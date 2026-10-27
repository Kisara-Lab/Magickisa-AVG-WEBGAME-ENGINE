import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertProject, projectSchema } from "../src/engine/schema";
import type { AuthorProject, Profile } from "../src/studio/model";
import { root, projectFile, buildContent, resourceReferences } from "./content";
import { releaseContent, buildReleaseContent } from "./release-content";
import {
  projectContext,
  workspaces,
  createWorkspace,
  markOpened,
  contained,
  type ProjectContext,
} from "./workspaces";
import { ProjectPackages } from "./project-packages";
import { usages } from "../src/studio/discovery";
import { authorWarnings } from "../src/studio/authorWarnings";
import { issuePosition } from "../src/studio/issuePosition";
import type { EditorPosition } from "../src/studio/workspace";
import { isExternalResource, resourcePath } from "../src/engine/resource.js";
const digest = (value: string | Buffer) =>
  crypto.createHash("sha256").update(value).digest("hex");
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const nodeSchema = projectSchema.shape.nodes.element;
const releaseSchema = projectSchema
  .omit({ schemaVersion: true })
  .extend({
    nodes: z
      .array(
        nodeSchema
          .extend({
            choices: z
              .array(nodeSchema.shape.choices.unwrap().element.loose())
              .optional(),
          })
          .loose(),
      )
      .min(1),
    media: projectSchema.shape.media
      .extend({
        dedication: projectSchema.shape.media.shape.dedication
          .unwrap()
          .loose()
          .optional(),
      })
      .loose(),
  })
  .loose();
const fileFor = (profile: Profile, ctx = projectContext(profile)) =>
  ctx.projectFile;
