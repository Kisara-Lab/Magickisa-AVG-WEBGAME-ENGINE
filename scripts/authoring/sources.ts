import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { atomicJson, contained, type ProjectContext } from "../workspaces";
import { home, readJson, fileHash, hash } from "./storage";

// Local-only bindings support Windows files on another drive. They are never
// exported; manifests and packages retain portable relative source identities.
const bindingsSchema = z.record(
  z.string(),
  z.object({ path: z.string(), file: z.string() }).strict(),
);
const bindingFile = (ctx: ProjectContext) =>
  contained(home(ctx), ".source-bindings.json");
function bindings(ctx: ProjectContext) {
  return fs.existsSync(bindingFile(ctx))
    ? bindingsSchema.parse(readJson(bindingFile(ctx)))
    : {};
}
function checkFile(file: string) {
  if (!/\.(txt|md|json)$/i.test(file))
    throw Object.assign(new Error("来源仅支持 TXT、Markdown、JSON"), {
      code: "VALIDATION",
      exitCode: 1,
    });
  if (
    fs.existsSync(file) &&
    (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
  )
    throw Object.assign(new Error("来源必须为普通文件，不能是符号链接"), {
      code: "VALIDATION",
      exitCode: 1,
    });
  return file;
}
export function sourceFile(
  ctx: ProjectContext,
  source: { id: string; path: string },
) {
  if (
    path.isAbsolute(source.path) ||
    /^[A-Za-z]:|^[a-z]+:\/\//i.test(source.path)
  )
    throw Object.assign(new Error("来源清单路径必须为相对路径"), {
      code: "VALIDATION",
      exitCode: 1,
    });
  const binding = bindings(ctx)[source.id];
  if (binding?.path === source.path && !path.isAbsolute(binding.file))
    throw new Error("本地来源绑定需要绝对路径");
  return checkFile(
    binding?.path === source.path
      ? binding.file
      : path.resolve(home(ctx), source.path),
  );
}
export function registerSource(ctx: ProjectContext, id: string, file: string) {
  const absolute = checkFile(path.resolve(file));
  const sha256 = fileHash(absolute),
    records = bindings(ctx);
  let relative = path.relative(home(ctx), absolute).replaceAll("\\", "/");
  if (path.isAbsolute(relative)) {
    relative = `sources/${hash(id).slice(0, 24)}${path.extname(absolute).toLowerCase()}`;
    records[id] = { path: relative, file: absolute };
    atomicJson(bindingFile(ctx), records);
  } else if (Object.hasOwn(records, id)) {
    delete records[id];
    atomicJson(bindingFile(ctx), records);
  }
  return { id, path: relative, sha256 };
}
