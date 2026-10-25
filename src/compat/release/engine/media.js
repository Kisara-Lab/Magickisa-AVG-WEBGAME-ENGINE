// MAGICKISA release-compatible runtime.
export function getMedia(project) {
  return (project == null ? void 0 : project.media) || {};
}
export function resolveTrack(project, title) {
  var l, i, s;
  const n = getMedia(project),
    r =
      (l = n.chapterMusicRules) == null
        ? void 0
        : l.find((u) => u.keywords.some((o) => title.includes(o)));
  return (
    (r && ((i = n.chapterMusic) == null ? void 0 : i[r.track])) ||
    ((s = n.chapterMusic) == null ? void 0 : s.default) ||
    ""
  );
}
