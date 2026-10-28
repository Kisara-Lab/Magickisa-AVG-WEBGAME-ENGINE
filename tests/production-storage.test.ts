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
