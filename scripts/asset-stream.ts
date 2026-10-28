import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { contained, type ProjectContext } from "./workspaces";
import { acquireProjectWrite } from "./project-locks";
export const assetLimit = 512 * 1024 * 1024;
export function assetName(name: string) {
  if (
    typeof name !== "string" ||
    !/^[\p{L}\p{N} _.-]+\.(png|jpg|jpeg|webp|svg|avif|gif|mp3|ogg|wav|m4a|aac|flac|mp4|webm|ogv|lrc|vtt)$/iu.test(
      name,
    ) ||
    name.includes("..") ||
    name.length > 150
  )
    throw Object.assign(new Error("资源文件名或类型无效"), {
      code: "VALIDATION",
      exitCode: 1,
    });
  return name;
}
export async function importAssetStream(
  ctx: ProjectContext,
  name: string,
  source: Readable,
  alreadyLocked = false,
  signal?: AbortSignal,
) {
  assetName(name);
  const release = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  const staging = contained(
    ctx.directory,
    ".asset-upload-" + crypto.randomUUID(),
  );
  try {
    let bytes = 0;
    const hash = crypto.createHash("sha256");
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > assetLimit) {
          callback(
            Object.assign(new Error("资源超过 512 MiB"), {
              code: "VALIDATION",
              exitCode: 1,
            }),
          );
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      source,
      meter,
      fs.createWriteStream(staging, { flags: "wx" }),
      { signal },
    );
    if (!bytes)
      throw Object.assign(new Error("资源为空"), {
        code: "VALIDATION",
        exitCode: 1,
      });
    const folder = contained(ctx.public, "assets/imported");
    fs.mkdirSync(folder, { recursive: true });
    const ext = path.extname(name),
      stem = name.slice(0, -ext.length);
    const existing = new Set(
      fs.readdirSync(folder).map((n) => n.toLowerCase()),
    );
    let unique = name,
      index = 1;
    while (existing.has(unique.toLowerCase()))
      unique = `${stem}-${index++}${ext}`;
    const destination = contained(folder, unique);
    signal?.throwIfAborted();
    // Both paths are in the same workspace filesystem. Linking publishes the
    // complete inode atomically without overwriting or copying a large payload.
    await fs.promises.link(staging, destination);
    return {
      url: `/assets/imported/${unique}`,
      bytes,
      sha256: hash.digest("hex"),
    };
  } finally {
    fs.rmSync(staging, { force: true });
    release();
  }
}
