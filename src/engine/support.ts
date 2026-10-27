export const LEGACY_RELEASE_URL =
  "https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/releases/tag/v1.0legacy";
export const LEGACY_UNSUPPORTED = `兼容档已停止支持；请使用 v1.0legacy 打开，原文件不会修改。${LEGACY_RELEASE_URL}`;
export function requireModernProfile(profile: unknown): "modern" {
  if (
    profile === undefined ||
    profile === null ||
    profile === "" ||
    profile === "modern"
  )
    return "modern";
  throw new Error(
    profile === "release" ? LEGACY_UNSUPPORTED : "不支持的工程运行模式",
  );
}
export function requireModernProject(value: unknown): void {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 2
  )
    throw new Error(LEGACY_UNSUPPORTED);
}
