import { useState } from "react";
import { studioRequest } from "./ProjectManager";
import { Card } from "./fields";
import { Modal } from "./components";
interface Backup {
  id: string;
  title: string;
  createdAt: string;
  schemaVersion: number;
  scenes: number;
  studio: boolean;
  sync: boolean;
}
interface Preview {
  id: string;
  revision: string;
  studioRevision: string;
  digest: string;
  changes: unknown[];
  note: string;
  creativeChanges: { path: string; action: string }[];
}
export function BackupPanel({
  dirty,
  onRestored,
}: {
  dirty: boolean;
  onRestored: () => void;
}) {
  const [backups, setBackups] = useState<Backup[]>([]),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview>(),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="备份与恢复">
      <p>
        元数据备份包含工程、Studio
        创作资料和同步基线。完整媒体归档请导出工程包。恢复前会备份当前磁盘状态。
      </p>
      {dirty && (
        <p role="status">
          请先保存或放弃当前工程、JSON 与创作资料修改，再恢复备份。
        </p>
      )}
      <button
        disabled={busy}
        onClick={() =>
          void run(async () =>
            setBackups((await studioRequest("modern", "backups")).backups),
          )
        }
      >
        读取备份列表
      </button>
      {!backups.length && <p>尚未读取备份，或当前工程暂无备份。</p>}
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {backups.map((b) => (
          <article key={b.id}>
            <strong>{b.title}</strong>
            <p>
              {new Date(b.createdAt).toLocaleString()} · 格式 {b.schemaVersion}{" "}
              · {b.scenes} 场景 · {b.studio ? "含创作资料" : "无创作资料"} ·{" "}
              {b.sync ? "含同步基线" : "无同步基线"}
            </p>
            {(busy || dirty || b.schemaVersion !== 3) && (
              <p role="status">
                {b.schemaVersion !== 3
                  ? "此备份不是当前格式 3，无法恢复。原文件保留，请使用对应版本引擎读取。"
                  : busy
                    ? "正在处理另一项备份操作，请稍候。"
                    : "请先保存或放弃当前工程、JSON 与创作资料修改。"}
              </p>
            )}
            <button
              disabled={busy || dirty || b.schemaVersion !== 3}
              onClick={() =>
                void run(async () =>
                  setPreview(
                    await studioRequest(
                      "modern",
                      `backups/preview?id=${encodeURIComponent(b.id)}`,
                    ),
                  ),
                )
              }
            >
              检查恢复差异
            </button>
          </article>
        ))}
      </div>
      {preview && (
        <>
          <p>{preview.note}</p>
          <p>{preview.changes.length} 项工程变化。</p>
          <p>{preview.creativeChanges.length} 项创作文件变化。</p>
          <ul>
            {preview.creativeChanges.map((change) => (
              <li key={change.path}>
                {change.action}：{change.path}
              </li>
            ))}
          </ul>
          <details>
            <summary>查看字段差异</summary>
            <pre>{JSON.stringify(preview.changes, null, 2)}</pre>
          </details>
          <button disabled={busy || dirty} onClick={() => setConfirm(true)}>
            恢复此备份
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {confirm && preview && (
        <Modal title="确认恢复工程备份" onClose={() => setConfirm(false)}>
          <p>
            将恢复所选工程、创作资料和同步基线。当前内容会先备份；素材及原稿文件保持原样。
          </p>
          <button disabled={busy} onClick={() => setConfirm(false)}>
            取消
          </button>
          <button
            disabled={busy || dirty}
            onClick={() =>
              void run(async () => {
                await studioRequest("modern", "backups/restore", preview);
                setConfirm(false);
                onRestored();
              })
            }
          >
            备份当前内容并恢复
          </button>
        </Modal>
      )}
    </Card>
  );
}
