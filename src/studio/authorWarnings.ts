import type { AuthorProject, Profile } from "./model";
import type { Condition } from "../engine/types";
import { analyzeGraph } from "../engine/graph";
import { variableIndex } from "./logicIndex";
import { interpolationKeys } from "../engine/interpolation";
import {
  interfaceLabels,
  interfaceFeatures,
  projectNotificationKeys,
} from "../engine/uiConfig";
export function authorWarnings(p: AuthorProject, profile: Profile) {
  const issues: {
    code: string;
    severity: "warning";
    message: string;
    nodeId?: string;
    lineId?: string;
    field?: string;
  }[] = [];
  for (const [group, known] of [
    ["labels", Object.keys(interfaceLabels)],
    ["enabled", [...Object.keys(interfaceFeatures), "music"]],
    ["notifications", projectNotificationKeys(p)],
  ] as const)
    for (const key of Object.keys(p.ui?.[group] ?? {}))
      if (!known.includes(key))
        issues.push({
          code: "unknown-ui-key",
          severity: "warning",
          field: `ui.${group}.${key}`,
          message: `界面配置 ${group}.${key} 在当前版本没有对应入口，原值保留。`,
        });
  const knownVariables = new Set(
    variableIndex(p)
      .filter((v) => v.locations.some((l) => l.mode !== "read"))
      .map((v) => v.key),
  );
  Object.keys(p.variables ?? {}).forEach((key) => knownVariables.add(key));
  for (const n of p.nodes)
    for (const l of n.lines)
      for (const key of interpolationKeys(l.text))
        if (!key || !knownVariables.has(key))
          issues.push({
            code: "unknown-interpolation",
            severity: "warning",
            nodeId: n.id,
            lineId: l.id,
            field: "台词正文",
            message: `台词插值 {{${key}}} ${key ? "未发现声明、输入或效果赋值；若由外部提供，请在预览中验证。" : "缺少变量名。"}`,
          });
  const condition = (
    c: Condition | undefined,
    owner: string,
    nodeId?: string,
    lineId?: string,
  ): void => {
    if (!c) return;
    if (c.type === "not") condition(c.condition, owner, nodeId, lineId);
    if (c.type === "all" || c.type === "any") {
      if (!c.conditions.length)
        issues.push({
          code: "empty-condition",
          severity: "warning",
          message: `${owner} 使用空 ${c.type}，条件将始终${c.type === "all" ? "成立" : "不成立"}。`,
          nodeId,
          lineId,
          field: "condition",
        });
      c.conditions.forEach((child) => condition(child, owner, nodeId, lineId));
    }
  };
  for (const rule of [
    ...(p.resources.sceneRules || []),
    ...(p.media.chapterMusicRules || []),
  ])
    if (rule.keywords.some((k) => !k.trim()))
      issues.push({
        code: "empty-keyword",
        severity: "warning",
        message: "匹配规则包含空关键词，运行时会忽略空关键词，请填写有效文字。",
        field: "resources",
      });
  for (const rule of p.media.chapterMusicRules || [])
    if (!Object.hasOwn(p.media.chapterMusic || {}, rule.track))
      issues.push({
        code: "missing-chapter-track",
        severity: "warning",
        message: `章节音乐规则引用了不存在的标识 ${rule.track}，将回落到默认音乐。`,
        field: "media",
      });
  const shots = p.media.opening?.images?.length || 0;
  if (
    (p.media.opening?.credits?.artist && shots < 2) ||
    (p.media.opening?.credits?.production?.length && shots < 5)
  )
    issues.push({
      code: "opening-credit-shots",
      severity: "warning",
      message: `OP 署名按原演出镜头位置显示：画师需要至少 2 张、制作组需要至少 5 张；当前 ${shots} 张。`,
      field: "media",
    });
  if (
    p.nodes.some(
      (n) => n.tags?.includes("dedication") && n.presentation !== "dedication",
    )
  )
    issues.push({
      code: "dedication-tag",
      severity: "warning",
      message:
        "现代版献词由场景演出字段控制，dedication 标签不会触发献词，请设置“开场献词 → OP”。",
      field: "presentation",
    });
  for (const n of p.nodes) {
    const targetConditional = (id: string) =>
      !!p.nodes.find((target) => target.id === id)?.condition;
    if (
      (n.choices?.length || (n.next && targetConditional(n.next))) &&
      (n.choices || []).every(
        (c) => c.condition || c.once || targetConditional(c.target),
      ) &&
      (!n.next || targetConditional(n.next))
    )
      issues.push({
        code: "branch-fallback",
        severity: "warning",
        message: `${n.title} 的选项或目标可能全部不可用，且没有无条件下一场景；请确认这是预期的停留或结局。`,
        nodeId: n.id,
        field: "下一场景",
      });
    if (n.sequenceId)
      issues.push({
        code: "sequence-metadata",
        severity: "warning",
        message: `${n.title} 的 sequenceId 是保留元数据，当前播放按 presentation 与 media 配置选择 OP/ED，不解析独立序列。`,
        nodeId: n.id,
        field: "sequenceId",
      });
    condition(n.condition, n.title, n.id);
    n.lines.forEach((l) =>
      condition(l.condition, `${n.title} · ${l.id}`, n.id, l.id),
    );
    n.choices?.forEach((c) =>
      condition(c.condition, `${n.title} · ${c.label}`, n.id),
    );
  }
  p.materials.forEach((m) => condition(m.unlock, m.title));
  issues.push(
    ...analyzeGraph(p)
      .issues.filter((i) => i.severity === "warning")
      .map((i) => ({ ...i, severity: "warning" as const })),
  );
  for (const variable of variableIndex(p))
    for (const message of variable.warnings)
      issues.push({
        code: "variable-usage",
        severity: "warning",
        message: `${variable.key}：${message}`,
        nodeId: variable.locations[0]?.nodeId,
        field: variable.locations[0]?.field,
      });
  return issues;
}
