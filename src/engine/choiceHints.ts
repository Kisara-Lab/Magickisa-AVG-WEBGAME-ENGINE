import type { EngineSave, StoryChoice, StoryNode } from "./types";
import { applyEffects } from "./effects";
import { evaluateCondition } from "./condition";
export interface ChoiceHint {
  choice: StoryChoice;
  allowed: boolean;
  reason: string;
}
/** Availability remains owned by the runtime; hints never enable an option. */
export function choiceHints(
  node: StoryNode,
  save: EngineSave,
  available: StoryChoice[],
): ChoiceHint[] {
  const ids = new Set(available.map((c) => c.id));
  return (node.choices ?? []).map((choice) => {
    const allowed = ids.has(choice.id);
    let reason = "";
    if (!allowed) {
      if (choice.once && save.usedChoices.includes(choice.id))
        reason = "已选择（本周目仅一次）";
      else {
        try {
          const basis = save.completed
            ? save
            : applyEffects(save, node.onComplete);
          reason = evaluateCondition(
            choice.condition,
            basis.variables,
            basis.visitedNodes,
            basis,
          )
            ? "目标暂不可进入"
            : "尚未满足选项条件";
        } catch {
          reason = "暂不可用，请向作者反馈";
        }
      }
    }
    return { choice, allowed, reason };
  });
}
