import fs from "node:fs";
import { compareEngineVersions } from "./engine-version";
import path from "node:path";
import crypto from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ServerResponse } from "node:http";
import * as yazl from "yazl";
import * as yauzl from "yauzl";
import type { AuthorProject, Profile } from "../src/studio/model";
import { resourceReferences } from "./content";
import { isExternalResource } from "../src/engine/resource.js";
import { registerPackagePath } from "./package-paths";
import { exportAuthoring, restoreAuthoring } from "./authoring/portable";
import { acquireRegistry } from "./project-locks";
import {
  requireModernProfile,
  requireModernProject,
} from "../src/engine/support";
const studioVersion = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version as string;
import {
  repository,
  workspaceRoot,
  workspaces,
  atomicJson,
  contained,
  type ProjectContext,
} from "./workspaces";

const GiB = 1024 ** 3;
const limits = { compressed: 2 * GiB, expanded: 8 * GiB, files: 50_000 };
const transferRoot = path.join(repository, ".studio-transfers");
interface FileRecord {
  path: string;
  bytes: number;
  sha256: string;
}
interface Manifest {
  format: "magickisa-project";
  version: 2;
  studioVersion: string;
  projectSchemaVersion: 3;
  minimumEngineVersion: string;
  profile: Profile;
  name: string;
  files: FileRecord[];
}
interface Task {
  id: string;
  kind: "export" | "import";
  workspaceId: string;
  profile: Profile;
  status: "running" | "ready" | "failed" | "cancelled" | "complete";
  phase: string;
  completed: number;
  total: number;
  error?: string;
  summary?: ReturnType<typeof summary>;
  digest?: string;
  name?: string;
  directory: string;
  controller: AbortController;
}
function summary(
  ctx: ProjectContext,
  p: AuthorProject,
  warnings: string[],
  files: { bytes: number }[],
) {
  return {
    name: ctx.name,
    profile: ctx.profile,
    scenes: p.nodes.length,
    files: files.length,
    bytes: files.reduce((s, f) => s + f.bytes, 0),
    warnings,
    external: resourceReferences(
      p as Parameters<typeof resourceReferences>[0],
    ).filter(isExternalResource),
  };
}
export async function hashFile(file: string, signal?: AbortSignal) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash, { signal });
  return hash.digest("hex");
}
function walk(base: string, relative = ""): string[] {
  return fs
    .readdirSync(path.join(base, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const name = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
      contained(base, name);
      if (entry.isDirectory()) return walk(base, name);
      if (!entry.isFile()) throw new Error("不支持特殊文件：" + name);
      return [name];
    });
}
function publicFiles(ctx: ProjectContext) {
  return walk(ctx.public).filter(
    (name) =>
      !/^content\/(engine-story|script|index|flow|performance)\.json$/.test(
        name,
      ) &&
      !/^assets\/index-[^/]+\.(js|css)(\.map)?$/i.test(name) &&
      !/^index\.html$/i.test(name),
  );
}
function safeName(name: string) {
  if (
    name.length > 500 ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /[\x00-\x1f:<>"|?*]/.test(name) ||
    name
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p),
      )
  )
    throw new Error("压缩包路径无效：" + name);
  if (
    !["manifest.json", "project.json", "README.txt"].includes(name) &&
    !name.startsWith("public/") &&
    !/^content\/[^/]+\.json$/.test(name) &&
    !/^content\/authoring\/(?:.*\.json|sources\/[^/]+\.(?:txt|md))$/.test(name)
  )
    throw new Error("压缩包包含不支持的文件：" + name);
  return name;
}
export class ProjectPackages {
  private temporary = path.join(
    transferRoot,
    `${process.pid}-${crypto.randomUUID()}`,
  );
  tasks = new Map<string, Task>();
  constructor(
    private hooks: {
      validate: (
        p: unknown,
        ctx: ProjectContext,
        warnings: string[],
      ) => AuthorProject;
      revision: (ctx: ProjectContext) => string;
      snapshot: (
        p: AuthorProject,
        source: ProjectContext,
        target: string,
      ) => void;
    },
  ) {
    // This directory contains only disposable tasks, never committed projects.
    fs.mkdirSync(transferRoot, { recursive: true });
    for (const name of fs.readdirSync(transferRoot)) {
      if (!/^\d+-[0-9a-f-]{36}$/.test(name)) continue;
      try {
        process.kill(Number(name.split("-")[0]), 0);
      } catch {
        fs.rmSync(path.join(transferRoot, name), {
          recursive: true,
          force: true,
        });
      }
    }
    fs.mkdirSync(this.temporary, { recursive: true });
  }
  private task(kind: Task["kind"], ctx: ProjectContext) {
    const id = crypto.randomUUID(),
      directory = path.join(this.temporary, id);
    fs.mkdirSync(directory);
    const task: Task = {
      id,
      kind,
      workspaceId: ctx.id,
      profile: ctx.profile,
      status: "running",
      phase: "检查",
      completed: 0,
      total: 0,
      directory,
      controller: new AbortController(),
    };
    this.tasks.set(id, task);
    return task;
  }
  view(task: Task) {
    const { directory: _directory, controller: _controller, ...view } = task;
    return view;
  }
  get(id: string) {
    const task = this.tasks.get(id);
    if (!task)
      throw Object.assign(new Error("传输任务不存在或服务已重启，请重试"), {
        status: 404,
      });
    return task;
  }
  check(ctx: ProjectContext, input: unknown, revision: string) {
    if (this.hooks.revision(ctx) !== revision)
      throw Object.assign(new Error("工程已变化，请重新加载后导出"), {
        status: 409,
      });
    const warnings: string[] = [],
      p = this.hooks.validate(input, ctx, warnings);
    requireModernProfile(ctx.profile);
    requireModernProject(p);
    const names = publicFiles(ctx),
      included = new Set(names);
    for (const ref of resourceReferences(
      p as Parameters<typeof resourceReferences>[0],
    )) {
      if (/^blob:/i.test(ref))
        throw new Error("浏览器临时 blob 资源不能打包，请先上传素材：" + ref);
      if (isExternalResource(ref) || /^data:/i.test(ref)) continue;
      const relative = path
        .relative(
          ctx.public,
          contained(ctx.public, "." + decodeURIComponent(ref.split(/[?#]/)[0])),
        )
        .replaceAll("\\", "/");
      if (
        fs.existsSync(path.join(ctx.public, relative)) &&
        !included.has(relative)
      )
        throw new Error("资源引用了不能打包的引擎程序或生成内容：" + ref);
    }
    const files = names.map((file) => ({
      bytes: fs.statSync(contained(ctx.public, file)).size,
    }));
    return summary(ctx, p, warnings, files);
  }
  export(
    ctx: ProjectContext,
    input: unknown,
    revision: string,
    includeSources = false,
  ) {
    const info = this.check(ctx, input, revision),
      p = input as AuthorProject,
      task = this.task("export", ctx);
    task.summary = info;
    void this.run(task, async () => {
      const signal = task.controller.signal,
        snapshot = path.join(task.directory, "snapshot");
      fs.mkdirSync(snapshot);
      this.hooks.snapshot(p, ctx, snapshot);
      const checkAuthoring = exportAuthoring(ctx, snapshot, includeSources);
      const publicNames = publicFiles(ctx),
        records: FileRecord[] = [],
        sources: { source: string; destination: string }[] = [];
      for (const name of walk(snapshot))
        sources.push({ source: contained(snapshot, name), destination: name });
      for (const name of publicNames)
        sources.push({
          source: contained(ctx.public, name),
          destination: "public/" + name,
        });
      const folded = new Map<string, "file" | "directory">();
      for (const { destination } of sources) {
        safeName(destination);
        registerPackagePath(folded, destination);
      }
      if (sources.length + 2 > limits.files)
        throw new Error("工程文件超过 50,000 个");
      task.total = sources.length;
      task.phase = "读取素材与计算校验";
      const archived: { source: string; destination: string }[] = [];
      for (const { source, destination } of sources) {
        signal.throwIfAborted();
        const bytes = fs.statSync(source).size,
          sha256 = await hashFile(source, signal);
        if (bytes !== fs.statSync(source).size)
          throw new Error("素材在导出期间变化，请重试");
        let staged = source;
        if (destination.startsWith("public/")) {
          staged = contained(snapshot, destination);
          fs.mkdirSync(path.dirname(staged), { recursive: true });
          await pipeline(
            fs.createReadStream(source),
            fs.createWriteStream(staged),
            { signal },
          );
          if ((await hashFile(staged, signal)) !== sha256)
            throw new Error("素材在读取期间变化，请重试");
        }
        archived.push({ source: staged, destination });
        records.push({ path: destination, bytes, sha256 });
        task.completed++;
      }
      if (records.reduce((s, r) => s + r.bytes, 0) > limits.expanded)
        throw new Error("工程解压总量超过 8 GiB");
      const manifest: Manifest = {
        format: "magickisa-project",
        version: 2,
        studioVersion,
        projectSchemaVersion: 3,
        minimumEngineVersion: "2.0.0-dev.5",
        profile: ctx.profile,
        name: ctx.name,
        files: records,
      };
      const archive = new yazl.ZipFile();
      const writing = pipeline(
        archive.outputStream,
        limiter(limits.compressed),
        fs.createWriteStream(path.join(task.directory, "package.zip")),
        { signal },
      );
      // Catch immediately; cancellation must not create an unhandled rejection.
      writing.catch(() => {});
      task.phase = "打包";
      task.completed = 0;
      for (const { source, destination } of archived)
        archive.addFile(source, destination);
      archive.addBuffer(
        Buffer.from(JSON.stringify(manifest, null, 2)),
        "manifest.json",
      );
      archive.addBuffer(
        Buffer.from(
          `MAGICKISA Studio 工程包\n使用兼容的 Studio 导入此文件。\n外部资源：\n${info.external.join("\n")}\n警告：\n${info.warnings.join("\n")}\n`,
        ),
        "README.txt",
      );
      archive.on("error", (error) =>
        (archive.outputStream as import("node:stream").Readable).destroy(error),
      );
      archive.end();
      await writing;
      task.phase = "核对源文件";
      checkAuthoring();
      for (let i = 0; i < sources.length; i++) {
        if ((await hashFile(sources[i].source, signal)) !== records[i].sha256)
          throw new Error("文件在打包期间变化，请重试");
        task.completed++;
      }
      if (
        this.hooks.revision(ctx) !== revision ||
        JSON.stringify(publicNames) !== JSON.stringify(publicFiles(ctx))
      )
        throw Object.assign(new Error("工程或素材目录已变化，请重试"), {
          status: 409,
        });
      task.digest = await hashFile(
        path.join(task.directory, "package.zip"),
        signal,
      );
      task.phase = "可下载";
      task.status = "ready";
      fs.rmSync(snapshot, { recursive: true, force: true });
    });
    return this.view(task);
  }
  async upload(ctx: ProjectContext, req: Readable) {
    const task = this.task("import", ctx);
    try {
      await pipeline(
        req,
        limiter(limits.compressed),
        fs.createWriteStream(path.join(task.directory, "package.zip")),
        { signal: task.controller.signal },
      );
    } catch (error) {
      await this.fail(task, error);
      throw error;
    }
    void this.run(task, () => this.inspect(task));
    return this.view(task);
  }
  private async inspect(task: Task) {
    const stage = path.join(task.directory, "snapshot"),
      signal = task.controller.signal;
    fs.mkdirSync(stage);
    task.phase = "解压与校验";
    const actual: FileRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      yauzl.open(
        path.join(task.directory, "package.zip"),
        { lazyEntries: true, autoClose: true, strictFileNames: true },
        (error, zip) => {
          if (error || !zip) return reject(error);
          const abort = () => {
            zip.close();
            reject(new Error("已取消"));
          };
          signal.addEventListener("abort", abort, { once: true });
          const seen = new Set<string>();
          const occupied = new Map<string, "file" | "directory">();
          let expanded = 0;
          zip.on("error", reject);
          zip.on("end", () => {
            signal.removeEventListener("abort", abort);
            resolve();
          });
          zip.on("entry", (entry: yauzl.Entry) => {
            void (async () => {
              signal.throwIfAborted();
              const name = safeName(entry.fileName),
                key = name.normalize("NFC").toLowerCase();
              if (
                seen.has(key) ||
                ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
              )
                throw new Error("重复路径、大小写冲突或符号链接");
              seen.add(key);
              registerPackagePath(occupied, name);
              expanded += entry.uncompressedSize;
              if (
                seen.size > limits.files ||
                expanded > limits.expanded ||
                (/\.json$/.test(name) &&
                  !name.startsWith("public/") &&
                  entry.uncompressedSize > 32 * 1024 * 1024)
              )
                throw new Error(
                  "压缩包超过文件数或解压大小限制（内容 JSON 单文件最大 32 MiB）",
                );
              const file = contained(stage, name);
              fs.mkdirSync(path.dirname(file), { recursive: true });
              const stream = await new Promise<import("node:stream").Readable>(
                (ok, fail) =>
                  zip.openReadStream(entry, (e, s) =>
                    e || !s ? fail(e) : ok(s),
                  ),
              );
              await pipeline(
                stream,
                limiter(entry.uncompressedSize),
                fs.createWriteStream(file, { flags: "wx" }),
                { signal },
              );
              actual.push({
                path: name,
                bytes: fs.statSync(file).size,
                sha256: await hashFile(file, signal),
              });
              task.completed++;
              zip.readEntry();
            })().catch((e) => {
              zip.close();
              reject(e);
            });
          });
          zip.readEntry();
        },
      );
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(stage, "manifest.json"), "utf8"),
    ) as Manifest;
    if (
      manifest.format !== "magickisa-project" ||
      manifest.version !== 2 ||
      typeof manifest.studioVersion !== "string" ||
      !manifest.studioVersion.trim()
    )
      throw new Error("不支持的工程包或 Studio 版本");
    requireModernProfile(manifest.profile);
    if (
      manifest.projectSchemaVersion !== 3 ||
      typeof manifest.minimumEngineVersion !== "string"
    )
      throw new Error("工程包缺少格式 3 与最低引擎版本声明");
    if (compareEngineVersions(studioVersion, manifest.minimumEngineVersion) < 0)
      throw new Error(
        `此工程包需要 MAGICKISA ${manifest.minimumEngineVersion} 或更新版本`,
      );
    if (manifest.profile !== "modern")
      throw new Error("工程包缺少现代版模式元数据");
    if (
      typeof manifest.name !== "string" ||
      !manifest.name.trim() ||
      manifest.name.length > 200 ||
      !Array.isArray(manifest.files)
    )
      throw new Error("工程包清单无效");
    const listed = new Set<string>();
    const indexed = new Map(actual.map((record) => [record.path, record]));
    for (const file of manifest.files) {
      const name = safeName(file.path);
      if (listed.has(name) || ["manifest.json", "README.txt"].includes(name))
        throw new Error("工程包清单重复或无效");
      listed.add(name);
      const found = indexed.get(name);
      if (!found || found.bytes !== file.bytes || found.sha256 !== file.sha256)
        throw new Error("文件缺失或 SHA256 校验失败：" + name);
    }
    if (
      actual.some(
        (r) =>
          !["manifest.json", "README.txt"].includes(r.path) &&
          !listed.has(r.path),
      )
    )
      throw new Error("工程包包含清单外文件");
    const p = JSON.parse(
      fs.readFileSync(path.join(stage, "project.json"), "utf8"),
    );
    requireModernProject(p);
    const ctx = {
      ...projectContextForStage(stage, manifest.profile),
      name: manifest.name,
    };
    fs.mkdirSync(ctx.public, { recursive: true });
    const warnings: string[] = [];
    this.hooks.validate(p, ctx, warnings);
    // Rebuild/check authoring sidecars before allowing commit.
    const verified = path.join(task.directory, "verified");
    fs.mkdirSync(verified);
    this.hooks.snapshot(p, ctx, verified);
    fs.mkdirSync(ctx.content, { recursive: true });
    fs.cpSync(path.join(verified, "content"), ctx.content, { recursive: true });
    fs.rmSync(verified, { recursive: true, force: true });
    restoreAuthoring(stage);
    task.profile = manifest.profile;
    task.name = manifest.name;
    task.summary = summary(
      ctx,
      p,
      warnings,
      actual.filter((r) => r.path.startsWith("public/")),
    );
    task.total = task.completed;
    task.phase = "检查通过，等待建立项目";
    task.status = "ready";
  }
  async commit(task: Task, requested: string) {
    if (task.kind !== "import" || task.status !== "ready")
      throw new Error("导入尚未检查通过");
    const unlock = acquireRegistry();
    try {
      let name = requested?.trim() || task.name!;
      if (name.length > 200 || /[\x00-\x1f]/.test(name))
        throw new Error("工程名称无效");
      const names = new Set(workspaces().map((p) => p.name)),
        base = name;
      let i = 2;
      while (names.has(name)) name = `${base} (${i++})`;
      const id = crypto.randomUUID(),
        stage = path.join(task.directory, "snapshot");
      fs.mkdirSync(workspaceRoot, { recursive: true });
      atomicJson(path.join(stage, "workspace.json"), {
        id,
        profile: task.profile,
        name,
        lastOpened: Date.now(),
      });
      this.committing.add(task.id);
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            await fs.promises.rename(stage, path.join(workspaceRoot, id));
            break;
          } catch (error) {
            if (
              attempt >= 9 ||
              !["EPERM", "EACCES", "EBUSY"].includes(
                (error as NodeJS.ErrnoException).code || "",
              )
            )
              throw error;
            await new Promise((resolve) =>
              setTimeout(resolve, (attempt + 1) * 100),
            );
          }
        }
      } finally {
        this.committing.delete(task.id);
      }
      task.status = "complete";
      task.phase = "已建立独立项目";
      fs.rmSync(task.directory, { recursive: true, force: true });
      return { id, profile: task.profile, name };
    } finally {
      unlock();
    }
  }
  async dispose() {
    for (const task of this.tasks.values()) await this.cancel(task);
    while (this.running.size)
      await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.promises.rm(this.temporary, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
  async cancel(task: Task) {
    if (this.committing.has(task.id))
      throw Object.assign(new Error("正在完成项目登记，请稍后查看结果"), {
        status: 409,
      });
    if (task.status === "complete") return;
    task.status = "cancelled";
    task.controller.abort();
    if (!this.running.has(task.id)) await this.cleanup(task);
  }
  private running = new Set<string>();
  private committing = new Set<string>();
  private async cleanup(task: Task) {
    await fs.promises.rm(task.directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
  private async fail(task: Task, error: unknown) {
    if (task.status !== "cancelled") {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.phase = "失败，可重试";
    }
    try {
      await this.cleanup(task);
    } catch (cleanupError) {
      task.error = `${task.error || "任务已取消"}；临时文件清理失败：${String(cleanupError)}`;
    }
  }
  private async run(task: Task, fn: () => Promise<void>) {
    this.running.add(task.id);
    try {
      await fn();
    } catch (error) {
      await this.fail(task, error);
    } finally {
      this.running.delete(task.id);
    }
  }
  download(task: Task, res: ServerResponse, checksum: boolean) {
    if (task.kind !== "export" || task.status !== "ready")
      throw new Error("工程包尚未就绪");
    const name = `magickisa-${task.profile}-${task.id}.magickisa.zip`;
    res.setHeader(
      "Content-Type",
      checksum ? "text/plain; charset=utf-8" : "application/zip",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${name}${checksum ? ".sha256" : ""}"`,
    );
    if (checksum) res.end(`${task.digest}  ${name}\n`);
    else {
      res.setHeader(
        "Content-Length",
        fs.statSync(path.join(task.directory, "package.zip")).size,
      );
      fs.createReadStream(path.join(task.directory, "package.zip")).pipe(res);
    }
  }
}
function limiter(max: number) {
  let size = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(size > max ? new Error("文件超过大小限制") : null, chunk);
    },
  });
}
function projectContextForStage(
  directory: string,
  profile: Profile,
): ProjectContext {
  return {
    id: "staging",
    name: "",
    profile,
    directory,
    public: path.join(directory, "public"),
    content: path.join(directory, "content"),
    projectFile: path.join(directory, "project.json"),
    backups: path.join(directory, "backups"),
    output: path.join(directory, "dist"),
  };
}
