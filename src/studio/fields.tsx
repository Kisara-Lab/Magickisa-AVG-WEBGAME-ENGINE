import { describeError } from "../engine/errors";
import { useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import type {
  Condition,
  Effect,
  StoryNode,
  Value,
  StoryProject,
} from "../engine/types";
import { Fold } from "./components";
import { TargetPicker } from "./TargetPicker";
import { conditionSummary } from "../engine/investigation";
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
  allowEmpty = false,
  validate,
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
  allowEmpty?: boolean;
  validate?: (text: string) => string | undefined;
}) {
  const [numberText, setNumberText] = useState(String(value ?? ""));
  const [numberError, setNumberError] = useState("");
  useEffect(() => {
    setNumberText(String(value ?? ""));
    setNumberError("");
  }, [value]);
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
          {!options.some((o) => o.value === String(value ?? "")) && (
            <option value={value ?? ""}>未设置或已失效：{value}</option>
          )}
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
          value={type === "number" || validate ? numberText : (value ?? "")}
          placeholder={placeholder}
          aria-invalid={!!numberError}
          onChange={(e) => {
            const text = e.target.value;
            if (validate) {
              setNumberText(text);
              const problem = validate(text);
              setNumberError(
                problem ? `尚未应用：${problem}；工程保留原值。` : "",
              );
              if (problem) return;
            }
            if (type !== "number") {
              onChange(text);
              return;
            }
            setNumberText(text);
            const n = Number(text);
            if (
              (!text && !allowEmpty) ||
              (text &&
                (!Number.isFinite(n) ||
                  (min !== undefined && n < min) ||
                  (max !== undefined && n > max) ||
                  (step === 1 && !Number.isInteger(n))))
            ) {
              setNumberError(
                `尚未应用：请输入${min !== undefined ? ` ≥ ${min}` : "有效"}${max !== undefined ? `、≤ ${max}` : ""}的${step === 1 ? "整数" : "数字"}；工程保留原值。`,
              );
              return;
            }
            setNumberError("");
            onChange(text);
          }}
        />
      )}
      {numberError && <small role="alert">{numberError}</small>}
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
  const serialized = JSON.stringify(value ?? null, null, 2);
  const base = useRef(serialized);
  const [dirty, setDirty] = useState(false);
  const [text, setText] = useState(serialized),
    [error, setError] = useState("");
  useEffect(() => {
    if (!dirty) {
      setText(serialized);
      base.current = serialized;
    }
  }, [serialized, dirty]);
  return (
    <div className="st-json-field">
      <Field
        label={label}
        value={text}
        multiline
        onChange={(v) => {
          setText(v);
          setDirty(v !== base.current);
        }}
      />
      {dirty && (
        <p role="status">
          此项 JSON 尚未应用。
          {serialized !== base.current
            ? "工程中的此项已变化，请核对后应用或重新载入。"
            : "应用后才会参与保存、预览与导出。"}
        </p>
      )}
      {dirty && (
        <button
          onClick={() => {
            setText(serialized);
            base.current = serialized;
            setDirty(false);
            setError("");
          }}
        >
          丢弃此项输入并重新载入
        </button>
      )}
      <button
        onClick={() => {
          try {
            onChange(JSON.parse(text));
            setDirty(false);
            setError("");
          } catch (e) {
            setError(describeError(e));
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
  ["material", "线索解锁／阅读"],
  ["contains", "列表包含"],
  ["flag", "变量相等"],
  ["count", "数字比较"],
  ["visited", "已访问节点"],
  ["all", "同时满足"],
  ["any", "满足任一"],
  ["not", "取反"],
];
export function makeCondition(type: string, nodeId = ""): Condition {
  if (type === "material") return { type, id: "clue", state: "unlocked" };
  if (type === "contains") return { type, key: "clues", value: "" };
  return type === "all" || type === "any"
    ? { type, conditions: [{ type: "flag", key: "flag", equals: true }] }
    : type === "not"
      ? { type, condition: { type: "flag", key: "flag", equals: true } }
      : type === "visited"
        ? { type, nodeId, value: true }
        : type === "count"
          ? { type, key: "count", operator: "gte", value: 1 }
          : { type: "flag", key: "flag", equals: true };
}
export function ConditionEditor({
  value,
  onChange,
  nodes,
  materials = [],
  label = "条件",
}: {
  value?: Condition;
  onChange: (v: Condition | undefined) => void;
  nodes: StoryNode[];
  materials?: { id: string; title: string }[];
  label?: string;
}) {
  return (
    <div className="st-rule" data-rule-label={label}>
      <p className="st-field-help">{conditionSummary(value)}</p>
      <div className="st-inline">
        <strong>{label}</strong>
        <button
          onClick={() => onChange(value ? undefined : makeCondition("flag"))}
        >
          {value ? "移除条件" : "添加条件"}
        </button>
      </div>
      <small className="st-field-help">
        条件决定内容何时可见；支持资料已解锁／已阅读、列表包含，以及递归全部／任一／取反。
      </small>
      {value && (
        <>
          <Field
            label={`${label}类型`}
            value={value.type}
            options={conditionTypes.map(([value, label]) => ({ value, label }))}
            onChange={(v) => onChange(makeCondition(v, nodes[0]?.id))}
          />
          {value.type === "flag" ||
          value.type === "count" ||
          value.type === "contains" ? (
            <Field
              label="变量名"
              value={value.key}
              onChange={(key) => onChange({ ...value, key })}
            />
          ) : null}
          {value.type === "contains" && (
            <ValueField
              label="包含的值"
              value={value.value}
              onChange={(v) => onChange({ ...value, value: v })}
            />
          )}
          {value.type === "material" && (
            <>
              <Field
                label="线索资料 ID"
                value={value.id}
                onChange={(id) => onChange({ ...value, id })}
              />
              {!!materials.length && (
                <Field
                  label="选择线索资料"
                  value={value.id}
                  options={[
                    { value: "", label: "选择资料" },
                    ...materials.map((m) => ({
                      value: m.id,
                      label: `${m.title} · ${m.id}`,
                    })),
                  ]}
                  onChange={(id) => onChange({ ...value, id })}
                />
              )}
              <Field
                label="线索状态"
                value={value.state}
                options={[
                  { value: "unlocked", label: "已解锁" },
                  { value: "read", label: "已阅读" },
                ]}
                onChange={(state) =>
                  onChange({ ...value, state: state as "unlocked" | "read" })
                }
              />
              <Check
                label="要求满足该状态"
                value={value.value !== false}
                onChange={(v) => onChange({ ...value, value: v })}
              />
            </>
          )}
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
              <TargetPicker
                label="条件节点"
                nodes={nodes}
                value={value.nodeId}
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
              {!value.conditions.length && (
                <p role="status">
                  空组合：
                  {value.type === "all"
                    ? "同时满足将始终成立"
                    : "满足任一将始终不成立"}
                  。请添加子条件或移除组合。
                </p>
              )}
              <div className="st-subrules">
                {value.conditions.map((v, i) => (
                  <ConditionEditor
                    key={i}
                    label={`子条件 ${i + 1}`}
                    nodes={nodes}
                    materials={materials}
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
              materials={materials}
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
function makeEffect(
  type: string,
  audio: { id: string }[] = [],
  materials: { id: string }[] = [],
): Effect {
  return type === "unlockMaterial" || type === "markRead"
    ? { type, id: materials[0]?.id || "" }
    : type === "appendNote"
      ? { type, text: "" }
      : type === "setAudio"
        ? { type, trackId: audio[0]?.id || "" }
        : type === "increment"
          ? { type, key: "count", amount: 1 }
          : type === "toggle"
            ? { type, key: "flag" }
            : { type: type as "set", key: "flag", value: true };
}
export function EffectsEditor({
  value = [],
  onChange,
  label,
  audio = [],
  materials = [],
}: {
  value?: Effect[];
  onChange: (v: Effect[]) => void;
  label: string;
  audio?: StoryProject["audio"];
  materials?: StoryProject["materials"];
}) {
  return (
    <div className="st-rule" data-rule-label={label}>
      <div className="st-inline">
        <strong>
          {label} <small>{value.length}</small>
        </strong>
        <button onClick={() => onChange([...value, makeEffect("set")])}>
          添加效果
        </button>
      </div>
      <small className="st-field-help">
        效果会改变运行状态，例如设置变量或解锁资料。场景区分进入时与完成时效果，分支效果在选择时应用。
      </small>
      {value.map((effect, i) => {
        const change = (v: Effect) =>
          onChange(value.map((e, j) => (j === i ? v : e)));
        return (
          <div className="st-effect" key={i} data-effect-index={i}>
            <div className="st-inline">
              <Field
                label={`效果 ${i + 1} 类型`}
                value={effect.type}
                options={effectTypes
                  .filter(
                    ([type]) =>
                      (type !== "setAudio" || audio.length) &&
                      (!["unlockMaterial", "markRead"].includes(type) ||
                        materials.length),
                  )
                  .map(([value, label]) => ({
                    value,
                    label,
                  }))}
                onChange={(v) => change(makeEffect(v, audio, materials))}
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
                options={materials.map((m) => ({
                  value: m.id,
                  label: `${m.id} · ${m.title}`,
                }))}
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
                options={audio.map((a) => ({ value: a.id, label: a.id }))}
                onChange={(trackId) => change({ ...effect, trackId })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