function revision(profile: Profile, ctx = projectContext(profile)) {
  return digest(
    profile === "modern"
      ? fs.readFileSync(ctx.projectFile)
      : fs.readFileSync(ctx.projectFile, "utf8") +
          "\0" +
          fs
            .readdirSync(ctx.content)
            .sort()
            .map(
              (f) =>
                f + "\0" + fs.readFileSync(path.join(ctx.content, f), "utf8"),
            )
            .join("\0"),
  );
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
function validate(
  input: unknown,
  profile: Profile,
  warnings: string[] = [],
  ctx = projectContext(profile),
): AuthorProject {
  if (
    !input ||
    typeof input !== "object" ||
    (profile === "modern") !== ((input as AuthorProject).schemaVersion === 2)
  )
    throw new Error(
      "工程数据与运行模式不匹配；请打开正确工程，不能在 JSON 中切换运行模式。",
    );
  if (profile === "release") releaseSchema.parse(input);
  const p =
    profile === "modern" ? assertProject(input) : (input as AuthorProject);
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
    if (isExternalResource(ref) || /^(data|blob):/i.test(ref)) continue;
    const file = contained(
      publicRoot,
      "." + decodeURIComponent(ref.split(/[?#]/)[0]),
    );
    if (!file.startsWith(publicRoot + path.sep))
      throw new Error(`资源路径越界：${ref}`);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      const inlineLyrics =
        (ref === resourcePath(p.media.opening?.lyrics || "") &&
          p.media.opening?.pages?.length) ||
        (ref === resourcePath(p.media.ending?.lyrics || "") &&
          p.media.ending?.lines?.length);
      if (profile === "release" && inlineLyrics) {
        warnings.push(`歌词文件不存在：${ref}；演出将使用工程内的定时字幕。`);
        continue;
      }
      throw new Error(`资源不存在：${ref}`);
    }
  }
  return p;
}
function write(file: string, value: unknown) {
  fs.writeFileSync(file + ".tmp", JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(file + ".tmp", file);
}
interface StudioIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  lineId?: string;
  field?: string;
  position?: EditorPosition;
  path?: (string | number)[];
}
function diagnostics(
  input: unknown,
  profile: Profile,
  ctx = projectContext(profile),
): StudioIssue[] {
  const parsed = (
    profile === "modern" ? projectSchema : releaseSchema
  ).safeParse(input);
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
      position: { section: "project", items: {}, field: "起始场景" },
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
      { target: n.next, field: "next" },
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
  if (profile === "release")
    for (const material of p.materials)
      if (
        !material.unlockNode &&
        !material.unlock &&
        p.nodes.some((n) => n.title === material.title)
      )
        issues.push({
          code: "legacy-title-unlock",
          severity: "warning",
          message: `资料 ${material.title} 未设置解锁条件，兼容版沿用同名场景访问后解锁规则；建议明确设置解锁场景。`,
          field: "materials",
        });
  issues.push(...authorWarnings(p, profile));
  return issues;
}
function saveRelease(p: AuthorProject, ctx = projectContext("release")) {
  const before = read(fileFor("release", ctx)) as AuthorProject;
  if (isDeepStrictEqual(before, p)) return;
  const script = read(path.join(ctx.content, "script.json"));
  const old = new Map(
    before.nodes.map((n, i) => [
      n.id,
      { node: n, section: script.sections[i] },
    ]),
  );
  script.sections = p.nodes.map((n) => {
    const previous = old.get(n.id);
    return previous && JSON.stringify(previous.node) === JSON.stringify(n)
      ? previous.section
      : {
          ...previous?.section,
          title: n.title,
          level: n.sourceLevel || previous?.section.level || 2,
          body: n.lines.map((l) => l.text).join("\n\n"),
        };
  });
  script.lineCount = p.nodes.reduce((s, n) => s + n.lines.length, 0);
  script.charCount = p.nodes.reduce(
    (s, n) => s + n.lines.reduce((a, l) => a + l.text.length, 0),
    0,
  );
  // Each replacement is atomic; the caller restores the complete backup on failure.
  write(path.join(ctx.content, "script.json"), script);
  write(fileFor("release", ctx), p);
  if (ctx.projectFile !== path.join(ctx.content, "engine-story.json"))
    write(path.join(ctx.content, "engine-story.json"), p);
  buildReleaseContent(ctx.content, ctx.public);
}
function snapshot(p: AuthorProject, source: ProjectContext, directory: string) {
  const content = path.join(directory, "content"),
    publicRoot = path.join(directory, "public");
  fs.mkdirSync(content, { recursive: true });
  fs.mkdirSync(publicRoot, { recursive: true });
  if (source.profile === "modern") {
    buildContent(p as Parameters<typeof buildContent>[0], publicRoot, false);
    fs.cpSync(path.join(publicRoot, "content"), content, { recursive: true });
    fs.rmSync(path.join(publicRoot, "content"), { recursive: true });
  } else {
    fs.cpSync(source.content, content, { recursive: true });
    write(path.join(directory, "project.json"), read(source.projectFile));
    const target = {
      ...source,
      content,
      public: publicRoot,
      projectFile: path.join(directory, "project.json"),
    };
    saveRelease(p, target);
    buildReleaseContent(content, publicRoot);
    fs.rmSync(path.join(publicRoot, "content"), { recursive: true });
  }
  write(path.join(directory, "project.json"), p);
}
export function studioPlugin(): Plugin {
  let job: {
    id: string;
    profile: Profile;
    workspaceId: string;
    status: string;
    log: string;
    output?: string;
  } | null = null;
  return {
    name: "magickisa-studio",
    apply: "serve",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children:
            "if(import.meta.hot)import.meta.hot.on('magickisa:content',()=>{if(!['/engine.html','/studio-preview.html'].includes(location.pathname))location.reload();});",
          injectTo: "body",
        },
      ];
    },
    configureServer(server) {
      const packages = new ProjectPackages({
        validate: (p, ctx, warnings) => validate(p, ctx.profile, warnings, ctx),
        revision: (ctx) => revision(ctx.profile, ctx),
        snapshot,
      });
      const writing = new Set<string>();
      const send = server.ws.send.bind(server.ws);
      server.ws.send = ((
        payload: Parameters<typeof send>[0] | import("vite").HMRPayload,
        data?: unknown,
      ) => {
        if (typeof payload === "string") {
          send(payload, data);
          return;
        }
        if (
          payload.type === "full-reload" &&
          payload.path &&
          (/^\/(content|assets|music)\//.test(payload.path) ||
            payload.path === "/index.html")
        ) {
          // Regenerated content reloads the game; the studio applies its draft explicitly.
          send({
            type: "custom",
            event: "magickisa:content",
            data: { path: payload.path },
          });
          return;
        }
        send(payload);
      }) as typeof server.ws.send;
      server.middlewares.use("/__studio", async (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        const host = req.headers.host || "",
          origin = req.headers.origin;
        if (
          !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
          (origin && origin !== `http://${host}`)
        ) {
          res
            .writeHead(403)
            .end(JSON.stringify({ error: "只允许本机同源访问。" }));
          return;
        }
        const url = new URL(req.url || "/", "http://localhost"),
          profile: Profile =
            url.searchParams.get("profile") === "release"
              ? "release"
              : "modern";
        let locked = "";
        try {
          const ctx = projectContext(
            profile,
            url.searchParams.get("workspaceId"),
          );
          if (req.method === "GET" && url.pathname === "/workspaces") {
            res.end(JSON.stringify({ projects: workspaces() }));
            return;
          }
          if (req.method === "GET" && url.pathname.startsWith("/packages/")) {
            const [, , id, action] = url.pathname.split("/");
            const task = packages.get(id);
            if (task.workspaceId !== ctx.id)
              throw new Error("传输任务属于其他项目");
            if (action === "download" || action === "checksum")
              packages.download(task, res, action === "checksum");
            else res.end(JSON.stringify(packages.view(task)));
            return;
          }
          if (req.method === "POST" && url.pathname === "/packages/upload") {
            if (job?.status === "running")
              throw new Error("正在构建，请完成后再导入");
            res.end(JSON.stringify(await packages.upload(ctx, req)));
            return;
          }
          if (
            req.method === "POST" &&
            !["/validate", "/packages/cancel"].includes(url.pathname)
          ) {
            if (writing.has(ctx.id)) {
              res
                .writeHead(409)
                .end(JSON.stringify({ error: "当前项目正在写入，请稍后重试" }));
              return;
            }
            locked = ctx.id;
            writing.add(locked);
          }
          if (
            req.method === "GET" &&
            (url.pathname === "/file" || url.pathname.startsWith("/media/"))
          ) {
            const routeMatch =
              /^\/media\/(modern|release)(?:\/@([0-9a-f-]{36}))?(\/.*)$/.exec(
                decodeURIComponent(url.pathname),
              );
            const selectedProfile = routeMatch?.[1] || profile;
            const base = projectContext(
                selectedProfile as Profile,
                routeMatch?.[2] || url.searchParams.get("workspaceId"),
              ).public,
              ref = routeMatch?.[3] || url.searchParams.get("path") || "";
            const file = contained(base, "." + ref);
            if (
              !ref.startsWith("/") ||
              !file.startsWith(base + path.sep) ||
              !fs.existsSync(file) ||
              !fs.statSync(file).isFile()
            ) {
              res.writeHead(404).end();
              return;
            }
            const mime: Record<string, string> = {
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".webp": "image/webp",
              ".svg": "image/svg+xml",
              ".mp3": "audio/mpeg",
              ".wav": "audio/wav",
              ".ogg": "audio/ogg",
              ".lrc": "text/plain; charset=utf-8",
              ".json": "application/json",
              ".moc3": "application/octet-stream",
              ".bin": "application/octet-stream",
            };
            if (!mime[path.extname(file).toLowerCase()]) {
              res.writeHead(403).end();
              return;
            }
            res.setHeader(
              "Content-Type",
              mime[path.extname(file).toLowerCase()],
            );
            res.setHeader("Accept-Ranges", "bytes");
            const size = fs.statSync(file).size,
              match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
            if (match) {
              const start = Number(match[1]),
                end = match[2]
                  ? Math.min(Number(match[2]), size - 1)
                  : size - 1;
              if (start >= size || end < start) {
                res.writeHead(416).end();
                return;
              }
              res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${size}`,
                "Content-Length": end - start + 1,
              });
              fs.createReadStream(file, { start, end }).pipe(res);
            } else {
              res.setHeader("Content-Length", size);
              fs.createReadStream(file).pipe(res);
            }
            return;
          }
          if (req.method === "GET" && url.pathname === "/project") {
            markOpened(ctx);
            const project = read(fileFor(profile, ctx)) as AuthorProject;
            const sections =
              profile === "release"
                ? read(path.join(ctx.content, "script.json")).sections
                : [];
            res.end(
              JSON.stringify({
                project,
                revision: revision(profile, ctx),
                profile,
                workspaceId: ctx.id,
                directory: ctx.directory,
                output: ctx.output,
                source: path
                  .relative(root, ctx.projectFile)
                  .replaceAll("\\", "/"),
                sectionLevels: Object.fromEntries(
                  project.nodes.map((n, i) => [n.id, sections[i]?.level || 2]),
                ),
              }),
            );
            return;
          }
          if (req.method === "GET" && url.pathname === "/build") {
            res.end(
              JSON.stringify(
                job?.workspaceId === ctx.id ? job : { status: "idle", log: "" },
              ),
            );
            return;
          }
          if (req.method === "GET" && url.pathname === "/assets") {
            const base = ctx.public;
            const files = fs
              .readdirSync(base, { recursive: true })
              .filter(
                (f): f is string =>
                  typeof f === "string" &&
                  /\.(png|jpe?g|svg|webp|mp3|ogg|wav|lrc)$/i.test(f),
              )
              .map((f) => ({
                url: "/" + f.replaceAll("\\", "/"),
                bytes: fs.statSync(path.join(base, f)).size,
              }));
            res.end(JSON.stringify({ files }));
            return;
          }
          if (
            req.method !== "POST" ||
            !req.headers["content-type"]?.startsWith("application/json")
          ) {
            res.writeHead(405).end();
            return;
          }
          if (
            job?.status === "running" &&
            url.pathname !== "/packages/cancel"
          ) {
            res.writeHead(409).end(
              JSON.stringify({
                error: "正在构建，请完成后再保存或导入资源。",
              }),
            );
            return;
          }
          req.setEncoding("utf8");
          let body = "";
          for await (const chunk of req) {
            body += String(chunk);
            if (Buffer.byteLength(body) > 12 * 1024 * 1024)
              throw new Error("请求超过 12 MB。");
          }
          const data = JSON.parse(body);
          if (url.pathname === "/workspaces/create") {
            const created = createWorkspace(profile, data.name);
            res.end(
              JSON.stringify({ id: created.id, profile, name: created.name }),
            );
            return;
          }
          if (url.pathname === "/packages/check") {
            res.end(
              JSON.stringify(packages.check(ctx, data.project, data.revision)),
            );
            return;
          }
          if (url.pathname === "/packages/export") {
            res.end(
              JSON.stringify(packages.export(ctx, data.project, data.revision)),
            );
            return;
          }
          if (
            url.pathname === "/packages/cancel" ||
            url.pathname === "/packages/commit"
          ) {
            const task = packages.get(data.id);
            if (task.workspaceId !== ctx.id)
              throw new Error("传输任务属于其他项目");
            if (url.pathname.endsWith("cancel")) {
              await packages.cancel(task);
              res.end(JSON.stringify({ cancelled: true }));
            } else
              res.end(JSON.stringify(await packages.commit(task, data.name)));
            return;
          }
          if (url.pathname === "/open-directory") {
            if (
              data.target !== undefined &&
              data.target !== "project" &&
              data.target !== "backups"
            )
              throw new Error("不支持的目录类型。");
            const directory =
              data.target === "backups" ? ctx.backups : ctx.directory;
            fs.mkdirSync(directory, { recursive: true });
            const child = spawn(
              process.platform === "win32"
                ? "explorer.exe"
                : process.platform === "darwin"
                  ? "open"
                  : "xdg-open",
              [directory],
              { windowsHide: true, stdio: "ignore" },
            );
            child.on("error", () => {});
            child.unref();
            res.end(JSON.stringify({ directory }));
            return;
          }
          if (url.pathname === "/validate") {
            const issues = diagnostics(data.project, profile, ctx),
              errors = issues.filter((i) => i.severity === "error"),
              warnings = issues
                .filter((i) => i.severity === "warning")
                .map((i) => i.message);
            if (errors.length) res.statusCode = 400;
            res.end(
              JSON.stringify({
                valid: !errors.length,
                warnings,
                issues,
                ...(errors.length
                  ? { error: errors.map((i) => i.message).join("\n") }
                  : {}),
              }),
            );
            return;
          }
          if (url.pathname === "/project") {
            if (data.revision !== revision(profile, ctx)) {
              res.writeHead(409).end(
                JSON.stringify({
                  error: "工程文件已变化，请先导出草稿，再重新加载合并。",
                }),
              );
              return;
            }
            const p = validate(data.project, profile, [], ctx),
              backup = path.join(
                ctx.backups,
                `studio-${profile}-${Date.now()}-${crypto.randomUUID()}`,
              );
            fs.mkdirSync(backup, { recursive: true });
            const files =
              profile === "modern"
                ? [ctx.projectFile]
                : fs
                    .readdirSync(ctx.content)
                    .map((f) => path.join(ctx.content, f))
                    .concat([ctx.projectFile]);
            // Flat backups must reject root/content basename collisions before any write.
            for (const f of files)
              if (
                files.some(
                  (other) =>
                    other !== f &&
                    path.basename(other).toLowerCase() ===
                      path.basename(f).toLowerCase(),
                )
              )
                throw new Error(
                  "备份文件名冲突，请先重命名 content 内与工程根文件同名的文件。",
                );
            for (const f of files)
              fs.copyFileSync(f, path.join(backup, path.basename(f)));
            try {
              if (profile === "modern") {
                write(ctx.projectFile, p);
                buildContent(
                  p as Parameters<typeof buildContent>[0],
                  ctx.public,
                  ctx.id.startsWith("builtin-"),
                );
              } else saveRelease(p, ctx);
            } catch (error) {
              for (const f of files)
                fs.copyFileSync(path.join(backup, path.basename(f)), f);
              if (profile === "modern")
                buildContent(
                  read(ctx.projectFile),
                  ctx.public,
                  ctx.id.startsWith("builtin-"),
                );
              else buildReleaseContent(ctx.content, ctx.public);
              throw error;
            }
            res.end(
              JSON.stringify({
                revision: revision(profile, ctx),
                backup: path.relative(root, backup),
              }),
            );
            return;
          }
          if (url.pathname === "/asset") {
            if (
              typeof data.name !== "string" ||
              !/^[\p{L}\p{N} _.-]+\.(png|jpg|jpeg|webp|svg|mp3|ogg|wav|lrc)$/iu.test(
                data.name,
              ) ||
              data.name.includes("..") ||
              data.name.length > 150 ||
              typeof data.base64 !== "string"
            )
              throw new Error("资源文件名无效。");
            const bytes = Buffer.from(data.base64, "base64");
            if (!bytes.length || bytes.length > 8 * 1024 * 1024)
              throw new Error("资源为空或超过 8 MB。");
            const folder = path.join(ctx.public, "assets/imported");
            fs.mkdirSync(folder, { recursive: true });
            let name = data.name;
            const ext = path.extname(name),
              stem = name.slice(0, -ext.length);
            let i = 1;
            while (fs.existsSync(path.join(folder, name)))
              name = `${stem}-${i++}${ext}`;
            const file = path.join(folder, name);
            fs.writeFileSync(file + ".tmp", bytes);
            fs.renameSync(file + ".tmp", file);
            res.end(JSON.stringify({ url: "/assets/imported/" + name }));
            return;
          }
          if (url.pathname === "/build") {
            if (data.revision !== revision(profile, ctx)) {
              res.writeHead(409).end(
                JSON.stringify({
                  error: "工程已变化，请重新加载并保存后再构建。",
                }),
              );
              return;
            }
            validate(read(fileFor(profile, ctx)), profile, [], ctx);
            job = {
              id: crypto.randomUUID(),
              profile,
              workspaceId: ctx.id,
              status: "running",
              log: "",
              output:
                path.relative(root, ctx.output).replaceAll("\\", "/") + "/",
            };
            const current = job;
            const child = spawn(
              process.execPath,
              [
                path.join(root, "node_modules", "vite", "bin", "vite.js"),
                "build",
                ...(profile === "release" ? ["--mode", "release"] : []),
              ],
              {
                cwd: root,
                windowsHide: true,
                env: {
                  ...process.env,
                  NODE_ENV: "production",
                  MAGICKISA_BUILD_EDITOR: "0",
                  MAGICKISA_WORKSPACE: ctx.id,
                },
              },
            );
            for (const stream of [child.stdout, child.stderr])
              stream.on("data", (chunk) => {
                current.log = (current.log + String(chunk)).slice(-100000);
              });
            child.on("error", (e) => {
              current.status = "failed";
              current.log += String(e);
            });
            child.on("close", (code) => {
              current.status = code === 0 ? "complete" : "failed";
            });
            res.end(JSON.stringify(current));
            return;
          }
          res.writeHead(404).end(JSON.stringify({ error: "接口不存在。" }));
        } catch (e) {
          if (res.headersSent) {
            res.destroy();
            return;
          }
          res.writeHead((e as { status?: number }).status || 400).end(
            JSON.stringify({
              error: e instanceof Error ? e.message : String(e),
            }),
          );
        } finally {
          if (locked) writing.delete(locked);
        }
      });
    },
  };
}
