import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  entry = path.join(root, "scripts/magickisa.mjs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "MAGICKISA 接入 测试 ")),
  created = new Set();
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};
async function cli(args, expected = 0) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args, "--json"], {
      cwd: temp,
      windowsHide: true,
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error("CLI timed out: " + args.join(" ") + "\n" + stdout + stderr),
      );
    }, 180000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end();
  });
  assert.equal(
    result.code,
    expected,
    args.join(" ") + "\n" + result.stdout + result.stderr,
  );
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.protocolVersion, 1);
  assert.equal(envelope.ok, expected === 0);
  return expected === 0 ? envelope.data : envelope.error;
}
try {
  const workspace = await cli([
      "project",
      "create",
      "--name",
      "多文件 中文 工程",
    ]),
    id = workspace.workspaceId;
  created.add(id);
  const call = (args, code = 0) => cli([...args, "--workspace", id], code);
  const directory = path.join(root, "workspace-projects", id),
    authoring = path.join(directory, "authoring"),
    manifestFile = path.join(authoring, "manifest.json"),
    projectFile = path.join(directory, "project.json"),
    stateFile = path.join(authoring, ".sync-state.json");
  await call(["agent", "init"]);
  assert.ok(
    fs.readFileSync(path.join(authoring, "AGENTS.md"), "utf8").includes(id),
  );
  assert.equal((await call(["agent", "init"])).created.length, 0);
  const studioData = {
    formatVersion: 2,
    tests: [],
    positions: { "scene-001": { x: 20, y: 40 } },
    variables: {
      entered: {
        label: "调查进度说明",
        type: "boolean",
        description: "创作注释不会初始化变量",
      },
    },
    presets: [],
  };
  write(path.join(authoring, "studio.json"), studioData);
  for (const schema of [
    "manifest",
    "module",
    "plan",
    "resolutions",
    "studio",
    "preset",
  ])
    assert.ok((await cli(["schema", schema])).properties);
  const sourceFiles = new Map();
  for (const [name, body] of [
    ["剧本.txt", "星门开启。"],
    ["分支 逻辑.md", "选择进入，设置 entered。"],
    ["规则.json", '{"flag":"entered"}'],
  ]) {
    fs.writeFileSync(path.join(temp, name), body);
    const registered = await call([
      "source",
      "add",
      "--file",
      path.join(temp, name),
      "--id",
      "source-" + name.split(".")[0].replaceAll(" ", "-"),
    ]);
    sourceFiles.set(registered.id, path.join(temp, name));
  }
  // Exercise portable aliases/local-only bindings even on a single-drive host.
  if (!fs.existsSync(path.join(authoring, ".source-bindings.json"))) {
    const registered = json(manifestFile),
      source = registered.sources[0];
    source.path = "sources/local-alias.txt";
    write(path.join(authoring, ".source-bindings.json"), {
      [source.id]: { path: source.path, file: sourceFiles.get(source.id) },
    });
    write(manifestFile, registered);
  }
  const assetFile = path.join(temp, "背景.svg");
  fs.writeFileSync(assetFile, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const asset = await call(["asset", "import", "--file", assetFile]);
  const story = {
    formatVersion: 1,
    nodes: [
      {
        id: "scene-001",
        next: "gate",
        lines: [{ id: "line-001", text: "序章" }],
      },
      {
        id: "gate",
        title: "星门",
        background: "sky",
        lines: [
          {
            id: "gate-line",
            text: "是否前进？",
            characterLayers: [{ characterId: "hero", x: 10 }],
          },
        ],
        choices: [
          {
            id: "enter",
            label: "前进",
            target: "arrival",
            effects: [{ type: "set", key: "entered", value: true }],
          },
        ],
      },
    ],
  };
  const ending = {
    formatVersion: 1,
    nodes: [
      {
        id: "arrival",
        title: "抵达",
        lines: [{ id: "arrival-line", text: "欢迎。" }],
        condition: { type: "flag", key: "entered", equals: true },
        onComplete: [{ type: "appendNote", text: "抵达" }],
        presentation: "ending",
      },
    ],
    characters: [{ id: "hero", name: "主角", portrait: asset.url }],
    backdrops: [{ id: "sky", src: asset.url }],
    media: {
      opening: { images: [asset.url], pages: [{ at: 0, text: "OP" }] },
      ending: { image: asset.url, lines: [{ at: 0, en: "END", zh: "终" }] },
      dedication: { pages: [["献词"]] },
    },
  };
  write(path.join(authoring, "modules/story.json"), story);
  fs.writeFileSync(
    path.join(authoring, "modules/story.json"),
    "\uFEFF" +
      fs.readFileSync(path.join(authoring, "modules/story.json"), "utf8"),
  );
  write(path.join(authoring, "modules/end.json"), ending);
  const manifest = json(manifestFile);
  manifest.modules.push("modules/end.json");
  manifest.origins = [
    { target: "/nodes/@gate", sourceId: manifest.sources[0].id, line: 1 },
  ];
  write(manifestFile, manifest);
  let serial = 0;
  const plan = async (resolutions, code = 0) => {
    const output = path.join(temp, `方案 ${++serial}.json`),
      args = ["sync", "plan", "--file", manifestFile, "--out", output];
    if (resolutions) {
      const file = path.join(temp, "处理.json");
      write(file, { formatVersion: 1, resolutions });
      args.push("--resolutions", file);
    }
    await call(args, code);
    return { file: output, value: json(output) };
  };
  const untouched = fs.readFileSync(projectFile);
  const adopt = await plan(undefined, 1);
  assert.ok(adopt.value.conflicts.some((c) => c.reason === "adoption"));
  await call(["sync", "apply", "--file", adopt.file], 1);
  assert.deepEqual(fs.readFileSync(projectFile), untouched);
  let prepared = await plan([{ path: "/nodes/@scene-001", take: "incoming" }]);
  assert.ok(prepared.value.changes.some((c) => c.origin.sourceId));
  await call(["sync", "apply", "--file", prepared.file, "--dry-run"]);
  assert.equal(fs.existsSync(stateFile), false);
  const backupCount = () =>
    fs.existsSync(path.join(directory, "backups"))
      ? fs.readdirSync(path.join(directory, "backups")).length
      : 0;
  const firstBackups = backupCount();
  await call(["sync", "apply", "--file", prepared.file]);
  assert.equal(backupCount(), firstBackups + 1);
  prepared = await plan();
  assert.equal(prepared.value.changes.length, 0);
  const stableState = fs.readFileSync(stateFile);
  await call(["sync", "apply", "--file", prepared.file]);
  assert.deepEqual(fs.readFileSync(stateFile), stableState);
  assert.equal(backupCount(), firstBackups + 1);
  const context = await call([
    "agent",
    "context",
    "--scene",
    "gate",
    "--limit",
    "1",
  ]);
  assert.equal(context.nodes[0].id, "gate");
  assert.ok(context.variables.includes("entered"));
  await call(["agent", "context", "--limit", "201"], 2);
  await call([
    "line",
    "update",
    "--scene",
    "gate",
    "--id",
    "gate-line",
    "--data",
    '{"text":"Studio 人工修改"}',
  ]);
  prepared = await plan();
  assert.equal(prepared.value.conflicts.length, 0);
  await call(["sync", "apply", "--file", prepared.file]);
  assert.ok(
    (await call(["sync", "status"])).localChanges.some((c) =>
      c.path.endsWith("/text"),
    ),
  );
  story.nodes[1].lines[0].text = "原稿第二版";
  write(path.join(authoring, "modules/story.json"), story);
  prepared = await plan(undefined, 1);
  assert.ok(
    prepared.value.conflicts.some(
      (c) => c.path === "/nodes/@gate/lines/@gate-line/text",
    ),
  );
  prepared = await plan([
    { path: "/nodes/@gate/lines/@gate-line/text", take: "current" },
  ]);
  await call(["sync", "apply", "--file", prepared.file]);
  assert.equal(
    json(projectFile).nodes.find((n) => n.id === "gate").lines[0].text,
    "Studio 人工修改",
  );
  prepared = await plan();
  assert.equal(prepared.value.conflicts.length, 0);
  // Plans are immutable and bound to both authoritative revisions.
  const tampered = path.join(temp, "tampered.json");
  write(tampered, { ...prepared.value, digest: "changed" });
  await call(["sync", "apply", "--file", tampered], 3);
  const priorState = fs.readFileSync(stateFile);
  fs.appendFileSync(stateFile, " ");
  await call(["sync", "apply", "--file", prepared.file], 3);
  fs.writeFileSync(stateFile, priorState);
  const priorProject = fs.readFileSync(projectFile);
  fs.appendFileSync(projectFile, " ");
  await call(["sync", "apply", "--file", prepared.file], 3);
  fs.writeFileSync(projectFile, priorProject);
  const liveLock = path.join(directory, ".magickisa-write.lock");
  fs.mkdirSync(liveLock);
  write(path.join(liveLock, "owner.json"), {
    pid: process.pid,
    token: "authoring-live",
  });
  try {
    await call(["sync", "apply", "--file", prepared.file], 4);
  } finally {
    fs.rmSync(liveLock, { recursive: true });
  }
  story.nodes[1].lines[0].text = "原稿第三版";
  write(path.join(authoring, "modules/story.json"), story);
  prepared = await plan([
    { path: "/nodes/@gate/lines/@gate-line/text", take: "incoming" },
  ]);
  await call(["sync", "apply", "--file", prepared.file]);
  assert.equal(
    json(projectFile).nodes.find((n) => n.id === "gate").lines[0].text,
    "原稿第三版",
  );
  prepared = await plan();
  fs.appendFileSync(path.join(temp, "剧本.txt"), "改稿");
  await call(["sync", "apply", "--file", prepared.file], 3);
  assert.equal(
    (await call(["source", "status"])).sources.find((s) =>
      s.path.endsWith(".txt"),
    ).status,
    "changed",
  );
  const missing = path.join(temp, "分支 逻辑.md");
  fs.renameSync(missing, missing + ".saved");
  await plan(undefined, 1);
  fs.renameSync(missing + ".saved", missing);
  manifest.questions = ["缺少下一章的去向"];
  write(manifestFile, manifest);
  await plan(undefined, 1);
  manifest.questions = [];
  write(manifestFile, manifest);
  write(path.join(authoring, "modules/duplicate.json"), {
    formatVersion: 1,
    nodes: [{ id: "gate", title: "重复定义" }],
  });
  manifest.modules.push("modules/duplicate.json");
  write(manifestFile, manifest);
  await call(["sync", "plan", "--out", path.join(temp, "重复.json")], 1);
  manifest.modules.pop();
  write(manifestFile, manifest);
  // Explicit ordering and removal; omission alone never removes a scene.
  story.nodes.push({
    id: "unused",
    title: "可删除",
    lines: [{ id: "unused-line", text: "" }],
  });
  write(path.join(authoring, "modules/story.json"), story);
  prepared = await plan();
  await call(["sync", "apply", "--file", prepared.file]);
  story.nodes.pop();
  await call([
    "line",
    "add",
    "--scene",
    "unused",
    "--id",
    "manual-line",
    "--data",
    '{"text":"人工新增内容"}',
  ]);
  prepared = await plan();
  await call(["sync", "apply", "--file", prepared.file]);
  write(path.join(authoring, "modules/story.json"), story);
  prepared = await plan();
  assert.equal(prepared.value.operations.length, 0);
  manifest.operations = [
    { op: "scene.remove", id: "unused" },
    { op: "scene.move", id: "arrival", before: "gate" },
    { op: "scene.move", id: "scene-001", before: "arrival" },
  ];
  write(manifestFile, manifest);
  prepared = await plan(undefined, 1);
  assert.ok(
    prepared.value.conflicts.some((item) => item.path === "/nodes/@unused"),
  );
  prepared = await plan([{ path: "/nodes/@unused", take: "current" }]);
  const refused = await call(["sync", "apply", "--file", prepared.file]);
  assert.ok(refused.deferred.some((item) => item.path === "/nodes/@unused"));
  prepared = await plan();
  assert.ok(
    prepared.value.deferred.some((item) => item.path === "/nodes/@unused"),
  );
  assert.ok(
    (await call(["sync", "status"])).deferred.some(
      (item) => item.path === "/nodes/@unused",
    ),
  );
  prepared = await plan([{ path: "/nodes/@unused", take: "incoming" }]);
  await call(["sync", "apply", "--file", prepared.file]);
  assert.equal(
    json(projectFile).nodes.some((n) => n.id === "unused"),
    false,
  );
  prepared = await plan();
  await call(["sync", "apply", "--file", prepared.file]);
  manifest.operations = [{ op: "scene.remove", id: "arrival" }];
  manifest.modules = ["modules/story.json"];
  write(manifestFile, manifest);
  await plan(undefined, 1);
  manifest.modules.push("modules/end.json");
  manifest.operations = [];
  write(manifestFile, manifest);
  // Positional deletion of non-ID subtitles is atomic and does not repeat.
  delete ending.media.opening.pages;
  write(path.join(authoring, "modules/end.json"), ending);
  manifest.operations = [{ op: "json.remove", path: "/media/opening/pages/0" }];
  write(manifestFile, manifest);
  prepared = await plan();
  await call(["sync", "apply", "--file", prepared.file]);
  assert.deepEqual(json(projectFile).media.opening.pages, []);
  prepared = await plan();
  assert.equal(prepared.value.operations.length, 0);
  await call(["sync", "apply", "--file", prepared.file]);
  manifest.operations = [];
  write(manifestFile, manifest);
  // A generation failure rolls back authoritative bytes and retains a recoverable journal.
  const failureProject = fs.readFileSync(projectFile),
    failureState = fs.readFileSync(stateFile);
  story.nodes[1].title = "失败后恢复";
  write(path.join(authoring, "modules/story.json"), story);
  prepared = await plan();
  const generated = path.join(directory, "public/content"),
    parked = generated + ".saved";
  fs.renameSync(generated, parked);
  fs.writeFileSync(generated, "block generation");
  try {
    await call(["sync", "apply", "--file", prepared.file], 5);
    assert.deepEqual(fs.readFileSync(projectFile), failureProject);
    assert.deepEqual(fs.readFileSync(stateFile), failureState);
    assert.ok(
      fs.existsSync(path.join(directory, ".magickisa-sync-commit.json")),
    );
  } finally {
    fs.unlinkSync(generated);
    fs.renameSync(parked, generated);
  }
  await call(["sync", "recover"]);
  assert.equal(
    fs.existsSync(path.join(directory, ".magickisa-sync-commit.json")),
    false,
  );
  prepared = await plan();
  await call(["sync", "apply", "--file", prepared.file]);
  // Simulate interruption after project write, before state write.
  const before = fs.readFileSync(projectFile),
    oldState = fs.readFileSync(stateFile),
    after = Buffer.from(
      JSON.stringify({ ...json(projectFile), title: "未完成提交" }, null, 2) +
        "\n",
    );
  write(path.join(directory, ".magickisa-sync-commit.json"), {
    version: 1,
    projectBefore: before.toString("base64"),
    projectAfter: after.toString("base64"),
    stateBefore: oldState.toString("base64"),
    stateAfter: oldState.toString("base64"),
  });
  fs.writeFileSync(projectFile, after);
  await call(["project", "show"], 3);
  await call(["sync", "recover"]);
  assert.deepEqual(fs.readFileSync(projectFile), before);
  assert.deepEqual(fs.readFileSync(stateFile), oldState);
  const zip = path.join(temp, "创作资料.magickisa.zip");
  for (const name of ["AGENTS.md", "README.md"])
    fs.appendFileSync(
      path.join(authoring, name),
      "\n项目自定义约定：保留中文、空格与稳定 ID。\n",
    );
  await call(["package", "export", "--out", zip]);
  assert.deepEqual(
    json(path.join(authoring, "studio.json")),
    studioData,
    "Agent sync must preserve independent Studio authoring",
  );
  const imported = await call(["package", "import", "--file", zip]);
  created.add(imported.id);
  const importedHome = path.join(
    root,
    "workspace-projects",
    imported.id,
    "authoring",
  );
  assert.equal(
    fs.existsSync(path.join(importedHome, ".source-bindings.json")),
    false,
  );
  assert.ok(fs.existsSync(path.join(importedHome, ".sync-state.json")));
  for (const name of ["AGENTS.md", "README.md"])
    assert.deepEqual(
      fs.readFileSync(path.join(importedHome, name)),
      fs.readFileSync(path.join(authoring, name)),
    );
  assert.deepEqual(
    json(path.join(importedHome, "studio.json")),
    studioData,
    "Studio authoring must survive actual ZIP roundtrip",
  );
  assert.ok(
    json(path.join(importedHome, "manifest.json")).sources.every(
      (s) =>
        s.path.startsWith("sources/") &&
        !fs.existsSync(path.join(importedHome, s.path)),
    ),
  );
  const importedCall = (args, code = 0) =>
    cli([...args, "--workspace", imported.id], code);
  assert.ok(
    (await importedCall(["source", "status"])).sources.every(
      (s) => s.status === "missing",
    ),
  );
  for (let i = 0; i < manifest.sources.length; i++)
    await importedCall([
      "source",
      "add",
      "--id",
      manifest.sources[i].id,
      "--file",
      sourceFiles.get(manifest.sources[i].id),
    ]);
  const importedPlan = path.join(temp, "迁移后方案.json");
  await importedCall(["sync", "plan", "--out", importedPlan]);
  await importedCall(["sync", "apply", "--file", importedPlan]);
  assert.deepEqual(json(path.join(importedHome, "studio.json")), studioData);
  await importedCall(["build"]);
  assert.ok(
    fs.existsSync(
      path.join(root, "workspace-projects", imported.id, "dist/index.html"),
    ),
  );
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "workspace-projects",
        imported.id,
        "dist/content/authoring",
      ),
    ),
    false,
  );
  const inclusive = path.join(temp, "包含原稿.magickisa.zip");
  await call(["package", "export", "--out", inclusive, "--include-sources"]);
  const inclusiveProject = await call([
    "package",
    "import",
    "--file",
    inclusive,
  ]);
  created.add(inclusiveProject.id);
  assert.ok(
    (
      await cli(["source", "status", "--workspace", inclusiveProject.id])
    ).sources.every((s) => s.status === "registered"),
  );
  console.log(
    "PASS authoring: multi-file Agent intake, adoption, three-way merge, stable IDs, explicit deletions/order, no-op/dry-run, source/revision guards, recovery, portable packages and build",
  );
} finally {
  const base = path.resolve(root, "workspace-projects");
  for (const id of created) {
    const target = path.resolve(base, id);
    if (path.dirname(target) !== base || !/^[a-f0-9-]{36}$/.test(id)) {
      console.error("Unsafe fixture cleanup skipped");
      process.exitCode = 1;
      continue;
    }
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
  if (path.dirname(temp) === path.resolve(os.tmpdir())) {
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
}
