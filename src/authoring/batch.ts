import type { StoryProject } from "../engine/types";
import { applyOperations, type Operation } from "./operations";
import { validateProject } from "../engine/schema";
import { randomId } from "../engine/id";

export function editSelectedLines(
  project: StoryProject,
  scene: string,
  ids: string[],
  action: "copy" | "remove" | "up" | "down" | "move",
  target?: string,
) {
  const node = project.nodes.find((n) => n.id === scene);
  if (
    !node ||
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !node.lines.some((l) => l.id === id))
  )
    throw new Error("选中台词已变化，请重新选择。");
  const selected = new Set(ids),
    chosen = node.lines.filter((l) => selected.has(l.id));
  let lines = [...node.lines];
  if (action === "remove" || action === "move")
    lines = lines.filter((l) => !selected.has(l.id));
  if (action === "copy")
    lines = lines.flatMap((l) =>
      selected.has(l.id) ? [l, { ...structuredClone(l), id: randomId() }] : [l],
    );
  if (action === "up")
    for (let i = 1; i < lines.length; i++) {
      if (selected.has(lines[i].id) && !selected.has(lines[i - 1].id))
        [lines[i - 1], lines[i]] = [lines[i], lines[i - 1]];
    }
  if (action === "down")
    for (let i = lines.length - 2; i >= 0; i--) {
      if (selected.has(lines[i].id) && !selected.has(lines[i + 1].id))
        [lines[i], lines[i + 1]] = [lines[i + 1], lines[i]];
    }
  if (
    action === "move" &&
    (!target || target === scene || !project.nodes.some((n) => n.id === target))
  )
    throw new Error("请选择其他目标场景。");
  const result = {
    ...project,
    nodes: project.nodes.map((n) =>
      n.id === scene
        ? { ...n, lines }
        : action === "move" && n.id === target
          ? { ...n, lines: [...n.lines, ...chosen] }
          : n,
    ),
  };
  const issues = validateProject(result);
  if (issues.length)
    throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
  return result;
}

export type TextField = "text" | "speaker" | "label";
export interface Replacement {
  key: string;
  scene: string;
  id: string;
  field: TextField;
  before: string;
  after: string;
  operation: Operation;
}
export function replacementPlan(
  project: StoryProject,
  query: string,
  replacement: string,
  scope: { scene?: string; chapter?: string; fields: TextField[] },
) {
  if (!query) return [];
  const result: Replacement[] = [];
  for (const node of project.nodes) {
    if (
      (scope.scene && node.id !== scope.scene) ||
      (scope.chapter && node.chapter !== scope.chapter)
    )
      continue;
    const add = (
      id: string,
      field: TextField,
      before: string | undefined,
      group: "line" | "choice",
    ) => {
      if (
        before === undefined ||
        !scope.fields.includes(field) ||
        !before.includes(query)
      )
        return;
      const after = before.split(query).join(replacement);
      if (after === before) return;
      result.push({
        key: `${node.id}/${group}/${id}/${field}`,
        scene: node.id,
        id,
        field,
        before,
        after,
        operation: {
          op: `${group}.update`,
          scene: node.id,
          id,
          value: { [field]: after },
        },
      });
    };
    for (const line of node.lines) {
      add(line.id, "text", line.text, "line");
      add(line.id, "speaker", line.speaker, "line");
    }
    for (const choice of node.choices ?? [])
      add(choice.id, "label", choice.label, "choice");
  }
  return result;
}
export function applyReplacements(project: StoryProject, rows: Replacement[]) {
  for (const row of rows) {
    const node = project.nodes.find((n) => n.id === row.scene);
    const actual =
      row.field === "label"
        ? node?.choices?.find((c) => c.id === row.id)?.label
        : node?.lines.find((l) => l.id === row.id)?.[row.field];
    if (actual !== row.before)
      throw new Error(`替换方案已过期：${row.key}。请重新检查差异。`);
  }
  const result = applyOperations(
    project,
    rows.map((row) => row.operation),
  );
  const issues = validateProject(result.project);
  if (issues.length)
    throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
  return result.project;
}
