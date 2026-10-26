// MAGICKISA release-compatible runtime.
import { z } from "zod";
export const SAVE_SCHEMA_VERSION = 1;
export const slotKey = (slotId, projectId) =>
  projectId
    ? `magickisa-avg:release:${encodeURIComponent(projectId)}:${slotId}`
    : `magickisa-avg:slot:${slotId}`;
export function createSave(nodeId, slotId = "auto", project) {
  return {
    ...(project
      ? { projectId: project.id, contentVersion: project.version || "" }
      : {}),
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
    playerNotes: "",
    usedChoices: [],
    audio: {
      volume: 1,
      muted: !1,
    },
  };
}
const strings = z.array(z.string());
const stateSchema = z.object({
  nodeId: z.string(),
  lineIndex: z.number().int().nonnegative(),
  variables: z.record(z.string(), z.json()),
  visitedNodes: strings,
  unlockedMaterials: strings,
  readMaterials: strings,
  notes: strings,
  playerNotes: z.string().default(""),
  usedChoices: strings,
  audio: z.object({
    volume: z.number().min(0).max(1),
    muted: z.boolean(),
    currentTrackId: z.string().optional(),
  }),
});
const saveSchema = stateSchema.extend({
  schemaVersion: z.literal(1),
  projectId: z.string().optional(),
  contentVersion: z.string().optional(),
  slotId: z.string(),
  savedAt: z.string(),
  history: z
    .array(
      stateSchema.extend({
        id: z.string(),
        createdAt: z.string(),
        speaker: z.string().optional(),
        text: z.string().optional(),
      }),
    )
    .max(500),
});
export function importSave(input, project, { allowUnbound = false } = {}) {
  const save = saveSchema.parse(input);
  if (!save.projectId && !allowUnbound)
    throw new Error("旧存档未绑定工程，请通过导入存档确认归属。");
  if (save.projectId && save.projectId !== project.id)
    throw new Error("存档属于其他工程。");
  // Bound saves must prove their content version; do not silently stamp an unknown version.
  if (save.projectId && save.contentVersion === undefined)
    throw new Error("已绑定工程的存档缺少内容版本。");
  if (
    save.contentVersion !== undefined &&
    save.contentVersion !== (project.version || "")
  )
    throw new Error("存档内容版本不一致，请使用对应版本的游戏读取。");
  for (const state of [save, ...save.history]) {
    const node = project.nodes.find((n) => n.id === state.nodeId);
    if (
      !node ||
      state.lineIndex > node.lines.length ||
      state.visitedNodes.some((id) => !project.nodes.some((n) => n.id === id))
    )
      throw new Error("存档中的场景或台词位置无效。");
  }
  return {
    ...save,
    projectId: project.id,
    contentVersion: project.version || "",
  };
}
export function writeSave(save, project) {
  const checked = project ? importSave(save, project) : saveSchema.parse(save);
  localStorage.setItem(
    slotKey(checked.slotId, checked.projectId),
    JSON.stringify(checked),
  );
}
export function readSave(slotId, project) {
  const text = localStorage.getItem(slotKey(slotId, project?.id));
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return project ? importSave(value, project) : saveSchema.parse(value);
  } catch (error) {
    throw new Error(
      `读取存档失败，原数据未被覆盖：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
