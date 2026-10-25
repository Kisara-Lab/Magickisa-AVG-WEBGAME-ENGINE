// MAGICKISA release-compatible runtime.
export const SAVE_SCHEMA_VERSION = 1;
export const slotKey = (e) => `magickisa-avg:slot:${e}`;
export function createSave(nodeId, slotId = "auto") {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    slotId: slotId,
    savedAt: new Date().toISOString(),
    nodeId: nodeId,
    lineIndex: 0,
    variables: {},
    visitedNodes: [nodeId],
    history: [],
    unlockedMaterials: [],
    readMaterials: [],
    notes: [],
    usedChoices: [],
    audio: {
      volume: 1,
      muted: !1,
    },
  };
}
export function writeSave(save) {
  localStorage.setItem(slotKey(save.slotId), JSON.stringify(save));
}
export function readSave(slotId) {
  try {
    const t = JSON.parse(localStorage.getItem(slotKey(slotId) || "") || "null");
    return (t == null ? void 0 : t.schemaVersion) === SAVE_SCHEMA_VERSION
      ? t
      : null;
  } catch {
    return null;
  }
}
