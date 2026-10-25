// MAGICKISA release-compatible runtime.
export const conditionHandlers = new Map();
export function evaluateCondition(condition, variables, visitedNodes = []) {
  if (!condition) return !0;
  const customHandler = conditionHandlers.get(condition.type);
  if (customHandler) return customHandler(condition, variables, visitedNodes);
  switch (condition.type) {
    case "flag":
      return condition.equals === void 0
        ? !!variables[condition.key]
        : variables[condition.key] === condition.equals;
    case "not":
      return !evaluateCondition(condition.condition, variables, visitedNodes);
    case "all":
      return condition.conditions.every((l) =>
        evaluateCondition(l, variables, visitedNodes),
      );
    case "any":
      return condition.conditions.some((l) =>
        evaluateCondition(l, variables, visitedNodes),
      );
    case "visited":
      return (
        visitedNodes.includes(condition.nodeId) === (condition.value ?? !0)
      );
    case "count": {
      const l = Number(variables[condition.key] ?? 0);
      return condition.operator === "eq"
        ? l === condition.value
        : condition.operator === "gt"
          ? l > condition.value
          : condition.operator === "gte"
            ? l >= condition.value
            : condition.operator === "lt"
              ? l < condition.value
              : l <= condition.value;
    }
  }
}
