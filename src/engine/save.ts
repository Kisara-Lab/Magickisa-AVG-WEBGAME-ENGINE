import { z } from "zod";
import { valueSchema } from "./schema";
import type {
  EngineSave,
  SaveState,
  StoryProject,
  StorageAdapter,
} from "./types";
const strings = z.array(z.string());
export const stateSchema = z.object({
  nodeId: z.string(),
  lineIndex: z.number().int().nonnegative(),
  variables: z.record(z.string(), valueSchema),
  visitedNodes: strings,
  unlockedMaterials: strings,
  readMaterials: strings,
  notes: strings,
  playerNotes: z.string(),
  usedChoices: strings,
  entered: z.boolean(),
  completed: z.boolean(),
  completedEndings: strings,
  seenPresentations: strings,
  presentation: z
    .object({
      id: z.enum(["opening", "ending"]),
      nodeId: z.string(),
      position: z.number().nonnegative().optional(),
    })
    .nullable(),
  audio: z.object({
    volume: z.number().min(0).max(1),
    muted: z.boolean(),
    currentTrackId: z.string().optional(),
  }),
});
export const saveSchema = stateSchema.extend({
  readLineIds: strings.default([]),
  schemaVersion: z.literal(2),
  projectId: z.string(),
  contentVersion: z.string(),
  slotId: z.string(),
  savedAt: z.string(),
  history: z
    .array(
      stateSchema.extend({
        id: z.string(),
        createdAt: z.string(),
        speaker: z.string().optional(),
        text: z.string().optional(),
        section: z.string().optional(),
      }),
    )
    .max(500),
});
export const slotKey = (projectId: string, slotId = "auto") =>
  `magickisa-avg:v2:${projectId}:${slotId}`;
export function createSave(project: StoryProject, slotId = "auto"): EngineSave {
  return {
    schemaVersion: 2,
    projectId: project.id,
    contentVersion: project.version,
    slotId,
    savedAt: new Date().toISOString(),
    nodeId: project.startNodeId,
    lineIndex: 0,
    variables: {},
    visitedNodes: [project.startNodeId],
    history: [],
    readLineIds: [],
    unlockedMaterials: [],
    readMaterials: [],
    notes: [],
    playerNotes: "",
    usedChoices: [],
    entered: false,
    completed: false,
    completedEndings: [],
    seenPresentations: [],
    presentation: null,
    audio: { volume: 1, muted: false },
  };
}
export function snapshot(save: EngineSave): SaveState {
  const {
    schemaVersion,
    projectId,
    contentVersion,
    slotId,
    savedAt,
    history,
    readLineIds,
    ...state
  } = save;
  return structuredClone(state);
}
function validPosition(state: SaveState, p: StoryProject): void {
  const node = p.nodes.find((n) => n.id === state.nodeId);
  if (!node) throw new Error(`存档节点已不存在：${state.nodeId}`);
  if (state.lineIndex > node.lines.length)
    throw new Error("存档行号超出节点范围。");
  if (state.visitedNodes.some((id) => !p.nodes.some((n) => n.id === id)))
    throw new Error("存档包含已删除的节点。");
  if (
    state.presentation &&
    !p.nodes.some((n) => n.id === state.presentation?.nodeId)
  )
    throw new Error("演出节点不存在。");
}
export function importSave(
  input: unknown,
  p: StoryProject,
  slotId = "auto",
): EngineSave {
  if (typeof input !== "object" || !input) throw new Error("存档格式无效。");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion === 2) {
    const save = saveSchema.parse(raw);
    if (save.projectId !== p.id) throw new Error("存档属于其他项目。");
    if (save.contentVersion !== p.version)
      throw new Error(
        `存档内容版本 ${save.contentVersion} 与当前 ${p.version} 不同。请使用对应内容版本的游戏读取，或导入当前版本导出的存档；本引擎不自动转换内容版本。`,
      );
    validPosition(save, p);
    save.history.forEach((s) => validPosition(s, p));
    return { ...save, slotId };
  }
  throw new Error("不支持此存档版本。请导入本工程当前版本导出的存档；发行兼容版存档不能直接导入现代版。");
}

export function readSave(
  p: StoryProject,
  slotId: string,
  storage: StorageAdapter,
): EngineSave | null {
  const key = slotKey(p.id, slotId);
  const text = storage.getItem(key);
  if (!text) return null;
  try {
    return importSave(JSON.parse(text), p, slotId);
  } catch (e) {
    throw new Error(
      `读取存档失败，原数据未被覆盖：${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
export function writeSave(save: EngineSave, storage: StorageAdapter): void {
  storage.setItem(slotKey(save.projectId, save.slotId), JSON.stringify(save));
}
