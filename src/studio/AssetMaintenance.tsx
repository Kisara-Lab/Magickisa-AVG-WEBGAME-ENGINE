import { describeError } from "../engine/errors";
import { useEffect, useRef, useState } from "react";
import { studioRequest, studioUrl } from "./ProjectManager";
import { Fold, Modal } from "./components";
interface Info {
  url: string;
  sha256: string;
  revision: string;
  bytes: number;
  references: { label: string; field: string }[];
}
interface Restore {
  id: string;
  url: string;
  revision: string;
  sha256: string | null;
  backupSha256: string;
}
export function AssetMaintenance({
  url,
  dirty,
  onReload,
}: {
  url: string;
  dirty: boolean;
  onReload: () => Promise<void>;
}) {
  const [info, setInfo] = useState<Info>(),
    [file, setFile] = useState<File>(),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<"remove" | "replace">(),
    [restore, setRestore] = useState<Restore>();
  const [history, setHistory] = useState<
    { id: string; url: string; createdAt: string }[]
  >([]);
  const abort = useRef<AbortController>();
  useEffect(() => {
    setInfo(undefined);
    setFile(undefined);
    setConfirm(undefined);
  }, [url]);
  useEffect(() => () => abort.current?.abort(), []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(describeError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Fold title="素材检查、替换与恢复" summary="校验文件版本 · 修改前自动备份">
      <p>
        引用检查基于磁盘工程；先保存或放弃未保存工程与
        JSON。替换沿用原路径，会影响所有使用位置；删除仅允许无引用文件。
      </p>
      {dirty && (
        <p role="status">工程有未保存修改，素材替换、删除和恢复暂不可用。</p>
      )}
      <button
        disabled={!url || busy}
        onClick={() =>
          void run(async () => {
            setInfo(
              await studioRequest(
                "modern",
                `assets/inspect?url=${encodeURIComponent(url)}`,
              ),
            );
            setMessage("");
          })
        }
      >
        检查选中素材
      </button>
      {info && (
        <>
          <p>
            {info.bytes} 字节 · SHA256{" "}
            <code style={{ overflowWrap: "anywhere" }}>{info.sha256}</code>
          </p>
          <p>{info.references.length} 处已保存引用</p>
          <ul>
            {info.references.map((ref, i) => (
              <li key={i}>
                {ref.label} · {ref.field}
              </li>
            ))}
          </ul>
          <label>
            选择同格式替换文件
            <input
              type="file"
              disabled={busy || dirty}
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            disabled={busy || dirty || !file}
            onClick={() => setConfirm("replace")}
          >
            检查替换确认
          </button>
          <button
            disabled={busy || dirty || !!info.references.length}
            onClick={() => setConfirm("remove")}
          >
            删除无引用素材
          </button>
        </>
      )}
      <button
        disabled={busy}
        onClick={() =>
          void run(async () =>
            setHistory(
              (await studioRequest("modern", "assets/history")).backups,
            ),
          )
        }
      >
        读取素材历史
      </button>
      <div style={{ maxHeight: 260, overflow: "auto" }}>
        {history.map((item) => (
          <p key={item.id}>
            {item.url} · {new Date(item.createdAt).toLocaleString()}{" "}
            <button
              disabled={busy || dirty}
              onClick={() =>
                void run(async () =>
                  setRestore(
                    await studioRequest(
                      "modern",
                      `assets/restore-plan?id=${encodeURIComponent(item.id)}`,
                    ),
                  ),
                )
              }
            >
              检查恢复旧素材
            </button>
          </p>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {confirm && info && (
        <Modal
          title={confirm === "replace" ? "确认原位替换素材" : "确认删除素材"}
          onClose={() => {
            if (!busy) setConfirm(undefined);
          }}
        >
          <p>
            {info.url} ·{" "}
            {confirm === "replace"
              ? `将使用 ${file?.name} 替换，影响 ${info.references.length} 处引用。`
              : "文件将从素材目录移除。"}
            旧文件先保存到素材历史。
          </p>
          <button
            disabled={busy || dirty}
            onClick={() =>
              void run(async () => {
                if (confirm === "replace" && file) {
                  abort.current = new AbortController();
                  const query = new URLSearchParams({
                    url: info.url,
                    revision: info.revision,
                    sha256: info.sha256,
                    name: file.name,
                  });
                  const response = await fetch(
                    studioUrl("modern", `assets/replace?${query}`),
                    {
                      method: "POST",
                      body: file,
                      signal: abort.current.signal,
                    },
                  );
                  const result = await response.json();
                  if (!response.ok)
                    throw new Error(result.error || "素材替换失败");
                } else await studioRequest("modern", "assets/remove", info);
                setConfirm(undefined);
                setInfo(undefined);
                setFile(undefined);
                await onReload();
                setMessage("素材操作完成，旧文件已备份。请手动更新真实预览。");
              })
            }
          >
            备份并确认操作
          </button>
          {busy && (
            <button onClick={() => abort.current?.abort()}>取消替换上传</button>
          )}
          <button disabled={busy} onClick={() => setConfirm(undefined)}>
            返回
          </button>
        </Modal>
      )}
      {restore && (
        <Modal
          title="确认恢复旧素材"
          onClose={() => {
            if (!busy) setRestore(undefined);
          }}
        >
          <p>
            恢复 {restore.url}。当前文件若存在会先备份；核对 SHA256 后应用。
          </p>
          <code style={{ overflowWrap: "anywhere" }}>
            {restore.backupSha256}
          </code>
          <button
            disabled={busy || dirty}
            onClick={() =>
              void run(async () => {
                await studioRequest("modern", "assets/restore", restore);
                setRestore(undefined);
                await onReload();
                setMessage("素材已恢复，请更新真实预览。");
              })
            }
          >
            确认恢复素材
          </button>
        </Modal>
      )}
    </Fold>
  );
}
