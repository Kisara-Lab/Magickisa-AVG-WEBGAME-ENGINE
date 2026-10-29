import { useState } from "react";
import type { EngineStore } from "../engine/store";
import { resolveAsset } from "../engine/media";
import { downloadText, type ConfirmAction } from "./SavePanel";
export function GalleryPanel({
  store,
  confirm,
}: {
  store: EngineStore;
  confirm: ConfirmAction;
}) {
  const [selected, setSelected] = useState("");
  const [imageError, setImageError] = useState(false),
    [retry, setRetry] = useState(0);
  const [recoveryError, setRecoveryError] = useState("");
  const run = (action: () => void) => {
    try {
      action();
      setRecoveryError("");
      setRetry((n) => n + 1);
    } catch (error) {
      setRecoveryError(String(error));
    }
  };
  const progress = store.collections.snapshot;
  const entries = store.project.gallery ?? [];
  const entry = entries.find(
    (g) => g.id === selected && progress.gallery.includes(g.id),
  );
  return (
    <section>
      <p>
        已收集 {entries.filter((g) => progress.gallery.includes(g.id)).length} /{" "}
        {entries.length} 张画面。收藏跨周目保留，不改变剧情变量。
      </p>
      {store.collections.error && <p role="alert">{store.collections.error}</p>}
      {recoveryError && <p role="alert">{recoveryError}</p>}
      <div className="player-menu">
        {entries.map((g) => (
          <button
            key={g.id}
            disabled={!progress.gallery.includes(g.id)}
            onClick={() => {
              setSelected(g.id);
              setImageError(false);
            }}
          >
            {progress.gallery.includes(g.id) ? g.title : "尚未解锁"}
          </button>
        ))}
      </div>
      {!entries.length && <p>作者尚未设置画廊内容。</p>}
      {entry && (
        <figure>
          <img
            key={`${entry.id}:${retry}`}
            onError={() => setImageError(true)}
            style={{
              maxWidth: "100%",
              maxHeight: "60dvh",
              objectFit: "contain",
            }}
            src={resolveAsset(store.project, entry.asset)}
            alt={entry.title}
          />
          <figcaption>{entry.title}</figcaption>
          {imageError && (
            <p role="alert">
              图片无法加载。
              <button
                onClick={() => {
                  setImageError(false);
                  setRetry((n) => n + 1);
                }}
              >
                重试画廊图片
              </button>
            </p>
          )}
        </figure>
      )}
      <h3>已达成结局</h3>
      {progress.endings.length ? (
        <ul>
          {progress.endings.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      ) : (
        <p>尚未达成结局。</p>
      )}
      <button
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(progress, null, 2)], {
              type: "application/json",
            }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "magickisa-collections.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        导出收藏记录
      </button>
      {store.collections.needsRecovery ? (
        <div>
          <p>
            重新读取可恢复暂时的存储错误；若原数据已损坏，请先导出，再备份并重建。重建只保留本次已获得收藏。
          </p>
          <button onClick={() => run(() => store.collections.reload())}>
            重新读取收藏记录
          </button>
          <button
            onClick={() =>
              run(() =>
                downloadText(
                  store.collections.raw() ?? "",
                  "magickisa-collections-original.json",
                ),
              )
            }
          >
            导出原收藏数据
          </button>
          <button
            onClick={() =>
              confirm(
                "备份原收藏数据并以本次收藏重建？无法解析的旧解锁记录不能自动恢复；备份失败将停止操作。",
                () => run(() => store.collections.rebuild()),
              )
            }
          >
            备份并重建收藏
          </button>
        </div>
      ) : (
        store.collections.error && (
          <button onClick={() => store.retrySave()}>重试保存收藏</button>
        )
      )}
    </section>
  );
}
