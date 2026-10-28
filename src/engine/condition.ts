import type { Condition, Variables } from "./types";
export interface ConditionState {
  unlockedMaterials?: string[];
  readMaterials?: string[];
}
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = Object.keys(a).sort(),
    right = Object.keys(b).sort();
  return (
    left.length === right.length &&
    left.every(
      (key, i) =>
        key === right[i] &&
        jsonEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}
export const conditionHandlers = new Map<
  string,
  (
    condition: Condition,
    variables: Variables,
    visited: string[],
    state: ConditionState,
  ) => boolean
>();
export function evaluateCondition(
  c: Condition | undefined,
  v: Variables,
  visited: string[] = [],
  state: ConditionState = {},
  observe?: (condition: Condition, result: boolean) => void,
): boolean {
  const result = evaluateValue(c, v, visited, state, observe);
  if (c) observe?.(c, result);
  return result;
}
function evaluateValue(
  c: Condition | undefined,
  v: Variables,
  visited: string[],
  state: ConditionState,
  observe?: (condition: Condition, result: boolean) => void,
): boolean {
  if (!c) return true;
  const custom = conditionHandlers.get(c.type);
  if (custom) return custom(c, v, visited, state);
  switch (c.type) {
    case "material":
      return (
        (
          (c.state === "read"
            ? state.readMaterials
            : state.unlockedMaterials) ?? []
        ).includes(c.id) === (c.value ?? true)
      );
    case "contains":
      return (
        Array.isArray(v[c.key]) &&
        (v[c.key] as unknown[]).some((value) => jsonEqual(value, c.value))
      );
    case "flag":
      return c.equals === undefined
        ? !!v[c.key]
        : JSON.stringify(v[c.key]) === JSON.stringify(c.equals);
    case "not":
      return !evaluateCondition(c.condition, v, visited, state, observe);
    case "all":
      return c.conditions.every((x) =>
        evaluateCondition(x, v, visited, state, observe),
      );
    case "any":
      return c.conditions.some((x) =>
        evaluateCondition(x, v, visited, state, observe),
      );
    case "visited":
      return visited.includes(c.nodeId) === (c.value ?? true);
    case "count": {
      const x = Number(v[c.key] ?? 0);
      switch (c.operator) {
        case "eq":
          return x === c.value;
        case "gt":
          return x > c.value;
        case "gte":
          return x >= c.value;
        case "lt":
          return x < c.value;
        case "lte":
          return x <= c.value;
      }
    }
  }
}
