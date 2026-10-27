import { useMemo } from "react";
import {
  BookOpen,
  Clapperboard,
  GitBranch,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { AuthorNode } from "./model";
export function SceneTree({
  nodes,
  selected,
  start,
  levels,
  search,
  collapsed,
  onCollapse,
  onSelect,
}: {
  nodes: AuthorNode[];
  selected: string;
  start: string;
  levels: Record<string, number>;
  search: string;
  collapsed: string[];
  onCollapse: (v: string[]) => void;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const result: { id: string; title: string; nodes: AuthorNode[] }[] = [];
    let current = "未分章";
    for (const n of nodes) {
      if ((n.sourceLevel || levels[n.id]) === 1) current = n.title;
      const title = n.chapter || current;
      if (result.at(-1)?.title !== title)
        result.push({ id: n.id, title, nodes: [] });
      result.at(-1)!.nodes.push(n);
    }
    return result;
  }, [nodes, levels]);
  return (
    <>
      {search &&
        !nodes.some((n) =>
          `${n.id} ${n.title} ${n.lines.map((l) => l.text).join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ) && (
          <p className="st-empty-actions">
            没有匹配场景；清空上方搜索可查看全部，或使用“＋”新增场景。
          </p>
        )}
      {groups.map((g) => {
        const visible = g.nodes.filter(
          (n) =>
            !search ||
            `${n.id} ${n.title} ${n.lines.map((l) => l.text).join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        );
        if (!visible.length) return null;
        const closed = !search && collapsed.includes(g.id);
        return (
          <section className="st-chapter" key={g.id}>
            <button
              className="st-chapter-heading"
              aria-expanded={!closed}
              onClick={() =>
                onCollapse(
                  closed
                    ? collapsed.filter((id) => id !== g.id)
                    : [...collapsed, g.id],
                )
              }
            >
              {closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <b>{g.title}</b>
              <small>{visible.length}</small>
            </button>
            {!closed &&
              visible.map((n) => (
                <button
                  key={n.id}
                  data-scene-id={n.id}
                  className={selected === n.id ? "selected" : ""}
                  onClick={() => onSelect(n.id)}
                  title={`${n.id} · ${n.title}`}
                >
                  <span
                    className={`st-node-kind ${n.presentation ? "presentation" : ""}`}
                  >
                    {n.presentation ? (
                      <Clapperboard size={15} />
                    ) : n.choices?.length ? (
                      <GitBranch size={15} />
                    ) : (
                      <BookOpen size={15} />
                    )}
                  </span>
                  <span>
                    <small>
                      {n.id}
                      {n.id === start ? " · 起点" : ""}
                    </small>
                    <b>{n.title}</b>
                  </span>
                  {!!n.choices?.length && <em>{n.choices.length}</em>}
                </button>
              ))}
          </section>
        );
      })}
    </>
  );
}
