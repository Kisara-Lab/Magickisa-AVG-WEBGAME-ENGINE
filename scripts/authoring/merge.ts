import { isDeepStrictEqual as equal } from "node:util";
import { safeData } from "../cli/operations";
import type { Cell, Entry, Origin, SyncState } from "./model";
export const absent: Cell = { present: false };
export const cell = (value: unknown): Cell => ({
  present: true,
  value: structuredClone(value),
});
export const escape = (value: string) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");
const keyed = new Set([
  "nodes",
  "lines",
  "choices",
  "characters",
  "materials",
  "backdrops",
  "audio",
]);
export function segments(pointer: string) {
  if (!pointer.startsWith("/") || pointer === "/")
    throw new Error("Expected a non-root stable pointer");
  return pointer
    .slice(1)
    .split("/")
    .map((s) => {
      if (/~(?![01])/.test(s)) throw new Error("Invalid pointer escape");
      const key = s.replaceAll("~1", "/").replaceAll("~0", "~");
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Prototype paths are forbidden");
      return key;
    });
}
export function get(root: unknown, pointer: string): Cell {
  let target: any = root;
  for (const part of segments(pointer)) {
    if (part === "$order" && Array.isArray(target))
      return cell(target.map((item) => item.id));
    if (Array.isArray(target) && part.startsWith("@"))
      target = target.find((item) => item.id === part.slice(1));
    else if (
      target &&
      typeof target === "object" &&
      Object.hasOwn(target, part)
    )
      target = target[part];
    else return absent;
    if (target === undefined) return absent;
  }
  return cell(target);
}
export function put(root: unknown, pointer: string, value: Cell) {
  safeData(value);
  const parts = segments(pointer);
  let target: any = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i],
      last = i === parts.length - 1;
    if (part === "$order" && last && Array.isArray(target)) {
      if (!value.present || !Array.isArray(value.value))
        throw new Error("Invalid order");
      const ids = value.value as string[];
      if (new Set(ids).size !== ids.length)
        throw new Error("Duplicate ordering ID");
      const sorted = [
        ...ids
          .map((id) => target.find((item: any) => item.id === id))
          .filter(Boolean),
        ...target.filter((item: any) => !ids.includes(item.id)),
      ];
      target.splice(0, target.length, ...sorted);
      return;
    }
    if (Array.isArray(target) && part.startsWith("@")) {
      const id = part.slice(1),
        index = target.findIndex((item) => item.id === id);
      if (last) {
        if (!value.present) {
          if (index >= 0) target.splice(index, 1);
        } else if (index < 0) target.push(structuredClone(value.value));
        else target[index] = structuredClone(value.value);
        return;
      }
      if (index < 0) target.push({ id });
      target = target.find((item) => item.id === id);
    } else if (Array.isArray(target)) {
      if (!/^(0|[1-9]\d*)$/.test(part) || Number(part) >= target.length)
        throw new Error(`Invalid array path ${pointer}`);
      const index = Number(part);
      if (last) {
        if (value.present) target[index] = structuredClone(value.value);
        else target.splice(index, 1);
        return;
      }
      target = target[index];
    } else {
      if (!target || typeof target !== "object" || Array.isArray(target))
        throw new Error(`Invalid path ${pointer}`);
      if (last) {
        if (value.present) target[part] = structuredClone(value.value);
        else delete target[part];
        return;
      }
      if (!Object.hasOwn(target, part))
        target[part] =
          parts[i + 1].startsWith("@") || parts[i + 1] === "$order" ? [] : {};
      target = target[part];
    }
  }
}
export function flatten(value: unknown, origin: Origin, prefix = ""): Entry[] {
  safeData(value);
  const result: Entry[] = [];
  function visit(value: any, pointer: string, field: string) {
    if (
      Array.isArray(value) &&
      keyed.has(field) &&
      (/^\/(nodes|characters|materials|backdrops|audio)$/.test(pointer) ||
        /^\/nodes\/[^/]+\/(lines|choices)$/.test(pointer))
    ) {
      const seen = new Set<string>();
      for (const item of value) {
        if (
          !item ||
          typeof item.id !== "string" ||
          !item.id ||
          seen.has(item.id)
        )
          throw new Error(`Missing/duplicate stable ID: ${pointer}`);
        seen.add(item.id);
        const at = pointer + "/" + escape("@" + item.id);
        result.push({
          path: at,
          mode: "record",
          cell: cell({ id: item.id }),
          origin: { ...origin, field: at },
        });
        for (const [key, child] of Object.entries(item))
          if (key !== "id") visit(child, at + "/" + escape(key), key);
      }
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
    ) {
      for (const [key, child] of Object.entries(value))
        visit(child, pointer + "/" + escape(key), key);
    } else
      result.push({
        path: pointer,
        mode: "value",
        cell: cell(value),
        origin: { ...origin, field: pointer },
      });
  }
  for (const [key, child] of Object.entries(value as object))
    visit(child, prefix + "/" + escape(key), key);
  return result;
}
export function merge<T>(
  current: T,
  entries: Entry[],
  state: SyncState,
  resolutions: { path: string; take: "current" | "incoming" }[],
) {
  const project = structuredClone(current),
    nextEntries = structuredClone(state.entries);
  const changes: any[] = [],
    conflicts: any[] = [],
    blocked: string[] = [];
  const ordered = [...entries].sort(
    (a, b) => segments(a.path).length - segments(b.path).length,
  );
  for (const entry of ordered) {
    const at = entry.path;
    const choice = [...resolutions]
      .filter((r) => at === r.path || at.startsWith(r.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0]?.take;
    nextEntries[at] = entry.cell;
    if (blocked.some((p) => at.startsWith(p + "/"))) continue;
    const raw = get(current, at);
    const actual =
      entry.mode === "record" && raw.present
        ? cell({ id: (raw.value as any).id })
        : raw;
    let base =
      (entry.mode === "remove" && state.entries[at]?.present) ||
      (entry.mode === "order" &&
        state.entries[at] === undefined &&
        state.project)
        ? get(state.project, at)
        : state.entries[at];
    if (entry.mode === "remove" && state.incomingProject !== undefined) {
      base = get(state.incomingProject, at);
    } else if (entry.mode === "remove" && state.entries[at]?.present) {
      // A prior sync may have preserved manual values in its project snapshot.
      // Compare deletion against the incoming baseline, not that preserved copy.
      const incomingBase = structuredClone(state.project ?? current);
      for (const [path, baseline] of Object.entries(state.entries)
        .filter(([path]) => path === at || path.startsWith(at + "/"))
        .sort(([a], [b]) => segments(a).length - segments(b).length))
        if (!(
          baseline.present &&
          baseline.value &&
          typeof baseline.value === "object" &&
          Object.keys(baseline.value).length === 1 &&
          "id" in baseline.value &&
          get(incomingBase, path).present
        ))
          put(incomingBase, path, baseline);
      base = get(incomingBase, at);
    }
    let conflict = false,
      reason = "both-edited";
    if (entry.mode === "record") {
      if (!base && raw.present) {
        conflict = true;
        reason = "adoption";
      }
      if (base?.present && !raw.present) {
        const edited = entries.some(
          (e) =>
            e.path.startsWith(at + "/") &&
            !equal(state.entries[e.path], e.cell),
        );
        if (edited) {
          conflict = true;
          reason = "deleted-in-project";
        } else {
          blocked.push(at);
          continue;
        }
      }
    } else
      conflict =
        !equal(actual, entry.cell) &&
        (base === undefined
          ? actual.present
          : !equal(actual, base) && !equal(base, entry.cell));
    if (conflict && !choice) {
      conflicts.push({
        path: at,
        reason,
        base: base ?? absent,
        current: raw,
        incoming: entry.cell,
        origin: entry.origin,
      });
      if (entry.mode === "record") blocked.push(at);
      continue;
    }
    if (choice === "current") {
      if (entry.mode === "record") blocked.push(at);
      continue;
    }
    if (
      !choice &&
      base !== undefined &&
      equal(base, entry.cell) &&
      !equal(actual, base)
    )
      continue;
    if (entry.mode === "record") {
      if (!raw.present) {
        put(project, at, entry.cell);
        changes.push({ ...entry, before: raw, after: entry.cell });
      }
    } else if (!equal(get(project, at), entry.cell)) {
      const before = get(project, at);
      put(project, at, entry.cell);
      changes.push({ ...entry, before, after: entry.cell });
    }
  }
  return { project, changes, conflicts, nextEntries };
}
