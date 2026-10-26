export function resolvePlayback(
  project: {
    audio?: { id: string; src: string; volume?: number }[];
    media?: {
      chapterMusicRules?: { keywords: string[]; track: string }[];
      chapterMusic?: Record<string, string>;
    };
  },
  title: string,
  currentTrackId?: string,
): { src: string; volume: number };
export function playbackVolume(
  audio: { volume: number; muted: boolean },
  trackVolume?: number,
  base?: number,
): number;
