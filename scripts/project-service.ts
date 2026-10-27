import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  beginCommit,
  finishCommit,
  recoverCommit,
  stateFile,
  assertNoPendingCommit,
  readState,
} from "./authoring/storage";
import type { SyncState } from "./authoring/model";
import { spawn } from "node:child_process";
import {
  acquireProjectWrite,
  acquireBuild,
  acquireRegistry,
  protectChild,
  buildLockPath,
} from "./project-locks";
import { atomicJson } from "./workspaces";
import { assertProject, projectSchema } from "../src/engine/schema";
import type { AuthorProject, Profile } from "../src/studio/model";
import { root, buildContent, resourceReferences } from "./content";
import {
  projectContext,
  createWorkspace,
  contained,
  type ProjectContext,
} from "./workspaces";
import { usages } from "../src/studio/discovery";
import { authorWarnings } from "../src/studio/authorWarnings";
import { issuePosition } from "../src/studio/issuePosition";
import type { EditorPosition } from "../src/studio/workspace";
import { isExternalResource } from "../src/engine/resource.js";
import { studioDataFile, readStudioData } from "./studio-data";
import { studioDataSchema } from "../src/studio/investigationModel";
import { requireModernProject } from "../src/engine/support";
const digest = (value: string | Buffer) =>
  crypto.createHash("sha256").update(value).digest("hex");
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileFor = (profile: Profile, ctx = projectContext(profile)) =>
  ctx.projectFile;
