import type { AuthorProject, Profile, Section } from "./model";
import { randomId } from "../engine/id";
export interface Draft {
  key: string;
  profile: Profile;
  sourceId?: string;
  project: AuthorProject;
  saved: string;
  revision: string;
  raw: string;
  rawBase: string;
  updatedAt: number;
  tab: string;
}
export interface Layout {
  left: number;
  right: number;
  sidebar: boolean;
  preview: boolean;
  section: Section;
  node: string;
  collapsed: string[];
}
export const defaultLayout = (): Layout => ({
  left: 248,
  right: 400,
  sidebar: true,
  preview: window.innerWidth > 1050,
  section: "script",
  node: "",
  collapsed: [],
});
export function readLayout(profile: Profile): Layout {
  try {
    const p = JSON.parse(
      localStorage.getItem(
        `magickisa:layout:${preferenceNamespace(profile)}`,
      ) ||
        localStorage.getItem(
          `magickisa:layout:${profile}${new URLSearchParams(location.search).get("workspaceId") ? ":" + new URLSearchParams(location.search).get("workspaceId") : ""}`,
        ) ||
        "null",
    );
    if (!p) return defaultLayout();
    const allowed = [
      "script",
      "graph",
      "investigation",
      "presentations",
      "assets",
      "characters",
      "materials",
      "project",
      "json",
      "publish",
    ];
    return {
      ...defaultLayout(),
      ...p,
      left: Math.max(200, Math.min(380, Number(p.left) || 248)),
      right: Math.max(300, Math.min(620, Number(p.right) || 400)),
      section: allowed.includes(p.section) ? p.section : "script",
      collapsed: Array.isArray(p.collapsed) ? p.collapsed : [],
    };
  } catch {
    return defaultLayout();
  }
}
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("magickisa-studio", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("drafts", { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      database = undefined;
      reject(r.error);
    };
    r.onblocked = () =>
      reject(new Error("草稿数据库被其他页面阻塞，请关闭旧工作台后重试。"));
  }));
}
async function transact<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("drafts", mode),
      r = run(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const listDrafts = () =>
  transact<Draft[]>("readonly", (s) => s.getAll());
export const putDraft = (draft: Draft) =>
  transact("readwrite", (s) => s.put(draft));
export const removeDraft = (key: string) =>
  transact("readwrite", (s) => s.delete(key));
// A fresh ID per mounted document avoids copied sessionStorage IDs in duplicated tabs.
export const tabId = randomId();
let preferenceTab = tabId;
let preferenceInitialization: Promise<void> | undefined;
export function initializePreferences() {
  return (preferenceInitialization ||= (async () => {
    try {
      const previous = JSON.parse(
        sessionStorage.getItem("magickisa:preference-tab") || "null",
      );
      const active = await activeTabs();
      // A duplicated tab inherits sessionStorage; an existing live owner means a new namespace.
      if (
        previous &&
        typeof previous.id === "string" &&
        !active.has(previous.owner)
      )
        preferenceTab = previous.id;
      sessionStorage.setItem(
        "magickisa:preference-tab",
        JSON.stringify({ id: preferenceTab, owner: tabId }),
      );
    } catch {
      /* The fresh document ID still isolates preferences when sessionStorage fails. */
    }
  })());
}
export function preferenceNamespace(profile: Profile) {
  const workspace = new URLSearchParams(location.search).get("workspaceId");
  return `${profile}:${workspace ? `${workspace}:` : ""}${preferenceTab}`;
}
export function preferenceScope(profile: Profile, sourceId: string) {
  return `${profile}:${sourceId}:${preferenceTab}`;
}
const leases = new Map<string, number>();
let channel: BroadcastChannel | undefined;
try {
  channel = new BroadcastChannel("magickisa-studio-tabs");
  channel.onmessage = (e) => {
    if (e.data?.type === "hello") {
      leases.set(e.data.tab, Date.now());
      channel?.postMessage({ type: "alive", tab: tabId });
    }
    if (e.data?.type === "alive") leases.set(e.data.tab, Date.now());
  };
} catch {
  /* Draft keys still isolate tabs when BroadcastChannel is unavailable. */
}
export async function activeTabs() {
  channel?.postMessage({ type: "hello", tab: tabId });
  await new Promise((resolve) => setTimeout(resolve, 120));
  return new Set(
    [...leases].filter(([, at]) => Date.now() - at < 1000).map(([id]) => id),
  );
}
