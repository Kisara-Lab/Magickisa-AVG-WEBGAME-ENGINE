import type { AuthorProject, Profile } from "./model";
import type { Condition } from "../engine/types";
export function authorWarnings(p: AuthorProject, profile: Profile) {
  const issues: {
    code: string;
    severity: "warning";
    message: string;
    nodeId?: string;
    lineId?: string;
    field?: string;
  }[] = [];
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
    profile === "release" &&
    p.materials.some(
      (m) =>
        !m.unlockNode && !m.unlock && !p.nodes.some((n) => n.title === m.title),
    )
  )
    issues.push({
      code: "legacy-public-material",
      severity: "warning",
      message:
        "兼容版存在未配置解锁条件且没有同名场景的资料，这些资料会立即公开。请设置明确的解锁条件以避免剧透。",
      field: "materials",
    });
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
    profile === "modern" &&
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
    if (
      profile === "release" &&
      n.choices?.some((c) => targetConditional(c.target))
    )
      issues.push({
        code: "release-choice-timing",
        severity: "warning",
        message: `${n.title} 含带进入条件的分支目标：兼容版先应用选项效果与 once，再检查目标条件；条件不满足时仍停留原场景。`,
        nodeId: n.id,
        field: "分支选择",
      });
    if (
      profile === "release" &&
      (!n.next || targetConditional(n.next)) &&
      n.effects?.some((e) => e.type === "increment" || e.type === "toggle")
    )
      issues.push({
        code: "release-repeat-effects",
        severity: "warning",
        message: `${n.title} 无下一场景或目标带进入条件，兼容版在结束后每次继续都会应用节点效果；累加或切换可能重复发生。`,
        nodeId: n.id,
        field: "场景效果",
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
  return issues;
}
