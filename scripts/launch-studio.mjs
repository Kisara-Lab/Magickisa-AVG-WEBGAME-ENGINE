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
  if (process.argv.includes("--help")) {
    console.log(
      "MAGICKISA Studio launcher — Node.js 22+, npm; --no-open disables browser opening.",
    );
    return;
  }
  installDependencies(root);
  const { createServer } = await import(
    pathToFileURL(path.join(root, "node_modules/vite/dist/node/index.js")).href
  );
  const server = await createServer({
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
