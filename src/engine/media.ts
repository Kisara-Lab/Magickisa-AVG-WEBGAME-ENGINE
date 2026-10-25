import type { StoryProject } from "./types";
export function resolveAsset(p: StoryProject, s: string) {
  return s.startsWith("/") || /^https?:/.test(s)
    ? s
    : p.backdrops.find((b) => b.id === s)?.src ||
        `${p.resources.assetsBase || "/assets/generated"}/${s}.png`;
}
export function resolveScene(p: StoryProject, title: string) {
  const rule = p.resources.sceneRules?.find(r => r.keywords.some(k => title.includes(k)));
  return rule ? resolveAsset(p, rule.asset) : p.backdrops[0]?.src || "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%229%22%3E%3Crect width=%2216%22 height=%229%22 fill=%22%231a1b1e%22/%3E%3C/svg%3E";
}
export function resolveTrack(p: StoryProject, title: string) {
  const rule = p.media.chapterMusicRules?.find((r) =>
    r.keywords.some((k) => title.includes(k)),
  );
  return (
    (rule && p.media.chapterMusic?.[rule.track]) ||
    p.media.chapterMusic?.default ||
    ""
  );
}
export class AudioManager {
  private channels = new Map<string, HTMLAudioElement>();
  play(
    id: string,
    src: string,
    options: { volume?: number; loop?: boolean } = {},
  ) {
    let a = this.channels.get(id);
    if (!a) {
      a = new Audio(src);
      this.channels.set(id, a);
    }
    if (a.src !== new URL(src, location.href).href) a.src = src;
    a.volume = options.volume ?? 1;
    a.loop = options.loop ?? true;
    void a.play().catch(() => {});
    return a;
  }
  pause(id: string) {
    this.channels.get(id)?.pause();
  }
  stop(id: string) {
    const audio = this.channels.get(id);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
  stopAll() {
    this.channels.forEach((a) => {
      a.pause();
      a.removeAttribute("src");
      a.load();
    });
    this.channels.clear();
  }
}
