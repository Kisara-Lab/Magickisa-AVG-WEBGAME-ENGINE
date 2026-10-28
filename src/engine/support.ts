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
    value &&
    typeof value === "object" &&
    (value as { schemaVersion?: unknown }).schemaVersion === 2
  )
    throw new Error(
      "此工程使用旧 V2 开发格式 schemaVersion 2；当前要求版本 3。请用原开发版打开或创建新工程，原文件不会修改。",
    );
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 3
  )
    throw new Error(LEGACY_UNSUPPORTED);
}
