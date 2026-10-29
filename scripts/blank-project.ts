import { requireModernProfile } from "../src/engine/support";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function blankProject(profile: "modern", title = "未命名工程") {
  requireModernProfile(profile);
  return {
    schemaVersion: 3 as const,
    id: crypto.randomUUID(),
    title,
    version: "1.0.0",
    startNodeId: "scene-001",
    nodes: [
      {
        id: "scene-001",
        title: "新场景",
        speaker: "旁白",
        playable: true,
        lines: [{ id: "line-001", text: "" }],
      },
    ],
    materials: [],
    characters: [],
    backdrops: [],
    audio: [],
    resources: { assetsBase: "/assets", sceneRules: [] },
    media: { musicGallery: [], chapterMusic: {} },
    titleScreen: { overline: "MAGICKISA", studio: "Kisara-Lab" },
    ui: { labels: {}, enabled: {}, notifications: {} },
  };
}
export function initializeProject(
  directory: string,
  profile: "modern",
  title: string,
) {
  const project = blankProject(profile, title);
  const content = path.join(directory, "content");
  fs.mkdirSync(content, { recursive: true });
  fs.mkdirSync(path.join(directory, "public"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "project.json"),
    JSON.stringify(project, null, 2) + "\n",
  );

  return project;
}
export function defaultDirectory(profile: "modern") {
  requireModernProfile(profile);
  const directory = path.join(
    repositoryRoot,
    "workspace-projects",
    "default-modern-v3",
  );
  if (!fs.existsSync(path.join(directory, "project.json")))
    initializeProject(directory, profile, "空白工程 · 现代版");
  return directory;
}
