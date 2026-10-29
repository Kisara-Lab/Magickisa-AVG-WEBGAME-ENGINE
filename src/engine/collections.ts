import { describeError, errorSentence } from "./errors";
import { z } from "zod";
import type { EngineSave, StorageAdapter, StoryProject } from "./types";
import { evaluateCondition } from "./condition";
const schema = z
  .object({
    formatVersion: z
      .union([z.literal(1), z.literal(2)])
      .transform(() => 2 as const),
    gallery: z.array(z.string()),
    endings: z.array(z.string()),
    music: z.array(z.string()).default([]),
  })
  .strict();
export type CollectionProgress = z.infer<typeof schema>;
export class CollectionStore {
  readonly key: string;
  error = "";
  private unreadable = false;
  private persisted = "";
  private progress: CollectionProgress = {
    formatVersion: 2,
    gallery: [],
    endings: [],
    music: [],
  };
  constructor(
    projectId: string,
    private storage?: StorageAdapter,
  ) {
    this.key = `magickisa-avg:collections:v1:${projectId}`;
    try {
      const raw = storage?.getItem(this.key);
      if (raw) {
        this.progress = schema.parse(JSON.parse(raw));
        this.persisted = JSON.stringify(this.progress);
      }
    } catch (error) {
      this.unreadable = true;
      this.error = `收藏记录无法读取，原数据已保留：${describeError(error)}`;
    }
  }
  get snapshot() {
    return structuredClone(this.progress);
  }
  get needsRecovery() {
    return this.unreadable;
  }
  raw() {
    return this.storage?.getItem(this.key) ?? null;
  }
  reload() {
    try {
      const raw = this.raw();
      const disk = raw
        ? schema.parse(JSON.parse(raw))
        : { formatVersion: 2 as const, gallery: [], endings: [], music: [] };
      this.progress = {
        formatVersion: 2,
        gallery: [...new Set([...disk.gallery, ...this.progress.gallery])],
        endings: [...new Set([...disk.endings, ...this.progress.endings])],
        music: [...new Set([...disk.music, ...this.progress.music])],
      };
      this.persisted = raw ? JSON.stringify(disk) : "";
      this.unreadable = false;
      this.error = "";
    } catch (error) {
      this.unreadable = true;
      this.error = `收藏记录仍无法读取，原数据已保留：${describeError(error)}`;
    }
  }
  rebuild() {
    if (!this.storage) throw new Error("收藏存储不可用");
    const raw = this.raw();
    if (raw !== null) this.storage.setItem(`${this.key}:recovery`, raw);
    const next = JSON.stringify(this.progress);
    this.storage.setItem(this.key, next);
    this.persisted = next;
    this.unreadable = false;
    this.error = "";
  }
  update(project: StoryProject, save: EngineSave, persist = true) {
    this.progress = {
      formatVersion: 2,
      music: [
        ...new Set([
          ...this.progress.music,
          ...(project.media.musicGallery ?? [])
            .filter(
              (t) => !t.unlockNode || save.visitedNodes.includes(t.unlockNode),
            )
            .map((t) => t.id),
        ]),
      ],
      gallery: [
        ...new Set([
          ...this.progress.gallery,
          ...(project.gallery ?? [])
            .filter((g) =>
              evaluateCondition(
                g.unlock,
                save.variables,
                save.visitedNodes,
                save,
              ),
            )
            .map((g) => g.id),
        ]),
      ],
      endings: [
        ...new Set([...this.progress.endings, ...save.completedEndings]),
      ],
    };
    const next = JSON.stringify(this.progress);
    if (
      persist &&
      this.storage &&
      !this.unreadable &&
      next !== this.persisted
    ) {
      try {
        this.storage.setItem(this.key, next);
        this.persisted = next;
        this.error = "";
      } catch (error) {
        this.error = `收藏尚未保存：${errorSentence(error)}可导出本次收藏后重试。`;
      }
    }
  }
}
