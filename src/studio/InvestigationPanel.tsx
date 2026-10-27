import { useMemo, useState } from "react";
import type { AuthorProject } from "./model";
import { uniqueId } from "./model";
import { Card, Field, JsonField } from "./fields";
import { TargetPicker } from "./TargetPicker";
import { variableIndex } from "./logicIndex";
import { usages } from "./discovery";
import type { StudioDataController } from "./useStudioData";
import {
  presetSchema,
  presetIssues,
  type TestPreset,
} from "./investigationModel";
export function AuthoringStatus({
  controller: c,
}: {
  controller: StudioDataController;
}) {
  return (
    <div className="st-authoring-status">
      <strong>
        创作资料：{!c.ready ? "未读取" : c.dirty ? "未保存" : "已保存"}
      </strong>
      <span>与游戏工程分别保存</span>
      <button
        disabled={!c.ready || c.busy || !c.dirty}
        onClick={() => void c.save()}
      >
        保存创作资料
      </button>
      <button disabled={!c.canUndo} onClick={c.undo}>
        撤销布局／资料
      </button>
      <button disabled={!c.canRedo} onClick={c.redo}>
        重做布局／资料
      </button>
      <button
        disabled={c.busy}
        onClick={() => {
          if (!c.dirty || confirm("重新读取会丢弃本地创作资料修改，是否继续？"))
            void c.reload();
        }}
      >
        重新读取
      </button>
      <button
        onClick={() => {
          const link = document.createElement("a"),
            url = URL.createObjectURL(
              new Blob([JSON.stringify(c.data, null, 2)], {
                type: "application/json",
              }),
            );
          link.href = url;
          link.download = "studio-authoring.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }}
      >
        导出本地创作资料
      </button>
      {c.error && <p role="alert">{c.error} · 本地修改仍保留，可先导出。</p>}
    </div>
  );
}
export function InvestigationPanel({
  project,
  controller: c,
  onSelect,
  onPreview,
}: {
  project: AuthorProject;
  controller: StudioDataController;
  onSelect: (id: string) => void;
  onPreview: (p: TestPreset) => void;
}) {
  const [query, setQuery] = useState(""),
    [key, setKey] = useState(""),
    [presetId, setPresetId] = useState(""),
    [error, setError] = useState("");
  const variables = useMemo(() => variableIndex(project), [project]),
    refs = useMemo(() => usages(project), [project]);
  const selected = c.data.presets.find((p) => p.id === presetId),
    meta = c.data.variables[key] ?? {
      label: key,
      type: "unknown" as const,
      description: "",
    };
  function preset(next: TestPreset) {
    c.change({
      ...c.data,
      presets: c.data.presets.map((p) => (p.id === next.id ? next : p)),
    });
  }
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">INVESTIGATION LOGIC</span>
          <h2>变量与线索</h2>
          <p>变量说明不会初始化游戏状态；资料沿用原有解锁与阅读规则。</p>
        </div>
      </div>
      <AuthoringStatus controller={c} />
      {Object.keys(c.data.positions).filter(
        (id) => !project.nodes.some((n) => n.id === id),
      ).length > 0 && (
        <p role="status">布局包含已删除场景的位置记录，已保留以便恢复。</p>
      )}
      {c.data.presets.flatMap((p) =>
        presetIssues(project, p).map((issue) => (
          <p key={p.id + issue} role="status">
            预设 {p.name}：{issue}；不会自动修改。
          </p>
        )),
      )}
      <input
        aria-label="搜索变量与线索"
        placeholder="变量、线索标题或 ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="st-investigation-grid">
        <Card title="变量读取、写入与玩家输入">
          {[
            ...new Set([
              ...variables.map((v) => v.key),
              ...Object.keys(c.data.variables),
            ]),
          ]
            .filter((v) =>
              v.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            )
            .map((v) => (
              <button key={v} onClick={() => setKey(v)}>
                {v} ·{" "}
                {variables.find((g) => g.key === v)?.locations.length ?? 0} 处
              </button>
            ))}
          <Field label="变量名（说明）" value={key} onChange={setKey} />
          {key && (
            <>
              <Field
                label="显示名称"
                value={meta.label}
                onChange={(label) =>
                  c.change({
                    ...c.data,
                    variables: {
                      ...c.data.variables,
                      [key]: { ...meta, label },
                    },
                  })
                }
              />
              <Field
                label="预期类型"
                value={meta.type}
                options={[
                  "unknown",
                  "string",
                  "number",
                  "boolean",
                  "list",
                  "object",
                ].map((value) => ({ value, label: value }))}
                onChange={(type) =>
                  c.change({
                    ...c.data,
                    variables: {
                      ...c.data.variables,
                      [key]: { ...meta, type: type as typeof meta.type },
                    },
                  })
                }
              />
              <Field
                label="用途说明"
                multiline
                value={meta.description}
                onChange={(description) =>
                  c.change({
                    ...c.data,
                    variables: {
                      ...c.data.variables,
                      [key]: { ...meta, description },
                    },
                  })
                }
              />
              {meta.type !== "unknown" &&
                variables
                  .find((v) => v.key === key)
                  ?.locations.some(
                    (l) => l.type !== "unknown" && l.type !== meta.type,
                  ) && (
                  <p>
                    ⚠ 预期类型与发现的读写类型不同；说明不会限制实际运行值。
                  </p>
                )}
              {variables
                .find((v) => v.key === key)
                ?.warnings.map((w) => (
                  <p key={w}>⚠ {w}</p>
                ))}
              {variables
                .find((v) => v.key === key)
                ?.locations.map((l, i) => (
                  <div key={i}>
                    <span>
                      {l.mode} · {l.type} · {l.label}
                    </span>
                    {l.nodeId && (
                      <button onClick={() => onSelect(l.nodeId!)}>
                        定位场景
                      </button>
                    )}
                  </div>
                ))}
            </>
          )}
        </Card>
        <Card title="线索资料与引用">
          {project.materials
            .filter((m) =>
              `${m.id} ${m.title}`
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            )
            .map((m) => (
              <details key={m.id}>
                <summary>
                  {m.title} · {m.id} · {m.category}
                </summary>
                <p>
                  {m.unlockNode
                    ? "访问 " + m.unlockNode + " 后解锁"
                    : "没有访问节点要求"}{" "}
                  · {m.unlock ? "含解锁条件" : "无附加解锁条件"}
                </p>
                {refs
                  .filter((r) => r.kind === "materials" && r.target === m.id)
                  .map((r, i) => (
                    <div key={i}>
                      {r.label} · {r.field}
                      {r.position.nodeId && (
                        <button onClick={() => onSelect(r.position.nodeId!)}>
                          定位使用位置
                        </button>
                      )}
                    </div>
                  ))}
              </details>
            ))}
          {!project.materials.length && (
            <p>暂无线索。请到“资料”页新增；条件可检查已解锁或已阅读。</p>
          )}
        </Card>
      </div>
      <Card title="具名测试状态">
        <p>
          只用于独立预览，不改变工程变量初值或真实玩家存档。完成后检查表示已执行完成效果的检查点，请直接提供最终状态。
        </p>
        <select
          aria-label="选择测试预设"
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
        >
          <option value="">选择预设</option>
          {c.data.presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          disabled={!c.ready}
          onClick={() => {
            const p: TestPreset = {
              id: uniqueId(
                "test",
                c.data.presets.map((p) => p.id),
              ),
              name: "新的测试状态",
              nodeId: project.startNodeId,
              phase: "start",
              variables: {},
              visitedNodes: [],
              usedChoices: [],
              unlockedMaterials: [],
              readMaterials: [],
            };
            c.change({ ...c.data, presets: [...c.data.presets, p] });
            setPresetId(p.id);
          }}
        >
          新增测试预设
        </button>
        {selected && (
          <>
            <Field
              label="预设名称"
              value={selected.name}
              onChange={(name) => preset({ ...selected, name })}
            />
            <TargetPicker
              nodes={project.nodes}
              value={selected.nodeId}
              onChange={(nodeId) => preset({ ...selected, nodeId })}
            />
            <Field
              label="测试阶段"
              value={selected.phase}
              options={[
                { value: "start", label: "读取开始（正常执行进入效果）" },
                {
                  value: "completed",
                  label: "场景完成后检查（不重复执行效果）",
                },
              ]}
              onChange={(phase) =>
                preset({ ...selected, phase: phase as TestPreset["phase"] })
              }
            />
            <JsonField
              label="测试变量 JSON"
              value={selected.variables}
              onChange={(value) => {
                const parsed = presetSchema.safeParse({
                  ...selected,
                  variables: value,
                });
                if (parsed.success) {
                  preset(parsed.data);
                  setError("");
                } else setError(parsed.error.message);
              }}
            />
            {(
              [
                "visitedNodes",
                "usedChoices",
                "unlockedMaterials",
                "readMaterials",
              ] as const
            ).map((field) => (
              <JsonField
                key={field}
                label={
                  {
                    visitedNodes: "已访问节点 ID",
                    usedChoices: "已使用一次性分支 ID",
                    unlockedMaterials: "已解锁资料 ID",
                    readMaterials: "已阅读资料 ID",
                  }[field]
                }
                value={selected[field]}
                onChange={(value) => {
                  const parsed = presetSchema.safeParse({
                    ...selected,
                    [field]: value,
                  });
                  if (parsed.success) {
                    preset(parsed.data);
                    setError("");
                  } else setError(parsed.error.message);
                }}
              />
            ))}
            {presetIssues(project, selected).map((issue) => (
              <p key={issue} role="alert">
                {issue}
              </p>
            ))}
            <button
              disabled={!!presetIssues(project, selected).length}
              onClick={() => onPreview(selected)}
            >
              带此状态真实预览
            </button>
            <button
              className="danger"
              onClick={() => {
                if (confirm("删除此测试预设？")) {
                  c.change({
                    ...c.data,
                    presets: c.data.presets.filter((p) => p.id !== selected.id),
                  });
                  setPresetId("");
                }
              }}
            >
              删除预设
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </Card>
    </>
  );
}
