import { describeError } from "../engine/errors";
import { useState } from "react";
import type { StoryProject } from "../engine/types";
import {
  applyReplacements,
  replacementPlan,
  type Replacement,
  type TextField,
} from "../authoring/batch";
import { applyOperations } from "../authoring/operations";
import { validateProject } from "../engine/schema";
import { Fold } from "./components";

export function BatchEditor({
  project,
  scene,
  onChange,
}: {
  project: StoryProject;
  scene: string;
  onChange: (p: StoryProject) => void;
}) {
  const [query, setQuery] = useState(""),
    [replacement, setReplacement] = useState("");
  const [scope, setScope] = useState("scene"),
    [field, setField] = useState<TextField>("text");
  const [rows, setRows] = useState<Replacement[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState(""),
    [raw, setRaw] = useState(""),
    [importing, setImporting] = useState<string[] | null>(null);
  const [page, setPage] = useState(0);
  const invalidate = () => {
    setRows([]);
    setSelected(new Set());
    setPage(0);
  };
  const apply = () => {
    try {
      onChange(
        applyReplacements(
          project,
          rows.filter((r) => selected.has(r.key)),
        ),
      );
      invalidate();
      setError("");
    } catch (e) {
      setError(describeError(e));
    }
  };
  return (
    <Fold title="批量写作与替换" summary="检查差异后一次应用 · 可撤销">
      {error && <p role="alert">{error}</p>}
      <div className="st-fields">
        <label>
          查找文本
          <input
            aria-label="批量查找文本"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              invalidate();
            }}
          />
        </label>
        <label>
          替换为
          <input
            aria-label="批量替换文本"
            value={replacement}
            onChange={(e) => {
              setReplacement(e.target.value);
              invalidate();
            }}
          />
        </label>
        <label>
          范围
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              invalidate();
            }}
          >
            <option value="scene">当前场景</option>
            <option value="chapter">当前章节</option>
            <option value="all">全部场景</option>
          </select>
        </label>
        <label>
          字段
          <select
            value={field}
            onChange={(e) => {
              setField(e.target.value as TextField);
              invalidate();
            }}
          >
            <option value="text">台词正文</option>
            <option value="speaker">台词说话人</option>
            <option value="label">分支文案</option>
          </select>
        </label>
      </div>
      <button
        disabled={!query}
        onClick={() => {
          const chapter = project.nodes.find((n) => n.id === scene)?.chapter;
          if (scope === "chapter" && !chapter) {
            setError("当前场景未分配章节，请选择场景或全部范围。");
            return;
          }
          const plan = replacementPlan(project, query, replacement, {
            fields: [field],
            scene: scope === "scene" ? scene : undefined,
            chapter: scope === "chapter" ? chapter : undefined,
          });
          setRows(plan);
          setSelected(new Set(plan.map((r) => r.key)));
          setPage(0);
          setError(plan.length ? "" : "没有需要修改的匹配项。");
        }}
      >
        检查替换差异
      </button>
      {!!rows.length && (
        <>
          <p>
            {rows.length} 项匹配，已选 {selected.size} 项。不会改写稳定
            ID、资源路径或条件。
          </p>
          <button onClick={() => setSelected(new Set(rows.map((r) => r.key)))}>
            全选匹配项
          </button>
          <button onClick={() => setSelected(new Set())}>取消全选</button>
          {rows.slice(page * 50, (page + 1) * 50).map((row) => (
            <article key={row.key}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(row.key)}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (e.target.checked) next.add(row.key);
                      else next.delete(row.key);
                      return next;
                    })
                  }
                />
                {row.scene} / {row.id} / {row.field}
              </label>
              <p>
                <del>{row.before}</del>
              </p>
              <p>
                <ins>{row.after}</ins>
              </p>
            </article>
          ))}
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            上一页差异
          </button>
          <button
            disabled={(page + 1) * 50 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            下一页差异
          </button>
          <button disabled={!selected.size} onClick={apply}>
            应用所选替换
          </button>
        </>
      )}
      <h3>追加多行台词</h3>
      <p>
        每个非空行成为一条台词，追加到当前场景末尾。此入口不解析跳转或条件。
      </p>
      <textarea
        aria-label="待导入多行台词"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setImporting(null);
        }}
      />
      <label>
        读取 UTF-8 文件
        <input
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file)
              try {
                setRaw(
                  new TextDecoder("utf-8", { fatal: true }).decode(
                    await file.arrayBuffer(),
                  ),
                );
                setImporting(null);
              } catch {
                setError("无法按 UTF-8 读取文件。");
              }
          }}
        />
      </label>
      <button
        onClick={() =>
          setImporting(
            raw
              .replace(/^\uFEFF/, "")
              .split(/\r?\n/)
              .filter((t) => t.trim()),
          )
        }
      >
        预览台词导入
      </button>
      {importing && (
        <>
          <p>将追加 {importing.length} 条台词。</p>
          <ol>
            {importing.slice(0, 50).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          {importing.length > 50 && <p>这里只显示前 50 条。</p>}
          <button
            disabled={!importing.length || importing.length > 10000}
            onClick={() => {
              try {
                const result = applyOperations(
                  project,
                  importing.map((text) => ({
                    op: "line.add",
                    scene,
                    value: { text },
                  })),
                );
                const issues = validateProject(result.project);
                if (issues.length)
                  throw new Error(issues.map((i) => i.message).join("\n"));
                onChange(result.project);
                setImporting(null);
                setRaw("");
                setError("");
              } catch (e) {
                setError(describeError(e));
              }
            }}
          >
            确认追加台词
          </button>
        </>
      )}
    </Fold>
  );
}
