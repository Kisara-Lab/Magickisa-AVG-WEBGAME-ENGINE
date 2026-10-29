export type AssetKind = "image" | "audio" | "video" | "lyrics" | "other";
export function assetKind(value: string): AssetKind {
  const ext = value.split(/[?#]/)[0].split(".").at(-1)?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "svg", "gif", "avif"].includes(ext ?? ""))
    return "image";
  if (["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(ext ?? ""))
    return "audio";
  if (["mp4", "webm", "ogv"].includes(ext ?? "")) return "video";
  if (["lrc", "vtt"].includes(ext ?? "")) return "lyrics";
  return "other";
}
