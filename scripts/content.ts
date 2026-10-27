import { defaultDirectory } from "./blank-project";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { assertProject, projectSchema } from "../src/engine/schema";
import type { StoryProject } from "../src/engine/types";
import {
  resolveImage,
  isExternalResource,
  resourcePath,
} from "../src/engine/resource.js";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const projectFile = path.join(
  defaultDirectory("modern"),
  "project.json",
);
export function resourceReferences(p: StoryProject): string[] {
  const asset = (s: string) => resolveImage(p, s);
  return [
    ...new Set(
      [
        ...p.backdrops.map((b) => b.src),
        ...p.audio.map((a) => a.src),
        ...p.characters.flatMap((c) => [
          c.portrait ? asset(c.portrait) : undefined,
          ...Object.values(c.expressions || {})
            .filter(Boolean)
            .map(asset),
          c.live2d?.model ? asset(c.live2d.model) : undefined,
        ]),
        ...p.nodes.flatMap((n) => (n.background ? [asset(n.background)] : [])),
        ...(p.resources.sceneRules || []).map((r) => asset(r.asset)),
        p.titleScreen.music,
        p.titleScreen.backdrop ? asset(p.titleScreen.backdrop) : undefined,
        p.media.opening?.audio,
        p.media.opening?.lyrics,
        ...(p.media.opening?.images || []).map(asset),
        p.media.ending?.audio,
        p.media.ending?.image ? asset(p.media.ending.image) : undefined,
        p.media.ending?.lyrics,
        ...Object.values(p.media.chapterMusic || {}),
        ...(p.media.musicGallery || []).map((m) => m.src),
      ]
        .filter((s): s is string => !!s)
        .map(resourcePath),
    ),
  ];
}
export function validateResources(p: StoryProject): void {
  const errors: string[] = [];
  for (const ref of resourceReferences(p)) {
    if (isExternalResource(ref) || /^(data|blob):/i.test(ref)) continue;
    const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
    const file = path.resolve(
      root,
      "workspace-projects/default-modern/public",
      "." + clean,
    );
    if (
      !file.startsWith(
        path.join(defaultDirectory("modern"), "public") + path.sep,
      )
    )
      errors.push(`资源路径越界：${ref}`);
    else if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      errors.push(`资源缺失：${ref}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}
export function readProject() {
  const p = assertProject(JSON.parse(fs.readFileSync(projectFile, "utf8")));
  validateResources(p);
  return p;
}
function atomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
export function buildContent(
  p = readProject(),
  publicRoot = path.join(defaultDirectory("modern"), "public"),
  writeSchema = true,
) {
  const dir = path.join(publicRoot, "content");
  atomic(
    path.join(dir, "engine-story.json"),
    JSON.stringify(p, null, 2) + "\n",
  );
  const sections = p.nodes.map((n) => ({
    id: n.id,
    title: n.title,
    level: n.sourceLevel || 2,
    body: n.lines.map((l) => l.text).join("\n\n"),
  }));
  atomic(
    path.join(dir, "script.json"),
    JSON.stringify(
      {
        source: "project.json",
        lineCount: p.nodes.reduce((sum, n) => sum + n.lines.length, 0),
        charCount: p.nodes.reduce(
          (sum, n) => sum + n.lines.reduce((s, l) => s + l.text.length, 0),
          0,
        ),
        sections,
      },
      null,
      2,
    ),
  );
  atomic(
    path.join(dir, "index.json"),
    JSON.stringify(
      {
        title: p.title,
        chapters: p.nodes
          .filter((n) => n.tags?.includes("chapter"))
          .map((n) => ({ id: n.id, title: n.title })),
        materials: p.materials,
      },
      null,
      2,
    ),
  );
  atomic(
    path.join(dir, "flow.json"),
    JSON.stringify(
      {
        nodes: p.nodes.map((n) => ({
          id: n.id,
          title: n.title,
          next: n.next,
          choices: n.choices || [],
        })),
      },
      null,
      2,
    ),
  );
  atomic(
    path.join(dir, "performance.json"),
    JSON.stringify(
      {
        dedication: p.media.dedication,
        opening: p.media.opening,
        ending: p.media.ending,
      },
      null,
      2,
    ),
  );
  if (writeSchema)
    atomic(
      path.join(root, "game/project.schema.json"),
      JSON.stringify(z.toJSONSchema(projectSchema), null, 2),
    );
  return p;
}
export function exportMarkdown(p: StoryProject): string {
  return (
    "# " +
    p.title +
    "\n\n" +
    p.nodes
      .map(
        (n) =>
          `## ${n.title}\n<!-- node:${n.id} -->\n\n` +
          n.lines.map((l) => `<!-- line:${l.id} -->\n${l.text}`).join("\n\n"),
      )
      .join("\n\n")
  );
}
export function importMarkdown(p: StoryProject, text: string): StoryProject {
  const next = structuredClone(p),
    known = new Map(
      next.nodes.flatMap((n) => n.lines.map((l) => [l.id, l] as const)),
    ),
    seen = new Set<string>();
  const blocks = [
    ...text.matchAll(
      /<!-- line:([^>]+) -->\r?\n([\s\S]*?)(?=\r?\n\r?\n<!-- line:|\r?\n\r?\n## |$)/g,
    ),
  ];
  for (const block of blocks) {
    const id = block[1].trim(),
      line = known.get(id);
    if (!line || seen.has(id)) throw new Error(`未知或重复台词 ID：${id}`);
    line.text = block[2].trimEnd();
    seen.add(id);
  }
  if (seen.size !== known.size)
    throw new Error("Markdown 缺少台词 ID；禁止猜测或丢弃内容。");
  return assertProject(next);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const command = process.argv[2] || "build";
  if (command === "validate") {
    const p = readProject();
    console.log(
      `内容校验通过：${p.nodes.length} 节点，${resourceReferences(p).length} 资源引用`,
    );
  } else if (command === "build") {
    buildContent();
    console.log("内容构建完成");
  } else if (command === "watch") {
    buildContent();
    fs.watchFile(projectFile, { interval: 500 }, () => {
      try {
        buildContent();
        console.log("内容已更新");
      } catch (e) {
        console.error(e);
      }
    });
  } else if (command === "export-markdown") {
    const dest = process.argv[3];
    if (!dest) throw new Error("需要输出路径");
    fs.writeFileSync(dest, exportMarkdown(readProject()));
  } else if (command === "import-markdown") {
    const src = process.argv[3];
    if (!src) throw new Error("需要输入路径");
    const p = importMarkdown(readProject(), fs.readFileSync(src, "utf8"));
    const backups = path.join(root, "backups");
    fs.mkdirSync(backups, { recursive: true });
    fs.copyFileSync(
      projectFile,
      path.join(backups, `project-${Date.now()}.json`),
    );
    atomic(projectFile, JSON.stringify(p, null, 2));
    buildContent(p);
  } else throw new Error("未知内容命令");
}
