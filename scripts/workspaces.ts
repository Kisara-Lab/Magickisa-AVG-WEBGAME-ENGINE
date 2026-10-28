import { defaultDirectory, initializeProject } from "./blank-project";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Profile } from "../src/studio/model";
import {
  requireModernProfile,
  requireModernProject,
  LEGACY_UNSUPPORTED,
} from "../src/engine/support";

export const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const workspaceRoot = path.join(repository, "workspace-projects");
export interface ProjectContext {
  id: string;
  profile: Profile;
  name: string;
  directory: string;
  content: string;
  public: string;
  projectFile: string;
  backups: string;
  output: string;
  lastOpened?: number;
}
export function projectContext(
  profile: Profile,
  id?: string | null,
): ProjectContext {
  requireModernProfile(profile);
  if (id === "builtin-release" || id === "default-release")
    throw new Error(LEGACY_UNSUPPORTED);
  if (!id || id === `builtin-${profile}`) {
    const directory = defaultDirectory(profile);
    const content = path.join(directory, "content");
    const projectFile = path.join(directory, "project.json");
    requireModernProject(JSON.parse(fs.readFileSync(projectFile, "utf8")));
    let lastOpened = 0;
    try {
      lastOpened =
        JSON.parse(
          fs.readFileSync(
            path.join(workspaceRoot, `builtin-${profile}.json`),
            "utf8",
          ),
        ).lastOpened || 0;
    } catch {
      /* Optional local metadata. */
    }
    return {
      id: `builtin-${profile}`,
      profile,
      name: JSON.parse(fs.readFileSync(projectFile, "utf8")).title,
      lastOpened,
      directory,
      content,
      projectFile,
      public: path.join(directory, "public"),
      backups: path.join(directory, "backups"),
      output: path.join(directory, "dist"),
    };
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("工作区 ID 无效");
  const directory = path.join(workspaceRoot, id);
  const info = JSON.parse(
    fs.readFileSync(path.join(directory, "workspace.json"), "utf8"),
  );
  if (info.id !== id || info.profile !== profile) {
    requireModernProfile(info.profile);
    throw new Error("工程运行模式不匹配");
  }
  requireModernProject(
    JSON.parse(fs.readFileSync(path.join(directory, "project.json"), "utf8")),
  );
  return {
    ...info,
    directory,
    content: path.join(directory, "content"),
    public: path.join(directory, "public"),
    projectFile: path.join(directory, "project.json"),
    backups: path.join(directory, "backups"),
    output: path.join(directory, "dist"),
  };
}
export function workspaces() {
  const projects = [projectContext("modern")];
  if (fs.existsSync(workspaceRoot))
    for (const id of fs.readdirSync(workspaceRoot)) {
      try {
        const info = JSON.parse(
          fs.readFileSync(
            path.join(workspaceRoot, id, "workspace.json"),
            "utf8",
          ),
        );
        projects.push(projectContext(info.profile, id));
      } catch {
        /* Incomplete staging directories are never listed. */
      }
    }
  return projects.map(({ id, profile, name, lastOpened, directory }) => ({
    id,
    profile,
    name,
    lastOpened: lastOpened || 0,
    directory,
  }));
}
export function unsupportedWorkspaceCount() {
  if (!fs.existsSync(workspaceRoot)) return 0;
  let count = 0;
  for (const id of fs.readdirSync(workspaceRoot)) {
    if (
      ["default-release", "default-modern"].includes(id) &&
      fs.existsSync(path.join(workspaceRoot, id, "project.json"))
    ) {
      count++;
      continue;
    }
    try {
      const info = JSON.parse(
        fs.readFileSync(path.join(workspaceRoot, id, "workspace.json"), "utf8"),
      );
      const file = path.join(workspaceRoot, id, "project.json");
      if (
        info.profile === "release" ||
        (fs.existsSync(file) &&
          JSON.parse(fs.readFileSync(file, "utf8")).schemaVersion !== 3)
      )
        count++;
    } catch {
      /* Other files are not workspace records. */
    }
  }
  return count;
}
export function markOpened(ctx: ProjectContext) {
  if (ctx.id.startsWith("builtin-")) {
    atomicJson(path.join(workspaceRoot, `${ctx.id}.json`), {
      lastOpened: Date.now(),
    });
    return;
  }
  atomicJson(path.join(ctx.directory, "workspace.json"), {
    id: ctx.id,
    profile: ctx.profile,
    name: ctx.name,
    lastOpened: Date.now(),
  });
}
export function atomicJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + `.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + "\n");
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
export function contained(base: string, ref: string) {
  if (fs.existsSync(base) && fs.lstatSync(base).isSymbolicLink())
    throw new Error("不支持符号链接");
  const file = path.resolve(base, ref);
  if (!file.startsWith(path.resolve(base) + path.sep))
    throw new Error("资源路径越界");
  let cursor = path.resolve(base);
  for (const part of path.relative(base, file).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink())
      throw new Error("不支持符号链接");
  }
  return file;
}

export function createWorkspace(profile: Profile, name: string) {
  requireModernProfile(profile);
  const title = typeof name === "string" ? name.trim() : "";
  if (!title || title.length > 100)
    throw new Error("Project name must be 1-100 characters");
  const id = crypto.randomUUID();
  const temporary = path.join(workspaceRoot, `.create-${id}`);
  const destination = path.join(workspaceRoot, id);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  try {
    initializeProject(temporary, profile, title);
    atomicJson(path.join(temporary, "workspace.json"), {
      id,
      profile,
      name: title,
      lastOpened: Date.now(),
    });
    fs.renameSync(temporary, destination);
    return projectContext(profile, id);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
