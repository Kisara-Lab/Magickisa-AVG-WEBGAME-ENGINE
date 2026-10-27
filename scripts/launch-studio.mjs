import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export function installDependencies(root, run = spawnSync) {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("需要 Node.js 22 或更新版本：https://nodejs.org/");
  const probe = path.join(root, `.studio-write-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(probe, "", { flag: "wx" });
  } catch {
    throw new Error(
      "目录不可写，请将启动包解压到自己的可写目录，不要直接在 ZIP 中运行。",
    );
  } finally {
    if (fs.existsSync(probe)) fs.unlinkSync(probe);
  }
  const stamp = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, "package-lock.json")))
    .update(
      `${process.platform}/${process.arch}/${process.versions.node.split(".")[0]}`,
    )
    .update(
      process.platform === "linux"
        ? process.report.getReport().header.glibcVersionRuntime || "musl"
        : "",
    )
    .digest("hex");
  const marker = path.join(root, "node_modules", ".magickisa-install");
  if (
    fs.existsSync(marker) &&
    fs.readFileSync(marker, "utf8") === stamp &&
    fs.existsSync(path.join(root, "node_modules/vite/package.json"))
  )
    return false;
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const options = {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  };
  if (run(command, ["--version"], options).status !== 0)
    throw new Error("未找到可用的 npm，请重新安装包含 npm 的 Node.js 22+。");
  fs.rmSync(marker, { force: true });
  console.log("首次启动或依赖版本变化：正在联网安装依赖……");
  const result = run(command, ["ci", "--include=dev"], options);
  if (result.status !== 0)
    throw new Error(
      "依赖安装失败。请检查网络和 npm 配置后重新启动；也可在此目录执行 npm ci --include=dev。",
    );
  fs.writeFileSync(marker, stamp);
  return true;
}

export async function launch(root) {
  // Canonicalize Windows short paths and symlinks before Vite's realpath checks.
  root = fs.realpathSync.native(root);
  process.chdir(root);
  if (process.argv.includes("--help")) {
    console.log(
      "MAGICKISA Studio launcher — Node.js 22+, npm; --no-open disables browser opening.",
    );
    return;
  }
  const lock = path.join(root, ".magickisa-studio.lock");
  try {
    const fd = fs.openSync(lock, "wx");
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let pid;
    try {
      pid = Number(fs.readFileSync(lock, "utf8"));
    } catch {
      throw new Error("无法读取启动锁，请关闭本目录的其他 Studio 后重试。");
    }
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error("启动锁尚未写入，请稍后重试。");
    try {
      process.kill(pid, 0);
      throw new Error(
        "此目录已有 Studio 正在安装或运行，请使用原窗口；不要同时启动多个服务。",
      );
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
      fs.unlinkSync(lock);
      return launch(root);
    }
  }
  process.once("exit", () => {
    try {
      if (fs.readFileSync(lock, "utf8") === String(process.pid))
        fs.unlinkSync(lock);
    } catch {}
  });
  const marker = path.join(root, "node_modules/.magickisa-install");
  if (process.argv.includes("--reinstall")) fs.rmSync(marker, { force: true });
  installDependencies(root);
  process.env.NODE_ENV = "development";
  let server;
  try {
    const { createServer } = await import(
      pathToFileURL(path.join(root, "node_modules/vite/dist/node/index.js"))
        .href
    );
    server = await createServer({
      root,
      server: {
        host: "127.0.0.1",
        // Windows native fs watchers can abort Node for Unicode directory paths.
        ...(process.platform === "win32"
          ? { watch: { usePolling: true, interval: 500 } }
          : {}),
        open: process.argv.includes("--no-open") ? false : "/engine.html",
      },
    });
  } catch (error) {
    fs.rmSync(marker, { force: true });
    throw new Error(
      `${error.message}。已清除依赖缓存标记，下次启动将重新安装；也可使用 --reinstall。`,
    );
  }
  await server.listen();
  server.printUrls();
  console.log(
    `MAGICKISA Studio: http://127.0.0.1:${server.httpServer.address().port}/engine.html`,
  );
  console.log(
    "关闭此窗口或按 Ctrl+C 停止服务。项目保存在 workspace-projects/。",
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  launch(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  ).catch((error) => {
    console.error(`Studio 启动失败：${error.message}`);
    process.exitCode = 1;
  });
}
