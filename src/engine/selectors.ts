import type { EngineSave, StoryProject, EngineRendererContext } from "./types";
import { evaluateCondition } from "./condition";
export const selectNode = (p: StoryProject, s: EngineSave) =>
  p.nodes.find((n) => n.id === s.nodeId);
export const selectUnlockedMaterials = (p: StoryProject, s: EngineSave) =>
  p.materials.filter(
    (m) =>
      s.unlockedMaterials.includes(m.id) &&
      evaluateCondition(m.unlock, s.variables, s.visitedNodes),
  );
export function selectContext(
  project: StoryProject,
  save: EngineSave,
  choices: EngineRendererContext["choices"],
): EngineRendererContext {
  const node = selectNode(project, save);
  return {
    project,
    save,
    node,
    line: node?.lines[save.lineIndex],
    lineIndex: save.lineIndex,
    choices,
    canAdvance: !save.presentation,
    presentation: save.presentation,
  };
}
