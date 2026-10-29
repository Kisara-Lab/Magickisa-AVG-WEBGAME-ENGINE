import type { EngineSave, Value } from "./types";
import { jsonEqual } from "./condition";
export type EngineAction =
  | { kind: "advance"; line?: string }
  | { kind: "choose"; id: string }
  | { kind: "input"; line: string; value: string }
  | { kind: "read"; id: string }
  | { kind: "presentation.complete" }
  | { kind: "jump" | "rollback" | "restore" | "reset" | "debug-variable" };
export interface EngineEvent {
  protocolVersion: 1;
  action?: EngineAction;
  before: { node: string; line: string | null };
  after: { node: string; line: string | null };
  variables: Record<string, { before?: Value; after?: Value }>;
  unlocked: string[];
  read: string[];
  endings: string[];
}
export function transitionEvent(
  before: EngineSave,
  after: EngineSave,
  action?: EngineAction,
): EngineEvent {
  const variables: EngineEvent["variables"] = {};
  for (const key of new Set([
    ...Object.keys(before.variables),
    ...Object.keys(after.variables),
  ]))
    if (!jsonEqual(before.variables[key], after.variables[key]))
      variables[key] = {
        before: structuredClone(before.variables[key]),
        after: structuredClone(after.variables[key]),
      };
  return {
    protocolVersion: 1,
    ...(action ? { action } : {}),
    before: { node: before.nodeId, line: before.lineId },
    after: { node: after.nodeId, line: after.lineId },
    variables,
    unlocked: after.unlockedMaterials.filter(
      (id) => !before.unlockedMaterials.includes(id),
    ),
    read: after.readMaterials.filter(
      (id) => !before.readMaterials.includes(id),
    ),
    endings: after.completedEndings.filter(
      (id) => !before.completedEndings.includes(id),
    ),
  };
}
