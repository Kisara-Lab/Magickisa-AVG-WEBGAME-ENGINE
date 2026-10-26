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
  for (const n of p.nodes) {
    const targetConditional = (id: string) =>
      !!p.nodes.find((target) => target.id === id)?.condition;
    if (
      n.choices?.length &&
      n.choices.every(
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
