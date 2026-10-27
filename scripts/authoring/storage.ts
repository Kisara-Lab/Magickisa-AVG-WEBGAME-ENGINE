import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { atomicJson, contained, type ProjectContext } from "../workspaces";
import { safeData } from "../cli/operations";
import { stateSchema, type SyncState } from "./model";
import { projectSchema } from "../../src/engine/schema";
import { buildContent } from "../content";
export const hash = (bytes: string | Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export function fileHash(file: string) {
  const digest = crypto.createHash("sha256"),
    buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(file, "r");
  try {
    let length: number;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      digest.update(buffer.subarray(0, length));
    return digest.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}
export const home = (ctx: ProjectContext) =>
  contained(ctx.directory, "authoring");
export const stateFile = (ctx: ProjectContext) =>
  contained(home(ctx), ".sync-state.json");
export const journalFile = (ctx: ProjectContext) =>
  contained(ctx.directory, ".magickisa-sync-commit.json");
export function readJson(file: string, maximum = 32 * 1024 * 1024) {
  if (fs.statSync(file).size > maximum)
    throw new Error("Authoring JSON exceeds 32 MiB");
  const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  safeData(data);
  return data;
}
export function stateRevision(ctx: ProjectContext) {
  const file = stateFile(ctx);
  return fs.existsSync(file) ? hash(fs.readFileSync(file)) : hash("");
}
export function readState(ctx: ProjectContext): SyncState {
  return fs.existsSync(stateFile(ctx))
    ? stateSchema.parse(readJson(stateFile(ctx)))
    : { formatVersion: 1, entries: {} };
}
const journalSchema = z
  .object({
    version: z.literal(1),
    projectBefore: z.string(),
    projectAfter: z.string(),
    stateBefore: z.string().nullable(),
    stateAfter: z.string(),
  })
  .strict();
function writeBytes(file: string, bytes: Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
export function beginCommit(
  ctx: ProjectContext,
  project: unknown,
  state: SyncState,
) {
  if (
    Buffer.byteLength(JSON.stringify(state, null, 2) + "\n") >
    32 * 1024 * 1024
  )
    throw new Error("同步状态超过 32 MiB，未提交工程");
  const before = fs.existsSync(stateFile(ctx))
    ? fs.readFileSync(stateFile(ctx)).toString("base64")
    : null;
  atomicJson(journalFile(ctx), {
    version: 1,
    projectBefore: fs.readFileSync(ctx.projectFile).toString("base64"),
    projectAfter: Buffer.from(JSON.stringify(project, null, 2) + "\n").toString(
      "base64",
    ),
    stateBefore: before,
    stateAfter: Buffer.from(JSON.stringify(state, null, 2) + "\n").toString(
      "base64",
    ),
  });
}
export function finishCommit(ctx: ProjectContext, state: SyncState) {
  atomicJson(stateFile(ctx), state);
  fs.rmSync(journalFile(ctx));
}
// Called only while holding the shared project lock. Roll back both authoritative
// files and regenerate runtime content before allowing another write.
export function recoverCommit(ctx: ProjectContext) {
  if (!fs.existsSync(journalFile(ctx))) return false;
  const journal = journalSchema.parse(
    readJson(journalFile(ctx), 256 * 1024 * 1024),
  );
  const projectNow = fs.readFileSync(ctx.projectFile).toString("base64");
  const stateNow = fs.existsSync(stateFile(ctx))
    ? fs.readFileSync(stateFile(ctx)).toString("base64")
    : null;
  if (
    ![journal.projectBefore, journal.projectAfter].includes(projectNow) ||
    ![journal.stateBefore, journal.stateAfter].includes(stateNow)
  )
    throw Object.assign(
      new Error("同步恢复遇到外部修改，保留提交日志并停止写入"),
      { code: "RECOVERY_CONFLICT", exitCode: 3, status: 409 },
    );
  // Validate recovery payloads before writing anything.
  const prior = JSON.parse(
    Buffer.from(journal.projectBefore, "base64").toString("utf8"),
  );
  safeData(prior);
  projectSchema.parse(prior);
  if (journal.stateBefore)
    stateSchema.parse(
      JSON.parse(Buffer.from(journal.stateBefore, "base64").toString("utf8")),
    );
  writeBytes(ctx.projectFile, Buffer.from(journal.projectBefore, "base64"));
  if (journal.stateBefore === null) fs.rmSync(stateFile(ctx), { force: true });
  else writeBytes(stateFile(ctx), Buffer.from(journal.stateBefore, "base64"));
  buildContent(prior, ctx.public, ctx.id.startsWith("builtin-"));
  fs.rmSync(journalFile(ctx));
  return true;
}
export function assertNoPendingCommit(ctx: ProjectContext) {
  if (fs.existsSync(journalFile(ctx)))
    throw Object.assign(
      new Error("存在未完成同步；先运行 sync recover，恢复后重新读取工程"),
      { code: "RECOVERY_REQUIRED", exitCode: 3, status: 409 },
    );
}
