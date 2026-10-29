import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { contained, type ProjectContext } from "../workspaces";
import { manifestSchema } from "./model";
import { creativeRootFiles } from "./creative-files";

const key = z
  .string()
  .refine(
    (s) =>
      (creativeRootFiles as readonly string[]).includes(s) ||
      /^modules\/(?:[^/\\:.]+\/)*[^/\\:.]+\.json$/.test(s),
    "无效创作备份路径",
  );
export const creativeFilesSchema = z.record(
  key,
  z
    .string()
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .nullable(),
);
export type CreativeFiles = z.infer<typeof creativeFilesSchema>;
export const creativeFile = (ctx: ProjectContext, key: string) =>
  contained(contained(ctx.directory, "authoring"), key);
export function readCreativeFile(ctx: ProjectContext, key: string) {
  const file = creativeFile(ctx, key);
  if (!fs.existsSync(file)) return null;
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 32 * 1024 * 1024)
    throw new Error("创作备份文件无效或超过 32 MiB");
  return fs.readFileSync(file).toString("base64");
}
export function creativeSnapshot(ctx: ProjectContext): CreativeFiles {
  const files: CreativeFiles = {};
  for (const name of creativeRootFiles)
    files[name] = readCreativeFile(ctx, name);
  if (files["manifest.json"]) {
    const manifest = manifestSchema.parse(
      JSON.parse(
        Buffer.from(files["manifest.json"], "base64")
          .toString("utf8")
          .replace(/^\uFEFF/, ""),
      ),
    );
    for (const name of manifest.modules)
      files[name] = readCreativeFile(ctx, name);
  }
  validateCreativeFiles(files);
  return files;
}
export function validateCreativeFiles(input: unknown): CreativeFiles {
  const files = creativeFilesSchema.parse(input);
  const names = Object.keys(files);
  if (
    new Set(names.map((n) => n.toLowerCase())).size !== names.length ||
    names.some((n) => n.split("/").some((part) => part.trim() !== part))
  )
    throw new Error("创作备份包含冲突或非规范路径");
  if (Buffer.byteLength(JSON.stringify(files)) > 64 * 1024 * 1024)
    throw new Error("创作备份超过 64 MiB");
  return files;
}
export function writeCreativeFiles(ctx: ProjectContext, files: CreativeFiles) {
  for (const [name, bytes] of Object.entries(validateCreativeFiles(files))) {
    const file = creativeFile(ctx, name);
    if (bytes === null) {
      fs.rmSync(file, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + "." + crypto.randomUUID() + ".restore.tmp";
    try {
      fs.writeFileSync(temp, Buffer.from(bytes, "base64"));
      fs.renameSync(temp, file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
}
