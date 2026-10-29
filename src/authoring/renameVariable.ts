import type { Condition, Effect, StoryProject } from "../engine/types";
import { assertProject } from "../engine/schema";
import {
  studioDataSchema,
  type StudioData,
} from "../studio/investigationModel";

/** Only semantic variable fields and supported dialogue interpolation are rewritten. */
export function renameVariable(
  project: StoryProject,
  authoring: StudioData,
  from: string,
  to: string,
) {
  if (
    !from ||
    !to ||
    from === to ||
    [from, to].some(
      (key) =>
        ["__proto__", "prototype", "constructor"].includes(key) ||
        /[{}\r\n]/.test(key),
    )
  )
    throw new Error("变量名称无效，或新旧名称相同");
  const p = structuredClone(project),
    data = structuredClone(authoring);
  const changes: { path: string; before: string; after: string }[] = [];
  const key = (value: string, path: string) => {
    if (value === to) throw new Error(`目标变量名已被使用：${path}`);
    if (value !== from) return value;
    changes.push({ path, before: from, after: to });
    return to;
  };
  const record = (map: Record<string, unknown> | undefined, path: string) => {
    if (!map) return;
    if (Object.hasOwn(map, to)) throw new Error(`目标变量名已被使用：${path}`);
    if (Object.hasOwn(map, from)) {
      map[to] = map[from];
      delete map[from];
      changes.push({ path: `${path}.${from}`, before: from, after: to });
    }
  };
  const condition = (c: Condition | undefined, path: string): void => {
    if (!c) return;
    if ("key" in c) c.key = key(c.key, `${path}.key`);
    if (c.type === "not") condition(c.condition, `${path}.condition`);
    if (c.type === "all" || c.type === "any")
      c.conditions.forEach((child, i) =>
        condition(child, `${path}.conditions.${i}`),
      );
  };
  const effects = (values: Effect[] | undefined, path: string) =>
    values?.forEach((effect, i) => {
      if ("key" in effect) effect.key = key(effect.key, `${path}.${i}.key`);
    });
  record(p.variables, "project.variables");
  for (const node of p.nodes) {
    const path = `nodes.${node.id}`;
    condition(node.condition, `${path}.condition`);
    effects(node.onEnter, `${path}.onEnter`);
    effects(node.onComplete, `${path}.onComplete`);
    for (const line of node.lines) {
      const field = `${path}.lines.${line.id}`;
      condition(line.condition, `${field}.condition`);
      if (line.input)
        line.input.key = key(line.input.key, `${field}.input.key`);
      line.text = line.text.replace(
        /\{\{([^}]+)\}\}/g,
        (match, name: string) =>
          name.trim() === from
            ? `{{${key(name.trim(), `${field}.text`)}}}`
            : match,
      );
    }
    for (const choice of node.choices ?? []) {
      condition(choice.condition, `${path}.choices.${choice.id}.condition`);
      effects(choice.effects, `${path}.choices.${choice.id}.effects`);
    }
  }
  p.materials.forEach((item) =>
    condition(item.unlock, `materials.${item.id}.unlock`),
  );
  p.gallery?.forEach((item) =>
    condition(item.unlock, `gallery.${item.id}.unlock`),
  );
  record(data.variables, "authoring.variables");
  data.presets.forEach((preset) =>
    record(preset.variables, `presets.${preset.id}.variables`),
  );
  data.tests.forEach((test) => {
    const path = `tests.${test.id}`;
    record(test.initial?.variables, `${path}.initial.variables`);
    record(test.initialSave?.variables, `${path}.initialSave.variables`);
    test.initialSave?.history.forEach((checkpoint, i) =>
      record(
        checkpoint.variables,
        `${path}.initialSave.history.${i}.variables`,
      ),
    );
    test.steps.forEach((step, i) => {
      if (step.action === "assert") {
        record(step.variables, `${path}.steps.${i}.variables`);
        condition(step.condition, `${path}.steps.${i}.condition`);
      }
    });
  });
  if (!changes.length) throw new Error("未找到该变量的声明或明确引用");
  return {
    project: assertProject(p),
    authoring: studioDataSchema.parse(data),
    changes,
  };
}
