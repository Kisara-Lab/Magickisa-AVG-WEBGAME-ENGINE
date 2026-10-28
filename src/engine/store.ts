import { StoryRuntime } from "./runtime";
import { assertProject } from "./schema";
import { createSave, importSave, readSave, writeSave } from "./save";
import type {
  StoryProject,
  SessionOptions,
  EngineSave,
  StorageAdapter,
  Value,
} from "./types";
export class EngineStore {
  readonly runtime: StoryRuntime;
  private listeners = new Set<() => void>();
  private current: EngineSave;
  private storage?: StorageAdapter;
  persistenceError = "";
  readonly temporary: boolean;
  constructor(
    public project: StoryProject,
    options: SessionOptions = {},
  ) {
    assertProject(project);
    this.temporary = options.persist === false;
    this.storage =
      options.persist === false
        ? undefined
        : (options.storage ??
          (typeof localStorage !== "undefined" ? localStorage : undefined));
    const slot = options.slotId || "auto";
    const initial = options.initialSave
      ? importSave(options.initialSave, project, slot)
      : this.storage
        ? readSave(project, slot, this.storage)
        : null;
    this.runtime = new StoryRuntime(
      project,
      initial || createSave(project, slot),
    );
    this.current = structuredClone(this.runtime.save);
  }
  get save() {
    return this.current;
  }
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private commit(persist = true) {
    this.runtime.save.savedAt = new Date().toISOString();
    this.current = structuredClone(this.runtime.save);
    if (this.storage && persist) {
      try {
        writeSave(this.runtime.save, this.storage);
        this.persistenceError = "";
      } catch (e) {
        this.persistenceError = `进度未保存：${String(e)}。请导出存档，释放存储空间后重试。`;
      }
    }
    this.listeners.forEach((l) => l());
    return this.current;
  }
  advance() {
    this.runtime.advance();
    return this.commit();
  }
  choose(id: string) {
    this.runtime.choose(id);
    return this.commit();
  }
  jump(id: string, line = 0) {
    this.runtime.jump(id, line);
    return this.commit();
  }
  rollback(index?: number) {
    this.runtime.rollback(index);
    return this.commit();
  }
  finishPresentation() {
    this.runtime.finishPresentation();
    return this.commit();
  }
  setPresentationPosition(position: number) {
    if (
      this.runtime.save.presentation &&
      Number.isFinite(position) &&
      position >= 0
    ) {
      this.runtime.save.presentation.position = position;
      return this.commit();
    }
    return this.current;
  }
  setAudio(volume: number, muted: boolean, persist = true) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      throw new Error("音量必须在 0 到 1 之间");
    this.runtime.save.audio = { ...this.runtime.save.audio, volume, muted };
    return this.commit(persist);
  }
  setVariable(key: string, value: Value) {
    this.runtime.setVariable(key, value);
    return this.commit();
  }
  setPlayerNotes(text: string) {
    this.runtime.setPlayerNotes(text);
    return this.commit();
  }
  markRead(id: string) {
    this.runtime.markRead(id);
    return this.commit();
  }
  restore(input: unknown) {
    this.runtime.restore(input);
    return this.commit();
  }
  retrySave() {
    return this.commit();
  }
  reset() {
    const readLineIds = [...this.runtime.save.readLineIds];
    this.runtime.save = createSave(this.project, this.save.slotId);
    this.runtime.save.readLineIds = readLineIds;
    this.runtime.restore(this.runtime.save);
    return this.commit();
  }
  destroy() {
    this.listeners.clear();
  }
}
