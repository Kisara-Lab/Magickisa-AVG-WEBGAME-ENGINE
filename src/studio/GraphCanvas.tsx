import { useSelection, reveal } from "./workspace";
import { StoryRuntime } from "../engine/runtime";
import { memo, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Handle,
  Position,
  Controls,
  MiniMap,
  Background,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeProps,
  type Node,
  type Connection,
} from "@xyflow/react";
import { graphLayout } from "./graphLayout";
import "@xyflow/react/dist/style.css";
import "./investigation.css";
import type { AuthorProject } from "./model";
import { newNode, uniqueId } from "./model";
import type { EngineSave, StoryChoice, StoryNode } from "../engine/types";
import { analyzeGraph, type StoryEdge } from "../engine/graph";
import {
  explainBranches,
  explainNext,
  conditionSummary,
} from "../engine/investigation";
import { presetSave } from "./investigationModel";
import { Card, Field, Check, ConditionEditor, EffectsEditor } from "./fields";
import { TargetPicker } from "./TargetPicker";
import type { StudioDataController } from "./useStudioData";
import { AuthoringStatus } from "./InvestigationPanel";
import { readPreference, writePreference } from "./graphPreferences";
type FlowData = { story: StoryNode; start: boolean };
const StoryCard = memo(function StoryCard({
  data,
  selected,
}: NodeProps<Node<FlowData>>) {
  const n = data.story;
  const update = useUpdateNodeInternals();
  useEffect(() => update(n.id), [update, n]);
  return (
    <div
      className={"st-flow-card" + (selected ? " selected" : "")}
      aria-label={"流程节点 " + n.id}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <strong>{n.title || "未命名场景"}</strong>
      <small>
        {n.id}
        {data.start ? " · 起点" : ""}
        {n.ending ? " · 结局" : ""}
      </small>
      <small>
        {n.chapter || "未分章"} · {n.lines.length} 句 · {n.choices?.length ?? 0}{" "}
        分支
      </small>
      <small>
        {n.condition ? "🔒 进入条件 " : ""}
        {n.onEnter?.length || n.onComplete?.length ? "✦ 效果 " : ""}
        {n.presentation ?? ""}
      </small>
      <div className="st-flow-port">
        下一场景
        <Handle type="source" position={Position.Right} id="next" />
      </div>
      {(n.choices ?? []).map((c) => (
        <div
          className="st-flow-port"
          key={c.id}
          title={conditionSummary(c.condition)}
        >
          {c.label}
          {c.once ? " · 仅一次" : ""}
          {c.condition ? " · 条件" : ""}
          <Handle
            type="source"
            position={Position.Right}
            id={"choice:" + c.id}
          />
        </div>
      ))}
      <div className="st-flow-port">
        ＋ 新增分支
        <Handle type="source" position={Position.Right} id="new" />
      </div>
    </div>
  );
});
const nodeTypes = { story: StoryCard };
interface Props {
  project: AuthorProject;
  selected: string;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onChange: (p: AuthorProject) => void;
  onDelete: () => void;
  authoring: StudioDataController;
  scope: string;
  runtime: EngineSave | null;
  runtimeStale: boolean;
}
export function GraphEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphWorkspace {...props} />
    </ReactFlowProvider>
  );
}
function GraphWorkspace({
  project,
  selected,
  onSelect,
  onEdit,
  onChange,
  onDelete,
  authoring,
  scope,
  runtime,
  runtimeStale,
}: Props) {
  const flow = useReactFlow();
  const [prefs, setPrefs] = useState(() =>
    readPreference(scope, project.nodes.length > 300 ? "neighbors" : "all"),
  );
  const { query, mode, chapter, depth, direction, conditional, problems } =
    prefs;
  const initialViewport = useRef(prefs.viewport);
  const [expanded, setExpanded] = useState<string[]>([]),
    [edgeKey, setEdgeKey] = useSelection("graph-edge", ""),
    [pending, setPending] = useState<Connection | null>(null),
    [label, setLabel] = useState("新的选择"),
    [error, setError] = useState(""),
    [debugSource, setDebugSource] = useState("none"),
    [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({});
  const [relationQuery, setRelationQuery] = useState(""),
    [boundaryLimit, setBoundaryLimit] = useState(100);
  const [preferenceError, setPreferenceError] = useState("");
  useEffect(() => {
    setPreferenceError(
      writePreference(scope, prefs)
        ? ""
        : "偏好未保存：浏览器存储不可用，本会话仍可继续。",
    );
  }, [scope, prefs]);
  const index = useMemo(() => analyzeGraph(project), [project]);
  const node = index.byId.get(selected) ?? project.nodes[0],
    edge = index.edges.find((e) => e.key === edgeKey),
    owner = edge ? index.byId.get(edge.from) : node,
    choice = edge?.id
      ? owner?.choices?.find((c) => c.id === edge.id)
      : undefined;
  const positions = useMemo(
    () => graphLayout(project.nodes, index.edges),
    [project.nodes.map((n) => n.id).join("\0")],
  );
  const shown = useMemo(() => {
    const ids = new Set<string>();
    if (mode === "neighbors") {
      ids.add(selected);
      let frontier = [selected];
      for (let i = 0; i < depth; i++) {
        const next: string[] = [];
        for (const id of frontier) {
          const links = [
            ...(direction !== "out" ? (index.incoming.get(id) ?? []) : []),
            ...(direction !== "in" ? (index.outgoing.get(id) ?? []) : []),
          ];
          for (const e of links) {
            const other = e.from === id ? e.to : e.from;
            if (!ids.has(other)) {
              ids.add(other);
              next.push(other);
            }
          }
        }
        frontier = next;
      }
    } else
      for (const n of project.nodes)
        if (mode !== "chapter" || (n.chapter ?? "") === chapter) ids.add(n.id);
    const bad = new Set(index.issues.map((i) => i.nodeId));
    for (const id of [...ids]) {
      const n = index.byId.get(id);
      if (
        !n ||
        (query &&
          !`${n.id} ${n.title} ${n.chapter ?? ""}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())) ||
        (problems && !bad.has(id))
      )
        ids.delete(id);
    }
    expanded.forEach((id) => ids.add(id));
    return ids;
  }, [
    index,
    project,
    selected,
    mode,
    chapter,
    depth,
    direction,
    query,
    problems,
    expanded,
  ]);
  const visibleEdges = index.edges.filter(
      (e) =>
        shown.has(e.from) && shown.has(e.to) && (!conditional || e.conditional),
    ),
    boundaries = index.edges.filter(
      (e) => shown.has(e.from) !== shown.has(e.to),
    );
  const nodes: Node<FlowData>[] = project.nodes
    .filter((n) => shown.has(n.id))
    .map((n) => ({
      id: n.id,
      type: "story",
      initialWidth: 260,
      initialHeight: 180 + (n.choices?.length ?? 0) * 32,
      position: drag[n.id] ??
        authoring.data.positions[n.id] ??
        positions[n.id] ?? { x: 0, y: 0 },
      data: { story: n, start: n.id === project.startNodeId },
      selected: selected === n.id,
    }));
  const state = useMemo(() => {
    try {
      if (debugSource === "runtime") return runtime;
      const preset = authoring.data.presets.find((p) => p.id === debugSource);
      return preset
        ? new StoryRuntime(project, presetSave(project, preset)).save
        : null;
    } catch {
      return null;
    }
  }, [debugSource, runtime, project, authoring.data.presets]);
  const nextExplanation =
    state && owner ? explainNext(project, owner, state) : null;
  const explanations =
      state && owner
        ? explainBranches(project, owner, { ...state, nodeId: owner.id })
        : [],
    isStale = debugSource === "runtime" && runtimeStale;
  function patch(n: StoryNode) {
    onChange({
      ...project,
      nodes: project.nodes.map((old) => (old.id === n.id ? n : old)),
    });
  }
  function patchChoice(next: StoryChoice) {
    if (owner)
      patch({
        ...owner,
        choices: owner.choices!.map((c) => (c.id === next.id ? next : c)),
      });
  }
  function connect(connection: Connection) {
    setPending(connection);
    setLabel("新的选择");
    setError("");
  }
  function focusRule(label: string) {
    setTimeout(() => {
      const rule = Array.from(
          document.querySelectorAll(".st-flow-inspector [data-rule-label]"),
        ).find((e) => e.getAttribute("data-rule-label") === label),
        target = rule?.querySelector<HTMLElement>("input,select,button");
      if (target) reveal(target);
    }, 0);
  }
  function applyConnection() {
    if (!pending) return;
    const source = index.byId.get(pending.source);
    if (!source || !index.byId.has(pending.target)) {
      setError("连接目标不存在");
      return;
    }
    if (
      pending.sourceHandle?.startsWith("choice:") &&
      !source.choices?.some((c) => c.id === pending.sourceHandle!.slice(7))
    ) {
      setError("原分支已被删除，请重新建立连接。");
      return;
    }
    if (pending.sourceHandle === "next")
      patch({ ...source, next: pending.target });
    else if (pending.sourceHandle?.startsWith("choice:"))
      patch({
        ...source,
        choices: source.choices?.map((c) =>
          c.id === pending.sourceHandle!.slice(7)
            ? { ...c, target: pending.target }
            : c,
        ),
      });
    else {
      if (!label.trim()) {
        setError("请输入分支文案");
        return;
      }
      patch({
        ...source,
        choices: [
          ...(source.choices ?? []),
          {
            id: uniqueId(
              "choice",
              project.nodes.flatMap((n) => n.choices?.map((c) => c.id) ?? []),
            ),
            label,
            target: pending.target,
          },
        ],
      });
    }
    setPending(null);
  }
  const selectedLinks = [
    ...(index.incoming.get(selected) ?? []),
    ...(index.outgoing.get(selected) ?? []),
  ].filter((e, i, a) => a.findIndex((x) => x.key === e.key) === i);
  if (!authoring.ready && !authoring.error)
    return <p role="status">正在读取流程布局与测试状态…</p>;
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">INVESTIGATION FLOW</span>
          <h2>剧情流程图</h2>
          <p>
            {project.nodes.length} 个场景 · {index.edges.length} 条连接 ·
            静态连通不保证可通行
          </p>
        </div>
        <button
          onClick={() => {
            const n = newNode(project);
            onChange({ ...project, nodes: [...project.nodes, n] });
            onSelect(n.id);
          }}
        >
          新增场景
        </button>
      </div>
      <AuthoringStatus controller={authoring} />
      {preferenceError && <p role="alert">{preferenceError}</p>}
      <div className="st-graph-tools">
        <button onClick={() => void flow.fitView({ duration: 0 })}>
          适应视图
        </button>
        <button
          onClick={() => {
            setExpanded((e) => [...e, selected]);
            setTimeout(
              () =>
                void flow.fitView({ nodes: [{ id: selected }], duration: 0 }),
              0,
            );
          }}
        >
          定位当前节点
        </button>
        <button
          disabled={!authoring.ready}
          onClick={() => {
            authoring.change({
              ...authoring.data,
              positions: {
                ...authoring.data.positions,
                ...graphLayout(
                  project.nodes.filter((n) => shown.has(n.id)),
                  visibleEdges,
                ),
              },
            });
            setDrag({});
          }}
        >
          自动整理当前视图
        </button>
        <label>
          视图
          <select
            aria-label="视图"
            value={mode}
            onChange={(e) => {
              setExpanded([]);
              setPrefs({
                ...prefs,
                mode: e.target.value as typeof mode,
                chapter:
                  e.target.value === "chapter" &&
                  !project.nodes.some(
                    (n) => (n.chapter ?? "") === prefs.chapter,
                  )
                    ? (node?.chapter ?? "")
                    : prefs.chapter,
              });
            }}
          >
            <option value="all">全图</option>
            <option value="chapter">按章节</option>
            <option value="neighbors">当前节点邻域</option>
          </select>
        </label>
        {mode === "chapter" && (
          <label>
            章节
            <select
              aria-label="流程章节"
              value={chapter}
              onChange={(e) => setPrefs({ ...prefs, chapter: e.target.value })}
            >
              {[...new Set(project.nodes.map((n) => n.chapter ?? ""))].map(
                (c) => (
                  <option key={c} value={c}>
                    {c || "未分章"}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        {mode === "neighbors" && (
          <>
            <label>
              层数
              <select
                aria-label="邻域层数"
                value={depth}
                onChange={(e) =>
                  setPrefs({ ...prefs, depth: Number(e.target.value) })
                }
              >
                <option value={1}>一层</option>
                <option value={2}>两层</option>
              </select>
            </label>
            <label>
              方向
              <select
                aria-label="连接方向"
                value={direction}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    direction: e.target.value as typeof direction,
                  })
                }
              >
                <option value="both">入边与出边</option>
                <option value="in">入边</option>
                <option value="out">出边</option>
              </select>
            </label>
          </>
        )}
        <input
          aria-label="筛选流程节点"
          placeholder="ID、标题、章节"
          value={query}
          onChange={(e) => setPrefs({ ...prefs, query: e.target.value })}
        />
        <Check
          label="只看条件连接"
          value={conditional}
          onChange={(value) => setPrefs({ ...prefs, conditional: value })}
        />
        <Check
          label="只看问题节点"
          value={problems}
          onChange={(value) => setPrefs({ ...prefs, problems: value })}
        />
      </div>
      <div className="st-flow-workspace">
        {!shown.size && (
          <p role="status">
            当前筛选没有场景。
            <button
              onClick={() =>
                setPrefs({
                  ...prefs,
                  query: "",
                  problems: false,
                  conditional: false,
                  mode: "all",
                })
              }
            >
              清除筛选
            </button>
          </p>
        )}
        <div>
          <div
            className="st-flow-canvas"
            aria-label="可编辑剧情画布"
            onKeyDownCapture={(event) => {
              if (
                event.nativeEvent.isComposing ||
                (event.target as HTMLElement).closest(
                  "input,textarea,select,button",
                )
              )
                return;
              const element = (
                  event.target as HTMLElement
                ).closest<HTMLElement>(".react-flow__node,.react-flow__edge"),
                id = element?.dataset.id;
              if (!id) return;
              const n = index.byId.get(id),
                e = index.edges.find((e) => e.key === id);
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                if (n) {
                  onSelect(id);
                  setEdgeKey("");
                } else if (e) setEdgeKey(id);
              }
              if ((event.key === "Delete" || event.key === "Backspace") && e) {
                event.preventDefault();
                event.stopPropagation();
                const from = index.byId.get(e.from)!;
                if (e.kind === "next") patch({ ...from, next: undefined });
                else if (confirm("删除该分支及其条件和效果？"))
                  patch({
                    ...from,
                    choices: from.choices?.filter((c) => c.id !== e.id),
                  });
                setEdgeKey("");
              }
              const movement: Record<string, [number, number]> = {
                ArrowLeft: [-20, 0],
                ArrowRight: [20, 0],
                ArrowUp: [0, -20],
                ArrowDown: [0, 20],
              };
              if (n && authoring.ready && movement[event.key]) {
                event.preventDefault();
                event.stopPropagation();
                const current = flow.getNode(id)?.position;
                if (current) {
                  const [x, y] = movement[event.key],
                    factor = event.shiftKey ? 4 : 1;
                  authoring.change({
                    ...authoring.data,
                    positions: {
                      ...authoring.data.positions,
                      [id]: {
                        x: current.x + x * factor,
                        y: current.y + y * factor,
                      },
                    },
                  });
                }
              }
            }}
          >
            <ReactFlow
              onInit={(instance) => {
                if (!initialViewport.current && project.nodes.length <= 300)
                  requestAnimationFrame(() =>
                    requestAnimationFrame(
                      () => void instance.fitView({ duration: 0 }),
                    ),
                  );
              }}
              nodes={nodes}
              edges={visibleEdges.map((e) => ({
                id: e.key,
                source: e.from,
                target: e.to,
                sourceHandle: e.kind === "next" ? "next" : "choice:" + e.id,
                targetHandle: "in",
                label:
                  e.label +
                  (index.byId.get(e.from)?.choices?.find((c) => c.id === e.id)
                    ?.once
                    ? " · 仅一次"
                    : "") +
                  (e.conditional ? " · 门槛" : ""),
                ariaLabel: `${e.kind === "next" ? "下一场景" : "分支"} ${e.from} ${e.label} 到 ${e.to}${e.conditional ? " 含门槛" : ""}`,
                selected: e.key === edgeKey,
                type: e.from === e.to ? "default" : "smoothstep",
                markerEnd: { type: MarkerType.ArrowClosed },
                style: {
                  stroke: e.conditional ? "#77501d" : "#32270f",
                  strokeDasharray: e.conditional ? "6 4" : undefined,
                },
              }))}
              nodeTypes={nodeTypes}
              onConnect={connect}
              onReconnect={(old, c) =>
                connect({
                  ...c,
                  source: old.source,
                  sourceHandle: old.sourceHandle ?? null,
                })
              }
              onNodeClick={(_, n) => {
                onSelect(n.id);
                setEdgeKey("");
              }}
              onNodeDoubleClick={() => onEdit()}
              onEdgeClick={(_, e) => setEdgeKey(e.id)}
              onNodeDrag={(_, n) =>
                setDrag((d) => ({ ...d, [n.id]: n.position }))
              }
              onNodeDragStop={(_, n) => {
                authoring.change({
                  ...authoring.data,
                  positions: {
                    ...authoring.data.positions,
                    [n.id]: n.position,
                  },
                });
                setDrag({});
              }}
              onMoveEnd={(_, view) =>
                setPrefs((p) => ({ ...p, viewport: view }))
              }
              defaultViewport={prefs.viewport}
              deleteKeyCode={null}
              onlyRenderVisibleElements
              nodesDraggable={authoring.ready}
              fitView={!prefs.viewport && project.nodes.length <= 300}
              minZoom={0.08}
              maxZoom={2}
            >
              <Controls />
              <MiniMap
                pannable
                zoomable
                nodeColor="#a86e14"
                bgColor="#ffedbf"
                maskColor="#533a1230"
              />
              <Background />
            </ReactFlow>
          </div>
          {!!boundaries.length && (
            <details>
              <summary>
                {boundaries.length} 条连接跨越当前视图（目标仍存在）
              </summary>
              {boundaries.slice(0, boundaryLimit).map((e) => (
                <button
                  key={e.key}
                  onClick={() => setExpanded((ids) => [...ids, e.from, e.to])}
                >
                  {e.from} → {e.to} · 展开
                </button>
              ))}
              {boundaries.length > boundaryLimit && (
                <button onClick={() => setBoundaryLimit((n) => n + 100)}>
                  显示更多跨范围连接
                </button>
              )}
            </details>
          )}
          <Card title="当前节点入边／出边">
            <p>关系列表支持键盘与手机操作，可直接选择并编辑。</p>
            <input
              aria-label="搜索当前节点连接"
              value={relationQuery}
              placeholder="来源、目标或分支文案"
              onChange={(e) => setRelationQuery(e.target.value)}
            />
            {selectedLinks
              .filter((e) =>
                `${e.from} ${e.to} ${e.label}`
                  .toLocaleLowerCase()
                  .includes(relationQuery.toLocaleLowerCase()),
              )
              .map((e) => (
                <button key={e.key} onClick={() => setEdgeKey(e.key)}>
                  {e.from} → {e.label} → {e.to}
                </button>
              ))}
            {!selectedLinks.length && <p>暂无连接，请使用右侧表单添加。</p>}
          </Card>
          <details>
            <summary>连接检查 · {index.issues.length} 个提示</summary>
            {index.issues.map((issue, i) => (
              <button
                key={i}
                onClick={() => {
                  onSelect(issue.nodeId);
                  setExpanded((e) => [...e, issue.nodeId]);
                  setEdgeKey(issue.edgeKey ?? "");
                }}
              >
                {issue.severity === "error" ? "错误" : "提示"} · {issue.nodeId}{" "}
                · {issue.message}
              </button>
            ))}
          </details>
        </div>
        <aside className="st-flow-inspector" aria-label="流程逻辑检查器">
          {pending && (
            <Card title="应用连接">
              <TargetPicker
                nodes={project.nodes}
                label="连接目标"
                value={pending.target}
                onChange={(target) => setPending({ ...pending, target })}
              />
              <p>
                {pending.source} → {pending.target}
              </p>
              <p>
                原目标：
                {pending.sourceHandle === "next"
                  ? (index.byId.get(pending.source)?.next ?? "无")
                  : (index.byId
                      .get(pending.source)
                      ?.choices?.find(
                        (c) => "choice:" + c.id === pending.sourceHandle,
                      )?.target ?? "新增")}
                ；新目标：{pending.target}
              </p>
              {pending.sourceHandle === "new" && (
                <Field label="新分支文案" value={label} onChange={setLabel} />
              )}
              <button className="primary" onClick={applyConnection}>
                应用连接
              </button>
              <button onClick={() => setPending(null)}>取消连接</button>
            </Card>
          )}
          {error && <p role="alert">{error}</p>}
          {owner && (
            <Card title={edge ? "连接属性" : "场景属性"}>
              <p>
                {owner.id}
                {edge ? " → " + edge.to : ""}
              </p>
              <button
                onClick={() => {
                  onSelect(owner.id);
                  onEdit();
                }}
              >
                前往完整剧本
              </button>
              {!edge && (
                <>
                  <Field
                    label="场景标题"
                    value={owner.title}
                    onChange={(title) => patch({ ...owner, title })}
                  />
                  <Field
                    label="章节"
                    value={owner.chapter ?? ""}
                    onChange={(chapter) => patch({ ...owner, chapter })}
                  />
                  <Field
                    label="结局标识"
                    value={owner.ending ?? ""}
                    onChange={(ending) =>
                      patch({ ...owner, ending: ending || undefined })
                    }
                  />
                </>
              )}
              {choice ? (
                <>
                  <Field
                    label="分支文案"
                    value={choice.label}
                    onChange={(label) => patchChoice({ ...choice, label })}
                  />
                  <TargetPicker
                    nodes={project.nodes}
                    value={choice.target}
                    onChange={(target) => patchChoice({ ...choice, target })}
                    onVisit={(id) => {
                      setEdgeKey("");
                      onSelect(id);
                    }}
                  />
                  <Check
                    label="仅可选择一次"
                    value={choice.once}
                    onChange={(once) => patchChoice({ ...choice, once })}
                  />
                  <p>{conditionSummary(choice.condition)}</p>
                  <ConditionEditor
                    materials={project.materials}
                    label="分支可选条件"
                    nodes={project.nodes}
                    value={choice.condition}
                    onChange={(condition) =>
                      patchChoice({ ...choice, condition })
                    }
                  />
                  <EffectsEditor
                    audio={project.audio}
                    materials={project.materials}
                    label="选择后效果"
                    value={choice.effects}
                    onChange={(effects) => patchChoice({ ...choice, effects })}
                  />
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm("删除该分支及其条件和效果？")) {
                        patch({
                          ...owner,
                          choices: owner.choices?.filter(
                            (c) => c.id !== choice.id,
                          ),
                        });
                        setEdgeKey("");
                      }
                    }}
                  >
                    删除分支及其条件和效果
                  </button>
                </>
              ) : (
                <>
                  <TargetPicker
                    nodes={project.nodes}
                    label="下一场景"
                    allowEmpty
                    value={owner.next ?? ""}
                    onChange={(next) => {
                      if (owner.next && next)
                        connect({
                          source: owner.id,
                          target: next,
                          sourceHandle: "next",
                          targetHandle: "in",
                        });
                      else patch({ ...owner, next: next || undefined });
                    }}
                    onVisit={(id) => {
                      setEdgeKey("");
                      onSelect(id);
                    }}
                  />
                  {edge && (
                    <button
                      onClick={() => {
                        patch({ ...owner, next: undefined });
                        setEdgeKey("");
                      }}
                    >
                      清除这条连接
                    </button>
                  )}
                </>
              )}
              {edge && (
                <details>
                  <summary>
                    目标进入门槛 ·{" "}
                    {conditionSummary(index.byId.get(edge.to)?.condition)}
                  </summary>
                  <p>目标条件在分支效果应用后判断，修改影响全部入边。</p>
                  <button
                    onClick={() => {
                      onSelect(edge.to);
                      setEdgeKey("");
                      focusRule("条件");
                    }}
                  >
                    定位目标条件
                  </button>
                </details>
              )}
              {!edge && (
                <>
                  <details>
                    <summary>
                      场景进入条件 · {conditionSummary(owner.condition)}
                    </summary>
                    <ConditionEditor
                      materials={project.materials}
                      nodes={project.nodes}
                      value={owner.condition}
                      onChange={(condition) => patch({ ...owner, condition })}
                    />
                  </details>
                  <details>
                    <summary>
                      进入／完成效果 ·{" "}
                      {(owner.onEnter?.length ?? 0) +
                        (owner.onComplete?.length ?? 0)}
                    </summary>
                    <EffectsEditor
                      label="进入时效果"
                      audio={project.audio}
                      materials={project.materials}
                      value={owner.onEnter}
                      onChange={(onEnter) => patch({ ...owner, onEnter })}
                    />
                    <EffectsEditor
                      label="完成时效果"
                      audio={project.audio}
                      materials={project.materials}
                      value={owner.onComplete}
                      onChange={(onComplete) => patch({ ...owner, onComplete })}
                    />
                  </details>
                  <button
                    onClick={() =>
                      connect({
                        source: owner.id,
                        target: owner.id,
                        sourceHandle: "new",
                        targetHandle: "in",
                      })
                    }
                  >
                    新增分支
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm("删除当前场景？将先检查引用。")) onDelete();
                    }}
                  >
                    删除场景并检查引用
                  </button>
                </>
              )}
            </Card>
          )}
          <Card title="状态与门槛解释">
            <select
              aria-label="门槛解释状态来源"
              value={debugSource}
              onChange={(e) => setDebugSource(e.target.value)}
            >
              <option value="none">不检查状态</option>
              <option value="runtime">当前真实预览</option>
              {authoring.data.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.phase === "completed" ? "完成后" : "读取开始"}
                </option>
              ))}
            </select>
            {isStale ? (
              <p role="status">工程已修改，解释待更新；请手动刷新预览。</p>
            ) : state && owner ? (
              <>
                <p>
                  来源：{debugSource === "runtime" ? "真实预览" : "测试预设"} ·{" "}
                  {state.completed ? "场景完成后" : "尚未完成"}。
                  {state.nodeId !== owner.id
                    ? "此状态属于其他场景，以下为假设分析。"
                    : ""}
                </p>
                {nextExplanation?.target && (
                  <p>
                    下一场景 {nextExplanation.target}：
                    {nextExplanation.allowed
                      ? "可通行"
                      : nextExplanation.blockedByChoices
                        ? "存在可用分支，暂不走下一场景"
                        : "目标不存在或进入条件未满足"}{" "}
                    · {nextExplanation.condition.label}
                  </p>
                )}
                {explanations.map((e) => (
                  <div key={e.choiceId}>
                    <b>
                      {e.choiceId}：{e.allowed ? "可用" : "不可用"}
                    </b>
                    <button
                      onClick={() => {
                        setEdgeKey(
                          JSON.stringify([owner.id, "choice", e.choiceId]),
                        );
                        focusRule("分支可选条件");
                      }}
                    >
                      定位此分支
                    </button>
                    <button
                      onClick={() => {
                        onSelect(e.target);
                        setEdgeKey("");
                        focusRule("条件");
                      }}
                    >
                      定位目标门槛
                    </button>
                    <p>
                      一次性：{e.onceAllowed ? "通过" : "已使用"}；分支：
                      {e.condition.allowed ? "通过" : "未满足"}（
                      {e.condition.label}）；目标：
                      {e.targetExists && e.targetCondition.allowed
                        ? "通过"
                        : "未满足"}
                      （{e.targetCondition.label}）
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p>选择有效预设或开启真实预览。单状态解释不是全图可通行证明。</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
