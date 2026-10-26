import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AuthorProject, Section } from "./model";

export interface EditorPosition {
  section: Section;
  nodeId?: string;
  lineId?: string;
  mode?: "dedication" | "opening" | "ending";
  items: Record<string, string>;
  field?: string;
  selector?: string;
}
interface Bookmark {
  position: EditorPosition;
  scroll: number;
  inner: number;
  focus?: string;
}
export const WorkspaceContext = createContext<{
  scope: string;
  section: Section;
  items: Record<string, string>;
  setItem: (key: string, value: string) => void;
  warning: (message: string) => void;
  sequences: Record<string, string[]>;
  navigationVersion: number;
} | null>(null);
export function useNavigationSignal() {
  return useContext(WorkspaceContext)?.navigationVersion || 0;
}
// Presentation arrays have no schema IDs. Session keys follow unchanged entries through sorting.
export function useSequenceKeys(scope: string, project: AuthorProject | null) {
  const registry = useRef<{
    scope: string;
    values: Record<string, { id: string; signature: string }[]>;
  }>({ scope: "", values: {} });
  if (registry.current.scope !== scope)
    registry.current = { scope, values: {} };
  const arrays = {
    "dedication-page": project?.media.dedication?.pages || [],
    "cue:opening": project?.media.opening?.pages || [],
    "cue:ending": project?.media.ending?.lines || [],
  };
  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(arrays)) {
    const old = registry.current.values[key] || [],
      used = new Set<string>();
    const next = values.map((value) => {
      const signature = JSON.stringify(value);
      const match = old.find(
        (entry) => entry.signature === signature && !used.has(entry.id),
      );
      if (match) used.add(match.id);
      return { signature, id: match?.id || "" };
    });
    next.forEach((entry, index) => {
      if (!entry.id) {
        const previous = old[index];
        entry.id =
          previous && !used.has(previous.id)
            ? previous.id
            : crypto.randomUUID();
        used.add(entry.id);
      }
    });
    registry.current.values[key] = next;
    result[key] = next.map((entry) => entry.id);
  }
  return result;
}
export function useSequenceSelection(
  key: string,
): [number, Dispatch<SetStateAction<number>>] {
  const context = useContext(WorkspaceContext);
  const ids = context?.sequences[key] || [];
  const [selected, setSelected] = useSelection(key, ids[0] || "");
  const index = Math.max(0, ids.indexOf(selected));
  return [
    index,
    (value) => {
      const next = typeof value === "function" ? value(index) : value;
      setSelected(ids[next] || "");
    },
  ];
}
export function useSelection(
  key: string,
  fallback = "",
): [string, Dispatch<SetStateAction<string>>] {
  const context = useContext(WorkspaceContext);
  const [local, setLocal] = useState(fallback);
  const value = context?.items[key] ?? fallback;
  return context
    ? [
        value,
        (next) =>
          context.setItem(key, typeof next === "function" ? next(value) : next),
      ]
    : [local, setLocal];
}
export function preference<T>(key: string, fallback: T): T {
  try {
    const legacy = key.replace(
      /(magickisa:(?:recent|fold):[^:]+:[^:]+):[0-9a-f-]{36}(?=:|$)/,
      "$1",
    );
    return (
      JSON.parse(
        localStorage.getItem(key) ||
          (legacy !== key ? localStorage.getItem(legacy) : null) ||
          "null",
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function useEditorNavigation(
  scope: string,
  current: EditorPosition,
  apply: (p: EditorPosition) => void,
) {
  const history = useRef<Bookmark[]>([]),
    cursor = useRef(-1),
    pending = useRef<Bookmark | null>(null);
  const restoring = useRef(false);
  const [version, refresh] = useState(0);
  const identity = JSON.stringify(current);
  const previousScope = useRef(scope);
  useEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      history.current = [];
      cursor.current = -1;
      pending.current = null;
    }
    if (!scope) return;
    const last = history.current[cursor.current];
    if (last && JSON.stringify(last.position) === identity) {
      pending.current = null;
      return;
    }
    if (pending.current) {
      // The requested entity may have been deleted; replace its bookmark with the resolved fallback.
      history.current[cursor.current] = {
        ...pending.current,
        position: structuredClone(current),
      };
      pending.current = null;
      refresh((v) => v + 1);
      return;
    }
    {
      history.current = history.current.slice(0, cursor.current + 1);
      history.current.push({
        position: structuredClone(current),
        scroll: 0,
        inner: 0,
      });
      if (history.current.length > 30) history.current.shift();
      cursor.current = history.current.length - 1;
    }
    refresh((v) => v + 1);
  }, [identity, scope]);
  useEffect(() => {
    const record = () => {
      const bookmark = history.current[cursor.current];
      if (!bookmark || pending.current || restoring.current) return;
      if (
        document.querySelector<HTMLElement>(".studio-root")?.dataset.section !==
        bookmark.position.section
      )
        return;
      bookmark.scroll = document.querySelector(".st-content")?.scrollTop || 0;
      bookmark.inner = document.querySelector(".st-line-list")?.scrollTop || 0;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest(".st-content")) {
        const label = active.getAttribute("aria-label");
        if (label) bookmark.focus = label;
      }
    };
    document.addEventListener("scroll", record, true);
    document.addEventListener("focusin", record, true);
    return () => {
      document.removeEventListener("scroll", record, true);
      document.removeEventListener("focusin", record, true);
    };
  }, []);
  const go = (delta: number) => {
    const index = cursor.current + delta,
      bookmark = history.current[index];
    if (!bookmark) return;
    const restore = structuredClone(bookmark);
    restoring.current = true;
    cursor.current = index;
    pending.current = bookmark;
    apply(structuredClone(bookmark.position));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const content = document.querySelector(".st-content"),
          lines = document.querySelector(".st-line-list");
        if (content) content.scrollTop = restore.scroll;
        if (lines) lines.scrollTop = restore.inner;
        const target = restore.focus
          ? Array.from(
              document.querySelectorAll<HTMLElement>("[aria-label]"),
            ).find(
              (e) =>
                e.getAttribute("aria-label") === restore.focus &&
                e.closest(".st-content"),
            )
          : undefined;
        if (target) reveal(target, false);
        requestAnimationFrame(() => {
          restoring.current = false;
        });
      }),
    );
    refresh((v) => v + 1);
  };
  void version;
  return {
    back: () => go(-1),
    forward: () => go(1),
    canBack: cursor.current > 0,
    canForward: cursor.current < history.current.length - 1,
  };
}
export function reveal(target: HTMLElement, scroll = true) {
  let parent = target.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) {
      parent.dataset.temporaryOpen = "true";
      parent.open = true;
    }
    parent = parent.parentElement;
  }
  target.focus({ preventScroll: true });
  if (scroll) target.scrollIntoView({ block: "center" });
}
export function resolvePosition(
  p: AuthorProject,
  position: EditorPosition,
  files: { url: string }[],
  sequences: Record<string, string[]> = {},
) {
  const next = structuredClone(position);
  let missing = false;
  if (next.nodeId && !p.nodes.some((n) => n.id === next.nodeId)) {
    next.nodeId = p.nodes[0]?.id;
    next.lineId = undefined;
    missing = true;
  }
  const node = p.nodes.find((n) => n.id === next.nodeId);
  if (next.lineId && !node?.lines.some((l) => l.id === next.lineId)) {
    next.lineId = undefined;
    missing = true;
  }
  for (const [key, values] of [
    ["characters", p.characters.map((c) => c.id)],
    ["materials", p.materials.map((m) => m.id)],
    ["assets", files.map((f) => f.url)],
  ] as const) {
    if (next.items[key] && !values.includes(next.items[key])) {
      next.items[key] = "";
      missing = true;
    }
  }
  for (const [key, ids] of Object.entries(sequences)) {
    if (next.items[key] && !ids.includes(next.items[key])) {
      next.items[key] = ids[0] || "";
      missing = true;
    }
  }
  if (missing) next.field = undefined;
  return { position: next, missing };
}
