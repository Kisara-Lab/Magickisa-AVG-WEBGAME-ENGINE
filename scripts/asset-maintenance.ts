import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import type { Readable } from "node:stream";
import { contained, atomicJson, type ProjectContext } from "./workspaces";
import { acquireProjectWrite } from "./project-locks";
import { assertRevision, readSnapshot } from "./project-service";
import { fileHash } from "./authoring/storage";
import { receiveAssetStream, assetName } from "./asset-stream";
import { assetKind } from "../src/authoring/assetKind";
import { usages } from "../src/studio/discovery";

function assetFile(ctx: ProjectContext, url: string) {
  if (
    typeof url !== "string" ||
    !url.startsWith("/") ||
    url.startsWith("//") ||
    assetKind(url) === "other" ||
    /[?#]/.test(url)
  )
    throw new Error("请选择项目内的素材文件");
  return contained(ctx.public, "." + url);
}
const conflict = () =>
  Object.assign(new Error("素材或工程已变化，请重新检查"), {
    code: "REVISION_CONFLICT",
    status: 409,
    exitCode: 3,
  });
export function inspectAsset(ctx: ProjectContext, url: string) {
  const file = assetFile(ctx, url),
    snapshot = readSnapshot(ctx),
    stat = fs.statSync(file);
  const sha256 = fileHash(file),
    after = fs.statSync(file);
  if (stat.mtimeMs !== after.mtimeMs || stat.size !== after.size)
    throw conflict();
  return {
    workspaceId: ctx.id,
    url,
    bytes: stat.size,
    sha256,
    revision: snapshot.revision,
    kind: assetKind(url),
    references: usages(snapshot.project).filter(
      (r) => r.kind === "assets" && r.target === url,
    ),
  };
}
async function backupAsset(ctx: ProjectContext, url: string, expected: string) {
  const id = "asset-" + crypto.randomUUID(),
    directory = contained(ctx.backups, id);
  fs.mkdirSync(directory, { recursive: true });
  const bytes = contained(directory, "asset.bin"),
    file = assetFile(ctx, url);
  try {
    await fs.promises.copyFile(file, bytes, fs.constants.COPYFILE_EXCL);
    if (fileHash(bytes) !== expected || fileHash(file) !== expected)
      throw conflict();
    atomicJson(contained(directory, "asset.json"), {
      formatVersion: 1,
      url,
      sha256: expected,
      createdAt: new Date().toISOString(),
    });
    return id;
  } catch (error) {
    await fs.promises.rm(directory, { recursive: true, force: true });
    throw error;
  }
}
export async function changeAsset(
  ctx: ProjectContext,
  request: { url: string; sha256: string; revision: string },
  replacement?: { name: string; stream: Readable; signal?: AbortSignal },
  alreadyLocked = false,
) {
  const release = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  let staged: Awaited<ReturnType<typeof receiveAssetStream>> | undefined;
  try {
    assertRevision(ctx, request.revision);
    const info = inspectAsset(ctx, request.url);
    if (info.sha256 !== request.sha256) throw conflict();
    if (!replacement && info.references.length)
      throw Object.assign(new Error("素材仍有引用，请先修改工程引用后再删除"), {
        status: 409,
        code: "REFERENCED",
        exitCode: 1,
        details: info.references,
      });
    if (replacement) {
      assetName(replacement.name);
      if (
        path.extname(replacement.name).toLowerCase() !==
        path.extname(request.url).toLowerCase()
      )
        throw new Error("原位替换必须使用相同扩展名；其他格式请导入后重新引用");
      staged = await receiveAssetStream(
        ctx,
        replacement.stream,
        replacement.signal,
      );
    }
    const backupId = await backupAsset(ctx, request.url, request.sha256);
    assertRevision(ctx, request.revision);
    if (fileHash(assetFile(ctx, request.url)) !== request.sha256)
      throw conflict();
    replacement?.signal?.throwIfAborted();
    if (staged) fs.renameSync(staged.file, assetFile(ctx, request.url));
    else fs.unlinkSync(assetFile(ctx, request.url));
    return {
      backupId,
      url: request.url,
      sha256: staged?.sha256 ?? null,
      action: staged ? "replaced" : "removed",
    };
  } finally {
    try {
      staged?.cleanup();
    } finally {
      release();
    }
  }
}
const AssetBackupSchema = z.object({
  formatVersion: z.literal(1),
  url: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
});
export function assetBackups(ctx: ProjectContext) {
  if (!fs.existsSync(ctx.backups)) return [];
  return fs
    .readdirSync(ctx.backups)
    .filter((id) => /^asset-[a-f0-9-]{36}$/.test(id))
    .flatMap((id) => {
      try {
        const data = AssetBackupSchema.parse(
          JSON.parse(
            fs.readFileSync(contained(ctx.backups, `${id}/asset.json`), "utf8"),
          ),
        );
        assetFile(ctx, data.url);
        return [{ ...data, id }];
      } catch {
        return [];
      }
    });
}
export function planAssetRestore(ctx: ProjectContext, id: string) {
  const record = assetBackups(ctx).find((item) => item.id === id);
  if (!record) throw new Error("素材备份不存在");
  const file = assetFile(ctx, record.url);
  return {
    workspaceId: ctx.id,
    id,
    url: record.url,
    revision: readSnapshot(ctx).revision,
    sha256: fs.existsSync(file) ? fileHash(file) : null,
    backupSha256: record.sha256,
  };
}
export async function restoreAsset(
  ctx: ProjectContext,
  id: string,
  revision: string,
  expectedCurrent: string | null,
  alreadyLocked = false,
  expectedBackup?: string,
) {
  const release = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  let temporary: string | undefined;
  try {
    assertRevision(ctx, revision);
    const record = assetBackups(ctx).find((item) => item.id === id);
    if (!record) throw new Error("素材备份不存在");
    if (expectedBackup !== undefined && record.sha256 !== expectedBackup)
      throw conflict();
    const file = assetFile(ctx, record.url),
      current = fs.existsSync(file) ? fileHash(file) : null;
    if (current !== expectedCurrent) throw conflict();
    const source = contained(ctx.backups, `${id}/asset.bin`);
    if (fileHash(source) !== record.sha256) throw new Error("素材备份校验不符");
    if (current) await backupAsset(ctx, record.url, current);
    temporary = contained(
      ctx.directory,
      ".asset-upload-" + crypto.randomUUID(),
    );
    await fs.promises.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
    if (fileHash(temporary) !== record.sha256) throw conflict();
    assertRevision(ctx, revision);
    if ((fs.existsSync(file) ? fileHash(file) : null) !== expectedCurrent)
      throw conflict();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.renameSync(temporary, file);
    return { url: record.url, sha256: record.sha256 };
  } finally {
    try {
      if (temporary) fs.rmSync(temporary, { force: true });
    } finally {
      release();
    }
  }
}
