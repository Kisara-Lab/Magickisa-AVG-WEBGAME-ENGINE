export function waitPointsError(
  text: string,
  duration: number,
): string | undefined {
  if (!text.trim()) return;
  const parts = text.split(",");
  const values = parts.map((s) => Number(s.trim()));
  if (
    parts.some((s) => !s.trim()) ||
    values.some(
      (n, i) =>
        !Number.isFinite(n) ||
        n < 0 ||
        n >= duration ||
        (i > 0 && n <= values[i - 1]),
    )
  )
    return "等待点须为逗号分隔、严格递增且小于演出长度的非负秒数";
}
