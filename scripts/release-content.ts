import { defaultDirectory } from "./blank-project";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const releaseRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const releaseContent = path.join(defaultDirectory("release"), "content");
export function buildReleaseContent(
  content = releaseContent,
  publicRoot = path.join(defaultDirectory("release"), "public"),
) {
  const project = JSON.parse(
    fs.readFileSync(path.join(content, "engine-story.json"), "utf8"),
  );
  const script = JSON.parse(
    fs.readFileSync(path.join(content, "script.json"), "utf8"),
  );
  const ids = new Set<string>(project.nodes.map((n: { id: string }) => n.id));
  if (ids.size !== project.nodes.length || !ids.has(project.startNodeId))
    throw new Error("发行版内容节点或起点无效");
  if (script.sections.length !== project.nodes.length)
    throw new Error("发行版章节索引必须与节点顺序一致");
  for (const [i, n] of project.nodes.entries()) {
    if (script.sections[i].title !== n.title)
      throw new Error(`发行版第 ${i} 节标题与章节索引不同`);
    for (const target of [
      n.next,
      ...(n.choices || []).map((c: { target: string }) => c.target),
    ].filter(Boolean))
      if (!ids.has(target)) throw new Error(`发行版目标不存在：${target}`);
  }
  fs.cpSync(content, path.join(publicRoot, "content"), {
    recursive: true,
  });
  return project;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const p = buildReleaseContent();
  console.log(`发行版兼容内容：${p.nodes.length} 节点`);
}
