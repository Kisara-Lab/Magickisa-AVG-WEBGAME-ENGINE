import { describeError, errorSentence } from "./errors";
import { StoryRuntime } from "./runtime";
import { assertProject } from "./schema";
import { createSave, importSave, readSave, writeSave } from "./save";
import { transitionEvent, type EngineEvent, type EngineAction } from "./events";
import { jsonEqual } from "./condition";
import { CollectionStore } from "./collections";
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
  private eventListeners = new Set<(event: EngineEvent) => void>();
  private eventQueue: EngineEvent[] = [];
  private notifying = 0;
  private dispatching = false;
  observerError = "";
  private current: EngineSave;
  private storage?: StorageAdapter;
  persistenceError = "";
  readonly temporary: boolean;
  readonly collections: CollectionStore;
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
      options.observeCondition,
      options.onSkipLine,
    );
    this.current = structuredClone(this.runtime.save);
    this.collections = new CollectionStore(project.id, this.storage);
    this.collections.update(project, this.current, false);
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
  subscribeEvents = (listener: (event: EngineEvent) => void) => {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  };
  private commit(persist = true, action?: EngineAction) {
    const before = this.current;
    const changed =
      this.eventListeners.size > 0 && !jsonEqual(before, this.runtime.save);
    this.runtime.save.savedAt = new Date().toISOString();
    this.current = structuredClone(this.runtime.save);
    this.collections.update(this.project, this.current, persist);
    if (this.storage && persist) {
      try {
        writeSave(this.runtime.save, this.storage);
        this.persistenceError = "";
      } catch (e) {
        this.persistenceError = `进度未保存：${errorSentence(e)}可先导出当前进度；请根据上述原因处理后重试保存。`;
      }
    }
    if (changed) {
      this.eventQueue.push(transitionEvent(before, this.current, action));
    }
    this.notifying++;
    try {
      this.listeners.forEach((l) => l());
    } finally {
      this.notifying--;
      if (!this.notifying && !this.dispatching) {
        this.dispatching = true;
        try {
          while (this.eventQueue.length) {
            const event = this.eventQueue.shift()!;
            // Snapshot events before any callback; nested edits enqueue later events.
            for (const observer of [...this.eventListeners]) {
              try {
                observer(structuredClone(event));
              } catch (error) {
                this.observerError = describeError(error);
              }
            }
          }
        } finally {
          this.dispatching = false;
        }
      }
    }
    return this.current;
  }
  advance() {
    const line = this.runtime.line?.id;
    this.runtime.advance();
    return this.commit(true, { kind: "advance", line });
  }
  tickSequence(seconds: number) {
    const trigger = this.runtime.save.sequence?.trigger;
    this.runtime.tickSequence(seconds);
    return this.commit(
      false,
      trigger && trigger !== this.runtime.save.sequence?.trigger
        ? { kind: "presentation.complete" }
        : undefined,
    );
  }
  resumeSequence() {
    this.runtime.resumeSequence();
    return this.commit();
  }
  skipSequence() {
    this.runtime.skipSequence();
    return this.commit(true, { kind: "presentation.complete" });
  }
  choose(id: string) {
    this.runtime.choose(id);
    return this.commit(true, { kind: "choose", id });
  }
  jump(id: string, line = 0) {
    this.runtime.jump(id, line);
    return this.commit(true, { kind: "jump" });
  }
  rollback(index?: number) {
    this.runtime.rollback(index);
    return this.commit(true, { kind: "rollback" });
  }
  finishPresentation() {
    this.runtime.finishPresentation();
    return this.commit(true, { kind: "presentation.complete" });
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
    const input =
      this.runtime.line?.input?.key === key ? this.runtime.line.id : undefined;
    this.runtime.setVariable(key, value);
    return this.commit(
      true,
      input && typeof value === "string"
        ? { kind: "input", line: input, value }
        : { kind: "debug-variable" },
    );
  }
  setPlayerNotes(text: string) {
    this.runtime.setPlayerNotes(text);
    return this.commit();
  }
  markRead(id: string) {
    this.runtime.markRead(id);
    return this.commit(true, { kind: "read", id });
  }
  restore(input: unknown) {
    this.runtime.restore(input);
    return this.commit(true, { kind: "restore" });
  }
  retrySave() {
    return this.commit();
  }
  reset() {
    const readLineIds = [...this.runtime.save.readLineIds];
    this.runtime.save = createSave(this.project, this.save.slotId);
    this.runtime.save.readLineIds = readLineIds;
    this.runtime.restore(this.runtime.save);
    return this.commit(true, { kind: "reset" });
  }
  destroy() {
    this.listeners.clear();
    this.eventListeners.clear();
    this.eventQueue = [];
  }
}
