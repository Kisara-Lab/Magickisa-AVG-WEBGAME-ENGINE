import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import yauzl from "yauzl";
import { pipeline } from "node:stream/promises";
import { installDependencies } from "./launch-studio.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "MAGICKISA 中文 空格 "));
let child;
try {
  const unit = path.join(temp, "unit");
  fs.mkdirSync(unit);
  fs.writeFileSync(path.join(unit, "package-lock.json"), "{}");
  const fake = (_cmd, args) => {
    if (args[0] === "ci") {
      assert.deepEqual(args, ["ci", "--include=dev"]);
      fs.mkdirSync(path.join(unit, "node_modules/vite"), { recursive: true });
      fs.writeFileSync(path.join(unit, "node_modules/vite/package.json"), "{}");
    }
    return { status: 0 };
  };
  assert.equal(installDependencies(unit, fake), true);
  assert.equal(
    installDependencies(unit, () => {
      throw new Error("must reuse dependencies");
    }),
    false,
  );
  fs.writeFileSync(path.join(unit, "package-lock.json"), '{"changed":true}');
  assert.throws(
    () =>
      installDependencies(unit, (_cmd, args) => ({
        status: args[0] === "ci" ? 1 : 0,
      })),
    /npm ci/,
  );
  assert.equal(
    fs.existsSync(path.join(unit, "node_modules/.magickisa-install")),
    false,
  );
  assert.equal(installDependencies(unit, fake), true);

  const zip = path.resolve(
    "release-artifacts/MAGICKISA-v1.0legacy-Studio-start.zip",
  );
  await new Promise((resolve, reject) =>
    yauzl.open(zip, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      archive.on("error", reject);
      archive.on("end", resolve);
      archive.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) {
          fs.mkdirSync(path.join(temp, entry.fileName), { recursive: true });
          archive.readEntry();
          return;
        }
        archive.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const output = path.join(temp, entry.fileName);
          fs.mkdirSync(path.dirname(output), { recursive: true });
          // lazyEntries: advance only after this write completes, so end cannot
          // resolve the archive before an outstanding pipeline has finished.
          pipeline(stream, fs.createWriteStream(output)).then(
            () => archive.readEntry(),
            (error) => {
              archive.close();
              reject(error);
            },
          );
        });
      });
      archive.readEntry();
    }),
  );
  const root = path.join(temp, "MAGICKISA");
  const wrapper =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/c", "Start-Studio.cmd --help"], {
          cwd: root,
          encoding: "utf8",
          windowsHide: true,
        })
      : spawnSync(
          "sh",
          [
            process.platform === "darwin"
              ? "Start-Studio.command"
              : "Start-Studio.sh",
            "--help",
          ],
          { cwd: root, encoding: "utf8" },
        );
  assert.equal(wrapper.status, 0, wrapper.stderr);
  assert.match(wrapper.stdout, /MAGICKISA Studio launcher/);
  child = spawn(process.execPath, ["scripts/launch-studio.mjs", "--no-open"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production" },
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  let url;
  for (let i = 0; i < 900; i++) {
    if (child.exitCode !== null) throw new Error(output);
    url = output.match(/MAGICKISA Studio: (http:\/\/127\.0\.0\.1:\d+)\//)?.[1];
    if (url) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(url, output);
  const duplicate = spawnSync(
    process.execPath,
    ["scripts/launch-studio.mjs", "--no-open"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /Studio/);
  const page = await fetch(url + "/engine.html").catch((error) => {
    throw new Error(`${error}\n${output}`);
  });
  assert.equal(
    page.ok,
    true,
    `${page.status}: ${await page.text()}\n${output}`,
  );
  const list = await (await fetch(url + "/__studio/workspaces")).json();
  assert.ok(Array.isArray(list.projects));
  child.kill("SIGTERM");
  await once(child, "exit");
  child = null;
  await assert.rejects(() => fetch(url + "/engine.html"));
  assert.ok(fs.existsSync(path.join(root, "node_modules/.magickisa-install")));
  console.log(
    "PASS launcher: platform wrapper, Unicode/space path, clean install, reuse, failed install/retry, live Studio API, shutdown",
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  await fs.promises.rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 200,
  });
}
