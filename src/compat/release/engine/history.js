// MAGICKISA release-compatible runtime.
export function createCheckpoint(save, metadata = {}) {
  return {
    id: `${save.nodeId}:${save.lineIndex}:${Date.now()}`,
    nodeId: save.nodeId,
    lineIndex: save.lineIndex,
    variables: structuredClone(save.variables),
    visitedNodes: [...save.visitedNodes],
    unlockedMaterials: [...save.unlockedMaterials],
    readMaterials: [...save.readMaterials],
    notes: [...save.notes],
    audio: {
      ...save.audio,
    },
    usedChoices: [...save.usedChoices],
    createdAt: new Date().toISOString(),
    ...metadata,
  };
}
