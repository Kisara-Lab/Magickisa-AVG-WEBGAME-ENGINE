import type { Condition, EngineSave, StoryNode, StoryProject } from "./types";
import { evaluateCondition } from "./condition";
import { applyEffects } from "./effects";
export function conditionSummary(c?: Condition): string {
  if (!c) return "无条件";
  switch (c.type) {
    case "flag":
      return `${c.key} = ${JSON.stringify(c.equals ?? true)}`;
    case "contains":
      return `${c.key} 包含 ${JSON.stringify(c.value)}`;
    case "material":
      return `${c.value === false ? "未" : "已"}${c.state === "read" ? "阅读" : "解锁"}资料 ${c.id}`;
    case "visited":
      return `${c.value === false ? "未" : "已"}访问 ${c.nodeId}`;
    case "count":
      return `${c.key} ${c.operator} ${c.value}`;
    case "not":
      return `非（${conditionSummary(c.condition)}）`;
    case "all":
    case "any":
      return `（${c.conditions.map(conditionSummary).join(c.type === "all" ? " 且 " : " 或 ")}）`;
  }
}
export function explainCondition(
  c: Condition | undefined,
  state: EngineSave,
): {
  label: string;
  allowed: boolean;
  children: ReturnType<typeof explainCondition>[];
} {
  return {
    label: conditionSummary(c),
    allowed: evaluateCondition(c, state.variables, state.visitedNodes, state),
    children:
      c?.type === "not"
        ? [explainCondition(c.condition, state)]
        : c?.type === "all" || c?.type === "any"
          ? c.conditions.map((child) => explainCondition(child, state))
          : [],
  };
}
// Mirrors the runtime choice evaluation order without constructing a runtime or
// triggering onEnter/unlock/persistence; the caller supplies an actual checkpoint.
export function explainBranches(
  project: StoryProject,
  node: StoryNode,
  state: EngineSave,
) {
  const basis = state.completed
    ? structuredClone(state)
    : applyEffects(state, node.onComplete);
  const targets = new Map(project.nodes.map((n) => [n.id, n]));
  return (node.choices ?? []).map((choice) => {
    const condition = explainCondition(choice.condition, basis),
      once = !choice.once || !basis.usedChoices.includes(choice.id);
    const afterChoice = applyEffects(basis, choice.effects),
      target = targets.get(choice.target);
    const targetCondition = explainCondition(target?.condition, afterChoice);
    return {
      choiceId: choice.id,
      target: choice.target,
      allowed: once && condition.allowed && !!target && targetCondition.allowed,
      onceAllowed: once,
      condition,
      targetExists: !!target,
      targetCondition,
      completedBefore: state.completed,
      afterComplete: basis,
      afterChoice,
    };
  });
}
export function explainNext(
  project: StoryProject,
  node: StoryNode,
  state: EngineSave,
) {
  const basis = state.completed
    ? structuredClone(state)
    : applyEffects(state, node.onComplete);
  const target = project.nodes.find((n) => n.id === node.next);
  const condition = explainCondition(target?.condition, basis);
  const availableChoices = explainBranches(project, node, state).filter(
    (c) => c.allowed,
  );
  return {
    target: node.next,
    targetExists: !!target,
    condition,
    afterComplete: basis,
    blockedByChoices: availableChoices.length > 0,
    allowed: !!target && condition.allowed && !availableChoices.length,
  };
}
