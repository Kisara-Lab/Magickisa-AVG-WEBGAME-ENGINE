import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { contained, type ProjectContext } from "./workspaces";
import { acquireProjectWrite } from "./project-locks";
import { assertRevision, readSnapshot, saveProject } from "./project-service";
import { readStudioData } from "./studio-data";
import {
  emptyStudioData,
  studioDataSchema,
} from "../src/studio/investigationModel";
import { readJson, stateRevision } from "./authoring/storage";
import { stateSchema } from "./authoring/model";
import { assertProject } from "../src/engine/schema";
import { changeRecord } from "../src/authoring/history";
import {
  creativeSnapshot,
  validateCreativeFiles,
} from "./authoring/creative-backup";
const creativeRevision = (ctx: ProjectContext) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(creativeSnapshot(ctx)))
    .digest("hex");

function directory(ctx: ProjectContext, id: string) {
  if (!/^[\w-]+$/.test(id)) throw new Error("无效备份 ID");
  return contained(ctx.backups, id);
}
function digest(dir: string) {
  const hash = crypto.createHash("sha256");
  for (const name of [
    "project.json",
    "studio.json",
    "authoring-state.json",
    "creative-files.json",
  ]) {
    const file = contained(dir, name);
    hash
      .update(name)
      .update(fs.existsSync(file) ? fs.readFileSync(file) : "absent");
  }
  return hash.digest("hex");
}
export function listBackups(ctx: ProjectContext) {
  if (!fs.existsSync(ctx.backups)) return [];
  return fs
    .readdirSync(ctx.backups)
    .flatMap((id) => {
      try {
        const dir = directory(ctx, id),
          file = contained(dir, "project.json");
        const stat = fs.statSync(file),
          project = JSON.parse(fs.readFileSync(file, "utf8"));
        return [
          {
            id,
            createdAt: stat.mtime.toISOString(),
            title: project.title,
            schemaVersion: project.schemaVersion,
            scenes: project.nodes?.length ?? 0,
            bytes: stat.size,
            studio: fs.existsSync(contained(dir, "studio.json")),
            sync: fs.existsSync(contained(dir, "authoring-state.json")),
            kind: "metadata",
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function previewBackup(ctx: ProjectContext, id: string) {
  const dir = directory(ctx, id);
  const project = assertProject(readJson(contained(dir, "project.json")));
  const current = readSnapshot(ctx);
  const delta = changeRecord(current.project, project);
  const creativePath = contained(dir, "creative-files.json"),
    live = creativeSnapshot(ctx);
  const archived = fs.existsSync(creativePath)
    ? validateCreativeFiles(readJson(creativePath, 64 * 1024 * 1024))
    : undefined;
  const creativeChanges = archived
    ? [...new Set([...Object.keys(live), ...Object.keys(archived)])]
        .filter((key) => (live[key] ?? null) !== (archived[key] ?? null))
        .map((key) => ({
          path: key,
          action: !archived[key] ? "删除" : !live[key] ? "新增" : "修改",
        }))
    : [];
  return {
    id,
    revision: current.revision,
    studioRevision: readStudioData(ctx).revision,
    creativeRevision: creativeRevision(ctx),
    syncRevision: stateRevision(ctx),
    creativeChanges,
    creativeFiles: fs.existsSync(contained(dir, "creative-files.json"))
      ? Object.keys(
          validateCreativeFiles(
            readJson(contained(dir, "creative-files.json"), 64 * 1024 * 1024),
          ),
        )
      : [],
    digest: digest(dir),
    changes: delta.forward.map((patch, i) => ({
      path: patch.path,
      after: patch,
      before: delta.backward[delta.backward.length - 1 - i],
    })),
    note: "恢复工程、布局/测试与同步基线；含创作文件快照的备份同时恢复清单、结构稿模块和操作说明。原始附件和素材不在恢复范围。",
  };
}
export function restoreBackup(
  ctx: ProjectContext,
  id: string,
  expected: string,
  studioRevision: string,
  expectedDigest: string,
  alreadyLocked = false,
  expectedCreative?: string,
  expectedSync?: string,
) {
  const release = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  try {
    assertRevision(ctx, expected);
    if (expectedSync !== stateRevision(ctx))
      throw Object.assign(new Error("同步基线已变化，请重新检查恢复差异"), {
        status: 409,
        code: "REVISION_CONFLICT",
        exitCode: 3,
      });
    const dir = directory(ctx, id);
    if (
      fs.existsSync(contained(dir, "creative-files.json")) &&
      expectedCreative !== creativeRevision(ctx)
    )
      throw Object.assign(
        new Error("创作文件已变化或恢复方案缺少版本，请重新检查差异"),
        { status: 409, code: "REVISION_CONFLICT", exitCode: 3 },
      );
    if (digest(dir) !== expectedDigest)
      throw Object.assign(new Error("备份内容已变化，请重新检查差异"), {
        status: 409,
        code: "REVISION_CONFLICT",
        exitCode: 3,
      });
    const project = assertProject(readJson(contained(dir, "project.json")));
    const studioFile = contained(dir, "studio.json"),
      syncFile = contained(dir, "authoring-state.json");
    const studio = fs.existsSync(studioFile)
      ? studioDataSchema.parse(readJson(studioFile))
      : emptyStudioData();
    const state = fs.existsSync(syncFile)
      ? stateSchema.parse(readJson(syncFile))
      : { formatVersion: 1 as const, entries: {} };
    // Existing coordinated commit backs up current values and restores all three on failure.
    const creativePath = contained(dir, "creative-files.json");
    const creative = fs.existsSync(creativePath)
      ? {
          ...Object.fromEntries(
            Object.keys(creativeSnapshot(ctx)).map((key) => [key, null]),
          ),
          ...validateCreativeFiles(readJson(creativePath, 64 * 1024 * 1024)),
        }
      : undefined;
    return saveProject(
      ctx,
      project,
      expected,
      true,
      state,
      {
        data: studio,
        revision: studioRevision,
      },
      creative,
    );
  } finally {
    release();
  }
}
