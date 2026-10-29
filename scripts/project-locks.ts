import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { recoverCommit } from "./authoring/storage";
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
    return {
      directory,
      ...owner,
      alive,
      state: alive ? "active" : "stale",
      recoveryHint: alive
        ? "持有进程仍存在，不能恢复。"
        : "可使用 doctor --recover --lock <directory> --token <token> 恢复。",
    };
  } catch {
    return {
      directory,
      pid: null,
      token: null,
      alive: null,
      state: "unknown",
      recoveryHint:
        "锁归属文件缺失或损坏，无法证明持有进程已退出，禁止强制解锁。请关闭此引擎的全部 Studio、CLI 和构建进程，保留锁目录副本后离线移除该锁目录；详见 docs/CLI.md 的损坏锁恢复。",
    };
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
  const temporaryOwner = path.join(directory, `owner-${token}.tmp`);
  try {
    fs.writeFileSync(
      temporaryOwner,
      JSON.stringify({
        pid: process.pid,
        token,
        startedAt: new Date().toISOString(),
      }),
      { flag: "wx" },
    );
    fs.renameSync(temporaryOwner, path.join(directory, "owner.json"));
  } catch (error) {
    fs.rmSync(temporaryOwner, { force: true });
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
    const unlock = acquireLock(projectLockPath(ctx));
    try {
      recoverCommit(ctx);
      return unlock;
    } catch (error) {
      unlock();
      throw error;
    }
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
  if (info?.alive === null) throw busy(info.recoveryHint);
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
