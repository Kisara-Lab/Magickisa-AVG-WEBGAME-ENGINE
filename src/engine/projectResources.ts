import type { StoryProject } from "./types";

/** Map only resource fields. Stable IDs, prose, links and authoring data stay intact. */
export function mapProjectResources(
  input: StoryProject,
  map: (path: string) => string,
): StoryProject {
  const p = structuredClone(input);
  const optional = (value: string | undefined) =>
    value === undefined ? undefined : map(value);
  p.resources.assetsBase = map(p.resources.assetsBase || "/assets/generated");
  p.resources.sceneRules?.forEach((r) => {
    r.asset = map(r.asset);
  });
  p.backdrops.forEach((a) => {
    a.src = map(a.src);
  });
  p.audio.forEach((a) => {
    a.src = map(a.src);
  });
  p.assets?.forEach((a) => {
    a.src = map(a.src);
  });
  p.gallery?.forEach((g) => {
    g.asset = map(g.asset);
  });
  p.sequences?.forEach((s) =>
    s.tracks.forEach((t) => {
      t.asset = optional(t.asset);
    }),
  );
  p.characters.forEach((c) => {
    c.portrait = optional(c.portrait);
    if (c.live2d) c.live2d.model = map(c.live2d.model);
    if (c.expressions)
      c.expressions = Object.fromEntries(
        Object.entries(c.expressions).map(([key, value]) => [key, map(value)]),
      );
  });
  p.titleScreen.music = optional(p.titleScreen.music);
  p.titleScreen.backdrop = optional(p.titleScreen.backdrop);
  if (p.media.opening) {
    p.media.opening.audio = optional(p.media.opening.audio);
    p.media.opening.lyrics = optional(p.media.opening.lyrics);
    p.media.opening.images = p.media.opening.images?.map(map);
  }
  if (p.media.ending) {
    p.media.ending.audio = optional(p.media.ending.audio);
    p.media.ending.lyrics = optional(p.media.ending.lyrics);
    p.media.ending.image = optional(p.media.ending.image);
  }
  if (p.media.chapterMusic)
    p.media.chapterMusic = Object.fromEntries(
      Object.entries(p.media.chapterMusic).map(([key, value]) => [
        key,
        map(value),
      ]),
    );
  p.media.musicGallery?.forEach((m) => {
    m.src = map(m.src);
  });
  p.nodes.forEach((n) => {
    n.background = optional(n.background);
    n.lines.forEach((l) => {
      l.voice = optional(l.voice);
    });
  });
  return p;
}

export function deploymentResource(value: string, base: string): string {
  if (!value || base === "/" || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value))
    return value;
  // Bare IDs resolve through registries or the mapped generated-assets base.
  if (!value.includes("/") && !/\.[a-z0-9]+(?:[?#]|$)/i.test(value))
    return value;
  return base.replace(/\/$/, "") + "/" + value.replace(/^\.?\//, "");
}
