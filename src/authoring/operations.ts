import { describeError } from "../engine/errors";
import { randomId } from "../engine/id";
import { jsonEqual } from "../engine/condition";
import { z } from "zod";
import type { StoryProject } from "../engine/types";

export const operationSchema = z
  .object({
    op: z.enum([
      "project.update",
      "scene.add",
      "scene.update",
      "scene.remove",
      "scene.move",
      "scene.link",
      "line.add",
      "line.update",
      "line.remove",
      "line.move",
      "choice.add",
      "choice.update",
      "choice.remove",
      "choice.move",
      "condition.set",
      "condition.unset",
      "effect.add",
      "effect.update",
      "effect.remove",
      "effect.clear",
      "entity.add",
      "entity.update",
      "entity.remove",
      "media.set",
      "media.unset",
      "json.set",
      "json.remove",
      "json.test",
    ]),
    scene: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    collection: z
      .enum([
        "characters",
        "materials",
        "backdrops",
        "audio",
        "assets",
        "sequences",
        "gallery",
      ])
      .optional(),
    target: z.enum(["scene", "line", "choice", "material"]).optional(),
    phase: z.enum(["enter", "complete", "choice"]).optional(),
    kind: z.enum(["opening", "ending", "dedication"]).optional(),
    index: z.number().int().nonnegative().optional(),
    before: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
    path: z.string().optional(),
    value: z.unknown().optional(),
  })
  .strict();
export const transactionSchema = z
  .object({
    expectedRevision: z.string().min(1).optional(),
    operations: z.array(operationSchema).min(1).max(10000),
  })
  .strict();
export type Operation = z.infer<typeof operationSchema>;

export function safeData(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error(`禁止原型属性：${key}`);
    safeData(child);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("value 必须是 JSON 对象");
  safeData(value);
  return value as Record<string, unknown>;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`缺少 ${name}`);
  return value;
}
function find<T extends { id: string }>(items: T[], id: string | undefined): T {
  const item = items.find((item) => item.id === id);
  if (!item) throw new Error(`目标不存在：${id ?? "未指定 ID"}`);
  return item;
}
function position(items: { id: string }[], op: Operation): number {
  if ([op.before, op.after, op.index].filter((v) => v !== undefined).length > 1)
    throw new Error("before、after、index 只能指定一个");
  if (op.before !== undefined || op.after !== undefined) {
    const index = items.indexOf(find(items, op.before ?? op.after));
    return index + (op.after !== undefined ? 1 : 0);
  }
  const index = op.index ?? items.length;
  if (index > items.length) throw new Error("插入位置超出列表范围");
  return index;
}
function update(item: { id: string }, value: unknown) {
  const data = object(value);
  if (Object.hasOwn(data, "id") && data.id !== item.id)
    throw new Error("更新不能更改稳定 ID；请新增并显式调整引用");
  Object.assign(item, data);
}
export function pointer(
  root: unknown,
  path: string,
  action: "get" | "set" | "remove",
  value?: unknown,
): unknown {
  if (!path.startsWith("/"))
    throw new Error("path 必须为非空 RFC 6901 JSON Pointer");
  const parts = path
    .slice(1)
    .split("/")
    .map((part) => {
      if (/~(?![01])/u.test(part)) throw new Error("JSON Pointer 转义无效");
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("禁止原型路径");
      return key;
    });
  let current = root as Record<string, unknown>;
  for (let i = 0; i < parts.length; i++) {
    if (!current || typeof current !== "object")
      throw new Error("路径父项不是对象");
    const key = parts[i],
      last = i === parts.length - 1;
    if (Array.isArray(current)) {
      const index =
        key === "-" && last && action === "set"
          ? current.length
          : /^(0|[1-9]\d*)$/.test(key)
            ? Number(key)
            : NaN;
      if (
        !Number.isSafeInteger(index) ||
        index > current.length ||
        (index === current.length && !(last && action === "set"))
      )
        throw new Error("数组路径越界或无效");
      if (last) {
        if (action === "remove") return current.splice(index, 1)[0];
        if (action === "set") {
          safeData(value);
          current[index] = structuredClone(value);
          return value;
        }
        return current[index];
      }
      current = current[index];
    } else {
      if (!Object.hasOwn(current, key) && !(last && action === "set"))
        throw new Error(`路径不存在：${path}`);
      if (last) {
        if (action === "remove") {
          const old = current[key];
          delete current[key];
          return old;
        }
        if (action === "set") {
          safeData(value);
          current[key] = structuredClone(value);
          return value;
        }
        return current[key];
      }
      current = current[key] as Record<string, unknown>;
    }
  }
}

