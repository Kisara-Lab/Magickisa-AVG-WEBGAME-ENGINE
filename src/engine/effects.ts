import type { Effect, EngineSave, Value } from "./types";
import { jsonEqual } from "./condition";
export const effectHandlers = new Map<
  string,
  (save: EngineSave, effect: Effect) => EngineSave
>();
export function applyEffects(
  input: EngineSave,
  effects: Effect[] = [],
): EngineSave {
  // Checkpoints are immutable; copying the entire backlog for each choice preview
  // makes long playthroughs needlessly expensive.
  const { history, ...state } = input;
  let save: EngineSave = { ...structuredClone(state), history: [...history] };
  for (const e of effects) {
    const custom = effectHandlers.get(e.type);
    if (custom) {
      save = custom(save, e);
      continue;
    }
    const v = save.variables;
    switch (e.type) {
      case "set":
        v[e.key] = structuredClone(e.value);
        break;
      case "toggle":
        v[e.key] = !v[e.key];
        break;
      case "increment": {
        const next = Number(v[e.key] ?? 0) + e.amount;
        if (!Number.isFinite(next))
          throw new Error(
            `变量 ${e.key} 无法进行有限数值运算，请检查输入和效果。`,
          );
        v[e.key] = next;
        break;
      }
      case "addToList": {
        const current = v[e.key];
        const list: Value[] = Array.isArray(current) ? [...current] : [];
        if (!list.some((x) => jsonEqual(x, e.value)))
          list.push(structuredClone(e.value));
        v[e.key] = list;
        break;
      }
      case "removeFromList": {
        const list = v[e.key];
        v[e.key] = Array.isArray(list)
          ? list.filter((x) => !jsonEqual(x, e.value))
          : [];
        break;
      }
      case "unlockMaterial":
        if (!save.unlockedMaterials.includes(e.id))
          save.unlockedMaterials.push(e.id);
        break;
      case "markRead":
        if (!save.readMaterials.includes(e.id)) save.readMaterials.push(e.id);
        break;
      case "appendNote":
        if (!save.notes.includes(e.text)) save.notes.push(e.text);
        break;
      case "setAudio":
        save.audio.currentTrackId = e.trackId;
        break;
    }
  }
  return save;
}
