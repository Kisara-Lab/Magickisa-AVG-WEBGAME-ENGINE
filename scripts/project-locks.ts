import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { repository, workspaceRoot, type ProjectContext } from "./workspaces";

export const buildLockPath = path.join(repository, ".magickisa-build.lock");
const gatePath = path.join(repository, ".magickisa-coordination.lock");
export const registryLockPath = path.join(
  repository,
  ".magickisa-registry.lock",
);
export const projectLockPath = (ctx: ProjectContext) =>
  path.join(ctx.directory, ".magickisa-write.lock");
export function busy(message: string) {
  return Object.assign(new Error(message), {
    status: 409,
    code: "BUSY",
    exitCode: 4,
  });
}
export function lockInfo(directory: string) {
  if (!fs.existsSync(directory)) return null;
  if (fs.lstatSync(directory).isSymbolicLink())
    throw busy("锁路径不能是符号链接");
  try {
    const owner = JSON.parse(
      fs.readFileSync(path.join(directory, "owner.json"), "utf8"),
    );
    let alive = false;
    if (
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.token !== "string"
    )
      throw new Error("Invalid owner");
    for (const pid of [owner.pid, ...(owner.dependents ?? [])]) {
      if (!Number.isInteger(pid) || pid <= 0)
        throw new Error("Invalid dependent");
      try {
        process.kill(pid, 0);
        alive = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") alive = true;
      }
    }
    return { directory, ...owner, alive };
  } catch {
    return { directory, pid: null, token: null, alive: null };
  }
}
export function protectChild(directory: string, pid: number) {
  const info = lockInfo(directory);
  if (!info || info.pid !== process.pid) throw busy("锁归属已改变");
  const { directory: _directory, alive: _alive, ...owner } = info;
  const temp = path.join(directory, `owner-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temp, JSON.stringify({ ...owner, dependents: [pid] }));
  fs.renameSync(temp, path.join(directory, "owner.json"));
}
export function acquireLock(directory: string): () => void {
  try {
    fs.mkdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw Object.assign(
      busy(`资源正在写入或存在遗留锁；使用 doctor 检查后恢复：${directory}`),
      { details: lockInfo(directory) },
    );
  }
  const token = crypto.randomUUID();
  try {
    fs.writeFileSync(
      path.join(directory, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        token,
        startedAt: new Date().toISOString(),
      }),
      { flag: "wx" },
    );
  } catch (error) {
    fs.rmdirSync(directory);
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (lockInfo(directory)?.token === token)
      fs.rmSync(directory, { recursive: true });
  };
}
export function acquireProjectWrite(ctx: ProjectContext) {
  const gate = acquireLock(gatePath);
  try {
    if (lockInfo(buildLockPath)) throw busy("正在构建，请完成后再写入工程");
    return acquireLock(projectLockPath(ctx));
  } finally {
    gate();
  }
}
export function acquireRegistry() {
  const gate = acquireLock(gatePath);
  try {
    if (lockInfo(buildLockPath)) throw busy("正在构建，暂不能登记工程");
    return acquireLock(registryLockPath);
  } finally {
    gate();
  }
}
export function acquireBuild() {
  const gate = acquireLock(gatePath);
  try {
    if (lockInfo(registryLockPath)) throw busy("正在登记工程，暂不能构建");
    for (const entry of fs.readdirSync(workspaceRoot, {
      withFileTypes: true,
    })) {
      if (
        entry.isDirectory() &&
        fs.existsSync(
          path.join(workspaceRoot, entry.name, ".magickisa-write.lock"),
        )
      )
        throw busy("有工程正在写入，暂不能构建");
    }
    return acquireLock(buildLockPath);
  } finally {
    gate();
  }
}
export function inspectLocks(ctx?: ProjectContext) {
  return [
    gatePath,
    buildLockPath,
    registryLockPath,
    ...(ctx ? [projectLockPath(ctx)] : []),
  ]
    .map(lockInfo)
    .filter(Boolean);
}
export function recoverLock(directory: string, token: string) {
  const info = lockInfo(directory);
  if (!info || info.token !== token || info.alive !== false)
    throw busy("只能恢复 token 匹配且持有进程已退出的锁");
  const marker = path.join(directory, "recovering");
  const fd = fs.openSync(marker, "wx");
  fs.closeSync(fd);
  try {
    const current = lockInfo(directory);
    if (!current || current.token !== token || current.alive !== false)
      throw busy("锁状态已改变，未恢复");
    const retired = `${directory}.recovered-${crypto.randomUUID()}`;
    fs.renameSync(directory, retired);
    fs.rmSync(retired, { recursive: true });
  } finally {
    // A replacement lock may already exist; never remove files in that directory.
    if (lockInfo(directory)?.token === token)
      fs.rmSync(marker, { force: true });
  }
}
