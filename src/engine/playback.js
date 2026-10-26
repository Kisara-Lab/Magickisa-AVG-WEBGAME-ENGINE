// Shared by both runtime modes. setAudio references registered audio IDs only.
export function resolvePlayback(project, title, currentTrackId) {
  const explicit = project.audio?.find((track) => track.id === currentTrackId);
  const rule = project.media?.chapterMusicRules?.find((rule) =>
    rule.keywords.some((key) => title.includes(key)),
  );
  const src =
    explicit?.src ||
    (rule && project.media?.chapterMusic?.[rule.track]) ||
    project.media?.chapterMusic?.default ||
    "";
  const registered =
    explicit || project.audio?.find((track) => track.src === src);
  return { src, volume: registered?.volume ?? 1 };
}
export function playbackVolume(audio, trackVolume = 1, base = 1) {
  return audio.muted
    ? 0
    : Math.max(0, Math.min(1, audio.volume * trackVolume * base));
}
