import { z } from "zod";
import { valueSchema } from "../engine/schema";
import type { StoryProject } from "../engine/types";
import { createSave } from "../engine/save";
import { storyTestSchema } from "../engine/storyTest";
export const presetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    nodeId: z.string().min(1),
    phase: z.enum(["start", "completed"]),
    variables: z.record(z.string(), valueSchema),
    visitedNodes: z.array(z.string()),
    usedChoices: z.array(z.string()),
    unlockedMaterials: z.array(z.string()),
    readMaterials: z.array(z.string()),
  })
  .strict();
export const studioDataSchema = z
  .object({
    formatVersion: z.literal(2),
    tests: z.array(storyTestSchema).default([]),
    positions: z.record(
      z.string(),
      z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    ),
    variables: z.record(
      z.string(),
      z
        .object({
          label: z.string(),
          type: z.enum([
            "unknown",
            "string",
            "number",
            "boolean",
            "list",
            "object",
          ]),
          description: z.string(),
        })
        .strict(),
    ),
    presets: z
      .array(presetSchema)
      .refine(
        (items) => new Set(items.map((p) => p.id)).size === items.length,
        "测试预设 ID 重复",
      ),
  })
  .strict();
export type StudioData = z.infer<typeof studioDataSchema>;
export type TestPreset = z.infer<typeof presetSchema>;
export const emptyStudioData = (): StudioData => ({
  formatVersion: 2,
  tests: [],
  positions: {},
  variables: {},
  presets: [],
});
export function presetIssues(project: StoryProject, preset: TestPreset) {
  const nodes = new Set(project.nodes.map((n) => n.id)),
    materials = new Set(project.materials.map((m) => m.id)),
    choices = new Set(
      project.nodes.flatMap((n) => n.choices?.map((c) => c.id) ?? []),
    );
  const issues: string[] = [];
  if (!nodes.has(preset.nodeId))
    issues.push(`预设场景不存在：${preset.nodeId}`);
  for (const id of preset.visitedNodes)
    if (!nodes.has(id)) issues.push(`访问场景不存在：${id}`);
  for (const id of preset.usedChoices)
    if (!choices.has(id)) issues.push(`一次性分支不存在：${id}`);
  for (const id of [...preset.unlockedMaterials, ...preset.readMaterials])
    if (!materials.has(id)) issues.push(`资料不存在：${id}`);
  for (const id of preset.readMaterials)
    if (!preset.unlockedMaterials.includes(id))
      issues.push(`已阅读资料必须已解锁：${id}`);
  return issues;
}
export function presetSave(project: StoryProject, preset: TestPreset) {
  const issues = presetIssues(project, preset);
  if (issues.length) throw new Error(issues.join("\n"));
  const save = createSave(project, "studio-preview");
  Object.assign(save, {
    variables: structuredClone(preset.variables),
    visitedNodes: [...new Set([...preset.visitedNodes, preset.nodeId])],
    usedChoices: [...preset.usedChoices],
    unlockedMaterials: [...preset.unlockedMaterials],
    readMaterials: [...preset.readMaterials],
    nodeId: preset.nodeId,
    lineIndex:
      preset.phase === "completed"
        ? project.nodes.find((n) => n.id === preset.nodeId)!.lines.length
        : 0,
    entered: preset.phase === "completed",
    completed: preset.phase === "completed",
  });
  const node = project.nodes.find((n) => n.id === preset.nodeId)!;
  save.lineId =
    preset.phase === "completed" ? null : (node.lines[0]?.id ?? null);
  save.phase = save.lineId === null ? "exits" : "line";
  return save;
}
