import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { initializeProject } from "../scripts/blank-project";
import type { ProjectContext } from "../scripts/workspaces";
import { readSnapshot, saveProject } from "../scripts/project-service";
import { listBackups, previewBackup, restoreBackup } from "../scripts/backups";
import { importAssetStream } from "../scripts/asset-stream";
import { readStudioData, saveStudioData } from "../scripts/studio-data";
import {
  beginCommit,
  readState,
  journalFile,
} from "../scripts/authoring/storage";
import {
  creativeSnapshot,
  writeCreativeFiles,
} from "../scripts/authoring/creative-backup";
import { acquireProjectWrite } from "../scripts/project-locks";
import {
  planVariableRename,
  applyVariableRename,
} from "../scripts/variable-maintenance";
import {
  inspectAsset,
  changeAsset,
  restoreAsset,
  planAssetRestore,
  assetBackups,
} from "../scripts/asset-maintenance";

test("variable rename coordinates project and authoring with one backup and rejects stale plans", () => {
  const ctx = fixture();
  try {
    const snapshot = readSnapshot(ctx),
      p = snapshot.project;
    p.variables = { clue: { type: "boolean", initial: false } };
    p.nodes[0].lines[0].text = "clue 原文 {{clue}}";
    p.nodes[0].onEnter = [{ type: "set", key: "clue", value: true }];
    saveProject(ctx, p, snapshot.revision);
    const studio = readStudioData(ctx);
    studio.data.variables.clue = {
      label: "线索",
      type: "boolean",
      description: "clue 原文不替换",
    };
    studio.data.tests = [
      {
        id: "test",
        name: "检查",
        initial: {
          variables: { clue: false },
          visited: [],
          unlocked: [],
          read: [],
          usedChoices: [],
        },
        steps: [
          {
            action: "assert",
            variables: { clue: true },
            condition: { type: "flag", key: "clue" },
          },
        ],
      },
    ];
    saveStudioData(ctx, studio.data, studio.revision);
    const plan = planVariableRename(ctx, "clue", "evidence");
    const backups = listBackups(ctx).length;
    applyVariableRename(ctx, plan);
    assert.equal(listBackups(ctx).length, backups + 1);
    const after = readSnapshot(ctx).project;
    assert.equal(after.nodes[0].lines[0].text, "clue 原文 {{evidence}}");
    assert.equal(after.variables?.clue, undefined);
    assert.equal(after.variables?.evidence.initial, false);
    assert.equal(
      readStudioData(ctx).data.variables.evidence.description,
      "clue 原文不替换",
    );
    assert.deepEqual(readStudioData(ctx).data.tests[0].steps[0], {
      action: "assert",
      variables: { evidence: true },
      condition: { type: "flag", key: "evidence" },
    });
    assert.throws(
      () => applyVariableRename(ctx, plan),
      (e: any) => e.status === 409,
    );
    const before = fs.readFileSync(ctx.projectFile);
    assert.throws(() => planVariableRename(ctx, "evidence", "constructor"));
    assert.deepEqual(fs.readFileSync(ctx.projectFile), before);
  } finally {
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("asset replacement and removal check references and bytes, and restore backed-up content", async () => {
  const ctx = fixture();
  try {
    const original = await importAssetStream(
      ctx,
      "图片.svg",
      Readable.from([Buffer.from("<svg>original</svg>")]),
    );
    const review = inspectAsset(ctx, original.url);
    const replacement = await changeAsset(ctx, review, {
      name: "新版.svg",
      stream: Readable.from([Buffer.from("<svg>replacement</svg>")]),
    });
    assert.equal(assetBackups(ctx).length, 1);
    await assert.rejects(
      () => changeAsset(ctx, review),
      (e: any) => e.status === 409,
    );
    const plan = planAssetRestore(ctx, replacement.backupId);
    await assert.rejects(
      () =>
        restoreAsset(
          ctx,
          plan.id,
          plan.revision,
          plan.sha256,
          false,
          "0".repeat(64),
        ),
      (e: any) => e.status === 409,
    );
    assert.equal(inspectAsset(ctx, original.url).sha256, replacement.sha256);
    await restoreAsset(
      ctx,
      plan.id,
      plan.revision,
      plan.sha256,
      false,
      plan.backupSha256,
    );
    assert.equal(inspectAsset(ctx, original.url).sha256, original.sha256);
    const snapshot = readSnapshot(ctx);
    saveProject(
      ctx,
      { ...snapshot.project, backdrops: [{ id: "used", src: original.url }] },
      snapshot.revision,
    );
    const referenced = inspectAsset(ctx, original.url);
    assert(referenced.references.length > 0);
    await assert.rejects(
      () => changeAsset(ctx, referenced),
      (e: any) => e.code === "REFERENCED",
    );
    const updated = readSnapshot(ctx);
    saveProject(ctx, { ...updated.project, backdrops: [] }, updated.revision);
    const removed = await changeAsset(ctx, inspectAsset(ctx, original.url));
    assert(!fs.existsSync(path.join(ctx.public, original.url)));
    const restore = planAssetRestore(ctx, removed.backupId);
    assert.equal(restore.sha256, null);
    await restoreAsset(ctx, restore.id, restore.revision, restore.sha256);
    assert.equal(inspectAsset(ctx, original.url).sha256, original.sha256);
    const cancel = new AbortController();
    cancel.abort();
    await assert.rejects(() =>
      changeAsset(ctx, inspectAsset(ctx, original.url), {
        name: "取消.svg",
        stream: Readable.from([Buffer.from("cancelled")]),
        signal: cancel.signal,
      }),
    );
    assert.equal(inspectAsset(ctx, original.url).sha256, original.sha256);
  } finally {
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("asset cleanup failure always releases the project lock", async (t) => {
  const ctx = fixture();
  const remove = fs.rmSync.bind(fs);
  try {
    const asset = await importAssetStream(
      ctx,
      "cleanup.svg",
      Readable.from([Buffer.from("<svg/>")]),
    );
    const plan = inspectAsset(ctx, asset.url);
    t.mock.method(fs, "rmSync", (...args: Parameters<typeof fs.rmSync>) => {
      if (String(args[0]).includes(".asset-upload-"))
        throw new Error("injected cleanup failure");
      return remove(...args);
    });
    await assert.rejects(
      () =>
        changeAsset(ctx, plan, {
          name: "replacement.svg",
          stream: Readable.from([Buffer.from("<svg>new</svg>")]),
        }),
      /injected cleanup failure/,
    );
    const release = acquireProjectWrite(ctx);
    release();
  } finally {
    t.mock.restoreAll();
    remove(ctx.directory, { recursive: true, force: true });
  }
});

test("external modification during backup aborts asset replacement without overwriting external bytes", async (t) => {
  const ctx = fixture();
  try {
    const asset = await importAssetStream(
      ctx,
      "external.svg",
      Readable.from([Buffer.from("<svg/>")]),
    );
    const plan = inspectAsset(ctx, asset.url);
    const copy = fs.promises.copyFile.bind(fs.promises);
    t.mock.method(
      fs.promises,
      "copyFile",
      async (...args: Parameters<typeof fs.promises.copyFile>) => {
        await copy(...args);
        fs.writeFileSync(path.join(ctx.public, asset.url), "external edit");
      },
    );
    await assert.rejects(
      () =>
        changeAsset(ctx, plan, {
          name: "replacement.svg",
          stream: Readable.from([Buffer.from("replacement")]),
        }),
      (error: any) => error.status === 409,
    );
    assert.equal(
      fs.readFileSync(path.join(ctx.public, asset.url), "utf8"),
      "external edit",
    );
    assert.equal(assetBackups(ctx).length, 0);
    const release = acquireProjectWrite(ctx);
    release();
  } finally {
    t.mock.restoreAll();
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("creative module restoration detects changed input and recovers interrupted multi-file commits", () => {
  const ctx = fixture();
  try {
    const root = path.join(ctx.directory, "authoring"),
      module = path.join(root, "modules/chapter.json");
    fs.mkdirSync(path.dirname(module), { recursive: true });
    fs.writeFileSync(
      path.join(root, "manifest.json"),
      JSON.stringify({ formatVersion: 1, modules: ["modules/chapter.json"] }),
    );
    fs.writeFileSync(module, '{"draft":"before"}');
    const before = readSnapshot(ctx);
    saveProject(ctx, { ...before.project, title: "改变工程" }, before.revision);
    const backup = listBackups(ctx)[0];
    fs.writeFileSync(module, '{"draft":"after"}');
    const plan = previewBackup(ctx, backup.id);
    assert(plan.creativeChanges.some((c) => c.path === "modules/chapter.json"));
    fs.writeFileSync(module, '{"draft":"external"}');
    assert.throws(
      () =>
        restoreBackup(
          ctx,
          plan.id,
          plan.revision,
          plan.studioRevision,
          plan.digest,
          false,
          plan.creativeRevision,
          plan.syncRevision,
        ),
      (e: any) => e.status === 409,
    );
    fs.writeFileSync(module, '{"draft":"after"}');
    restoreBackup(
      ctx,
      plan.id,
      plan.revision,
      plan.studioRevision,
      plan.digest,
      false,
      plan.creativeRevision,
      plan.syncRevision,
    );
    assert.equal(fs.readFileSync(module, "utf8"), '{"draft":"before"}');
    const creative = creativeSnapshot(ctx);
    creative["modules/chapter.json"] = Buffer.from(
      '{"draft":"interrupted"}',
    ).toString("base64");
    const snapshot = readSnapshot(ctx);
    beginCommit(ctx, snapshot.project, readState(ctx), undefined, creative);
    writeCreativeFiles(ctx, creative);
    assert(fs.existsSync(journalFile(ctx)));
    const release = acquireProjectWrite(ctx);
    release();
    assert.equal(fs.readFileSync(module, "utf8"), '{"draft":"before"}');
    assert(!fs.existsSync(journalFile(ctx)));
  } finally {
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "magickisa 创作 "));
  initializeProject(directory, "modern", "创作");
  const ctx: ProjectContext = {
    id: crypto.randomUUID(),
    profile: "modern",
    name: "创作",
    directory,
    content: path.join(directory, "content"),
    public: path.join(directory, "public"),
    projectFile: path.join(directory, "project.json"),
    backups: path.join(directory, "backups"),
    output: path.join(directory, "dist"),
  };
  return ctx;
}

test("backup review rejects stale project, altered backup and stale authoring without partial writes", () => {
  const ctx = fixture();
  try {
    const initial = readSnapshot(ctx);
    saveProject(
      ctx,
      { ...initial.project, title: "第一次修改" },
      initial.revision,
    );
    const backup = listBackups(ctx)[0];
    assert(backup);
    const plan = previewBackup(ctx, backup.id);
    const state = readStudioData(ctx);
    saveStudioData(
      ctx,
      { ...state.data, positions: { orphan: { x: 1, y: 2 } } },
      state.revision,
    );
    assert.throws(
      () =>
        restoreBackup(
          ctx,
          plan.id,
          plan.revision,
          plan.studioRevision,
          plan.digest,
          false,
          plan.creativeRevision,
          plan.syncRevision,
        ),
      (e: any) => e.status === 409,
    );
    assert.equal(readSnapshot(ctx).project.title, "第一次修改");
    const fresh = previewBackup(ctx, backup.id);
    const file = path.join(ctx.backups, backup.id, "project.json"),
      bytes = fs.readFileSync(file);
    fs.appendFileSync(file, " ");
    assert.throws(
      () =>
        restoreBackup(
          ctx,
          fresh.id,
          fresh.revision,
          fresh.studioRevision,
          fresh.digest,
          false,
          fresh.creativeRevision,
          fresh.syncRevision,
        ),
      (e: any) => e.status === 409,
    );
    fs.writeFileSync(file, bytes);
    const count = listBackups(ctx).length;
    restoreBackup(
      ctx,
      fresh.id,
      fresh.revision,
      fresh.studioRevision,
      fresh.digest,
      false,
      fresh.creativeRevision,
      fresh.syncRevision,
    );
    assert.equal(readSnapshot(ctx).project.title, initial.project.title);
    assert.equal(listBackups(ctx).length, count + 1);
    assert.throws(
      () =>
        restoreBackup(
          ctx,
          fresh.id,
          fresh.revision,
          fresh.studioRevision,
          fresh.digest,
          false,
          fresh.creativeRevision,
          fresh.syncRevision,
        ),
      (e: any) => e.status === 409,
    );
  } finally {
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  }
});

test("stream uploads preserve bytes, unique names and clean cancellation/failure staging", async () => {
  const ctx = fixture();
  try {
    const bytes = Buffer.alloc(9 * 1024 * 1024, 37);
    const first = await importAssetStream(
      ctx,
      "中文 配音.wav",
      Readable.from([bytes]),
    );
    const second = await importAssetStream(
      ctx,
      "中文 配音.wav",
      Readable.from([bytes]),
    );
    assert.notEqual(first.url, second.url);
    assert.equal(
      first.sha256,
      crypto.createHash("sha256").update(bytes).digest("hex"),
    );
    assert.deepEqual(fs.readFileSync(path.join(ctx.public, first.url)), bytes);
    await assert.rejects(
      () => importAssetStream(ctx, "空.wav", Readable.from([])),
      /为空/,
    );
    const cancel = new AbortController();
    cancel.abort();
    await assert.rejects(() =>
      importAssetStream(
        ctx,
        "取消.wav",
        Readable.from([bytes]),
        false,
        cancel.signal,
      ),
    );
    await assert.rejects(
      () =>
        importAssetStream(
          ctx,
          "失败.wav",
          Readable.from(
            (async function* () {
              yield Buffer.from("partial");
              throw new Error("source failed");
            })(),
          ),
        ),
      /source failed/,
    );
    assert.equal(
      fs.readdirSync(path.join(ctx.public, "assets/imported")).length,
      2,
    );
    assert(
      !fs
        .readdirSync(ctx.directory)
        .some((n) => n.startsWith(".asset-upload-")),
    );
  } finally {
    fs.rmSync(ctx.directory, { recursive: true, force: true });
  }
});
