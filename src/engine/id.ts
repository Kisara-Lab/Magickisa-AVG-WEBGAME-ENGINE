// getRandomValues is also available on ordinary HTTP, where randomUUID is not.
export function randomId(
  source: Partial<
    Pick<Crypto, "randomUUID" | "getRandomValues">
  > = globalThis.crypto,
): string {
  if (source?.randomUUID) return source.randomUUID();
  if (!source?.getRandomValues)
    throw new Error("浏览器不支持随机 ID，请使用支持 Web Crypto 的浏览器。");
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
