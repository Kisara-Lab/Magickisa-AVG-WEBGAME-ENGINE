import { useState } from "react";
import type { StoryProject, Value } from "../engine/types";
import { validateProject } from "../engine/schema";
import { Field } from "./fields";
type Definition = NonNullable<StoryProject["variables"]>[string];
const initial: Record<Definition["type"], Value> = {
  string: "",
  number: 0,
  boolean: false,
  list: [],
  object: {},
};

function DefinitionForm({
  value,
  onChange,
}: {
  value: Definition;
  onChange: (value: Definition) => void;
}) {
  const [raw, setRaw] = useState(JSON.stringify(value.initial, null, 2)),
    [error, setError] = useState("");
  return (
    <div className="st-fields">
      <Field
        label="变量用途说明"
        value={value.description ?? ""}
        onChange={(description) => onChange({ ...value, description })}
      />
      <label>
        变量类型
        <select
          value={value.type}
          onChange={(e) => {
            const type = e.target.value as Definition["type"];
            onChange({
              ...value,
              type,
              initial: structuredClone(initial[type]),
            });
            setRaw(JSON.stringify(initial[type], null, 2));
            setError("");
          }}
        >
          {Object.keys(initial).map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      {value.type === "boolean" ? (
        <label>
          <input
            type="checkbox"
            checked={value.initial === true}
            onChange={(e) => onChange({ ...value, initial: e.target.checked })}
          />
          初始值为真
        </label>
      ) : value.type === "string" ? (
        <Field
          label="变量初始文字"
          value={String(value.initial)}
          onChange={(text) => onChange({ ...value, initial: text })}
        />
      ) : value.type === "number" ? (
        <Field
          label="变量初始数值"
          type="number"
          value={Number(value.initial)}
          onChange={(text) => {
            if (Number.isFinite(Number(text)))
              onChange({ ...value, initial: Number(text) });
          }}
        />
      ) : (
        <>
          <label>
            列表／对象初始值 JSON
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} />
          </label>
          <button
            onClick={() => {
              try {
                const parsed = JSON.parse(raw);
                const kind = Array.isArray(parsed)
                  ? "list"
                  : parsed !== null && typeof parsed === "object"
                    ? "object"
                    : "invalid";
                if (kind !== value.type)
                  throw new Error("初始值与所选类型不符。");
                onChange({ ...value, initial: parsed });
                setError("");
              } catch (error) {
                setError(String(error));
              }
            }}
          >
            应用此初始值
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function VariableDeclarations({
  project,
  onChange,
}: {
  project: StoryProject;
  onChange: (project: StoryProject) => void;
}) {
  const [selected, setSelected] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const variables = project.variables ?? {},
    key = Object.hasOwn(variables, selected)
      ? selected
      : Object.keys(variables)[0];
  const update = (variables: StoryProject["variables"]) => {
    const next = { ...project, variables },
      issues = validateProject(next);
    if (issues.length) {
      setError(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
      return;
    }
    onChange(next);
    setError("");
  };
  return (
    <section aria-label="变量声明表单">
      <label>
        新增变量名称
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        disabled={!name.trim()}
        onClick={() => {
          const id = name.trim();
          if (
            ["__proto__", "constructor", "prototype"].includes(id) ||
            Object.hasOwn(variables, id)
          ) {
            setError("变量名称已存在或属于保留名称。");
            return;
          }
          update({
            ...variables,
            [id]: { type: "number", initial: 0, description: "" },
          });
          setSelected(id);
          setName("");
        }}
      >
        添加变量声明
      </button>
      <label>
        选中变量
        <select value={key ?? ""} onChange={(e) => setSelected(e.target.value)}>
          <option value="">选择变量</option>
          {Object.keys(variables).map((key) => (
            <option key={key}>{key}</option>
          ))}
        </select>
      </label>
      {key && (
        <DefinitionForm
          key={`${key}:${variables[key].type}`}
          value={variables[key]}
          onChange={(value) => update({ ...variables, [key]: value })}
        />
      )}
      {!key && (
        <p>
          尚无变量声明。条件和效果仍可使用未声明变量；声明用于明确新周目的初始状态。
        </p>
      )}
      <p>
        更改类型会重置该声明的初始值；已有玩家存档不受影响。删除或重命名需连同条件、效果及测试一起审查，可使用高级
        JSON 或 Agent 事务。
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
