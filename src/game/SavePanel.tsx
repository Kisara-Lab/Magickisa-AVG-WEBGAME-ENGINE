import { describeError, errorSentence } from "../engine/errors";
import { useState } from "react";
import type { EngineSave, StoryProject } from "../engine/types";
import { importSave } from "../engine/save";
import { PlayerSlots, manualSlots, saveSummary } from "./persistence";
export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type ConfirmAction = (message: string, action: () => void) => void;
export function SavePanel({
  project,
  slots,
  current,
  confirm,
  onLoad,
  notify,
}: {
  project: StoryProject;
  slots: PlayerSlots;
  current?: EngineSave;
  confirm: ConfirmAction;
  onLoad: (save: EngineSave) => void;
  notify: (text: string) => void;
}) {
  const [version, refresh] = useState(0),
    [error, setError] = useState(""),
    [incoming, setIncoming] = useState<EngineSave>();
  const run = (action: () => void) => {
    try {
      action();
      refresh((n) => n + 1);
      setError("");
    } catch (e) {
      setError(
        `操作未完成：${errorSentence(e)}原槽位与当前进度保留，可导出后重试。`,
      );
    }
  };
  const entries = slots.list();
  return (
    <section className="save-manager" data-version={version}>
      <p>
        自动进度与 12 个手动槽分别保存。读取手动槽后继续写自动槽，原手动槽不变。
      </p>
      {!current && (
        <p role="status">
          当前没有可保存的游玩进度。请选择健康槽位读取、导入存档或恢复副本。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="save-tools">
        <label className="player-file">
          导入存档
          <input
            aria-label="导入存档"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                try {
                  setIncoming(
                    importSave(JSON.parse(await file.text()), project),
                  );
                  setError("");
                } catch (err) {
                  setError(`导入未应用：${describeError(err)}`);
                }
            }}
          />
        </label>
        {current && (
          <button
            onClick={() =>
              downloadText(
                JSON.stringify(current, null, 2),
                `${project.id}-current.json`,
              )
            }
          >
            导出当前进度
          </button>
        )}
        <button
          onClick={() =>
            run(() => {
              const save = slots.recovery();
              if (!save) throw new Error("暂无恢复副本");
              confirm(
                "恢复最近一次被覆盖的自动进度？当前自动进度也将备份。",
                () => run(() => onLoad(save)),
              );
            })
          }
        >
          恢复最近自动副本
        </button>
      </div>
      {incoming && (
        <div className="import-preview">
          <strong>待导入：{saveSummary(project, incoming)}</strong>
          <p>请选择下方目标槽；确认后才写入。</p>
          <button onClick={() => setIncoming(undefined)}>取消导入</button>
        </div>
      )}
      <div className="save-grid">
        {entries.map((entry) => {
          const recovery = slots.recoveryEntry(entry.id);
          return (
            <article key={entry.id} data-slot={entry.id}>
              <h3>
                {entry.id === "auto"
                  ? "自动存档"
                  : `手动槽 ${manualSlots.indexOf(entry.id) + 1}`}
              </h3>
              <p>
                {entry.error
                  ? "存档损坏或版本不兼容"
                  : entry.save
                    ? saveSummary(project, entry.save)
                    : "空槽位"}
              </p>
              {entry.save && (
                <time>{new Date(entry.save.savedAt).toLocaleString()}</time>
              )}
              {entry.error && <p role="alert">{entry.error}</p>}
              <div className="slot-actions">
                {incoming ? (
                  <button
                    onClick={() =>
                      confirm(
                        `将导入存档写入${entry.id === "auto" ? "自动" : "手动"}槽${entry.raw ? "并覆盖原内容" : ""}？${entry.id === "auto" ? "同时恢复该进度。" : "当前游玩进度不变。"}`,
                        () =>
                          run(() => {
                            if (entry.id === "auto") onLoad(incoming);
                            else slots.write(entry.id, incoming);
                            setIncoming(undefined);
                            notify("存档已导入");
                          }),
                      )
                    }
                  >
                    导入到此槽
                  </button>
                ) : (
                  <>
                    {entry.id !== "auto" && current && (
                      <button
                        onClick={() => {
                          const save = () =>
                            run(() => {
                              slots.write(entry.id, current);
                              notify("手动存档已保存");
                            });
                          if (entry.raw)
                            confirm(
                              "覆盖此手动槽？原内容将先保留为该槽的最近恢复副本。",
                              save,
                            );
                          else save();
                        }}
                      >
                        保存到此槽
                      </button>
                    )}
                    <button
                      disabled={!entry.save}
                      onClick={() =>
                        confirm(
                          "读取此存档将替换当前自动进度，先保留最近恢复副本。继续？",
                          () => run(() => onLoad(entry.save!)),
                        )
                      }
                    >
                      读取
                    </button>
                  </>
                )}
                <button
                  disabled={!entry.raw}
                  onClick={() =>
                    downloadText(entry.raw!, `${project.id}-${entry.id}.json`)
                  }
                >
                  导出
                </button>
                {entry.id !== "auto" && (
                  <button
                    disabled={!entry.raw}
                    onClick={() =>
                      confirm(
                        "删除此手动存档？原内容将先保留为该槽的最近恢复副本。",
                        () =>
                          run(() => {
                            slots.remove(entry.id);
                            notify("手动存档已删除");
                          }),
                      )
                    }
                  >
                    删除
                  </button>
                )}
              </div>
              {recovery.raw && (
                <div className="slot-recovery">
                  <p>
                    最近恢复副本：
                    {recovery.save
                      ? `${saveSummary(project, recovery.save)} · ${new Date(recovery.save.savedAt).toLocaleString()}`
                      : "无法读取，可导出原始副本。"}
                  </p>
                  {recovery.error && <p role="alert">{recovery.error}</p>}
                  <button
                    disabled={!recovery.save}
                    onClick={() =>
                      confirm(
                        "恢复此槽最近被覆盖或删除的内容？现有内容会先备份，自动槽恢复后继续游玩。",
                        () =>
                          run(() => {
                            if (entry.id === "auto") onLoad(recovery.save!);
                            else slots.write(entry.id, recovery.save);
                            notify("槽位副本已恢复");
                          }),
                      )
                    }
                  >
                    恢复此槽副本
                  </button>
                  <button
                    onClick={() =>
                      downloadText(
                        recovery.raw!,
                        `${project.id}-${entry.id}-recovery.json`,
                      )
                    }
                  >
                    导出此槽副本
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
