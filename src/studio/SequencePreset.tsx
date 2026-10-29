import { useState } from "react";
import { z } from "zod";
import {
  sequenceSchema,
  sequenceIssues,
  type Sequence,
} from "../engine/sequence";
import { assertProject } from "../engine/schema";
import { randomId } from "../engine/id";
import type { StoryProject } from "../engine/types";

const presetSchema = z
  .object({ formatVersion: z.literal(1), sequence: sequenceSchema })
  .strict();
/** Author-owned reusable data. Import creates new IDs; resources remain explicit references. */
export function SequencePreset({
  project,
  sequence,
  onAdd,
}: {
  project: StoryProject;
  sequence?: Sequence;
  onAdd: (sequence: Sequence) => void;
}) {
  const [pending, setPending] = useState<Sequence>();
  const [error, setError] = useState("");
  const clone = (source: Sequence) => ({
    ...structuredClone(source),
    id: randomId(),
    name: source.name + " · 副本",
    tracks: source.tracks.map((track) => ({
      ...structuredClone(track),
      id: randomId(),
    })),
  });
  const add = (source: Sequence) => {
    const copy = clone(source);
    assertProject({
      ...project,
      sequences: [...(project.sequences ?? []), copy],
    });
    onAdd(copy);
    setPending(undefined);
    setError("");
  };
  return (
    <section aria-label="复用演出预设">
      <p>
        预设只包含演出配置，不携带媒体。导入后先核对人物与素材引用，再创建独立副本；不会覆盖现有演出。
      </p>
      <button
        disabled={!sequence}
        onClick={() => {
          try {
            add(sequence!);
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        复制为独立演出
      </button>
      <button
        disabled={!sequence}
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob(
              [JSON.stringify({ formatVersion: 1, sequence }, null, 2)],
              { type: "application/json" },
            ),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "演出预设.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        导出演出预设
      </button>
      <label>
        检查演出预设文件
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setPending(undefined);
            setError("");
            try {
              if (file.size > 8 * 1024 * 1024)
                throw new Error("预设超过 8 MiB，请拆分演出。");
              const data = presetSchema.parse(JSON.parse(await file.text()));
              const issues = sequenceIssues(data.sequence);
              if (issues.length)
                throw new Error(
                  issues.map((i) => `${i.path}: ${i.message}`).join("\n"),
                );
              setPending(data.sequence);
            } catch (e) {
              setError(String(e));
            }
          }}
        />
      </label>
      {pending && (
        <div>
          <p>
            {pending.name} · {pending.duration} 秒 · {pending.tracks.length}{" "}
            条轨道
          </p>
          <ul>
            {pending.tracks
              .filter((t) => t.asset || t.characterId)
              .map((t) => (
                <li key={t.id}>
                  {t.kind} · {t.asset ?? ""}{" "}
                  {t.characterId ? `人物 ${t.characterId}` : ""}
                </li>
              ))}
          </ul>
          <button
            onClick={() => {
              try {
                add(pending);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            创建预设副本
          </button>
          <button onClick={() => setPending(undefined)}>取消预设导入</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
