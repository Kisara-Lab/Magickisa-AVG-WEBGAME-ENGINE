import { evaluateCondition } from "./condition.js";

export function isMaterialAvailable(project, material, save) {
  if (!save) return false;
  if (save.unlockedMaterials.includes(material.id)) return true;
  if (material.unlockNode || material.unlock)
    return (
      (!material.unlockNode ||
        save.visitedNodes.includes(material.unlockNode)) &&
      !!evaluateCondition(material.unlock, save.variables, save.visitedNodes)
    );
  // Preserve the release mode's title-based fallback for unconfigured entries.
  const node = project.nodes.find((n) => n.title === material.title);
  return !node || save.visitedNodes.includes(node.id);
}

export function isMusicAvailable(track, save) {
  return !track.unlockNode || !!save?.visitedNodes.includes(track.unlockNode);
}
