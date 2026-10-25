import type { StoryProject, StoryNode, Effect } from "../engine/types";
export type AuthorNode = StoryNode & { effects?: Effect[]; act?: string };
export type Profile = "modern" | "release";
export type AuthorProject = Omit<StoryProject, "schemaVersion" | "nodes"> & {
  schemaVersion?: 2;
  nodes: AuthorNode[];
};
export type Section =
  | "script"
  | "graph"
  | "presentations"
  | "assets"
  | "characters"
  | "materials"
  | "project"
  | "json"
  | "publish";
export const copy = <T>(value: T): T => structuredClone(value);
export function uniqueId(prefix: string, ids: string[]) {
  let i = 1;
  while (ids.includes(`${prefix}-${String(i).padStart(3, "0")}`)) i++;
  return `${prefix}-${String(i).padStart(3, "0")}`;
}
export function newNode(p: AuthorProject): StoryNode {
  const numeric = p.nodes
    .map((n) => /^node-(\d+)$/.exec(n.id))
    .filter(Boolean)
    .map((m) => Number(m![1]));
  const id = `node-${String(Math.max(-1, ...numeric) + 1).padStart(3, "0")}`;
  return {
    id,
    title: "新的场景",
    speaker: "旁白",
    lines: [{ id: `${id}-line-0`, text: "在这里写下新的故事。" }],
    playable: true,
    tags: [],
  };
}
export function mediaUrl(profile: Profile, s: string) {
  const workspace = new URLSearchParams(location.search).get("workspaceId");
  return !s
    ? ""
    : s.startsWith("/")
      ? `/__studio/media/${profile}${workspace ? "/@" + workspace : ""}${s.split("/").map(encodeURIComponent).join("/")}`
      : s;
}
export function assetUrl(p: AuthorProject, s: string) {
  const ref = !s
    ? ""
    : s.startsWith("/") || /^https?:/.test(s)
      ? s
      : p.backdrops.find((b) => b.id === s)?.src ||
        `${p.resources.assetsBase || "/assets/generated"}/${s}.png`;
  return mediaUrl(p.schemaVersion === 2 ? "modern" : "release", ref);
}
