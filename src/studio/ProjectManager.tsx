import { describeError } from "../engine/errors";
import { LEGACY_RELEASE_URL } from "../engine/support";
import { useEffect, useRef, useState } from "react";
import type { AuthorProject, Profile } from "./model";
import { Modal } from "./components";
export const workspaceId = () =>
  new URLSearchParams(location.search).get("workspaceId") || "";
export function studioUrl(profile: Profile, route: string) {
  return `/__studio/${route}${route.includes("?") ? "&" : "?"}${new URLSearchParams(
    {
      profile,
      ...(workspaceId()
        ? {
            workspaceId: workspaceId(),
          }
        : {}),
    },
  )}`;
}
export async function studioRequest(
  profile: Profile,
  route: string,
  body?: unknown,
) {
  const response = await fetch(
    studioUrl(profile, route),
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || `HTTP ${response.status}`), {
      issues: data.issues,
      status: response.status,
    });
  return data;
}
export interface WorkspaceItem {
  id: string;
  name: string;
  profile: Profile;
  directory?: string;
  lastOpened?: number;
}
interface Summary {
  name: string;
  profile: Profile;
  scenes: number;
  files: number;
  bytes: number;
  warnings: string[];
  external: string[];
}
interface Transfer {
  id: string;
  kind: "export" | "import";
  status: string;
  phase: string;
  completed: number;
  total: number;
  error?: string;
  summary?: Summary;
  name?: string;
}
export function ProjectManager({
  open,
  onClose,
  profile,
  project,
  revision,
  rawDirty,
  dirty,
  onOpen,
  onJson,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  project: AuthorProject | null;
  revision: string;
  rawDirty: boolean;
  dirty: boolean;
  onOpen: (item: WorkspaceItem) => void;
  onJson: () => void;
}) {
  const [unsupported, setUnsupported] = useState(0);
  const [projects, setProjects] = useState<WorkspaceItem[]>([]),
    [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null),
    [task, setTask] = useState<Transfer | null>(null);
  const [pending, setPending] = useState(false),
    [uploadProgress, setUploadProgress] = useState<number | null>(null),
    [name, setName] = useState("");
  const [directory, setDirectory] = useState("");
  const [newName, setNewName] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);
  const snapshot = useRef<{
      project: AuthorProject;
      revision: string;
    } | null>(null),
    xhr = useRef<XMLHttpRequest | null>(null);
  const active = pending || task?.status === "running";
  const exportStale =
    !!snapshot.current &&
    (snapshot.current.revision !== revision ||
      JSON.stringify(snapshot.current.project) !== JSON.stringify(project));
  const api = (route: string, body?: unknown) =>
    studioRequest(profile, route, body);
  useEffect(() => {
    if (open)
      void studioRequest(profile, "workspaces")
        .then((data) => {
          setProjects(data.projects);
          setUnsupported(data.unsupportedProjects || 0);
        })
        .catch((e) => setError(describeError(e)));
  }, [open, profile]);
  useEffect(() => {
    if (!task || task.status !== "running") return;
    let disposed = false;
    const timer = setInterval(() => {
      void studioRequest(profile, `packages/${task.id}`)
        .then((next) => {
          if (disposed) return;
          setTask(next);
          if (next.status === "ready" && next.kind === "import")
            setName(next.name);
          if (next.error) setError(next.error);
        })
        .catch((e) => {
          if (!disposed) {
            setError(describeError(e));
            setTask((t) =>
              t
                ? {
                    ...t,
                    status: "failed",
                  }
                : t,
            );
          }
        });
    }, 500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [task?.id, task?.status, profile]);
  async function perform(fn: () => Promise<void>) {
    setError("");
    setPending(true);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setPending(false);
    }
  }
  async function clearTask() {
    if (task && task.status !== "complete") {
      try {
        await api("packages/cancel", {
          id: task.id,
        });
      } catch (e) {
        if (
          (
            e as {
              status?: number;
            }
          ).status !== 404
        )
          throw e;
      }
    }
    setTask(null);
    setSummary(null);
  }
  function upload(file?: File) {
    if (!file || active) return;
    void perform(async () => {
      await clearTask();
      if (file.size > 2 * 1024 ** 3) throw new Error("压缩包不能超过 2 GiB");
      const result = await new Promise<Transfer>((resolve, reject) => {
        const request = new XMLHttpRequest();
        xhr.current = request;
        request.open("POST", studioUrl(profile, "packages/upload"));
        request.setRequestHeader("Content-Type", "application/zip");
        request.upload.onprogress = (e) =>
          setUploadProgress(
            e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : 0,
          );
        request.onerror = () => reject(new Error("上传连接失败，请重试"));
        request.onabort = () => reject(new Error("已取消上传"));
        request.onload = () => {
          try {
            const data = JSON.parse(request.responseText);
            if (request.status >= 400) throw new Error(data.error);
            resolve(data);
          } catch (e) {
            reject(e);
          }
        };
        request.send(file);
      }).finally(() => {
        xhr.current = null;
        setUploadProgress(null);
      });
      setTask(result);
    });
  }
  if (!open) return null;
  return (
    <Modal title="项目管理与整体导入导出" onClose={onClose}>
      <h2>项目与迁移</h2>
      {unsupported > 0 && (
        <p role="status">
          {unsupported} 个兼容档工程已隐藏，原文件仍保留。请使用{" "}
          <a href={LEGACY_RELEASE_URL}>v1.0legacy</a>
        </p>
      )}
      <section className="st-package-section">
        <h3>创建空白工程</h3>
        <label>
          工程名称
          <input
            value={newName}
            maxLength={100}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="我的新工程"
          />
        </label>

        <button
          className="primary"
          disabled={active || !project || !revision || !newName.trim()}
          onClick={() =>
            void perform(async () => {
              const created = await studioRequest(
                "modern",
                "workspaces/create",
                {
                  name: newName,
                },
              );
              onOpen(created);
            })
          }
        >
          创建并打开
        </button>
        <p>创建独立工程，不附带剧情或素材。已有工程可通过下方工程包导入。</p>
      </section>
      <p>
        工程包包含全部项目素材，不含引擎源码。导入会建立独立项目，原项目保留。
      </p>
      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
      <section className="st-package-section">
        <h3>整体导出</h3>
        <p>
          {dirty
            ? "包含未保存修改：导出当前已应用草稿，不写入原工程。"
            : "导出当前已应用工程与全部素材（包含未使用素材）。"}
        </p>
        {rawDirty && (
          <p className="st-error">
            有未应用 JSON，暂时不能导出。
            <button
              onClick={() => {
                onClose();
                onJson();
              }}
            >
              前往处理 JSON
            </button>
          </p>
        )}
        <button
          disabled={!project || rawDirty || active}
          onClick={() =>
            void perform(async () => {
              await clearTask();
              snapshot.current = {
                project: structuredClone(project!),
                revision,
              };
              setSummary(await api("packages/check", snapshot.current));
            })
          }
        >
          检查整体导出
        </button>
        {summary && !task && (
          <>
            <PackageSummary value={summary} />
            {exportStale && (
              <p className="st-error">
                工程在检查后已更改，请重新检查整体导出。
              </p>
            )}
            <button
              className="primary"
              disabled={active || rawDirty || exportStale}
              onClick={() =>
                void perform(async () => {
                  setTask(await api("packages/export", snapshot.current));
                })
              }
            >
              确认导出工程包
            </button>
          </>
        )}
      </section>
      <section
        className="st-package-section"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files[0]);
        }}
      >
        <h3>整体导入</h3>
        <p>
          选择或拖入 .magickisa.zip；最大 2 GiB，解压后最大 8 GiB / 50,000
          文件。
        </p>
        <div>
          <button disabled={active} onClick={() => fileInput.current?.click()}>
            选择工程包
          </button>
          <input
            ref={fileInput}
            hidden
            aria-label="导入整体工程包"
            type="file"
            accept=".zip"
            disabled={active}
            onChange={(e) => {
              upload(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </div>
        {uploadProgress !== null && (
          <p role="status">
            上传 {uploadProgress}%{" "}
            <button onClick={() => xhr.current?.abort()}>取消上传</button>
          </p>
        )}
      </section>
      {task && (
        <section className="st-package-section" aria-label="工程包任务">
          <p role="status">
            {task.phase} · {task.completed} / {task.total || "…"}
          </p>
          {task.status === "running" && (
            <progress
              value={task.completed}
              max={task.total || Math.max(task.completed, 1)}
            />
          )}
          {task.summary && <PackageSummary value={task.summary} />}
          {task.status === "ready" && task.kind === "export" && (
            <div className="st-package-actions">
              <a
                className="st-upload"
                href={studioUrl(profile, `packages/${task.id}/download`)}
              >
                下载工程包 ZIP
              </a>
              <a href={studioUrl(profile, `packages/${task.id}/checksum`)}>
                下载 SHA256 校验文件
              </a>
            </div>
          )}
          {task.status === "ready" && task.kind === "import" && (
            <>
              <label>
                新项目名称
                <input
                  aria-label="新项目名称"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={pending || !name.trim()}
                onClick={() =>
                  void perform(async () => {
                    const item = await api("packages/commit", {
                      id: task.id,
                      name,
                    });
                    setTask({
                      ...task,
                      status: "complete",
                      phase: "已建立独立项目",
                    });
                    setProjects((await api("workspaces")).projects);
                    onOpen(item);
                  })
                }
              >
                建立新项目并打开
              </button>
            </>
          )}
          {!["complete", "cancelled", "failed"].includes(task.status) && (
            <button
              disabled={pending}
              onClick={() =>
                void perform(async () => {
                  await clearTask();
                })
              }
            >
              取消此任务
            </button>
          )}
          {["failed", "cancelled"].includes(task.status) && (
            <p>可重新检查导出，或重新选择工程包重试。</p>
          )}
        </section>
      )}
      <section className="st-package-section">
        <h3>项目列表</h3>
        {projects.map((item) => (
          <div className="st-package-project" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <small>
                {"现代开发版"} ·{" "}
                {item.lastOpened
                  ? new Date(item.lastOpened).toLocaleString()
                  : "原有工程"}
              </small>
            </div>
            <button
              disabled={
                active || item.id === (workspaceId() || `builtin-${profile}`)
              }
              onClick={() => onOpen(item)}
            >
              打开项目
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            void perform(async () => {
              const data = await api("open-directory", {});
              setError("");
              setDirectory(data.directory);
            })
          }
        >
          打开当前项目目录
        </button>
        <button
          onClick={() =>
            void perform(async () => {
              const data = await api("open-directory", {
                target: "backups",
              });
              setDirectory(data.directory);
            })
          }
        >
          打开保存备份目录
        </button>
        <p className="st-muted">
          每次保存前保留磁盘副本。备份不会自动删除；恢复前请关闭
          Studio，并先复制整个项目目录。
        </p>
        {directory && <p className="st-muted">{directory}</p>}
      </section>
    </Modal>
  );
}
function PackageSummary({ value }: { value: Summary }) {
  return (
    <div className="st-package-summary">
      <p>
        <strong>{value.name}</strong> · {"现代引擎"} · {value.scenes} 场景 ·{" "}
        {value.files} 素材 · {(value.bytes / 1024 ** 2).toFixed(1)} MB（压缩前）
      </p>
      {value.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      {value.external.length > 0 ? (
        <details>
          <summary>
            需要联网：{value.external.length} 个外部资源，包内保留链接
          </summary>
          <ul>
            {value.external.map((url) => (
              <li key={url}>{url}</li>
            ))}
          </ul>
        </details>
      ) : (
        <p>未发现直接引用的外部资源。</p>
      )}
    </div>
  );
}
