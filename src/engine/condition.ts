import type { Condition, Variables } from "./types";
export const conditionHandlers = new Map<
  string,
  (condition: Condition, variables: Variables, visited: string[]) => boolean
>();
export function evaluateCondition(
  c: Condition | undefined,
  v: Variables,
  visited: string[] = [],
): boolean {
  if (!c) return true;
  const custom = conditionHandlers.get(c.type);
  if (custom) return custom(c, v, visited);
  switch (c.type) {
    case "flag":
      return c.equals === undefined
        ? !!v[c.key]
        : JSON.stringify(v[c.key]) === JSON.stringify(c.equals);
    case "not":
      return !evaluateCondition(c.condition, v, visited);
    case "all":
      return c.conditions.every((x) => evaluateCondition(x, v, visited));
    case "any":
      return c.conditions.some((x) => evaluateCondition(x, v, visited));
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
