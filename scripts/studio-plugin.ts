import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AuthorProject, Profile } from "../src/studio/model";
import { root } from "./content";
import {
  projectContext,
  workspaces,
  markOpened,
  contained,
  unsupportedWorkspaceCount,
} from "./workspaces";
import { ProjectPackages } from "./project-packages";
import {
  requireModernProfile,
  requireModernProject,
} from "../src/engine/support";
import {
  revision,
  validate,
  diagnostics,
  snapshot,
  saveProject,
  importAsset,
  startBuild,
  createProject,
  listAssets,
} from "./project-service";
import { acquireProjectWrite } from "./project-locks";
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileFor = (profile: Profile, ctx = projectContext(profile)) =>
  ctx.projectFile;
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
          attrs: {
            type: "module",
          },
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
            data: {
              path: payload.path,
            },
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
          res.writeHead(403).end(
            JSON.stringify({
              error: "只允许本机同源访问。",
            }),
          );
          return;
        }
        const url = new URL(req.url || "/", "http://localhost");
        let locked = "";
        let unlock: (() => void) | undefined;
        try {
          const profile = requireModernProfile(url.searchParams.get("profile"));
          const ctx = projectContext(
            profile,
            url.searchParams.get("workspaceId"),
          );
          if (req.method === "GET" && url.pathname === "/workspaces") {
            res.end(
              JSON.stringify({
                projects: workspaces(),
                unsupportedProjects: unsupportedWorkspaceCount(),
              }),
            );
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
              res.writeHead(409).end(
                JSON.stringify({
                  error: "当前项目正在写入，请稍后重试",
                }),
              );
              return;
            }
            unlock = acquireProjectWrite(ctx);
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
            const selectedProfile = requireModernProfile(
              routeMatch?.[1] || profile,
            );
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
              fs.createReadStream(file, {
                start,
                end,
              }).pipe(res);
            } else {
              res.setHeader("Content-Length", size);
              fs.createReadStream(file).pipe(res);
            }
            return;
          }
          if (req.method === "GET" && url.pathname === "/project") {
            markOpened(ctx);
            const project = read(fileFor(profile, ctx)) as AuthorProject;
            requireModernProject(project);
            const sections: { title: string; level: number; body: string }[] =
              [];
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
                job?.workspaceId === ctx.id
                  ? job
                  : {
                      status: "idle",
                      log: "",
                    },
              ),
            );
            return;
          }
          if (req.method === "GET" && url.pathname === "/assets") {
            const files = listAssets(ctx);
            res.end(
              JSON.stringify({
                files,
              }),
            );
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
            const created = createProject(data.name);
            res.end(
              JSON.stringify({
                id: created.id,
                profile,
                name: created.name,
              }),
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
              res.end(
                JSON.stringify({
                  cancelled: true,
                }),
              );
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
            fs.mkdirSync(directory, {
              recursive: true,
            });
            const child = spawn(
              process.platform === "win32"
                ? "explorer.exe"
                : process.platform === "darwin"
                  ? "open"
                  : "xdg-open",
              [directory],
              {
                windowsHide: true,
                stdio: "ignore",
              },
            );
            child.on("error", () => {});
            child.unref();
            res.end(
              JSON.stringify({
                directory,
              }),
            );
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
                  ? {
                      error: errors.map((i) => i.message).join("\n"),
                    }
                  : {}),
              }),
            );
            return;
          }
          if (url.pathname === "/project") {
            res.end(
              JSON.stringify(
                saveProject(ctx, data.project, data.revision, true),
              ),
            );
            return;
          }
          if (url.pathname === "/asset") {
            res.end(
              JSON.stringify(
                importAsset(
                  ctx,
                  data.name,
                  Buffer.from(data.base64 || "", "base64"),
                  true,
                ),
              ),
            );
            return;
          }
          if (url.pathname === "/build") {
            // The shared build service owns the cross-process build lock.
            unlock?.();
            unlock = undefined;
            const current = startBuild(ctx, data.revision);
            job = current;
            res.end(JSON.stringify(current));
            return;
          }
          res.writeHead(404).end(
            JSON.stringify({
              error: "接口不存在。",
            }),
          );
        } catch (e) {
          if (res.headersSent) {
            res.destroy();
            return;
          }
          res
            .writeHead(
              (
                e as {
                  status?: number;
                }
              ).status || 400,
            )
            .end(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
                ...((e as { issues?: unknown }).issues
                  ? { issues: (e as { issues: unknown }).issues }
                  : {}),
              }),
            );
        } finally {
          unlock?.();
          if (locked) writing.delete(locked);
        }
      });
    },
  };
}
