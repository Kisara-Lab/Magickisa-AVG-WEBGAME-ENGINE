import { useState } from "react";
import type { EngineStore } from "../engine/store";
import { resolveAsset } from "../engine/media";
export function GalleryPanel({ store }: { store: EngineStore }) {
  const [selected, setSelected] = useState("");
  const [imageError, setImageError] = useState(false),
    [retry, setRetry] = useState(0);
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
      {store.collections.error && (
        <button onClick={() => store.retrySave()}>重试保存收藏</button>
      )}
    </section>
  );
}
