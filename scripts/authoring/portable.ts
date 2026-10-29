import fs from "node:fs";
import path from "node:path";
import { contained, atomicJson, type ProjectContext } from "../workspaces";
import { manifestSchema, moduleSchema, stateSchema } from "./model";
import { sourceFile } from "./sources";
import { studioDataSchema } from "../../src/studio/investigationModel";
import { creativeRootFiles } from "./creative-files";
import {
  home,
  hash,
  fileHash,
  readJson,
  stateFile,
  assertNoPendingCommit,
} from "./storage";

export function exportAuthoring(
  ctx: ProjectContext,
  snapshot: string,
  includeSources: boolean,
) {
  assertNoPendingCommit(ctx);
  const sourceRoot = home(ctx),
    manifestFile = contained(sourceRoot, "manifest.json");
  if (
    !fs.existsSync(manifestFile) &&
    !fs.existsSync(contained(sourceRoot, "studio.json")) &&
    !creativeRootFiles.some((name) =>
      fs.existsSync(contained(sourceRoot, name)),
    )
  )
    return () => {};
  const expected = new Map<string, string>();
  const read = (file: string) => {
    const bytes = fs.readFileSync(file);
    expected.set(file, hash(bytes));
    return bytes;
  };
  const manifest = manifestSchema.parse(
    fs.existsSync(manifestFile)
      ? JSON.parse(
          read(manifestFile)
            .toString("utf8")
            .replace(/^\uFEFF/, ""),
        )
      : { formatVersion: 1, modules: [] },
  );
  const output = contained(snapshot, "content/authoring");
  fs.mkdirSync(output, { recursive: true });
  for (const name of creativeRootFiles.filter(
    (name) => name !== "manifest.json",
  )) {
    const file = contained(sourceRoot, name);
    if (fs.existsSync(file))
      fs.writeFileSync(contained(output, name), read(file));
  }
  if (fs.existsSync(contained(sourceRoot, "studio.json"))) {
    const bytes = read(contained(sourceRoot, "studio.json"));
    studioDataSchema.parse(
      JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")),
    );
    fs.writeFileSync(contained(output, "studio.json"), bytes);
  }
  for (const module of manifest.modules) {
    const file = contained(sourceRoot, module),
      bytes = read(file);
    moduleSchema.parse(
      JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")),
    );
    const target = contained(output, module);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  if (fs.existsSync(stateFile(ctx))) {
    const bytes = read(stateFile(ctx));
    stateSchema.parse(
      JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")),
    );
    fs.writeFileSync(contained(output, ".sync-state.json"), bytes);
  }
  for (const source of manifest.sources) {
    if (path.isAbsolute(source.path) || /^[A-Za-z]:/.test(source.path))
      throw new Error("来源路径必须为相对路径");
    const original = sourceFile(ctx, source),
      ext = path.extname(original).toLowerCase();
    if (![".txt", ".md", ".json"].includes(ext))
      throw new Error("来源文件类型不支持");
    source.path = `sources/${hash(source.id).slice(0, 24)}${ext}`;
    if (includeSources) {
      if (fs.lstatSync(original).isSymbolicLink())
        throw new Error("来源不能是符号链接");
      source.sha256 = fileHash(original);
      expected.set(original, source.sha256);
      const target = contained(output, source.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(original, target);
      if (fileHash(target) !== source.sha256)
        throw new Error("来源在复制期间变化");
    }
  }
  atomicJson(contained(output, "manifest.json"), manifest);
  return () => {
    for (const [file, digest] of expected)
      if (!fs.existsSync(file) || fileHash(file) !== digest)
        throw new Error("创作资料在导出期间变化，请重新导出");
  };
}
export function restoreAuthoring(stage: string) {
  const sourceRoot = contained(stage, "content/authoring");
  if (!fs.existsSync(sourceRoot)) return;
  const manifest = manifestSchema.parse(
    readJson(contained(sourceRoot, "manifest.json")),
  );
  const files = new Set(["manifest.json"]);
  for (const name of creativeRootFiles)
    if (fs.existsSync(contained(sourceRoot, name))) files.add(name);
  if (fs.existsSync(contained(sourceRoot, "studio.json"))) {
    studioDataSchema.parse(readJson(contained(sourceRoot, "studio.json")));
    files.add("studio.json");
  }
  if (fs.existsSync(contained(sourceRoot, ".sync-state.json"))) {
    stateSchema.parse(readJson(contained(sourceRoot, ".sync-state.json")));
    files.add(".sync-state.json");
  }
  for (const module of manifest.modules) {
    moduleSchema.parse(readJson(contained(sourceRoot, module)));
    files.add(module);
  }
  for (const source of manifest.sources) {
    if (!/^sources\/[a-f0-9]{24}\.(txt|md|json)$/.test(source.path))
      throw new Error("包内来源路径无效");
    const file = contained(sourceRoot, source.path);
    if (fs.existsSync(file)) {
      if (fileHash(file) !== source.sha256) throw new Error("来源校验失败");
      files.add(source.path);
    }
  }
  for (const relative of fs.readdirSync(sourceRoot, { recursive: true })) {
    const name = String(relative).replaceAll("\\", "/"),
      file = contained(sourceRoot, name);
    if (fs.statSync(file).isFile() && !files.has(name))
      throw new Error("未知创作资料文件：" + name);
  }
  const destination = contained(stage, "authoring");
  fs.mkdirSync(destination, { recursive: true });
  for (const relative of files) {
    const target = contained(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(contained(sourceRoot, relative), target);
  }
  // Keep authoring data outside runtime-generated content and release builds.
  fs.rmSync(sourceRoot, { recursive: true });
}
