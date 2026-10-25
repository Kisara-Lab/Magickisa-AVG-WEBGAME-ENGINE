import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Condition, Effect, StoryNode, Value } from "../engine/types";
import { Fold } from "./components";
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  options,
  placeholder = "",
  type = "text",
  min,
  max,
  step,
}: {
  label: string;
  value?: string | number;
  onChange: (v: string) => void;
  multiline?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const explanation = /路径|目录/.test(label)
    ? "可用资源 ID 或路径，例如 /assets/imported/scene.png；素材选择器可自动回填。"
    : /字幕.*时间|时长/.test(label)
      ? "单位：秒；例如 12.50。数字输入可精确调整。"
      : undefined;
  return (
    <label className={`st-field ${multiline ? "wide" : ""}`}>
      <span>{label}</span>
      {options ? (
        <select
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          aria-label={label}
          rows={4}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          type={type}
          min={min}
          max={max}
          step={step}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {explanation && <small className="st-field-help">{explanation}</small>}
    </label>
  );
}
export function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="st-check">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function Card({
  title,
  children,
  action,
  collapsible = false,
  summary,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  collapsible?: boolean;
  summary?: string;
}) {
  if (collapsible)
    return (
      <Fold title={title} summary={summary}>
        {action && <div className="st-inline">{action}</div>}
        {children}
      </Fold>
    );
  return (
    <section className="st-card">
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
export function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value ?? null, null, 2)),
    [error, setError] = useState("");
  useEffect(() => setText(JSON.stringify(value ?? null, null, 2)), [value]);
  return (
    <div className="st-json-field">
      <Field label={label} value={text} multiline onChange={setText} />
      <button
        onClick={() => {
          try {
            onChange(JSON.parse(text));
            setError("");
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        应用此项
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function ValueField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Value;
  onChange: (v: Value) => void;
}) {
  const type =
    Array.isArray(value) || (typeof value === "object" && value !== null)
      ? "json"
      : value === null
        ? "null"
        : typeof value;
  return (
    <div className="st-value">
      <Field
        label={`${label}类型`}
        value={type}
        options={["string", "number", "boolean", "null", "json"].map(
          (v, i) => ({
            value: v,
            label: ["文字", "数字", "布尔值", "空值", "数组 / 对象"][i],
          }),
        )}
        onChange={(v) =>
          onChange(
            v === "number"
              ? 0
              : v === "boolean"
                ? true
                : v === "null"
                  ? null
                  : v === "json"
                    ? []
                    : "",
          )
        }
      />
      {type === "json" ? (
        <JsonField
          label={label}
          value={value}
          onChange={(v) => onChange(v as Value)}
        />
      ) : type === "boolean" ? (
        <Check label={label} value={value === true} onChange={onChange} />
      ) : (
        type !== "null" && (
          <Field
            label={label}
            type={type === "number" ? "number" : "text"}
            value={String(value)}
            onChange={(v) => onChange(type === "number" ? Number(v) : v)}
          />
        )
      )}
    </div>
  );
}
const conditionTypes = [
  ["flag", "变量相等"],
  ["count", "数字比较"],
  ["visited", "已访问节点"],
  ["all", "同时满足"],
  ["any", "满足任一"],
  ["not", "取反"],
];
function makeCondition(type: string): Condition {
  return type === "all" || type === "any"
    ? { type, conditions: [] }
    : type === "not"
      ? { type, condition: { type: "flag", key: "", equals: true } }
      : type === "visited"
        ? { type, nodeId: "", value: true }
        : type === "count"
          ? { type, key: "", operator: "gte", value: 1 }
          : { type: "flag", key: "", equals: true };
}
export function ConditionEditor({
  value,
  onChange,
  nodes,
  label = "条件",
}: {
  value?: Condition;
  onChange: (v: Condition | undefined) => void;
  nodes: StoryNode[];
  label?: string;
}) {
  return (
    <div className="st-rule">
      <div className="st-inline">
        <strong>{label}</strong>
        <button
          onClick={() => onChange(value ? undefined : makeCondition("flag"))}
        >
          {value ? "移除条件" : "添加条件"}
        </button>
      </div>
      <small className="st-field-help">
        条件决定内容何时可见。例如“已访问节点”可要求先读过指定场景；支持同时满足、任一和取反。
      </small>
      {value && (
        <>
          <Field
            label={`${label}类型`}
            value={value.type}
            options={conditionTypes.map(([value, label]) => ({ value, label }))}
            onChange={(v) => onChange(makeCondition(v))}
          />
          {value.type === "flag" || value.type === "count" ? (
            <Field
              label="变量名"
              value={value.key}
              onChange={(key) => onChange({ ...value, key })}
            />
          ) : null}
          {value.type === "flag" && (
            <ValueField
              label="期望值"
              value={value.equals === undefined ? true : value.equals}
              onChange={(equals) => onChange({ ...value, equals })}
            />
          )}
          {value.type === "count" && (
            <div className="st-fields">
              <Field
                label="比较方式"
                value={value.operator}
                options={["eq", "gt", "gte", "lt", "lte"].map((v, i) => ({
                  value: v,
                  label: ["等于", "大于", "大于等于", "小于", "小于等于"][i],
                }))}
                onChange={(operator) =>
                  onChange({
                    ...value,
                    operator: operator as typeof value.operator,
                  })
                }
              />
              <Field
                label="比较数值"
                type="number"
                value={value.value}
                onChange={(v) => onChange({ ...value, value: Number(v) })}
              />
            </div>
          )}
          {value.type === "visited" && (
            <>
              <Field
                label="条件节点"
                value={value.nodeId}
                options={[
                  { value: "", label: "选择节点" },
                  ...nodes.map((n) => ({
                    value: n.id,
                    label: `${n.id} · ${n.title}`,
                  })),
                ]}
                onChange={(nodeId) => onChange({ ...value, nodeId })}
              />
              <Check
                label="要求已访问"
                value={value.value !== false}
                onChange={(v) => onChange({ ...value, value: v })}
              />
            </>
          )}
          {(value.type === "all" || value.type === "any") && (
            <>
              <div className="st-subrules">
                {value.conditions.map((v, i) => (
                  <ConditionEditor
                    key={i}
                    label={`子条件 ${i + 1}`}
                    nodes={nodes}
                    value={v}
                    onChange={(next) =>
                      onChange({
                        ...value,
                        conditions: next
                          ? value.conditions.map((c, j) => (j === i ? next : c))
                          : value.conditions.filter((_, j) => j !== i),
                      })
                    }
                  />
                ))}
              </div>
              <button
                onClick={() =>
                  onChange({
                    ...value,
                    conditions: [...value.conditions, makeCondition("flag")],
                  })
                }
              >
                添加子条件
              </button>
            </>
          )}
          {value.type === "not" && (
            <ConditionEditor
              label="取反对象"
              value={value.condition}
              nodes={nodes}
              onChange={(condition) =>
                onChange({
                  ...value,
                  condition: condition || makeCondition("flag"),
                })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
const effectTypes = [
  ["set", "设置变量"],
  ["toggle", "切换布尔变量"],
  ["increment", "增减数值"],
  ["addToList", "加入列表"],
  ["removeFromList", "移出列表"],
  ["unlockMaterial", "解锁资料"],
  ["markRead", "标记已读"],
  ["appendNote", "追加笔记"],
  ["setAudio", "切换音轨"],
];
function makeEffect(type: string): Effect {
  return type === "unlockMaterial" || type === "markRead"
    ? { type, id: "" }
    : type === "appendNote"
      ? { type, text: "" }
      : type === "setAudio"
        ? { type, trackId: "" }
        : type === "increment"
          ? { type, key: "", amount: 1 }
          : type === "toggle"
            ? { type, key: "" }
            : { type: type as "set", key: "", value: true };
}
export function EffectsEditor({
  value = [],
  onChange,
  label,
}: {
  value?: Effect[];
  onChange: (v: Effect[]) => void;
  label: string;
}) {
  return (
    <div className="st-rule">
      <div className="st-inline">
        <strong>
          {label} <small>{value.length}</small>
        </strong>
        <button onClick={() => onChange([...value, makeEffect("set")])}>
          添加效果
        </button>
      </div>
      <small className="st-field-help">
        效果会改变运行状态，例如设置变量或解锁资料。兼容版使用原节点效果时机，现代版区分进入与完成效果。
      </small>
      {value.map((effect, i) => {
        const change = (v: Effect) =>
          onChange(value.map((e, j) => (j === i ? v : e)));
        return (
          <div className="st-effect" key={i}>
            <div className="st-inline">
              <Field
                label={`效果 ${i + 1} 类型`}
                value={effect.type}
                options={effectTypes.map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(v) => change(makeEffect(v))}
              />
              <button
                className="danger"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                删除效果
              </button>
            </div>
            {"key" in effect && (
              <Field
                label="效果变量"
                value={effect.key}
                onChange={(key) => change({ ...effect, key })}
              />
            )}
            {"value" in effect && (
              <ValueField
                label="写入值"
                value={effect.value}
                onChange={(value) => change({ ...effect, value })}
              />
            )}
            {"amount" in effect && (
              <Field
                label="增减量"
                type="number"
                value={effect.amount}
                onChange={(v) => change({ ...effect, amount: Number(v) })}
              />
            )}
            {"id" in effect && (
              <Field
                label="资料 ID"
                value={effect.id}
                onChange={(id) => change({ ...effect, id })}
              />
            )}
            {"text" in effect && (
              <Field
                label="笔记内容"
                value={effect.text}
                multiline
                onChange={(text) => change({ ...effect, text })}
              />
            )}
            {"trackId" in effect && (
              <Field
                label="音轨 ID"
                value={effect.trackId}
                onChange={(trackId) => change({ ...effect, trackId })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
