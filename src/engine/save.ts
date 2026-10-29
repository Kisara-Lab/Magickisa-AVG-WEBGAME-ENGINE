import { describeError } from "./errors";
import { z } from "zod";
import { valueSchema } from "./schema";
import { contentLayout } from "./contentLayout.js";
import { SequenceClock } from "./sequence";
import type {
  EngineSave,
  SaveState,
  StoryProject,
  StorageAdapter,
} from "./types";
const strings = z.array(z.string());
export const stateSchema = z.object({
  nodeId: z.string(),
  lineId: z.string().nullable(),
  phase: z.enum(["line", "exits"]),
  sequence: z
    .object({
      id: z.string(),
      trigger: z.string(),
      time: z.number().finite().nonnegative(),
      waiting: z.number().finite().nonnegative().nullable(),
      finished: z.boolean(),
    })
    .nullable()
    .default(null),
  sequenceTokens: strings.default([]),
  terminalSequence: z.string().nullable().default(null),
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
  contentLayout: z.string().optional(),
  readLineIds: strings.default([]),
  schemaVersion: z.literal(3),
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
  `magickisa-avg:v3:${projectId}:${slotId}`;
export function createSave(project: StoryProject, slotId = "auto"): EngineSave {
  return {
    schemaVersion: 3,
    contentLayout: contentLayout(project),
    projectId: project.id,
    contentVersion: project.version,
    slotId,
    savedAt: new Date().toISOString(),
    nodeId: project.startNodeId,
    lineId:
      project.nodes.find((n) => n.id === project.startNodeId)?.lines[0]?.id ??
      null,
    phase: project.nodes.find((n) => n.id === project.startNodeId)?.lines.length
      ? "line"
      : "exits",
    lineIndex: 0,
    variables: Object.fromEntries(
      Object.entries(project.variables ?? {}).map(([key, value]) => [
        key,
        structuredClone(value.initial),
      ]),
    ),
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
    sequence: null,
    sequenceTokens: [],
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
    contentLayout: _layout,
    playerNotes: _playerNotes,
    ...state
  } = save;
  return { ...structuredClone(state), playerNotes: "" };
}
function validPosition(state: SaveState, p: StoryProject): void {
  if (state.sequence) {
    const sequence = p.sequences?.find((s) => s.id === state.sequence!.id);
    if (!sequence) throw new Error("存档演出已不存在");
    new SequenceClock(sequence, state.sequence);
  }
  const node = p.nodes.find((n) => n.id === state.nodeId);
  if (!node) throw new Error(`存档节点已不存在：${state.nodeId}`);
  if (
    state.terminalSequence &&
    !p.sequences?.some((s) => s.id === state.terminalSequence)
  )
    throw new Error("存档保留的舞台演出已不存在");
  if (state.sequence) {
    const { trigger, id } = state.sequence;
    const bound =
      trigger === "enter"
        ? node.enterSequence
        : trigger === "exit" && state.phase === "exits"
          ? node.exitSequence
          : trigger === `line:${state.lineId}`
            ? node.lines.find((l) => l.id === state.lineId)?.sequence
            : undefined;
    if (
      bound !== id ||
      state.sequence.finished ||
      state.sequenceTokens?.includes(trigger)
    )
      throw new Error("存档演出触发位置与当前工程不一致");
  }
  if (state.phase === "line") {
    const index = node.lines.findIndex((line) => line.id === state.lineId);
    if (index < 0) throw new Error(`存档台词已不存在：${state.lineId}`);
    state.lineIndex = index;
  } else {
    if (state.lineId !== null) throw new Error("场景出口位置不能带有台词 ID");
    state.lineIndex = node.lines.length;
  }
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
  if (raw.schemaVersion === 3) {
    const save = saveSchema.parse(raw);
    if (save.projectId !== p.id) throw new Error("存档属于其他项目。");
    if (save.contentVersion !== p.version)
      throw new Error(
        `存档内容版本 ${save.contentVersion} 与当前 ${p.version} 不同。请使用对应内容版本的游戏读取，或导入当前版本导出的存档；本引擎不自动转换内容版本。`,
      );
    validPosition(save, p);
    save.history.forEach((s) => validPosition(s, p));
    // Completed self-target saves from older versions could retain entered=false.
    for (const state of [save, ...save.history])
      if (state.completed) state.entered = true;
    return { ...save, slotId };
  }
  throw new Error(
    "不支持此存档版本。请导入本工程当前版本导出的存档；发行兼容版存档不能直接导入现代版。",
  );
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
      `读取存档失败，原数据未被覆盖：${describeError(e)}`,
    );
  }
}
export function writeSave(save: EngineSave, storage: StorageAdapter): void {
  // Validate before stringify: JSON would silently turn NaN/Infinity into null.
  saveSchema.parse(save);
  storage.setItem(slotKey(save.projectId, save.slotId), JSON.stringify(save));
}
