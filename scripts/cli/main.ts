import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { addAbortSignal } from "node:stream";
import { spawn } from "node:child_process";
import { Console } from "node:console";
import { z } from "zod";
import { projectSchema } from "../../src/engine/schema";
import { usages } from "../../src/studio/discovery";
import {
  applyOperations,
  transactionSchema,
  safeData,
  type Operation,
} from "./operations";
import {
  projectContext,
  repository,
  workspaces,
  type ProjectContext,
} from "../workspaces";
import {
  createProject,
  readSnapshot,
  saveProject,
  checkedProject,
  diagnostics,
  snapshot,
  revision,
  importAsset,
  listAssets,
  startBuild,
  assertRevision,
} from "../project-service";
import {
  acquireProjectWrite,
  inspectLocks,
  recoverLock,
} from "../project-locks";
import { ProjectPackages } from "../project-packages";
import { exportMarkdown, importMarkdown } from "../content";

const commands: Record<string, string[]> = {
  project: ["list", "create", "show", "update"],
  scene: ["list", "show", "add", "update", "remove", "move", "link"],
  line: ["list", "show", "add", "update", "remove", "move"],
  choice: ["list", "show", "add", "update", "remove", "move"],
  condition: ["set", "unset"],
  effect: ["add", "update", "remove", "clear"],
  entity: ["list", "show", "add", "update", "remove"],
  media: ["show", "set", "unset"],
  asset: ["list", "import"],
  script: ["export", "import", "export-markdown", "import-markdown"],
  package: ["export", "import"],
  edit: [],
  validate: [],
  graph: [],
  refs: [],
  build: [],
  studio: [],
  help: [],
  schema: ["project", "transaction"],
  doctor: [],
};
const booleanOptions = new Set([
  "json",
  "dry-run",
  "help",
  "recover",
  "no-open",
]);
const valueOptions = new Set([
  "workspace",
  "name",
  "data",
  "file",
  "out",
  "scene",
  "id",
  "collection",
  "target",
  "phase",
  "kind",
  "index",
  "before",
  "after",
  "path",
  "text-file",
  "if-revision",
  "token",
  "lock",
]);
function failure(
  message: string,
  code = "ARGUMENT",
  exitCode = 2,
  details?: unknown,
) {
  return Object.assign(new Error(message), { code, exitCode, details });
}
function parse(args: string[]) {
  const words: string[] = [],
    options: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const equal = arg.indexOf("="),
      key = arg.slice(2, equal < 0 ? undefined : equal);
    if (!booleanOptions.has(key) && !valueOptions.has(key))
      throw failure(`未知选项：--${key}`);
    if (Object.hasOwn(options, key)) throw failure(`重复选项：--${key}`);
    if (booleanOptions.has(key)) {
      if (equal >= 0) throw failure(`--${key} 不接受值`);
      options[key] = true;
    } else {
      const value = equal >= 0 ? arg.slice(equal + 1) : args[++i];
      if (!value || value.startsWith("--")) throw failure(`--${key} 缺少值`);
      options[key] = value;
    }
  }
  const group = options.help ? "help" : (words[0] ?? "help"),
    action = words[1];
  if (
    !Object.hasOwn(commands, group) ||
    words.length > 2 ||
    (commands[group].length
      ? !commands[group].includes(action)
      : action !== undefined)
  ) {
    if (group !== "help") throw failure("命令或子命令无效；运行 help 查看命令");
  }
  const shared = ["json", "help", "workspace"];
  const allowed: Record<string, string[]> = {
    project:
      action === "create"
        ? ["name"]
        : action === "update"
          ? ["data", "dry-run", "if-revision"]
          : [],
    scene: [
      "id",
      "data",
      "before",
      "after",
      "index",
      "text-file",
      "dry-run",
      "if-revision",
    ],
    line: [
      "scene",
      "id",
      "data",
      "before",
      "after",
      "index",
      "text-file",
      "dry-run",
      "if-revision",
    ],
    choice: [
      "scene",
      "id",
      "data",
      "before",
      "after",
      "index",
      "dry-run",
      "if-revision",
    ],
    condition: ["scene", "id", "target", "data", "dry-run", "if-revision"],
    effect: ["scene", "id", "phase", "index", "data", "dry-run", "if-revision"],
    entity: ["collection", "id", "data", "dry-run", "if-revision"],
    media: ["kind", "data", "dry-run", "if-revision"],
    asset: action === "import" ? ["file", "name"] : [],
    edit: ["data", "file", "dry-run", "if-revision"],
    script: action?.startsWith("export")
      ? ["out"]
      : ["data", "file", "dry-run", "if-revision"],
    package:
      action === "export"
        ? ["out", "if-revision"]
        : ["file", "name", "if-revision"],
    refs: ["id", "kind"],
    build: ["if-revision"],
    studio: ["no-open"],
    doctor: ["recover", "lock", "token"],
  };
  if (group !== "help")
    for (const key of Object.keys(options))
      if (!shared.includes(key) && !(allowed[group] ?? []).includes(key))
        throw failure(`${group} ${action ?? ""} 不接受 --${key}`);
  if (
    ["scene", "line", "choice", "entity", "media"].includes(group) &&
    ["list", "show"].includes(action ?? "")
  ) {
    for (const key of [
      "data",
      "before",
      "after",
      "index",
      "text-file",
      "dry-run",
      "if-revision",
    ])
      if (options[key] !== undefined)
        throw failure(`${group} ${action} does not accept --${key}`);
  }
  if (options.file && options.data)
    throw failure("--file 与 --data 只能指定一个");
  return { group, action, options };
}
async function input(source: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (source === "-") {
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of addAbortSignal(signal, process.stdin))
        chunks.push(Buffer.from(chunk));
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw error;
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return source.startsWith("@")
    ? fs.readFileSync(path.resolve(source.slice(1)), "utf8")
    : source;
}
async function jsonInput(source: string, signal: AbortSignal) {
  try {
    const data = JSON.parse(
      (await input(source, signal)).replace(/^\uFEFF/, ""),
    );
    safeData(data);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code) throw error;
    throw failure(`JSON 输入无效：${String(error)}`);
  }
}
function writeOutput(file: string, content: string | Buffer) {
  const destination = path.resolve(file);
  fs.writeFileSync(destination, content, { flag: "wx" });
  return destination;
}
function graph(project: ReturnType<typeof readSnapshot>["project"]) {
  const edges = project.nodes.flatMap((n) => [
    ...(n.next
      ? [{ from: n.id, to: n.next, kind: "next", conditional: false }]
      : []),
    ...(n.choices ?? []).map((c) => ({
      from: n.id,
      to: c.target,
      kind: "choice",
      id: c.id,
      conditional: !!(c.condition || c.once),
    })),
  ]);
  const reachable = new Set([project.startNodeId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of edges)
      if (reachable.has(edge.from) && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        changed = true;
      }
  }
  return {
    nodes: project.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      reachable: reachable.has(n.id),
      condition: n.condition,
    })),
    edges,
    unreachable: project.nodes
      .filter((n) => !reachable.has(n.id))
      .map((n) => n.id),
    note: "静态连接可达性不保证运行条件下可通行；请在 Studio 预览验证剧情。",
  };
}
async function packageCommand(
  ctx: ProjectContext,
  action: string,
  options: Record<string, string | boolean>,
  signal: AbortSignal,
) {
  const packages = new ProjectPackages({
    validate: (p, c) => checkedProject(c, p).project,
    revision: (c) => revision(c.profile, c),
    snapshot,
  });
  let release: (() => void) | undefined;
  try {
    const current = readSnapshot(ctx);
    if (options["if-revision"])
      assertRevision(ctx, String(options["if-revision"]));
    let task;
    if (action === "export") {
      if (!options.out) throw failure("package export 需要 --out");
      release = acquireProjectWrite(ctx);
      task = packages.export(ctx, current.project, current.revision);
    } else {
      if (!options.file) throw failure("package import 需要 --file");
      task = await packages.upload(
        ctx,
        fs.createReadStream(path.resolve(String(options.file))),
      );
    }
    while (true) {
      if (signal.aborted) throw failure("操作已取消", "CANCELLED", 5);
      const state = packages.get(task.id);
      if (state.status === "ready") break;
      if (state.status === "failed" || state.status === "cancelled")
        throw failure(state.error ?? "工程包任务失败", "PACKAGE_FAILED", 1);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    const ready = packages.get(task.id);
    if (action === "import")
      return {
        ...(await packages.commit(ready, String(options.name ?? ""))),
        summary: ready.summary,
      };
    const destination = path.resolve(String(options.out));
    const checksum = destination + ".sha256";
    if (fs.existsSync(destination) || fs.existsSync(checksum))
      throw failure("输出文件已存在，拒绝覆盖", "IO", 5);
    let ownsDestination = false;
    try {
      const fd = fs.openSync(destination, "wx");
      ownsDestination = true;
      await pipeline(
        fs.createReadStream(path.join(ready.directory, "package.zip")),
        fs.createWriteStream(destination, { fd }),
        { signal },
      );
      fs.writeFileSync(
        checksum,
        `${ready.digest}  ${path.basename(destination)}\n`,
        { flag: "wx" },
      );
    } catch (error) {
      if (ownsDestination) fs.rmSync(destination, { force: true });
      throw error;
    }
    return {
      file: destination,
      checksum,
      sha256: ready.digest,
      summary: ready.summary,
    };
  } finally {
    release?.();
    await packages.dispose();
  }
}

export async function execute(args: string[], signal: AbortSignal) {
  const { group, action, options: o } = parse(args);
  const text = (key: string) =>
    typeof o[key] === "string" ? (o[key] as string) : undefined;
  const need = (key: string) =>
    text(key) ??
    (() => {
      throw failure(`需要 --${key}`);
    })();
  if (group === "help")
    return {
      commands,
      options: {
        ...Object.fromEntries([...valueOptions].map((key) => [key, "value"])),
        ...Object.fromEntries(
          [...booleanOptions].map((key) => [key, "boolean"]),
        ),
      },
      usage:
        "node scripts/magickisa.mjs <command> [action] --workspace <ID> [--data JSON|@file|-] [--json]",
      docs: "docs/CLI.md",
      protocolVersion: 1,
    };
  if (group === "schema")
    return z.toJSONSchema(
      action === "project" ? projectSchema : transactionSchema,
    );
  if (group === "project" && action === "list")
    return { projects: workspaces() };
  if (group === "project" && action === "create") {
    const ctx = createProject(need("name"));
    return readSnapshot(ctx);
  }
  const ctx = o.workspace
    ? projectContext("modern", text("workspace"))
    : undefined;
  if (group === "doctor") {
    if (o.recover) {
      const directory = path.resolve(need("lock"));
      const locks = inspectLocks(ctx);
      if (!locks.some((lock) => lock?.directory === directory))
        throw failure("仅允许恢复当前工程或已知服务锁");
      recoverLock(directory, need("token"));
    }
    return {
      node: process.versions.node,
      supported: Number(process.versions.node.split(".")[0]) >= 22,
      repository,
      locks: inspectLocks(ctx),
    };
  }
  if (!ctx)
    throw failure(
      "操作工程需要显式 --workspace <ID>；默认工程为 builtin-modern",
    );
  const current = readSnapshot(ctx),
    p = current.project;
  if (group === "project" && action === "show") return current;
  if (group === "validate") {
    const issues = diagnostics(p, "modern", ctx);
    if (issues.some((i) => i.severity === "error"))
      throw failure("工程校验失败", "VALIDATION", 1, { issues });
    return { valid: true, issues, revision: current.revision };
  }
  if (group === "graph") return graph(p);
  if (group === "refs")
    return {
      basis: "磁盘已保存工程，不含浏览器草稿",
      references: usages(p).filter(
        (r) => (!o.id || r.target === o.id) && (!o.kind || r.kind === o.kind),
      ),
    };
  if (group === "asset") {
    if (action === "list") return { files: listAssets(ctx) };
    const file = path.resolve(need("file"));
    return importAsset(
      ctx,
      text("name") ?? path.basename(file),
      fs.readFileSync(file),
    );
  }
  if (group === "package") return packageCommand(ctx, action!, o, signal);
  if (group === "build") {
    const job = startBuild(
      ctx,
      text("if-revision") ?? current.revision,
      (chunk) => process.stderr.write(chunk),
      signal,
    );
    await job.finished;
    return {
      output: job.output,
      revision: current.revision,
      status: job.status,
    };
  }
  if (group === "studio") {
    const { createServer, createLogger } = await import("vite");
    const server = await createServer({
      root: repository,
      configFile: path.join(repository, "vite.config.ts"),
      customLogger: createLogger("info", {
        allowClearScreen: false,
        console: new Console({
          stdout: process.stderr,
          stderr: process.stderr,
        }),
      }),
      server: { host: "127.0.0.1", port: 5173, open: false },
    });
    await server.listen();
    const address =
      server.httpServer!.address() as import("node:net").AddressInfo;
    const url = `http://127.0.0.1:${address.port}/engine.html?profile=modern&workspaceId=${ctx.id}`;
    process.stderr.write(`Studio: ${url}\nCtrl+C 停止服务\n`);
    if (!o["no-open"]) {
      const child =
        process.platform === "win32"
          ? spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
              windowsHide: true,
              stdio: "ignore",
            })
          : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
              stdio: "ignore",
            });
      child.on("error", () => {});
      child.unref();
    }
    try {
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
    } finally {
      await server.close();
    }
    return { url, stopped: true };
  }
  const selected = p.nodes.find((n) => n.id === text("scene"));
  if (
    ["scene", "line", "choice", "entity", "media"].includes(group) &&
    ["list", "show"].includes(action!)
  ) {
    if (["line", "choice"].includes(group) && !selected)
      throw failure("必须通过 --scene 指定存在的场景 ID");
    if (
      group === "entity" &&
      !["characters", "materials", "backdrops", "audio"].includes(
        need("collection"),
      )
    )
      throw failure("collection 必须是 characters/materials/backdrops/audio");
    if (
      group === "media" &&
      o.kind &&
      !["opening", "ending", "dedication"].includes(need("kind"))
    )
      throw failure("kind 必须是 opening/ending/dedication");
    const items =
      group === "scene"
        ? p.nodes
        : group === "line"
          ? selected?.lines
          : group === "choice"
            ? (selected?.choices ?? [])
            : group === "entity"
              ? p[need("collection") as "characters"]
              : undefined;
    if (group === "media")
      return o.kind ? (p.media[need("kind") as "opening"] ?? null) : p.media;
    if (!Array.isArray(items)) throw failure("目标场景或 collection 不存在");
    if (action === "list") return { items };
    const item = items.find((item) => item.id === need("id"));
    if (!item) throw failure("目标 ID 不存在");
    return item;
  }
  if (group === "script" && action?.startsWith("export")) {
    const data =
      action === "export"
        ? JSON.stringify(p, null, 2) + "\n"
        : exportMarkdown(p);
    return o.out
      ? { file: writeOutput(need("out"), data), revision: current.revision }
      : { content: action === "export" ? p : data, revision: current.revision };
  }
  let next = p,
    results: unknown[] = [],
    expected = text("if-revision") ?? current.revision;
  if (group === "script") {
    const source = o.file ? "@" + need("file") : need("data");
    next =
      action === "import"
        ? await jsonInput(source, signal)
        : importMarkdown(p, await input(source, signal));
  } else {
    let operations: Operation[];
    if (group === "edit") {
      const transaction = transactionSchema.parse(
        await jsonInput(o.file ? "@" + need("file") : need("data"), signal),
      );
      if (
        transaction.expectedRevision &&
        o["if-revision"] &&
        transaction.expectedRevision !== o["if-revision"]
      )
        throw failure("expectedRevision 与 --if-revision 不一致");
      expected = transaction.expectedRevision ?? expected;
      operations = transaction.operations;
    } else {
      const op: Record<string, unknown> = { op: `${group}.${action}` };
      for (const key of [
        "scene",
        "id",
        "collection",
        "target",
        "phase",
        "kind",
        "before",
        "after",
        "path",
      ])
        if (o[key] !== undefined) op[key] = o[key];
      if (o.index !== undefined) {
        if (!/^\d+$/.test(need("index"))) throw failure("index 必须为非负整数");
        op.index = Number(o.index);
      }
      if (o.data !== undefined)
        op.value = await jsonInput(need("data"), signal);
      if (o["text-file"] !== undefined) {
        if (
          !["line", "scene"].includes(group) ||
          !["add", "update"].includes(action!)
        )
          throw failure("--text-file 仅用于 scene/line add/update");
        const value = op.value ?? {};
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw failure("--text-file 需要对象 value");
        const content = fs
          .readFileSync(path.resolve(need("text-file")), "utf8")
          .replace(/^\uFEFF/, "");
        op.value =
          group === "line"
            ? { ...value, text: content }
            : {
                ...value,
                lines: content
                  .split(/\r?\n\s*\r?\n/)
                  .map((text) => ({ id: `line-${crypto.randomUUID()}`, text })),
              };
      }
      operations = [op as Operation];
    }
    const applied = applyOperations(p, operations);
    next = applied.project;
    results = applied.results;
  }
  signal.throwIfAborted();
  assertRevision(ctx, expected);
  let issues;
  try {
    ({ issues } = checkedProject(ctx, next));
  } catch (error) {
    if (error && typeof error === "object")
      Object.assign(error, {
        details: {
          operations: results.map((result, step) => ({ step, result })),
        },
      });
    throw error;
  }
  const changed = JSON.stringify(next) !== JSON.stringify(p);
  const summary = {
    workspaceId: ctx.id,
    changed,
    operations: results,
    scenes: next.nodes.length,
    lines: next.nodes.reduce((n, scene) => n + scene.lines.length, 0),
  };
  if (o["dry-run"] || !changed)
    return {
      ...summary,
      dryRun: !!o["dry-run"],
      revision: current.revision,
      issues,
    };
  return { ...summary, ...saveProject(ctx, next, expected) };
}

