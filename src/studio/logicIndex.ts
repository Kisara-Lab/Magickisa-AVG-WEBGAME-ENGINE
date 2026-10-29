import type { StoryProject, Condition, Effect, Value } from "../engine/types";
import { interpolationKeys } from "../engine/interpolation";
export interface VariableUse {
  key: string;
  mode: "read" | "write" | "input";
  type: string;
  nodeId?: string;
  label: string;
  field: string;
}
export function variableIndex(p: StoryProject) {
  const uses: VariableUse[] = [];
  const type = (v: Value | undefined) =>
    Array.isArray(v) ? "list" : v === null ? "object" : typeof v;
  function condition(c: Condition | undefined, label: string, nodeId?: string) {
    if (!c) return;
    if (c.type === "flag" || c.type === "count" || c.type === "contains")
      uses.push({
        key: c.key,
        mode: "read",
        type:
          c.type === "count"
            ? "number"
            : c.type === "contains"
              ? "list"
              : c.equals === undefined
                ? "unknown"
                : type(c.equals),
        nodeId,
        label,
        field: "condition",
      });
    if (c.type === "not") condition(c.condition, label, nodeId);
    if (c.type === "all" || c.type === "any")
      c.conditions.forEach((x) => condition(x, label, nodeId));
  }
  function effects(list: Effect[] | undefined, label: string, nodeId?: string) {
    for (const e of list ?? [])
      if ("key" in e)
        uses.push({
          key: e.key,
          mode: "write",
          type:
            e.type === "set"
              ? type(e.value)
              : e.type === "increment"
                ? "number"
                : e.type === "toggle"
                  ? "boolean"
                  : "list",
          nodeId,
          label,
          field: "effects",
        });
  }
  for (const n of p.nodes) {
    condition(n.condition, n.title, n.id);
    effects(n.onEnter, n.title + " · 进入", n.id);
    effects(n.onComplete, n.title + " · 完成", n.id);
    for (const l of n.lines) {
      condition(l.condition, n.title + " · " + l.id, n.id);
      for (const key of interpolationKeys(l.text))
        uses.push({
          key,
          mode: "read",
          type: "unknown",
          nodeId: n.id,
          label: n.title + " · " + l.id,
          field: "text",
        });
      if (l.input)
        uses.push({
          key: l.input.key,
          mode: "input",
          type: "string",
          nodeId: n.id,
          label: n.title + " · " + l.id,
          field: "input",
        });
    }
    for (const c of n.choices ?? []) {
      condition(c.condition, n.title + " · " + c.label, n.id);
      effects(c.effects, n.title + " · " + c.label, n.id);
    }
  }
  for (const m of p.materials) condition(m.unlock, m.title);
  const groups = new Map<string, VariableUse[]>();
  for (const use of uses) {
    const group = groups.get(use.key);
    if (group) group.push(use);
    else groups.set(use.key, [use]);
  }
  return [...groups].map(([key, locations]) => ({
    key,
    locations,
    warnings: [
      ...(locations.some((l) => l.mode === "read") &&
      !locations.some((l) => l.mode !== "read") &&
      !Object.hasOwn(p.variables ?? {}, key)
        ? ["只发现读取，未发现写入；可能由外部赋值"]
        : []),
      ...(new Set(locations.map((l) => l.type).filter((t) => t !== "unknown"))
        .size > 1
        ? ["类型使用不一致，请检查条件与效果"]
        : []),
    ],
  }));
}
