// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
export class ResourceManager {
  constructor() {
    defineField(this, "failed", new Set());
  }
  async preload(t) {
    await Promise.all(
      t.map(
        (n) =>
          new Promise((r) => {
            const l = new Image();
            ((l.onload = () => r()),
              (l.onerror = () => {
                (this.failed.add(n), r());
              }),
              (l.src = n));
          }),
      ),
    );
  }
  isFailed(t) {
    return this.failed.has(t);
  }
}
export function resolveAsset(project, asset) {
  var r, l;
  if (asset.startsWith("/") || asset.startsWith("http")) return asset;
  const n =
    (r = project.backdrops) == null ? void 0 : r.find((i) => i.id === asset);
  return (
    (n == null ? void 0 : n.src) ||
    `${((l = project.resources) == null ? void 0 : l.assetsBase) || "/assets/generated"}/${asset}.png`
  );
}
export function resolveScene(project, title) {
  var r, l;
  const n =
    (l = (r = project.resources) == null ? void 0 : r.sceneRules) == null
      ? void 0
      : l.find((i) => i.keywords.some((s) => title.includes(s)));
  return n ? resolveAsset(project, n.asset) : project.backdrops?.[0]?.src || "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%229%22%3E%3Crect width=%2216%22 height=%229%22 fill=%22%231a1b1e%22/%3E%3C/svg%3E";
}
export async function preloadCharacters(project, resolveAsset) {
  const n = (project.characters || []).flatMap((l) => {
      const i = l.portrait ? [resolveAsset(l.portrait)] : [],
        s = Object.values(l.expressions || {}).map(resolveAsset);
      return [...i, ...s];
    }),
    r = new ResourceManager();
  return (await r.preload(n), r);
}