export async function main(args: string[]) {
  const json = args.includes("--json");
  const controller = new AbortController();
  const stop = () => controller.abort(failure("Cancelled", "CANCELLED", 5));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    const data = await execute(args, controller.signal);
    if (json)
      process.stdout.write(
        JSON.stringify({ protocolVersion: 1, ok: true, data }) + "\n",
      );
    else if (args[0] === "help" || !args.length || args.includes("--help"))
      process.stdout.write(
        "MAGICKISA CLI\n" +
          Object.entries(commands)
            .map(([name, actions]) => `  ${name} ${actions.join(" | ")}`)
            .join("\n") +
          "\n\n工程操作使用 --workspace ID；数据使用 --data JSON|@文件|-。\n完整用法：docs/CLI.md；Agent：docs/AGENT-GUIDE.md\n",
      );
    else if (data && typeof data === "object" && "changed" in data) {
      const summary = data as {
        changed: boolean;
        dryRun?: boolean;
        revision: string;
        operations: unknown[];
      };
      process.stdout.write(
        `${summary.dryRun ? "检查通过（未保存）" : summary.changed ? "已保存工程" : "没有内容变化"}：${summary.operations.length} 项操作\nrevision: ${summary.revision}\n`,
      );
    } else process.stdout.write(JSON.stringify(data ?? null, null, 2) + "\n");
  } catch (raw) {
    const error = raw as Error & {
      code?: string;
      exitCode?: number;
      details?: unknown;
      issues?: unknown;
      step?: number;
      operation?: unknown;
    };
    const code = error.exitCode
      ? error.code
      : raw instanceof z.ZodError
        ? "ARGUMENT"
        : error.code
          ? "IO"
          : error.step !== undefined
            ? "VALIDATION"
            : "EXECUTION";
    process.exitCode =
      error.exitCode ??
      (raw instanceof z.ZodError ? 2 : error.step !== undefined ? 1 : 5);
    const result = {
      protocolVersion: 1,
      ok: false,
      error: {
        code,
        message: error.message ?? String(raw),
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...(error.issues ? { issues: error.issues } : {}),
        ...(error.step !== undefined
          ? { step: error.step, operation: error.operation }
          : {}),
      },
    };
    if (json) process.stdout.write(JSON.stringify(result) + "\n");
    else
      process.stderr.write(
        `${code}: ${result.error.message}\n${error.issues ? JSON.stringify(error.issues, null, 2) + "\n" : ""}`,
      );
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
