import { z } from "zod";
import type { EngineSave, StorageAdapter, StoryProject } from "./types";
import { evaluateCondition } from "./condition";
const schema = z
  .object({
    formatVersion: z.literal(1),
    gallery: z.array(z.string()),
    endings: z.array(z.string()),
  })
  .strict();
export type CollectionProgress = z.infer<typeof schema>;
export class CollectionStore {
  readonly key: string;
  error = "";
  private unreadable = false;
  private persisted = "";
  private progress: CollectionProgress = {
    formatVersion: 1,
    gallery: [],
    endings: [],
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
      this.error = `收藏记录无法读取，原数据已保留：${String(error)}`;
    }
  }
  get snapshot() {
    return structuredClone(this.progress);
  }
  update(project: StoryProject, save: EngineSave, persist = true) {
    this.progress = {
      formatVersion: 1,
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
        this.error = `收藏尚未保存：${String(error)}。可导出本次收藏后重试。`;
      }
    }
  }
}
