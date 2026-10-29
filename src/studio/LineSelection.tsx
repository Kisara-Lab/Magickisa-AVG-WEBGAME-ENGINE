import { useState } from "react";
import type { StoryProject } from "../engine/types";
import { editSelectedLines } from "../authoring/batch";
import { Fold, Modal } from "./components";

export function LineSelection({
  project,
  scene,
  onChange,
}: {
  project: StoryProject;
  scene: string;
  onChange: (project: StoryProject) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [target, setTarget] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const lines = project.nodes.find((n) => n.id === scene)?.lines ?? [];
  const visible = lines.filter((l) =>
    `${l.id} ${l.speaker ?? ""} ${l.text}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const apply = (action: Parameters<typeof editSelectedLines>[3]) => {
    try {
      onChange(editSelectedLines(project, scene, selected, action, target));
      setError("");
      setConfirm(false);
      if (["remove", "move"].includes(action)) setSelected([]);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <Fold
      title="多选台词操作"
      summary={`已选 ${selected.length} 条 · 一次撤销整批操作`}
    >
      <input
        aria-label="筛选待批量操作台词"
        placeholder="搜索台词、人物或 ID"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
      <button onClick={() => setSelected(visible.map((l) => l.id))}>
        选择全部搜索结果（{visible.length}）
      </button>
      <button onClick={() => setSelected([])}>清空选择</button>
      <div style={{ maxHeight: 320, overflow: "auto" }}>
        {visible.slice(page * 50, page * 50 + 50).map((l) => (
          <label key={l.id} style={{ display: "flex", gap: 8, minHeight: 44 }}>
            <input
              type="checkbox"
              checked={selected.includes(l.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, l.id]
                    : selected.filter((id) => id !== l.id),
                )
              }
            />
            <span>
              {l.speaker ? `${l.speaker}：` : ""}
              {l.text.slice(0, 100) || "空台词"}
              <small> · {l.id}</small>
            </span>
          </label>
        ))}
      </div>
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>
        上一页
      </button>
      <button
        disabled={(page + 1) * 50 >= visible.length}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </button>
      {!visible.length && <p>没有匹配台词，可清除搜索条件。</p>}
      <div className="st-inline">
        <button disabled={!selected.length} onClick={() => apply("copy")}>
          复制选中台词
        </button>
        <button disabled={!selected.length} onClick={() => apply("up")}>
          选中台词上移
        </button>
        <button disabled={!selected.length} onClick={() => apply("down")}>
          选中台词下移
        </button>
        <button disabled={!selected.length} onClick={() => setConfirm(true)}>
          删除选中台词
        </button>
      </div>
      <label>
        移动到场景
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">请选择</option>
          {project.nodes
            .filter((n) => n.id !== scene)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.chapter ? `${n.chapter} / ` : ""}
                {n.title} · {n.id}
              </option>
            ))}
        </select>
      </label>
      <button
        disabled={!selected.length || !target}
        onClick={() => apply("move")}
      >
        移动到目标场景末尾
      </button>
      <p>
        移动保留稳定 ID、条件、图层、输入、配音和演出配置；复制生成新
        ID。剧情测试及 Agent 来源映射仍可能需要复核。
      </p>
      {error && <p role="alert">{error}</p>}
      {confirm && (
        <Modal title="确认删除选中台词" onClose={() => setConfirm(false)}>
          {error && <p role="alert">{error}</p>}
          <p>
            将删除 {selected.length}{" "}
            条台词及其高级属性。可通过一次撤销恢复；引用这些台词的测试需复核。
          </p>
          <button onClick={() => setConfirm(false)}>取消</button>
          <button onClick={() => apply("remove")}>确认删除选中台词</button>
        </Modal>
      )}
    </Fold>
  );
}
