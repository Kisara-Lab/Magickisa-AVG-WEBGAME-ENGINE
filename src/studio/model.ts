import type { StoryProject, StoryNode, Effect } from "../engine/types";
import { randomId } from "../engine/id";
import { resolveImage, isExternalResource } from "../engine/resource.js";
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
  let id: string;
  do {
    id = `${prefix}-${randomId()}`;
  } while (ids.includes(id));
  return id;
}
export function newNode(p: AuthorProject): StoryNode {
  const id = uniqueId(
    "node",
    p.nodes.map((n) => n.id),
  );
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
    : s.startsWith("/") && !isExternalResource(s)
      ? `/__studio/media/${profile}${workspace ? "/@" + workspace : ""}${s.split("/").map(encodeURIComponent).join("/")}`
      : s;
}
export function assetUrl(p: AuthorProject, s: string) {
  const ref = resolveImage(p, s);
  return mediaUrl(p.schemaVersion === 2 ? "modern" : "release", ref);
}
