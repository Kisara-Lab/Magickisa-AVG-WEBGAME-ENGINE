import fs from "node:fs";
import { creativeSnapshot } from "./authoring/creative-backup";
import path from "node:path";
import crypto from "node:crypto";
import { contained, atomicJson, type ProjectContext } from "./workspaces";
import {
  studioDataSchema,
  emptyStudioData,
} from "../src/studio/investigationModel";
import { acquireProjectWrite } from "./project-locks";
import { assertNoPendingCommit } from "./authoring/storage";
import { safeData } from "./cli/operations";
export const studioDataFile = (ctx: ProjectContext) =>
  contained(ctx.directory, "authoring/studio.json");
export const studioDataRevision = (ctx: ProjectContext) =>
  crypto
    .createHash("sha256")
    .update(
      fs.existsSync(studioDataFile(ctx))
        ? fs.readFileSync(studioDataFile(ctx))
        : "",
    )
    .digest("hex");
export function readStudioData(ctx: ProjectContext) {
  assertNoPendingCommit(ctx);
  const file = studioDataFile(ctx);
  if (!fs.existsSync(file))
    return {
      data: emptyStudioData(),
      revision: crypto.createHash("sha256").update("").digest("hex"),
    };
  if (fs.statSync(file).size > 32 * 1024 * 1024)
    throw new Error("创作资料超过 32 MiB");
  const bytes = fs.readFileSync(file),
    raw = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  safeData(raw);
  return {
    data: studioDataSchema.parse(raw),
    revision: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}
export function saveStudioData(
  ctx: ProjectContext,
  input: unknown,
  expected: string,
  alreadyLocked = false,
) {
  const release = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  try {
    safeData(input);
    const current = readStudioData(ctx),
      data = studioDataSchema.parse(input);
    if (Buffer.byteLength(JSON.stringify(data)) > 32 * 1024 * 1024)
      throw new Error("创作资料超过 32 MiB");
    if (current.revision !== expected)
      throw Object.assign(
        new Error(
          "创作资料已被其他标签页或进程修改，请先导出本地修改并重新读取。",
        ),
        { status: 409 },
      );
    if (JSON.stringify(current.data) === JSON.stringify(data)) return current;
    if (new Set(data.presets.map((p) => p.id)).size !== data.presets.length)
      throw new Error("测试预设 ID 重复");
    {
      const backup = contained(
        ctx.backups,
        "studio-data-" + Date.now() + "-" + crypto.randomUUID(),
      );
      fs.mkdirSync(backup, { recursive: true });
      atomicJson(
        path.join(backup, "creative-files.json"),
        creativeSnapshot(ctx),
      );
      if (fs.existsSync(studioDataFile(ctx)))
        fs.copyFileSync(studioDataFile(ctx), path.join(backup, "studio.json"));
      atomicJson(path.join(backup, "authoring-files.json"), {
        studioExisted: fs.existsSync(studioDataFile(ctx)),
      });
      fs.copyFileSync(ctx.projectFile, path.join(backup, "project.json"));
      const sync = contained(ctx.directory, "authoring/.sync-state.json");
      if (fs.existsSync(sync))
        fs.copyFileSync(sync, path.join(backup, "authoring-state.json"));
    }
    fs.mkdirSync(path.dirname(studioDataFile(ctx)), { recursive: true });
    atomicJson(studioDataFile(ctx), data);
    return { data, revision: studioDataRevision(ctx) };
  } finally {
    release();
  }
}
