// MAGICKISA release-compatible runtime.
import { evaluateCondition } from "./condition.js";
export function attachDebug(engine, project) {
  if (typeof window > "u") return;
  const n = {
    project: project,
    getVariables: () => ({
      ...engine.runtime.save.variables,
    }),
    jump: (r) => {
      project.nodes.some((l) => l.id === r) &&
        (engine.runtime.save = {
          ...engine.runtime.save,
          nodeId: r,
          lineIndex: 0,
          visitedNodes: [...new Set([...engine.runtime.save.visitedNodes, r])],
        });
    },
    setVariable: (r, l) => {
      engine.runtime.save = {
        ...engine.runtime.save,
        variables: {
          ...engine.runtime.save.variables,
          [r]: l,
        },
      };
    },
    testCondition: (r) =>
      evaluateCondition(
        r,
        engine.runtime.save.variables,
        engine.runtime.save.visitedNodes,
      ),
    snapshot: () => structuredClone(engine.runtime.save),
  };
  window.__MAGICKISA_DEBUG__ = n;
}