// All edits are made on a copy; references are checked after the whole transaction,
// allowing forward references and coordinated removals without intermediate writes.
export function applyOperations(input: StoryProject, operations: Operation[]) {
  let project = { ...input };
  const results: { op: string; id?: string }[] = [];
  operations.forEach((raw, step) => {
    try {
      const op = operationSchema.parse(structuredClone(raw));
      const [group, action] = op.op.split(".");
      // Clone only affected branches. A single line edit retains every other scene.
      if (group === "json") project = structuredClone(project);
      else if (group === "media") project.media = { ...project.media };
      else if (
        group === "entity" ||
        (group === "condition" && op.target === "material")
      ) {
        const key =
          group === "entity"
            ? required(op.collection, "collection")
            : "materials";
        (project as unknown as Record<string, unknown>)[key] = (
          project[key] ?? []
        ).map((item) => (item.id === op.id ? structuredClone(item) : item));
      } else if (
        ["scene", "line", "choice", "condition", "effect"].includes(group)
      ) {
        const sceneId = op.scene ?? op.id;
        project.nodes = project.nodes.map((n) => {
          if (n.id !== sceneId) return n;
          const result = { ...n };
          if (group === "line" || op.target === "line")
            result.lines = n.lines.map((l) => (l.id === op.id ? { ...l } : l));
          if (
            group === "choice" ||
            op.target === "choice" ||
            op.phase === "choice"
          )
            result.choices = (n.choices ?? []).map((c) =>
              c.id === op.id ? structuredClone(c) : c,
            );
          if (group === "effect" && op.phase === "enter")
            result.onEnter = structuredClone(n.onEnter ?? []);
          if (group === "effect" && op.phase === "complete")
            result.onComplete = structuredClone(n.onComplete ?? []);
          return result;
        });
      }
      const allowed: Record<string, string[]> = {
        project: ["value"],
        scene: ["id", "value", "before", "after", "index"],
        line: ["scene", "id", "value", "before", "after", "index"],
        choice: ["scene", "id", "value", "before", "after", "index"],
        condition: ["scene", "id", "target", "value"],
        effect: ["scene", "id", "phase", "index", "value"],
        entity: ["collection", "id", "value"],
        media: ["kind", "value"],
        json: ["path", "value"],
      };
      for (const key of Object.keys(op))
        if (key !== "op" && !allowed[group].includes(key))
          throw new Error(`${op.op} 不接受 ${key}`);
      if (
        !["add", "update", "set", "test", "link"].includes(action) &&
        Object.hasOwn(op, "value")
      )
        throw new Error(`${op.op} does not accept value`);
      if (
        ["scene", "line", "choice"].includes(group) &&
        !["add", "move"].includes(action) &&
        [op.before, op.after, op.index].some((value) => value !== undefined)
      )
        throw new Error(`${op.op} does not accept ordering fields`);
      if (op.op === "effect.clear" && op.index !== undefined)
        throw new Error("effect.clear does not accept index");
      if (["line", "choice"].includes(group)) required(op.scene, "scene");
      if (
        ["scene", "line", "choice", "entity"].includes(group) &&
        action !== "add"
      )
        required(op.id, "id");
      if (["update", "set", "test", "link"].includes(action))
        required(op.value, "value");
      safeData(op.value);
      let resultId = op.id;
      const node = () => find(project.nodes, op.scene ?? op.id);
      if (op.op === "project.update") {
        const data = object(op.value);
        for (const key of Object.keys(data))
          if (
            ![
              "title",
              "version",
              "startNodeId",
              "resources",
              "titleScreen",
              "ui",
              "theme",
              "variables",
              "id",
            ].includes(key)
          )
            throw new Error(
              `project.update 不接受 ${key}；结构修改请使用专用操作或 JSON Pointer`,
            );
        if (Object.hasOwn(data, "id") && data.id !== project.id)
          throw new Error("project.update 不能更改工程 ID");
        Object.assign(project, data);
      } else if (op.op.startsWith("json.")) {
        const path = required(op.path, "path");
        if (op.op === "json.test") {
          if (!jsonEqual(pointer(project, path, "get"), op.value))
            throw new Error(`测试失败：${path}`);
        } else
          pointer(
            project,
            path,
            op.op === "json.set" ? "set" : "remove",
            op.value,
          );
      } else if (op.op === "scene.link") {
        const target = node();
        if (op.value === null) delete target.next;
        else target.next = z.string().min(1).parse(op.value);
      } else if (/^(scene|line|choice|entity)\./.test(op.op)) {
        const [kind, action] = op.op.split(".");
        const items: { id: string }[] =
          kind === "scene"
            ? project.nodes
            : kind === "line"
              ? node().lines
              : kind === "choice"
                ? (node().choices ??= [])
                : project[required(op.collection, "collection")]!;
        if (action === "add") {
          const value = op.value === undefined ? {} : object(op.value);
          const id =
            op.id ??
            (typeof value.id === "string" ? value.id : `${kind}-${randomId()}`);
          if (value.id !== undefined && value.id !== id)
            throw new Error("value.id 与 id 不一致");
          if (items.some((item) => item.id === id))
            throw new Error(`重复 ID：${id}`);
          const defaults =
            kind === "scene"
              ? {
                  title: "新场景",
                  lines: [{ id: `line-${randomId()}`, text: "" }],
                }
              : kind === "line"
                ? { text: "" }
                : {};
          const item = { ...defaults, ...value, id };
          items.splice(position(items, op), 0, item);
          resultId = id;
        } else {
          const item = find(items, op.id);
          if (action === "update") update(item, op.value);
          else {
            const old = items.indexOf(item);
            items.splice(old, 1);
            if (action === "move") items.splice(position(items, op), 0, item);
          }
        }
      } else if (op.op.startsWith("condition.")) {
        const target =
          op.target === "material"
            ? find(project.materials, op.id)
            : op.target === "line"
              ? find(node().lines, op.id)
              : op.target === "choice"
                ? find(node().choices ?? [], op.id)
                : op.target === "scene"
                  ? node()
                  : undefined;
        if (!target) throw new Error("condition 操作必须指定 target");
        const key = op.target === "material" ? "unlock" : "condition";
        const writable = target as unknown as Record<string, unknown>;
        if (op.op === "condition.unset") delete writable[key];
        else writable[key] = required(op.value, "value");
      } else if (op.op.startsWith("effect.")) {
        const target =
          op.phase === "choice"
            ? find(node().choices ?? [], op.id)
            : op.phase === "enter" || op.phase === "complete"
              ? node()
              : undefined;
        if (!target)
          throw new Error(
            "effect 操作必须指定 phase: enter / complete / choice",
          );
        const key =
          op.phase === "choice"
            ? "effects"
            : op.phase === "enter"
              ? "onEnter"
              : "onComplete";
        const writable = target as unknown as Record<string, unknown[]>;
        const effects = (writable[key] ??= []);
        if (op.op === "effect.clear") writable[key] = [];
        else if (op.op === "effect.add") {
          const index = op.index ?? effects.length;
          if (index > effects.length) throw new Error("效果索引超出范围");
          effects.splice(index, 0, required(op.value, "value"));
        } else {
          const index = required(op.index, "index");
          if (index >= effects.length) throw new Error("效果索引超出范围");
          if (op.op === "effect.remove") effects.splice(index, 1);
          else effects[index] = required(op.value, "value");
        }
      } else if (op.op.startsWith("media.")) {
        const key = required(op.kind, "kind");
        if (op.op === "media.unset") delete project.media[key];
        else (project.media as Record<string, unknown>)[key] = object(op.value);
      }
      results.push({ op: op.op, ...(resultId ? { id: resultId } : {}) });
    } catch (error) {
      throw Object.assign(
        new Error(
          `操作 ${step + 1} (${raw.op})：${describeError(error)}`,
        ),
        { step, operation: raw },
      );
    }
  });
  return { project, results };
}
