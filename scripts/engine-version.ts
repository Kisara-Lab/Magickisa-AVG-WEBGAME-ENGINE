/** SemVer ordering for package minimum-engine gates; build metadata is irrelevant. */
export function compareEngineVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const match =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
        value,
      );
    if (!match) throw new Error("无效引擎版本：" + value);
    const pre = match[4]?.split(".");
    if (pre?.some((part) => /^0\d+$/.test(part)))
      throw new Error("无效引擎版本：" + value);
    return { core: match.slice(1, 4).map(BigInt), pre };
  };
  const a = parse(left),
    b = parse(right);
  for (let i = 0; i < 3; i++)
    if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i],
      y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x),
      ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