export function revision(profile: Profile, ctx = projectContext(profile)) {
  return digest(fs.readFileSync(ctx.projectFile));
}
function invalidReferences(p: AuthorProject) {
  const targets: Record<string, Set<string>> = {
    script: new Set(p.nodes.map((n) => n.id)),
    characters: new Set(p.characters.map((c) => c.id)),
    materials: new Set(p.materials.map((m) => m.id)),
    audio: new Set(p.audio.map((a) => a.id)),
  };
  return usages(p).filter(
    (ref) => targets[ref.kind] && !targets[ref.kind].has(ref.target),
  );
}
export function validate(
  input: unknown,
  profile: Profile,
  warnings: string[] = [],
  ctx = projectContext(profile),
): AuthorProject {
  requireModernProject(input);
  const p = assertProject(input);
  const ids = new Set(p.nodes.map((n) => n.id));
  for (const rule of p.media.chapterMusicRules || [])
    if (!Object.hasOwn(p.media.chapterMusic || {}, rule.track))
      throw new Error(`章节音乐规则引用不存在的标识：${rule.track}`);
  if (ids.size !== p.nodes.length) throw new Error("节点 ID 重复。");
  if (!ids.has(p.startNodeId))
    throw new Error(`起始场景不存在：${p.startNodeId}`);
  const lineIds = new Set<string>();
  for (const n of p.nodes) {
    for (const t of [n.next, ...(n.choices || []).map((c) => c.target)].filter(
      Boolean,
    ))
      if (!ids.has(t!)) throw new Error(`${n.id} 的目标 ${t} 不存在。`);
    for (const l of n.lines) {
      if (lineIds.has(l.id)) throw new Error(`台词 ID 重复：${l.id}`);
      lineIds.add(l.id);
    }
  }
  const publicRoot = ctx.public;
  for (const ref of invalidReferences(p))
    throw new Error(
      `${ref.label} 的${ref.field}引用了不存在的条目 ${ref.target}`,
    );
  for (const ref of resourceReferences(
    p as Parameters<typeof resourceReferences>[0],
  )) {
    if (/^blob:/i.test(ref))
      throw new Error(
        "浏览器临时 blob 资源不能保存或构建，请先上传素材：" + ref,
      );
    if (isExternalResource(ref) || /^data:/i.test(ref)) continue;
    const file = contained(
      publicRoot,
      "." + decodeURIComponent(ref.split(/[?#]/)[0]),
    );
    if (!file.startsWith(publicRoot + path.sep))
      throw new Error(`资源路径越界：${ref}`);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`资源不存在：${ref}`);
    }
  }
  return p;
}
function write(file: string, value: unknown) {
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(file + ".tmp", file);
}
export interface StudioIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  lineId?: string;
  field?: string;
  position?: EditorPosition;
  path?: (string | number)[];
}
export function diagnostics(
  input: unknown,
  profile: Profile,
  ctx = projectContext(profile),
): StudioIssue[] {
  try {
    requireModernProject(input);
  } catch (error) {
    return [
      {
        code: "unsupported-project",
        severity: "error",
        message: String(error),
        field: "schemaVersion",
      },
    ];
  }
  const parsed = projectSchema.safeParse(input);
  const p = input as AuthorProject;
  if (!parsed.success)
    return parsed.error.issues.map((issue) => {
      const path = issue.path,
        ni = path.indexOf("nodes"),
        li = path.indexOf("lines");
      const node = ni >= 0 ? p?.nodes?.[Number(path[ni + 1])] : undefined;
      return {
        code: issue.code,
        severity: "error",
        message: `${path.join(".")}：${issue.message}`,
        nodeId: node?.id,
        lineId: li >= 0 ? node?.lines?.[Number(path[li + 1])]?.id : undefined,
        field: String(path.at(-1) || ""),
        path: path.map((p) => (typeof p === "number" ? p : String(p))),
        position: issuePosition(
          p,
          path.map((p) => (typeof p === "number" ? p : String(p))),
        ),
      };
    });
  const issues: StudioIssue[] = [],
    ids = new Set(p.nodes.map((n) => n.id)),
    seen = new Set<string>();
  if (!ids.has(p.startNodeId))
    issues.push({
      code: "start",
      severity: "error",
      message: "起始场景不存在",
      field: "startNodeId",
      position: {
        section: "project",
        items: {},
        field: "起始场景",
      },
    });
  for (const n of p.nodes) {
    if (seen.has(n.id))
      issues.push({
        code: "duplicate",
        severity: "error",
        message: `场景 ID 重复：${n.id}`,
        nodeId: n.id,
        field: "id",
      });
    seen.add(n.id);
    for (const { target, field } of [
      {
        target: n.next,
        field: "next",
      },
      ...(n.choices || []).map((c, i) => ({
        target: c.target,
        field: `choices.${i}.target`,
      })),
    ].filter((entry) => entry.target))
      if (!ids.has(target!))
        issues.push({
          code: "target",
          severity: "error",
          message: `${n.title} 的目标 ${target} 不存在`,
          nodeId: n.id,
          field,
        });
  }
  for (const ref of invalidReferences(p)) {
    issues.push({
      code: "reference",
      severity: "error",
      message: `${ref.label} 的${ref.field}引用了不存在的条目 ${ref.target}`,
      nodeId: ref.position.nodeId,
      lineId: ref.position.lineId,
      field: ref.position.field,
      position: ref.position,
    });
  }
  if (!issues.length) {
    const warnings: string[] = [];
    try {
      validate(input, profile, warnings, ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const n = p.nodes.find(
        (n) =>
          message.includes(n.id) || n.lines.some((l) => message.includes(l.id)),
      );
      issues.push({
        code: "validation",
        severity: "error",
        message,
        nodeId: n?.id,
        lineId: n?.lines.find((l) => message.includes(l.id))?.id,
      });
    }
    issues.push(
      ...warnings.map((message) => ({
        code: "resource",
        severity: "warning" as const,
        message,
        field: "media",
      })),
    );
  }
  issues.push(...authorWarnings(p, profile));
  return issues;
}
export function snapshot(
  p: AuthorProject,
  source: ProjectContext,
  directory: string,
) {
  const content = path.join(directory, "content"),
    publicRoot = path.join(directory, "public");
  fs.mkdirSync(content, {
    recursive: true,
  });
  fs.mkdirSync(publicRoot, {
    recursive: true,
  });
  buildContent(p as Parameters<typeof buildContent>[0], publicRoot, false);
  fs.cpSync(path.join(publicRoot, "content"), content, { recursive: true });
  fs.rmSync(path.join(publicRoot, "content"), { recursive: true });
  write(path.join(directory, "project.json"), p);
}

export function readSnapshot(ctx: ProjectContext) {
  assertNoPendingCommit(ctx);
  const bytes = fs.readFileSync(ctx.projectFile);
  const project = JSON.parse(bytes.toString("utf8")) as AuthorProject;
  requireModernProject(project);
  return {
    project,
    revision: digest(bytes),
    workspaceId: ctx.id,
    directory: ctx.directory,
    output: ctx.output,
  };
}
export function createProject(name: string) {
  const unlock = acquireRegistry();
  try {
    return createWorkspace("modern", name);
  } finally {
    unlock();
  }
}
export function listAssets(ctx: ProjectContext) {
  return fs
    .readdirSync(ctx.public, { recursive: true })
    .filter(
      (f): f is string =>
        typeof f === "string" &&
        /\.(png|jpe?g|svg|webp|mp3|ogg|wav|lrc)$/i.test(f),
    )
    .map((f) => ({
      url: "/" + f.replaceAll("\\", "/"),
      bytes: fs.statSync(contained(ctx.public, f)).size,
    }));
}
export function assertRevision(ctx: ProjectContext, expected: string) {
  if (revision(ctx.profile, ctx) !== expected)
    throw Object.assign(
      new Error("工程文件已变化，请重新读取后合并；未覆盖磁盘工程。"),
      { status: 409, code: "REVISION_CONFLICT", exitCode: 3 },
    );
}
export function checkedProject(ctx: ProjectContext, input: unknown) {
  const issues = diagnostics(input, ctx.profile, ctx);
  if (issues.some((i) => i.severity === "error"))
    throw Object.assign(
      new Error(
        issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("\n"),
      ),
      { code: "VALIDATION", exitCode: 1, issues },
    );
  return { project: validate(input, ctx.profile, [], ctx), issues };
}
export function saveProject(
  ctx: ProjectContext,
  input: unknown,
  expected: string,
  alreadyLocked = false,
  syncState?: SyncState,
  studioUpdate?: { data: unknown; revision: string },
) {
  const unlock = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  try {
    assertRevision(ctx, expected);
    const studio = studioUpdate
      ? studioDataSchema.parse(studioUpdate.data)
      : undefined;
    if (studioUpdate && readStudioData(ctx).revision !== studioUpdate.revision)
      throw Object.assign(new Error("创作资料已变化，请重新读取后合并"), {
        status: 409,
        code: "REVISION_CONFLICT",
        exitCode: 3,
      });
    const coordinatedState = syncState ?? (studio ? readState(ctx) : undefined);
    const { project, issues } = checkedProject(ctx, input);
    const original = fs.readFileSync(ctx.projectFile);
    if (digest(original) !== expected) assertRevision(ctx, expected);
    const projectChanged =
      JSON.stringify(JSON.parse(original.toString("utf8"))) !==
      JSON.stringify(project);
    if (
      studio &&
      !projectChanged &&
      JSON.stringify(readStudioData(ctx).data) === JSON.stringify(studio) &&
      !syncState
    )
      return { revision: revision(ctx.profile, ctx), issues, backup: null };
    if (syncState && !studio && !projectChanged) {
      beginCommit(ctx, project, syncState);
      try {
        finishCommit(ctx, syncState);
      } catch (error) {
        recoverCommit(ctx);
        throw error;
      }
      return { revision: revision(ctx.profile, ctx), issues, backup: null };
    }
    const backup = path.join(
      ctx.backups,
      `studio-modern-${Date.now()}-${crypto.randomUUID()}`,
    );
    fs.mkdirSync(backup, { recursive: true });
    fs.writeFileSync(path.join(backup, "project.json"), original);
    if (fs.existsSync(studioDataFile(ctx)))
      fs.copyFileSync(studioDataFile(ctx), path.join(backup, "studio.json"));
    if (fs.existsSync(stateFile(ctx)))
      fs.copyFileSync(
        stateFile(ctx),
        path.join(backup, "authoring-state.json"),
      );
    if (coordinatedState) beginCommit(ctx, project, coordinatedState, studio);
    try {
      atomicJson(ctx.projectFile, project);
      buildContent(project, ctx.public, ctx.id.startsWith("builtin-"));
      if (coordinatedState) finishCommit(ctx, coordinatedState, studio);
    } catch (error) {
      if (coordinatedState) {
        recoverCommit(ctx);
        throw error;
      }
      // Authoritative JSON is restored byte for byte; generated content is disposable.
      fs.writeFileSync(ctx.projectFile + ".rollback", original);
      fs.renameSync(ctx.projectFile + ".rollback", ctx.projectFile);
      try {
        buildContent(JSON.parse(original.toString("utf8")), ctx.public, false);
      } catch {
        /* Keep the original failure and intact source. */
      }
      throw error;
    }
    return {
      revision: revision(ctx.profile, ctx),
      backup: path.relative(root, backup),
      issues,
    };
  } finally {
    unlock();
  }
}
export function importAsset(
  ctx: ProjectContext,
  name: string,
  bytes: Buffer,
  alreadyLocked = false,
) {
  if (
    typeof name !== "string" ||
    !/^[\p{L}\p{N} _.-]+\.(png|jpg|jpeg|webp|svg|mp3|ogg|wav|lrc)$/iu.test(
      name,
    ) ||
    name.includes("..") ||
    name.length > 150
  )
    throw Object.assign(new Error("资源文件名无效"), {
      code: "VALIDATION",
      exitCode: 1,
    });
  if (!bytes.length || bytes.length > 8 * 1024 * 1024)
    throw Object.assign(new Error("资源为空或超过 8 MB"), {
      code: "VALIDATION",
      exitCode: 1,
    });
  const unlock = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  try {
    const folder = contained(ctx.public, "assets/imported");
    fs.mkdirSync(folder, { recursive: true });
    const ext = path.extname(name),
      stem = name.slice(0, -ext.length);
    let unique = name,
      index = 1;
    while (fs.existsSync(path.join(folder, unique)))
      unique = `${stem}-${index++}${ext}`;
    const file = contained(ctx.public, `assets/imported/${unique}`);
    fs.writeFileSync(file, bytes, { flag: "wx" });
    return { url: `/assets/imported/${unique}`, bytes: bytes.length };
  } finally {
    unlock();
  }
}
export interface BuildJob {
  id: string;
  profile: Profile;
  workspaceId: string;
  status: string;
  log: string;
  output: string;
  finished: Promise<void>;
}
export function startBuild(
  ctx: ProjectContext,
  expected: string,
  onLog?: (text: string) => void,
  signal?: AbortSignal,
): BuildJob {
  const unlock = acquireBuild();
  try {
    assertRevision(ctx, expected);
    checkedProject(ctx, readSnapshot(ctx).project);
    const job = {
      id: crypto.randomUUID(),
      profile: ctx.profile,
      workspaceId: ctx.id,
      status: "running",
      log: "",
      output: path.relative(root, ctx.output).replaceAll("\\", "/") + "/",
    } as BuildJob;
    const child = spawn(
      process.execPath,
      [path.join(root, "node_modules/vite/bin/vite.js"), "build"],
      {
        cwd: root,
        windowsHide: true,
        signal,
        env: {
          ...process.env,
          NODE_ENV: "production",
          MAGICKISA_BUILD_EDITOR: "0",
          MAGICKISA_WORKSPACE: ctx.id,
        },
      },
    );
    let failure: Error | undefined;
    const finished = new Promise<void>((resolve, reject) => {
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          const text = String(chunk);
          job.log = (job.log + text).slice(-100000);
          onLog?.(text);
        });
      child.on("error", (error) => {
        failure = error;
        job.log += String(error);
      });
      child.on("close", (code) => {
        job.status = code === 0 && !failure ? "complete" : "failed";
        unlock();
        if (job.status === "complete") resolve();
        else
          reject(
            Object.assign(failure ?? new Error("发行构建失败"), {
              code: "BUILD_FAILED",
              exitCode: 5,
              details: { log: job.log },
            }),
          );
      });
    });
    // Register error/close handlers before recording the dependent process.
    // A metadata failure must terminate the child and retain the lock until close.
    try {
      if (child.pid) protectChild(buildLockPath, child.pid);
    } catch (error) {
      failure = error as Error;
      child.kill();
    }
    Object.defineProperty(job, "finished", {
      value: finished,
      enumerable: false,
    });
    // The HTTP caller observes status; CLI callers also await the same promise.
    void finished.catch(() => {});
    return job;
  } catch (error) {
    unlock();
    throw error;
  }
}
