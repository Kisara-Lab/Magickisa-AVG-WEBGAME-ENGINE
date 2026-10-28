import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "scripts/magickisa.mjs");
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "MAGICKISA CLI 中文 空格 "),
);
const created = new Set();
export async function cli(args, input, expected = 0, cwd = temporary) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args, "--json"], {
      cwd,
      windowsHide: true,
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
  assert.equal(result.code, expected, result.stdout + result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.protocolVersion, 1);
  assert.equal(parsed.ok, expected === 0);
  return expected === 0 ? parsed.data : parsed.error;
}
try {
  assert.ok((await cli(["help"])).commands.edit);
  assert.ok((await cli(["schema", "transaction"])).properties.operations);
  assert.ok((await cli(["schema", "project"])).properties.schemaVersion);
  assert.equal((await cli(["doctor"])).supported, true);
  await cli(["scene", "list"], undefined, 2);
  await cli(["asset", "import", "--dry-run"], undefined, 2);
  await cli(["scene", "list", "--data", "{}"], undefined, 2);
  const fresh = await cli(["project", "create", "--name", "CLI 中文 工程"]);
  const id = fresh.workspaceId;
  created.add(id);
  const w = ["--workspace", id];
  const call = (args, input, code) => cli([...args, ...w], input, code);
  const directory = path.join(root, "workspace-projects", id);
  const projectFile = path.join(directory, "project.json");
  const original = fs.readFileSync(projectFile);
  const image = path.join(temporary, "图片 名称.svg");
  fs.writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const asset = await call(["asset", "import", "--file", image]);
  const duplicateAsset = await call(["asset", "import", "--file", image]);
  assert.notEqual(asset.url, duplicateAsset.url);
  assert.equal((await call(["asset", "list"])).files.length, 2);
  const transaction = {
    operations: [
      { op: "scene.link", id: "scene-001", value: "gate" },
      {
        op: "scene.add",
        id: "gate",
        value: {
          title: "岔路",
          lines: [{ id: "gate-line", text: "向哪里走？" }],
        },
      },
      {
        op: "scene.add",
        id: "end",
        value: {
          title: "终章",
          lines: [{ id: "end-line", text: "抵达" }],
          presentation: "ending",
        },
      },
      {
        op: "choice.add",
        scene: "gate",
        id: "go",
        value: {
          label: "前进",
          target: "end",
          effects: [{ type: "set", key: "arrived", value: true }],
        },
      },
      {
        op: "entity.add",
        collection: "characters",
        id: "hero",
        value: { name: "主角", portrait: asset.url },
      },
      {
        op: "entity.add",
        collection: "backdrops",
        id: "bg",
        value: { src: asset.url },
      },
      {
        op: "entity.add",
        collection: "materials",
        id: "note",
        value: { title: "笔记", body: "内容", category: "note" },
      },
      {
        op: "line.update",
        scene: "gate",
        id: "gate-line",
        value: {
          characterLayers: [
            { characterId: "hero", expression: "", x: 25, scale: 1.2 },
          ],
        },
      },
      { op: "scene.update", id: "gate", value: { background: "bg" } },
      {
        op: "media.set",
        kind: "opening",
        value: { duration: 2, pages: [{ at: 0, text: "OP" }], images: ["bg"] },
      },
      {
        op: "media.set",
        kind: "ending",
        value: {
          duration: 2,
          lines: [{ at: 0, en: "End", zh: "终" }],
          credits: ["CLI"],
        },
      },
      { op: "media.set", kind: "dedication", value: { pages: [["献词"]] } },
    ],
  };
  const txnFile = path.join(temporary, "批量 剧本.json");
  fs.writeFileSync(txnFile, JSON.stringify(transaction));
  const dry = await call(["edit", "--file", txnFile, "--dry-run"]);
  assert.equal(dry.changed, true);
  assert.deepEqual(fs.readFileSync(projectFile), original);
  assert.equal(fs.existsSync(path.join(directory, "backups")), false);
  const saved = await call(
    ["edit", "--data", "-"],
    JSON.stringify(transaction),
  );
  assert.equal(fs.readdirSync(path.join(directory, "backups")).length, 1);
  assert.ok(saved.backup);
  assert.notEqual(saved.revision, fresh.revision);
  assert.equal(
    (await call(["project", "show"])).project.media.ending.lines[0].zh,
    "终",
  );
  await call(["project", "update", "--data", '{"title":"新名字"}']);
  await call(["scene", "show", "--id", "gate"]);
  await call(["scene", "move", "--id", "end", "--before", "gate"]);
  await call(["scene", "move", "--id", "end", "--after", "gate"]);
  await call(["scene", "list"]);
  await call(["choice", "show", "--scene", "gate", "--id", "go"]);
  await call([
    "choice",
    "update",
    "--scene",
    "gate",
    "--id",
    "go",
    "--data",
    '{"once":true}',
  ]);
  await call([
    "choice",
    "move",
    "--scene",
    "gate",
    "--id",
    "go",
    "--index",
    "0",
  ]);
  await call(["choice", "list", "--scene", "gate"]);
  await call(["entity", "show", "--collection", "characters", "--id", "hero"]);
  await call([
    "entity",
    "update",
    "--collection",
    "characters",
    "--id",
    "hero",
    "--data",
    '{"name":"旅行者"}',
  ]);
  await call(["entity", "list", "--collection", "materials"]);
  await call([
    "condition",
    "set",
    "--target",
    "choice",
    "--scene",
    "gate",
    "--id",
    "go",
    "--data",
    '{"type":"flag","key":"permit"}',
  ]);
  await call([
    "condition",
    "unset",
    "--target",
    "choice",
    "--scene",
    "gate",
    "--id",
    "go",
  ]);
  await call([
    "effect",
    "add",
    "--phase",
    "enter",
    "--scene",
    "gate",
    "--data",
    '{"type":"set","key":"permit","value":true}',
  ]);
  await call([
    "effect",
    "update",
    "--phase",
    "enter",
    "--scene",
    "gate",
    "--index",
    "0",
    "--data",
    '{"type":"toggle","key":"permit"}',
  ]);
  await call([
    "effect",
    "remove",
    "--phase",
    "enter",
    "--scene",
    "gate",
    "--index",
    "0",
  ]);
  await call([
    "effect",
    "clear",
    "--phase",
    "choice",
    "--scene",
    "gate",
    "--id",
    "go",
  ]);
  const prose = path.join(temporary, "正文 文件.txt");
  fs.writeFileSync(prose, "你好\n第二行");
  const line = await call([
    "line",
    "add",
    "--scene",
    "gate",
    "--text-file",
    prose,
  ]);
  const lineId = line.operations[0].id;
  await call([
    "line",
    "update",
    "--scene",
    "gate",
    "--id",
    lineId,
    "--data",
    '{"speaker":"旁白"}',
  ]);
  await call(["line", "show", "--scene", "gate", "--id", lineId]);
  await call([
    "line",
    "move",
    "--scene",
    "gate",
    "--id",
    lineId,
    "--before",
    "gate-line",
  ]);
  assert.equal(
    (await call(["line", "list", "--scene", "gate"])).items[0].id,
    lineId,
  );
  await call(["line", "remove", "--scene", "gate", "--id", lineId]);
  assert.deepEqual((await call(["graph"])).unreachable, []);
  assert.ok((await call(["refs", "--id", "hero"])).references.length);
  await call(["validate"]);
  const stable = fs.readFileSync(projectFile);
  await call(["scene", "remove", "--id", "end"], undefined, 1);
  await call(
    ["entity", "remove", "--collection", "characters", "--id", "hero"],
    undefined,
    1,
  );
  await call(
    ["scene", "update", "--id", "gate", "--data", '{"id":"changed"}'],
    undefined,
    1,
  );
  await call(
    [
      "edit",
      "--data",
      '{"operations":[{"op":"project.update","value":{"title":"not saved"}},{"op":"scene.link","id":"gate","value":"missing"}]}',
    ],
    undefined,
    1,
  );
  await call(
    [
      "edit",
      "--data",
      '{"operations":[{"op":"json.set","path":"/__proto__/bad","value":true}]}',
    ],
    undefined,
    1,
  );
  await call(
    [
      "project",
      "update",
      "--data",
      '{"title":"conflict"}',
      "--if-revision",
      fresh.revision,
    ],
    undefined,
    3,
  );
  await call(["build", "--if-revision", fresh.revision], undefined, 3);
  assert.deepEqual(fs.readFileSync(projectFile), stable);
  const lock = path.join(directory, ".magickisa-write.lock");
  fs.mkdirSync(lock);
  const token = crypto.randomUUID();
  fs.writeFileSync(
    path.join(lock, "owner.json"),
    JSON.stringify({ pid: process.pid, token }),
  );
  try {
    await call(
      ["project", "update", "--data", '{"title":"busy"}'],
      undefined,
      4,
    );
    await call(
      ["doctor", "--recover", "--lock", lock, "--token", token],
      undefined,
      4,
    );
    assert.ok((await call(["doctor"])).locks.some((l) => l.alive));
    const dead = await new Promise((resolve) => {
      const child = spawn(process.execPath, ["-e", ""], { windowsHide: true });
      const pid = child.pid;
      child.on("close", () => resolve(pid));
    });
    fs.writeFileSync(
      path.join(lock, "owner.json"),
      JSON.stringify({ pid: dead, token }),
    );
    await call(["doctor", "--recover", "--lock", lock, "--token", token]);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
  const globalLock = path.join(root, ".magickisa-build.lock");
  assert.equal(fs.existsSync(globalLock), false);
  fs.mkdirSync(globalLock);
  try {
    fs.writeFileSync(
      path.join(globalLock, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "cli-build-test" }),
    );
    await call(
      [
        "line",
        "update",
        "--scene",
        "gate",
        "--id",
        "gate-line",
        "--data",
        '{"text":"blocked"}',
      ],
      undefined,
      4,
    );
    await call(["build"], undefined, 4);
    await call(
      [
        "doctor",
        "--recover",
        "--lock",
        globalLock,
        "--token",
        "cli-build-test",
      ],
      undefined,
      4,
    );
  } finally {
    fs.rmSync(globalLock, { recursive: true });
  }
  await call(
    [
      "script",
      "export",
      "--out",
      path.join(temporary, "missing-directory", "project.json"),
    ],
    undefined,
    5,
  );
  const studioArgs = [entry, "studio", ...w, "--no-open", "--json"];
  // Windows kill() terminates immediately. IPC emits the same Node signal event
  // as console Ctrl+C so we can verify graceful shutdown and the final envelope.
  const studio = spawn(
    process.execPath,
    process.platform === "win32"
      ? [
          "-e",
          'process.once("message", () => { process.disconnect(); process.emit("SIGTERM"); }); import(require("node:url").pathToFileURL(process.argv[1]).href);',
          ...studioArgs,
        ]
      : studioArgs,
    {
      cwd: temporary,
      windowsHide: true,
      stdio:
        process.platform === "win32" ? ["pipe", "pipe", "pipe", "ipc"] : "pipe",
    },
  );
  let studioLog = "",
    studioOutput = "";
  studio.stdout.on("data", (chunk) => (studioOutput += chunk));
  const studioClosed = new Promise((resolve) => studio.once("close", resolve));
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Studio startup timed out: " + studioLog)),
        30000,
      );
      studio.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      studio.stderr.on("data", (chunk) => {
        studioLog += chunk;
        const match = studioLog.match(/Studio: (http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      studio.once("close", () => {
        clearTimeout(timer);
        reject(new Error(studioLog));
      });
    });
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes("engine"));
  } finally {
    if (process.platform === "win32" && studio.connected) studio.send("stop");
    else studio.kill("SIGTERM");
    let shutdownTimer;
    try {
      await Promise.race([
        studioClosed,
        new Promise((_, reject) => {
          shutdownTimer = setTimeout(() => {
            studio.kill("SIGKILL");
            reject(
              new Error(
                `Studio shutdown timed out. stdout=${studioOutput}\nstderr=${studioLog}`,
              ),
            );
          }, 15000);
        }),
      ]);
    } finally {
      clearTimeout(shutdownTimer);
    }
  }
  const stopped = JSON.parse(studioOutput);
  assert.equal(stopped.ok, true);
  assert.equal(stopped.data.stopped, true);
  const markdown = path.join(temporary, "剧本.md");
  await call(["script", "export-markdown", "--out", markdown]);
  fs.writeFileSync(
    markdown,
    fs.readFileSync(markdown, "utf8").replace("向哪里走？", "向星空出发"),
  );
  await call(["script", "import-markdown", "--file", markdown]);
  const exported = path.join(temporary, "工程.json");
  await call(["script", "export", "--out", exported]);
  await call(["script", "import", "--file", exported, "--dry-run"]);
  await call(["media", "show", "--kind", "opening"]);
  await call(["media", "unset", "--kind", "dedication"]);
  await call([
    "media",
    "set",
    "--kind",
    "dedication",
    "--data",
    '{"pages":[["献词"]]}',
  ]);
  // Keep the published Agent example executable on a fresh workspace.
  const documented = await cli([
    "project",
    "create",
    "--name",
    "Documentation test",
  ]);
  created.add(documented.workspaceId);
  const guide = fs.readFileSync(path.join(root, "docs/CLI.md"), "utf8");
  const example = guide.match(/```json\s*([\s\S]*?)```/)[1];
  await cli(
    ["edit", "--workspace", documented.workspaceId, "--data", "-", "--dry-run"],
    example,
  );
  await cli(
    ["edit", "--workspace", documented.workspaceId, "--data", "-"],
    example,
  );
  const zip = path.join(temporary, "工程 包.magickisa.zip");
  await call(["package", "export", "--out", zip]);
  assert.ok(fs.existsSync(zip + ".sha256"));
  const imported = await call([
    "package",
    "import",
    "--file",
    zip,
    "--name",
    "CLI 导入",
  ]);
  created.add(imported.id);
  const importedProject = await cli([
    "project",
    "show",
    "--workspace",
    imported.id,
  ]);
  assert.deepEqual(
    importedProject.project,
    (await call(["project", "show"])).project,
  );
  assert.equal(
    fs.readFileSync(
      path.join(
        root,
        "workspace-projects",
        imported.id,
        "public",
        asset.url.slice(1),
      ),
      "utf8",
    ),
    fs.readFileSync(image, "utf8"),
  );
  await cli([
    "build",
    "--workspace",
    imported.id,
    "--base",
    "/games/cli-fixture/",
  ]);
  assert.ok(
    fs.existsSync(
      path.join(root, "workspace-projects", imported.id, "dist/index.html"),
    ),
  );
  assert.match(
    fs.readFileSync(
      path.join(root, "workspace-projects", imported.id, "dist/index.html"),
      "utf8",
    ),
    /\/games\/cli-fixture\/assets\//,
  );
  console.log(
    "PASS CLI: all command groups, transactions, stable IDs, forward refs, dry-run, failure rollback, revisions, locks/recovery, Unicode files/stdin, package roundtrip and build",
  );
} finally {
  const base = path.resolve(root, "workspace-projects");
  for (const id of created) {
    const target = path.resolve(base, id);
    if (path.dirname(target) !== base || !/^[0-9a-f-]{36}$/.test(id)) {
      console.error("Invalid fixture cleanup: skipped", id);
      process.exitCode = 1;
      continue;
    }
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (error) {
      console.error("Fixture cleanup failed", error);
      process.exitCode = 1;
    }
  }
  if (path.dirname(temporary) !== path.resolve(os.tmpdir())) {
    console.error("Invalid temp cleanup: skipped");
    process.exitCode = 1;
  } else
    try {
      fs.rmSync(temporary, { recursive: true, force: true });
    } catch (error) {
      console.error("Temporary cleanup failed", error);
      process.exitCode = 1;
    }
}
