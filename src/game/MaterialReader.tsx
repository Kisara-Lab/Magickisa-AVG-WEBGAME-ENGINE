import { useEffect, useState, useRef } from "react";
import type { MaterialEntry } from "../engine/types";
export function MaterialReader({
  entries,
  read,
  selected,
  markRead,
}: {
  entries: MaterialEntry[];
  read: string[];
  selected?: string;
  markRead: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [id, setId] = useState(selected ?? "");
  useEffect(() => {
    if (selected) {
      setId(selected);
      setQuery("");
    }
  }, [selected]);
  const entry = entries.find((m) => m.id === id);
  const body = useRef<HTMLElement>(null);
  const alreadyRead = !!entry && read.includes(entry.id);
  useEffect(() => {
    if (entry && !alreadyRead) {
      const visible = () => {
        const rect = body.current?.getBoundingClientRect();
        if (
          rect &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          document.visibilityState === "visible"
        )
          markRead(entry.id);
      };
      const observer = new IntersectionObserver(visible);
      if (body.current) observer.observe(body.current);
      document.addEventListener("visibilitychange", visible);
      const frame = requestAnimationFrame(visible);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        document.removeEventListener("visibilitychange", visible);
      };
    }
  }, [entry?.id, alreadyRead, markRead]);
  return (
    <section className="material-reader">
      <div>
        <label>
          搜索资料
          <input
            aria-label="搜索资料"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!entries.length && <p>暂无已解锁资料，继续探索故事后再来看看。</p>}
        {entries
          .filter((m) => `${m.title} ${m.body}`.includes(query))
          .map((m) => (
            <button
              key={m.id}
              aria-pressed={id === m.id}
              onClick={() => {
                setId(m.id);
                if (innerWidth <= 700)
                  requestAnimationFrame(() =>
                    body.current?.scrollIntoView({ block: "nearest" }),
                  );
              }}
            >
              {m.title} {read.includes(m.id) ? "· 已读" : "· 未读"}
            </button>
          ))}
        {entries.length > 0 &&
          !entries.some((m) => `${m.title} ${m.body}`.includes(query)) && (
            <p>
              没有匹配资料。
              <button onClick={() => setQuery("")}>清除搜索</button>
            </p>
          )}
      </div>
      <article aria-label="资料正文" ref={body}>
        {entry ? (
          <>
            <h3>{entry.title}</h3>
            <p className="prewrap">{entry.body}</p>
          </>
        ) : (
          <p>选择一条资料阅读。仅打开列表不会标记已读。</p>
        )}
      </article>
    </section>
  );
}
