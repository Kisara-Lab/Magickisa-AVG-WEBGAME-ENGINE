import { useMemo, useState, useRef } from "react";
import type { AuthorProject } from "./model";
export function GraphEditor({
  project,
  selected,
  onSelect,
  onEdit,
}: {
  project: AuthorProject;
  selected: string;
  onSelect: (id: string) => void;
  onEdit: () => void;
}) {
  const [zoom, setZoom] = useState(0.8),
    [filter, setFilter] = useState("");
  const [neighbors, setNeighbors] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const adjacent = new Set([
    selected,
    ...project.nodes
      .filter(
        (n) =>
          n.next === selected || n.choices?.some((c) => c.target === selected),
      )
      .map((n) => n.id),
    project.nodes.find((n) => n.id === selected)?.next,
    ...(project.nodes.find((n) => n.id === selected)?.choices || []).map(
      (c) => c.target,
    ),
  ]);
  const nodes = project.nodes.filter(
    (n) =>
      (!filter || `${n.id} ${n.title}`.includes(filter)) &&
      (!neighbors || adjacent.has(n.id)),
  );
  const positions = useMemo(
    () =>
      new Map(
        nodes.map((n, i) => [
          n.id,
          { x: 30 + (i % 4) * 280, y: 30 + Math.floor(i / 4) * 160 },
        ]),
      ),
    [nodes.map((n) => n.id).join("|")],
  );
  const width = 1160,
    height = Math.max(400, Math.ceil(nodes.length / 4) * 160 + 40);
  const links = nodes.flatMap((n) => [
    ...(n.next
      ? [
          {
            from: n.id,
            to: n.next,
            label: "继续",
            conditional: !!project.nodes.find((t) => t.id === n.next)
              ?.condition,
            condition: project.nodes.find((t) => t.id === n.next)?.condition,
          },
        ]
      : []),
    ...(n.choices || []).map((c) => ({
      from: n.id,
      to: c.target,
      label: c.label,
      conditional: !!(
        c.condition ||
        c.once ||
        project.nodes.find((t) => t.id === c.target)?.condition
      ),
      condition: {
        choice: c.condition,
        once: c.once,
        target: project.nodes.find((t) => t.id === c.target)?.condition,
      },
    })),
  ]);
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">STORY FLOW</span>
          <h2>剧情流程图</h2>
          <p>
            {project.nodes.length} 个场景 · {links.length} 条连接
          </p>
        </div>
        <button onClick={onEdit}>编辑选中场景</button>
      </div>
      <div className="st-graph-tools">
        <button
          onClick={() => {
            setZoom(
              Math.max(
                0.08,
                Math.min(
                  1,
                  (scroller.current?.clientWidth || 800) / width,
                  (scroller.current?.clientHeight || 500) / height,
                ),
              ),
            );
          }}
        >
          适应视图
        </button>
        <button
          onClick={() => {
            setFilter("");
            requestAnimationFrame(() =>
              scroller.current
                ?.querySelector(`[aria-label="流程节点 ${selected}"]`)
                ?.scrollIntoView({ block: "center", inline: "center" }),
            );
          }}
        >
          定位当前节点
        </button>
        <label>
          <input
            type="checkbox"
            checked={neighbors}
            onChange={(e) => setNeighbors(e.target.checked)}
          />
          只看相邻连接
        </label>
        <input
          aria-label="筛选流程节点"
          placeholder="筛选节点或场景名称…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label>
          缩放{" "}
          <input
            aria-label="流程图缩放"
            type="range"
            min={0.08}
            max={1.2}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          {Math.round(zoom * 100)}%
        </label>
      </div>
      <div className="st-graph-scroll" ref={scroller}>
        <div style={{ width: width * zoom, height: height * zoom }}>
          <svg
            className="st-graph"
            width={width}
            height={height}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            role="img"
            aria-label="剧情节点与分支连接"
          >
            <defs>
              <marker
                id="st-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {links.map((l, i) => {
              const a = positions.get(l.from),
                b = positions.get(l.to);
              if (!a || !b) return null;
              const active = l.from === selected || l.to === selected;
              return (
                <path
                  key={i}
                  className={active ? "active" : ""}
                  d={`M${a.x + 240} ${a.y + 58} C${a.x + 275} ${a.y + 58},${b.x - 30} ${b.y + 58},${b.x} ${b.y + 58}`}
                  markerEnd="url(#st-arrow)"
                  strokeDasharray={l.conditional ? "7 5" : undefined}
                >
                  <title>
                    {l.label}
                    {l.conditional
                      ? ` · 条件连接：${JSON.stringify(l.condition)}`
                      : " · 无条件"}
                  </title>
                </path>
              );
            })}
            {nodes.map((n) => {
              const p = positions.get(n.id)!;
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`流程节点 ${n.id}`}
                  className={`st-graph-node ${selected === n.id ? "selected" : ""}`}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => onSelect(n.id)}
                  onDoubleClick={onEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSelect(n.id);
                  }}
                >
                  <rect width="240" height="112" rx="10" />
                  <text className="st-graph-id" x="16" y="25">
                    {n.id}
                    {project.startNodeId === n.id ? " · START" : ""}
                  </text>
                  <text x="16" y="53">
                    {n.title.length > 15 ? n.title.slice(0, 15) + "…" : n.title}
                  </text>
                  <text className="st-graph-meta" x="16" y="84">
                    {n.lines.length} 句 · {n.choices?.length || 0} 个分支
                    {n.presentation ? " · " + n.presentation : ""}
                    {n.condition ? " · 进入条件" : ""}
                  </text>
                  <circle cx="0" cy="58" r="5" />
                  <circle cx="240" cy="58" r="5" />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <p className="st-muted">
        点击节点查看连接，双击进入编辑。虚线表示条件、一次性选项或目标进入门槛；悬停查看条件。连线表示已配置关系，不保证当前状态可通行。
      </p>
    </>
  );
}
