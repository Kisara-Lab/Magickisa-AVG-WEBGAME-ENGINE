import type { StorageAdapter } from "../engine/types";
export interface PlayerPreferences {
  fontSize: number;
  lineHeight: number;
  opacity: number;
  characterDelay: number;
  autoDelay: number;
  wheel: boolean;
  musicLabel: boolean;
  volume: number;
  muted: boolean;
}
export const defaultPreferences: PlayerPreferences = {
  fontSize: 21,
  lineHeight: 1.8,
  opacity: 0.9,
  characterDelay: 0,
  autoDelay: 2.6,
  wheel: false,
  musicLabel: true,
  volume: 1,
  muted: false,
};
export const preferenceKey = (id: string) =>
  `magickisa:player-preferences:${id}`;
export function readPreferences(
  storage: StorageAdapter,
  id: string,
  audio?: { volume: number; muted: boolean },
): PlayerPreferences {
  const raw = storage.getItem(preferenceKey(id));
  const input = raw
    ? JSON.parse(raw)
    : { musicLabel: storage.getItem("magickisa:music-label") !== "off" };
  const p = { ...defaultPreferences, ...audio };
  for (const [key, min, max] of [
    ["fontSize", 16, 32],
    ["lineHeight", 1.4, 2.4],
    ["opacity", 0.75, 1],
    ["characterDelay", 0, 120],
    ["autoDelay", 1, 10],
    ["volume", 0, 1],
  ] as const)
    if (typeof input[key] === "number" && Number.isFinite(input[key]))
      p[key] = Math.max(min, Math.min(max, input[key]));
  for (const key of ["wheel", "musicLabel", "muted"] as const)
    if (typeof input[key] === "boolean") p[key] = input[key];
  return p;
}
export function graphemes(text: string) {
  return Array.from(
    new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text),
    (entry) => entry.segment,
  );
}
