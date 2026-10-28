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
  current: EngineSave;
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
        `操作未完成：${String(e)}。原槽位与当前进度保留，可导出后重试。`,
      );
    }
  };
  const entries = slots.list();
  return (
    <section className="save-manager" data-version={version}>
      <p>
        自动进度与 12 个手动槽分别保存。读取手动槽后继续写自动槽，原手动槽不变。
      </p>
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
                  setError(`导入未应用：${String(err)}`);
                }
            }}
          />
        </label>
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
        {entries.map((entry) => (
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
                  {entry.id !== "auto" && (
                    <button
                      onClick={() => {
                        const save = () =>
                          run(() => {
                            slots.write(entry.id, current);
                            notify("手动存档已保存");
                          });
                        if (entry.raw)
                          confirm("覆盖此手动槽？原槽内容将被替换。", save);
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
                    confirm("删除此手动存档？建议先导出留存。", () =>
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
          </article>
        ))}
      </div>
    </section>
  );
}
