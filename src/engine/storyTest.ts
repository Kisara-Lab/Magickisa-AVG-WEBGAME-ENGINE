import { describeError } from "./errors";
import { z } from "zod";
import { assertProject, conditionSchema, valueSchema } from "./schema";
import { createSave, importSave, saveSchema } from "./save";
import { StoryRuntime } from "./runtime";
import { evaluateCondition, jsonEqual } from "./condition";
import type { Condition, EngineSave, StoryProject } from "./types";

const id = z.string().min(1);
export const storyTestStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advance"), line: id.optional() }).strict(),
  z.object({ action: z.literal("choose"), id }).strict(),
  z
    .object({ action: z.literal("input"), line: id, value: z.string() })
    .strict(),
  z.object({ action: z.literal("read"), id }).strict(),
  z.object({ action: z.literal("presentation.complete") }).strict(),
  z
    .object({
      action: z.literal("assert"),
      node: id.optional(),
      line: id.nullable().optional(),
      variables: z.record(id, valueSchema).optional(),
      choices: z.array(id).optional(),
      unlocked: z.array(id).optional(),
      read: z.array(id).optional(),
      endings: z.array(id).optional(),
      condition: conditionSchema.optional(),
    })
    .strict()
    .refine((s) => Object.keys(s).length > 1, "断言至少指定一项预期"),
]);
export const storyTestSchema = z
  .object({
    id,
    name: id,
    initialSave: saveSchema.optional(),
    initial: z
      .object({
        node: id.optional(),
        variables: z.record(id, valueSchema).default({}),
        visited: z.array(id).default([]),
        unlocked: z.array(id).default([]),
        read: z.array(id).default([]),
        usedChoices: z.array(id).default([]),
      })
      .strict()
      .optional(),
    steps: z.array(storyTestStepSchema).min(1).max(10000),
  })
  .strict()
  .refine(
    (t) => !(t.initial && t.initialSave),
    "initial 与 initialSave 不能同时指定",
  );
export const storyTestSuiteSchema = z
  .object({
    formatVersion: z.literal(1),
    tests: z.array(storyTestSchema).max(1000),
  })
  .strict()
  .refine(
    (s) => new Set(s.tests.map((t) => t.id)).size === s.tests.length,
    "测试 ID 重复",
  );
export type StoryTest = z.infer<typeof storyTestSchema>;
export interface StoryTestTrace {
  step: number;
  action: string;
  node: string;
  line: string | null;
  variables: Record<string, { before?: unknown; after?: unknown }>;
  choices: string[];
}
export interface StoryTestResult {
  id: string;
  name: string;
  passed: boolean;
  failure?: {
    step: number;
    message: string;
    node: string;
    line: string | null;
  };
  trace: StoryTestTrace[];
  coverage: {
    nodes: string[];
    lines: string[];
    choices: string[];
    endings: string[];
    conditions: { path: string; outcomes: boolean[] }[];
  };
}

