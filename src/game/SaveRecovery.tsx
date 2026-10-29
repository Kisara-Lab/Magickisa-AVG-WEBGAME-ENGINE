import { useMemo, useState } from "react";
import type { EngineSave, StoryProject } from "../engine/types";
import { createSave, slotKey } from "../engine/save";
import { PlayerSlots, type PlayerStorage } from "./persistence";
import { PlayerDialog } from "./PlayerDialog";
import { SavePanel, downloadText } from "./SavePanel";
export function SaveRecovery({
  project,
  storage,
  error,
  onTemporary,
  onRecover,
}: {
  project: StoryProject;
  storage: PlayerStorage;
  error: string;
  onTemporary: () => void;
  onRecover: (save: EngineSave) => void;
}) {
  const slots = useMemo(
    () => new PlayerSlots(project, storage),
    [project, storage],
  );
  const [confirm, setConfirm] = useState<{
    message: string;
    action: () => void;
  }>();
  const [message, setMessage] = useState("");
  return (
    <main className="player-root recovery-error">
      <h1>存档需要处理</h1>
      <p role="alert">{error}</p>
      <p>
        原自动存档保持原样。可从其他正常槽位恢复，或先导出原数据。临时周目仅保留在内存，离开前请导出。
      </p>
      <button onClick={onTemporary}>打开临时新周目（不保存）</button>
      <button
        onClick={() => {
          try {
            downloadText(
              storage.getItem(slotKey(project.id)) ?? "",
              `${project.id}-damaged-auto.json`,
            );
          } catch (e) {
            setMessage(String(e));
          }
        }}
      >
        导出原自动存档
      </button>
      <button
        onClick={() =>
          setConfirm({
            message:
              "备份原自动存档并建立可保存新周目？备份失败不会覆盖原存档。",
            action: () => onRecover(createSave(project)),
          })
        }
      >
        备份原存档并建立可保存新周目
      </button>
      {message && <p role="alert">{message}</p>}
      <SavePanel
        project={project}
        slots={slots}
        confirm={(message, action) => setConfirm({ message, action })}
        onLoad={onRecover}
        notify={setMessage}
      />
      {confirm && (
        <PlayerDialog title="确认操作" onClose={() => setConfirm(undefined)}>
          <p>{confirm.message}</p>
          <button autoFocus onClick={() => setConfirm(undefined)}>
            取消
          </button>
          <button
            onClick={() => {
              const action = confirm.action;
              setConfirm(undefined);
              try {
                action();
              } catch (e) {
                setMessage(`恢复未完成，原存档保留：${String(e)}`);
              }
            }}
          >
            确认继续
          </button>
        </PlayerDialog>
      )}
    </main>
  );
}
