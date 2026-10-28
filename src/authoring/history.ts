/** Persistent path patches: unchanged branches remain shared through undo/redo. */
export interface Patch {
  path: (string | number)[];
  present: boolean;
  value?: unknown;
}
export interface EditRecord {
  forward: Patch[];
  backward: Patch[];
  bytes: number;
}
export function changeRecord(before: unknown, after: unknown): EditRecord {
  const forward: Patch[] = [],
    backward: Patch[] = [];
  function walk(
    a: unknown,
    b: unknown,
    path: (string | number)[],
    hasA = true,
    hasB = true,
  ) {
    if (hasA === hasB && a === b) return;
    if (
      hasA &&
      hasB &&
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      Array.isArray(a) === Array.isArray(b) &&
      (!Array.isArray(a) || a.length === (b as unknown[]).length)
    ) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const left = a as Record<string, unknown>,
          right = b as Record<string, unknown>;
        walk(
          left[key],
          right[key],
          [...path, Array.isArray(a) ? Number(key) : key],
          Object.hasOwn(a, key),
          Object.hasOwn(b, key),
        );
      }
      return;
    }
    forward.push({ path, present: hasB, ...(hasB ? { value: b } : {}) });
    backward.unshift({ path, present: hasA, ...(hasA ? { value: a } : {}) });
  }
  walk(before, after, []);
  return {
    forward,
    backward,
    bytes: new TextEncoder().encode(JSON.stringify([forward, backward]))
      .byteLength,
  };
}
export function applyPatches<T>(root: T, patches: Patch[]): T {
  let result = root;
  for (const patch of patches) {
    function apply(current: unknown, depth: number): unknown {
      if (depth === patch.path.length) return patch.value;
      const key = patch.path[depth];
      if (["__proto__", "constructor", "prototype"].includes(String(key)))
        throw new Error("禁止原型路径");
      if (!current || typeof current !== "object")
        throw new Error("撤销路径已经失效");
      const next = Array.isArray(current) ? [...current] : { ...current };
      const record = next as Record<string | number, unknown>;
      if (depth === patch.path.length - 1 && !patch.present) delete record[key];
      else
        record[key] = apply(
          (current as Record<string | number, unknown>)[key],
          depth + 1,
        );
      return next;
    }
    result = apply(result, 0) as T;
  }
  return result;
}
export function appendHistory(
  history: EditRecord[],
  record: EditRecord,
  merge = false,
) {
  if (!record.forward.length) return { history, dropped: false };
  const result = [...history];
  if (merge && result.length) {
    const previous = result.pop()!;
    result.push({
      forward: [...previous.forward, ...record.forward],
      backward: [...record.backward, ...previous.backward],
      bytes: previous.bytes + record.bytes,
    });
  } else result.push(record);
  let bytes = result.reduce((sum, r) => sum + r.bytes, 0),
    dropped = false;
  while (result.length > 200 || bytes > 64 * 1024 * 1024) {
    bytes -= result.shift()!.bytes;
    dropped = true;
  }
  return { history: result, dropped };
}