export function runStoryTest(
  project: StoryProject,
  test: StoryTest,
): StoryTestResult {
  assertProject(project);
  test = storyTestSchema.parse(test);
  const initial = test.initialSave
    ? importSave(test.initialSave, project)
    : createSave(project);
  const seed = test.initial;
  if (seed) {
    initial.nodeId = seed.node ?? project.startNodeId;
    if (!project.nodes.some((n) => n.id === initial.nodeId))
      throw new Error("测试起点不存在");
    if (seed.visited.some((id) => !project.nodes.some((n) => n.id === id)))
      throw new Error("访问节点不存在");
    if (
      [...seed.unlocked, ...seed.read].some(
        (id) => !project.materials.some((m) => m.id === id),
      )
    )
      throw new Error("测试资料不存在");
    if (seed.read.some((id) => !seed.unlocked.includes(id)))
      throw new Error("已读资料必须已解锁");
    if (
      seed.usedChoices.some(
        (id) => !project.nodes.some((n) => n.choices?.some((c) => c.id === id)),
      )
    )
      throw new Error("测试分支不存在");
    initial.variables = {
      ...initial.variables,
      ...structuredClone(seed.variables),
    };
    initial.visitedNodes = [...new Set([initial.nodeId, ...seed.visited])];
    initial.unlockedMaterials = [...seed.unlocked];
    initial.readMaterials = [...seed.read];
    initial.usedChoices = [...seed.usedChoices];
  }
  // No persistence adapter, browser globals or wall-clock waits are involved.
  const conditionPaths = new WeakMap<Condition, string>();
  const outcomes = new Map<string, Set<boolean>>();
  const register = (condition: Condition | undefined, path: string) => {
    if (!condition) return;
    conditionPaths.set(condition, path);
    outcomes.set(path, new Set());
    if (condition.type === "not") register(condition.condition, `${path}/not`);
    if (condition.type === "all" || condition.type === "any")
      condition.conditions.forEach((c, i) =>
        register(c, `${path}/${condition.type}/${i}`),
      );
  };
  for (const node of project.nodes) {
    register(node.condition, `scene:${node.id}/condition`);
    for (const line of node.lines)
      register(line.condition, `line:${line.id}/condition`);
    for (const choice of node.choices ?? [])
      register(choice.condition, `choice:${choice.id}/condition`);
  }
  for (const material of project.materials)
    register(material.unlock, `material:${material.id}/unlock`);
  const runtime = new StoryRuntime(project, initial, (condition, result) => {
    const path = conditionPaths.get(condition);
    if (path) outcomes.get(path)!.add(result);
  });
  const nodes = new Set<string>(),
    lines = new Set<string>(),
    choices = new Set<string>();
  const trace: StoryTestTrace[] = [];
  let failure: StoryTestResult["failure"];
  const observe = () => {
    nodes.add(runtime.save.nodeId);
    if (runtime.line) lines.add(runtime.line.id);
  };
  observe();
  for (let index = 0; index < test.steps.length; index++) {
    const step = test.steps[index];
    const before = structuredClone(runtime.save.variables);
    try {
      if (step.action === "advance") {
        if (step.line && runtime.line?.id !== step.line)
          throw new Error(`当前台词不是 ${step.line}`);
        const old = JSON.stringify(runtime.save);
        runtime.advance();
        if (JSON.stringify(runtime.save) === old)
          throw new Error("无法推进：可能正在等待选择、输入、演出或门槛");
      } else if (step.action === "choose") {
        if (!runtime.choices.some((c) => c.id === step.id))
          throw new Error(`分支不可用：${step.id}`);
        runtime.choose(step.id);
        choices.add(step.id);
      } else if (step.action === "input") {
        if (runtime.line?.id !== step.line || !runtime.line.input)
          throw new Error("当前台词不是指定输入项");
        if (
          !step.value.trim() ||
          step.value.length > runtime.line.input.maxLength
        )
          throw new Error("输入为空或超长");
        runtime.setVariable(runtime.line.input.key, step.value);
      } else if (step.action === "read") {
        if (!runtime.save.unlockedMaterials.includes(step.id))
          throw new Error(`资料未解锁：${step.id}`);
        runtime.markRead(step.id);
      } else if (step.action === "presentation.complete") {
        if (runtime.save.sequence) {
          const sequence = project.sequences!.find(
            (s) => s.id === runtime.save.sequence!.id,
          )!;
          const trigger = runtime.save.sequence!.trigger;
          for (
            let i = 0;
            runtime.save.sequence?.id === sequence.id &&
            runtime.save.sequence?.trigger === trigger &&
            i <= sequence.waits.length + 1;
            i++
          ) {
            runtime.resumeSequence();
            runtime.tickSequence(sequence.duration);
          }
        } else {
          if (!runtime.save.presentation) throw new Error("没有正在播放的演出");
          runtime.finishPresentation();
        }
      } else {
        const check = (pass: boolean, label: string) => {
          if (!pass) throw new Error(`断言失败：${label}`);
        };
        if (step.node !== undefined)
          check(runtime.save.nodeId === step.node, `场景 ${step.node}`);
        if (step.line !== undefined)
          check((runtime.line?.id ?? null) === step.line, `台词 ${step.line}`);
        for (const [key, value] of Object.entries(step.variables ?? {}))
          check(jsonEqual(runtime.save.variables[key], value), `变量 ${key}`);
        if (step.choices)
          check(
            jsonEqual(
              runtime.choices.map((c) => c.id).sort(),
              [...step.choices].sort(),
            ),
            "可用分支集合",
          );
        for (const [field, expected] of [
          ["unlockedMaterials", step.unlocked],
          ["readMaterials", step.read],
          ["completedEndings", step.endings],
        ] as const)
          for (const value of expected ?? [])
            check(
              (runtime.save[field] as string[]).includes(value),
              `${field}: ${value}`,
            );
        if (step.condition)
          check(
            evaluateCondition(
              step.condition,
              runtime.save.variables,
              runtime.save.visitedNodes,
              runtime.save,
            ),
            "条件",
          );
      }
    } catch (error) {
      failure = {
        step: index + 1,
        message: describeError(error),
        node: runtime.save.nodeId,
        line: runtime.line?.id ?? null,
      };
    }
    observe();
    const variables: StoryTestTrace["variables"] = {};
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(runtime.save.variables),
    ]))
      if (!jsonEqual(before[key], runtime.save.variables[key]))
        variables[key] = {
          before: before[key],
          after: structuredClone(runtime.save.variables[key]),
        };
    trace.push({
      step: index + 1,
      action: step.action,
      node: runtime.save.nodeId,
      line: runtime.line?.id ?? null,
      variables,
      choices: runtime.choices.map((c) => c.id),
    });
    if (failure) break;
  }
  return {
    id: test.id,
    name: test.name,
    passed: !failure,
    ...(failure ? { failure } : {}),
    trace,
    coverage: {
      nodes: [...nodes],
      lines: [...lines],
      choices: [...choices],
      endings: [...runtime.save.completedEndings],
      conditions: [...outcomes].map(([path, values]) => ({
        path,
        outcomes: [...values].sort(),
      })),
    },
  };
}

export function runStorySuite(
  project: StoryProject,
  input: unknown,
  selected?: string,
) {
  const suite = storyTestSuiteSchema.parse(input);
  const tests = selected
    ? suite.tests.filter((t) => t.id === selected)
    : suite.tests;
  if (selected && !tests.length) throw new Error(`测试不存在：${selected}`);
  assertProject(project);
  const results = tests.map((test): StoryTestResult => {
    try {
      return runStoryTest(project, test);
    } catch (error) {
      return {
        id: test.id,
        name: test.name,
        passed: false,
        failure: {
          step: 0,
          message: describeError(error),
          node: test.initial?.node ?? project.startNodeId,
          line: null,
        },
        trace: [],
        coverage: {
          nodes: [],
          lines: [],
          choices: [],
          endings: [],
          conditions: [],
        },
      };
    }
  });
  return {
    passed: results.every((r) => r.passed),
    total: results.length,
    results,
    note: "覆盖报告只描述这些具体测试，不能证明所有条件下剧情均可通行。",
  };
}
