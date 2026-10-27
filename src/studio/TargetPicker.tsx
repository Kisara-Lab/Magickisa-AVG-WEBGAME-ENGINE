import { useContext, useId, useState } from "react";
import { WorkspaceContext } from "./workspace";
import type { StoryNode } from "../engine/types";
export function TargetPicker({
  nodes,
  value,
  onChange,
  onVisit,
  label = "跳转目标",
  allowEmpty = false,
  emptyLabel = "无下一场景",
}: {
  nodes: StoryNode[];
  value: string;
  onChange: (id: string) => void;
  onVisit?: (id: string) => void;
  label?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const context = useContext(WorkspaceContext),
    visit = onVisit ?? context?.visitNode;
  const id = useId();
  const selected = nodes.find((n) => n.id === value),
    matches = nodes.filter((n) =>
      `${n.id} ${n.title} ${n.chapter ?? ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    );
  return (
    <div className="st-target-picker">
      <label htmlFor={id + "search"}>{label} · 搜索</label>
      <input
        id={id + "search"}
        value={query}
        placeholder="ID、标题或章节"
        onChange={(e) => setQuery(e.target.value)}
      />
      <label htmlFor={id}>选择{label}</label>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {!matches.some((n) => n.id === value) && value && (
          <option value={value}>
            {selected?.title ?? "目标不存在"} · {value}
          </option>
        )}
        {matches.map((n) => (
          <option key={n.id} value={n.id}>
            {n.chapter ?? "未分章"} / {n.title} · {n.id}
          </option>
        ))}
      </select>
      <small>
        {selected
          ? `${selected.lines.length} 句 · ${selected.choices?.length ?? 0} 个分支`
          : "未选择有效目标"}
      </small>
      {!matches.length && (
        <p role="status">
          没有匹配的目标。
          <button onClick={() => setQuery("")}>清除目标搜索</button>
        </p>
      )}
      {selected && visit && (
        <button onClick={() => visit(value)}>查看目标</button>
      )}
    </div>
  );
}
