// MAGICKISA release-compatible runtime.
export const effectHandlers = new Map();
export function applyEffects(save, effects = []) {
  const variables = {
      ...save.variables,
    },
    unlockedMaterials = [...save.unlockedMaterials],
    readMaterials = [...save.readMaterials],
    notes = [...save.notes],
    audio = {
      ...save.audio,
    };
  let customSave = {
    ...save,
    variables: variables,
    unlockedMaterials: unlockedMaterials,
    readMaterials: readMaterials,
    notes: notes,
    audio: audio,
  };
  for (const o of effects) {
    const c = effectHandlers.get(o.type);
    if (c) {
      ((customSave = c(customSave, o)),
        Object.assign(variables, customSave.variables),
        unlockedMaterials.splice(
          0,
          unlockedMaterials.length,
          ...customSave.unlockedMaterials,
        ),
        readMaterials.splice(
          0,
          readMaterials.length,
          ...customSave.readMaterials,
        ),
        notes.splice(0, notes.length, ...customSave.notes),
        Object.assign(audio, customSave.audio));
      continue;
    }
    if (
      (o.type === "set" && (variables[o.key] = o.value),
      o.type === "toggle" && (variables[o.key] = !variables[o.key]),
      o.type === "increment" &&
        (variables[o.key] = Number(variables[o.key] ?? 0) + o.amount),
      o.type === "addToList")
    ) {
      const v = Array.isArray(variables[o.key]) ? [...variables[o.key]] : [];
      (v.includes(o.value) || v.push(o.value), (variables[o.key] = v));
    }
    if (o.type === "removeFromList") {
      const v = Array.isArray(variables[o.key]) ? variables[o.key] : [];
      variables[o.key] = v.filter((y) => y !== o.value);
    }
    (o.type === "unlockMaterial" &&
      !unlockedMaterials.includes(o.id) &&
      unlockedMaterials.push(o.id),
      o.type === "markRead" &&
        !readMaterials.includes(o.id) &&
        readMaterials.push(o.id),
      o.type === "appendNote" && !notes.includes(o.text) && notes.push(o.text),
      o.type === "setAudio" && (audio.currentTrackId = o.trackId));
  }
  return {
    ...save,
    variables: variables,
    unlockedMaterials: unlockedMaterials,
    readMaterials: readMaterials,
    notes: notes,
    audio: audio,
    savedAt: new Date().toISOString(),
  };
}
