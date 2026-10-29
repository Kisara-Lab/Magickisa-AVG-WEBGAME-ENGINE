import { describeError } from "../engine/errors";
import type { EngineSave, StoryProject, StorageAdapter } from "../engine/types";
import { importSave, slotKey, writeSave } from "../engine/save";

export type PlayerStorage = StorageAdapter & { removeItem(key: string): void };
export const manualSlots = Array.from(
  { length: 12 },
  (_, i) => `manual-${String(i + 1).padStart(2, "0")}`,
);
export const recoveryKey = (id: string, slot = "auto") =>
  `${slotKey(id, slot)}:player-recovery`;
export function memoryStorage(): PlayerStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => {
      entries.set(k, v);
    },
    removeItem: (k) => {
      entries.delete(k);
    },
  };
}
export function guardedStorage(
  storage: PlayerStorage,
  allowed: () => boolean,
): PlayerStorage {
  const check = () => {
    if (!allowed()) throw new Error("当前页面没有存档写权限，请重新接管游戏。");
  };
  return {
    getItem: (k) => storage.getItem(k),
    setItem: (k, v) => {
      check();
      storage.setItem(k, v);
    },
    removeItem: (k) => {
      check();
      storage.removeItem(k);
    },
  };
}
export class PlayerSlots {
  constructor(
    public project: StoryProject,
    public storage: PlayerStorage,
  ) {}
  read(id: string) {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(slotKey(this.project.id, id));
      if (!raw) return { id, raw: null, save: null, error: "" };
      return {
        id,
        raw,
        save: importSave(JSON.parse(raw), this.project, id),
        error: "",
      };
    } catch (e) {
      return { id, raw, save: null, error: describeError(e) };
    }
  }
  list() {
    return ["auto", ...manualSlots].map((id) => this.read(id));
  }
  write(id: string, input: unknown) {
    if (!["auto", ...manualSlots].includes(id)) throw new Error("无效存档槽位");
    const save = importSave(input, this.project, id);
    this.backup(id);
    save.savedAt = new Date().toISOString();
    writeSave(save, this.storage);
    return save;
  }
  backup(id = "auto") {
    if (!["auto", ...manualSlots].includes(id)) throw new Error("无效存档槽位");
    const raw = this.storage.getItem(slotKey(this.project.id, id));
    if (raw !== null)
      this.storage.setItem(recoveryKey(this.project.id, id), raw);
  }
  remove(id: string) {
    if (!manualSlots.includes(id)) throw new Error("只能删除手动存档");
    this.backup(id);
    this.storage.removeItem(slotKey(this.project.id, id));
  }
  recoveryEntry(id = "auto") {
    if (!["auto", ...manualSlots].includes(id)) throw new Error("无效存档槽位");
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(recoveryKey(this.project.id, id));
      return {
        raw,
        save: raw ? importSave(JSON.parse(raw), this.project, id) : null,
        error: "",
      };
    } catch (error) {
      return { raw, save: null, error: describeError(error) };
    }
  }
  recovery(id = "auto") {
    const entry = this.recoveryEntry(id);
    if (entry.error) throw new Error(entry.error);
    return entry.save;
  }
}
export function saveSummary(project: StoryProject, save: EngineSave) {
  const node = project.nodes.find((n) => n.id === save.nodeId);
  const text =
    node?.lines[save.lineIndex]?.text ?? (node?.ending ? "结局" : "场景末尾");
  return `${node?.chapter ? node.chapter + " · " : ""}${node?.title ?? save.nodeId} · ${text.slice(0, 90)}`;
}
