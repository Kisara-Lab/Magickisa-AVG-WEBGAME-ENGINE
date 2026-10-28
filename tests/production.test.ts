import test from "node:test";
import assert from "node:assert/strict";
import {
  sequenceSchema,
  sequenceIssues,
  sampleSequence,
  sequenceVisualState,
  SequenceClock,
} from "../src/engine/sequence";
import { runStorySuite } from "../src/engine/storyTest";
import { blankProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { applyOperations } from "../src/authoring/operations";
import {
  changeRecord,
  applyPatches,
  appendHistory,
} from "../src/authoring/history";
import {
  replacementPlan,
  applyReplacements,
  editSelectedLines,
} from "../src/authoring/batch";
import { StoryRuntime } from "../src/engine/runtime";
import { createSave, importSave } from "../src/engine/save";
import {
  mapProjectResources,
  deploymentResource,
} from "../src/engine/projectResources";

test("resource mapping isolates preview and subpath builds without rewriting IDs or story text", () => {
  const p = assertProject(blankProject("modern"));
  p.assets = [{ id: "voice", kind: "audio", src: "assets/中文 配音.wav" }];
  p.nodes[0].lines[0].voice = "voice";
  p.nodes[0].lines[0].text = "/do-not-rewrite";
  p.sequences = [
    sequenceSchema.parse({
      id: "clip",
      name: "clip",
      duration: 1,
      tracks: [
        {
          id: "movie",
          target: "stage",
          kind: "video",
          asset: "/assets/scene.mp4",
          start: 0,
          duration: 1,
        },
      ],
    }),
  ];
  const mapped = mapProjectResources(p, (value) =>
    deploymentResource(value, "/games/story/"),
  );
  assert.equal(mapped.assets?.[0].src, "/games/story/assets/中文 配音.wav");
  assert.equal(mapped.nodes[0].lines[0].voice, "voice");
  assert.equal(mapped.nodes[0].lines[0].text, "/do-not-rewrite");
  assert.equal(
    mapped.sequences?.[0].tracks[0].asset,
    "/games/story/assets/scene.mp4",
  );
  assert.equal(p.assets[0].src, "assets/中文 配音.wav");
  assert.equal(
    deploymentResource("https://example.org/a.png", "/games/story/"),
    "https://example.org/a.png",
  );
});

test("batch line moves preserve stable IDs and advanced properties; copies remain independent", () => {
  const p = assertProject(blankProject("modern"));
  const source = p.nodes[0];
  source.lines = [
    { id: "a", text: "甲", condition: { type: "flag", key: "clue" } },
    { id: "b", text: "乙" },
    { id: "c", text: "丙" },
  ];
  p.nodes.push({ id: "target", title: "目标", lines: [] });
  const moved = editSelectedLines(p, source.id, ["a", "b"], "move", "target");
  assert.deepEqual(moved.nodes[1].lines, source.lines.slice(0, 2));
  assert.deepEqual(
    moved.nodes[0].lines.map((l) => l.id),
    ["c"],
  );
  assert.equal(source.lines.length, 3);
  const copy = editSelectedLines(p, source.id, ["a"], "copy");
  assert.notEqual(copy.nodes[0].lines[1].id, "a");
  assert.notEqual(copy.nodes[0].lines[1].condition, source.lines[0].condition);
  const down = editSelectedLines(p, source.id, ["a", "b"], "down");
  assert.deepEqual(
    down.nodes[0].lines.map((l) => l.id),
    ["c", "a", "b"],
  );
  assert.throws(
    () => editSelectedLines(p, source.id, ["missing"], "remove"),
    /重新选择/,
  );
});

test("one invalid test seed does not suppress other route results", () => {
  const p = assertProject(blankProject("modern"));
  const report = runStorySuite(p, {
    formatVersion: 1,
    tests: [
      {
        id: "invalid",
        name: "失效起点",
        initial: { node: "missing" },
        steps: [{ action: "advance" }],
      },
      {
        id: "valid",
        name: "正常路线",
        steps: [{ action: "assert", node: p.startNodeId }],
      },
    ],
  });
  assert.equal(report.total, 2);
  assert.equal(report.results[0].failure?.step, 0);
  assert.equal(report.results[1].passed, true);
});

test("sequence triggers restore safely, retain terminal stage and do not duplicate story effects", () => {
  const p = assertProject(blankProject("modern"));
  const node = p.nodes[0];
  p.sequences = [
    sequenceSchema.parse({
      id: "intro",
      name: "intro",
      duration: 2,
      waits: [1],
      tracks: [
        {
          id: "caption",
          kind: "text",
          target: "caption",
          text: "intro",
          start: 0,
          duration: 2,
        },
      ],
    }),
  ];
  node.enterSequence = "intro";
  node.lines[0].sequence = "intro";
  node.exitSequence = "intro";
  node.onEnter = [{ type: "increment", key: "visits", amount: 1 }];
  node.onComplete = [{ type: "increment", key: "finishes", amount: 1 }];
  const runtime = new StoryRuntime(p, createSave(p));
  assert.equal(runtime.save.sequence?.trigger, "enter");
  runtime.tickSequence(1);
  const restored = new StoryRuntime(p, importSave(runtime.save, p));
  assert.equal(restored.save.sequence?.waiting, 1);
  assert.equal(restored.save.variables.visits, 1);
  restored.resumeSequence();
  restored.tickSequence(1);
  assert.equal(restored.save.sequence?.trigger, `line:${node.lines[0].id}`);
  restored.skipSequence();
  assert.equal(restored.save.sequence, null);
  assert.equal(restored.save.terminalSequence, "intro");
  restored.advance();
  assert.equal(structuredClone(restored.save).sequence?.trigger, "exit");
  restored.skipSequence();
  assert.equal(restored.save.variables.finishes, undefined);
  restored.skipSequence();
  restored.advance();
  assert.equal(restored.save.variables.finishes, 1);
  const invalid = structuredClone(runtime.save);
  invalid.sequence!.trigger = "line:deleted";
  assert.throws(() => importSave(invalid, p), /触发位置/);
});

test("stage sampling follows time rather than inspector order and preserves independent camera channels", () => {
  const sequence = sequenceSchema.parse({
    id: "stage",
    name: "stage",
    duration: 4,
    tracks: [
      {
        id: "later",
        kind: "text",
        target: "caption",
        text: "later",
        start: 2,
        duration: 2,
      },
      {
        id: "first",
        kind: "text",
        target: "caption",
        text: "first",
        start: 0,
        duration: 2,
      },
      {
        id: "pan",
        kind: "camera",
        target: "stage",
        start: 0,
        duration: 4,
        properties: { x: [{ at: 0, value: 20 }] },
      },
      {
        id: "zoom",
        kind: "camera",
        target: "stage",
        start: 1,
        duration: 3,
        properties: { scale: [{ at: 0, value: 2 }] },
      },
    ],
  });
  assert.deepEqual(sequenceIssues(sequence), []);
  const before = JSON.stringify(sequence);
  const state = sequenceVisualState(sequence, 3);
  assert.equal(state.visual[0].track.text, "later");
  assert.equal(state.camera.x, 20);
  assert.equal(state.camera.scale, 2);
  assert.equal(JSON.stringify(sequence), before);
});

test("local transactions retain unrelated scene identity and patch history reverses grouped edits", () => {
  const p = assertProject(blankProject("modern"));
  p.nodes.push({
    id: "other",
    title: "other",
    lines: [{ id: "other-line", text: "keep" }],
  });
  const next = applyOperations(p, [
    {
      op: "line.update",
      scene: p.startNodeId,
      id: p.nodes[0].lines[0].id,
      value: { text: "first" },
    },
  ]).project;
  assert.equal(next.nodes[1], p.nodes[1]);
  assert.equal(p.nodes[0].lines[0].text, "");
  const later = applyOperations(next, [
    {
      op: "line.update",
      scene: p.startNodeId,
      id: p.nodes[0].lines[0].id,
      value: { text: "second" },
    },
  ]).project;
  const history = appendHistory(
    [changeRecord(p, next)],
    changeRecord(next, later),
    true,
  ).history;
  assert.equal(history.length, 1);
  const undo = applyPatches(later, history[0].backward);
  assert.deepEqual(undo, p);
  assert.equal(undo.nodes[1], p.nodes[1]);
  assert.deepEqual(applyPatches(undo, history[0].forward), later);
  const failed = JSON.stringify(p);
  assert.throws(() =>
    applyOperations(p, [
      {
        op: "line.update",
        scene: p.startNodeId,
        id: p.nodes[0].lines[0].id,
        value: { text: "bad" },
      },
      { op: "scene.remove", id: "missing" },
    ]),
  );
  assert.equal(JSON.stringify(p), failed);
});

test("replacement previews preserve IDs, reject stale rows and never replace resource paths", () => {
  const p = assertProject(blankProject("modern"));
  p.nodes[0].lines[0].text = "信件里的信件";
  p.nodes[0].background = "/信件.png";
  const rows = replacementPlan(p, "信件", "证词", { fields: ["text"] });
  const next = applyReplacements(p, rows);
  assert.equal(next.nodes[0].lines[0].text, "证词里的证词");
  assert.equal(next.nodes[0].background, "/信件.png");
  assert.equal(next.nodes[0].lines[0].id, p.nodes[0].lines[0].id);
  assert.throws(() => applyReplacements(next, rows), /过期/);
});

test("sequence sampling, waiting, restore and skip have deterministic terminal state", () => {
  const sequence = sequenceSchema.parse({
    id: "intro",
    name: "镜头",
    duration: 4,
    waits: [1],
    tracks: [
      {
        id: "camera",
        target: "stage",
        kind: "camera",
        start: 0,
        duration: 4,
        properties: {
          x: [
            { at: 0, value: 0 },
            { at: 4, value: 100 },
          ],
        },
      },
    ],
  });
  assert.deepEqual(sequenceIssues(sequence), []);
  assert.equal(sampleSequence(sequence, 2)[0].properties.x, 50);
  const clock = new SequenceClock(sequence);
  assert.equal(clock.tick(3), false);
  assert.deepEqual(clock.cursor, { time: 1, waiting: 1, finished: false });
  const restored = new SequenceClock(sequence, clock.cursor);
  assert.equal(restored.tick(3), false);
  restored.resume();
  assert.equal(restored.tick(3), true);
  assert.equal(restored.tick(1), false);
  assert.equal(restored.skip(), false);
  assert.equal(
    sampleSequence(sequence, restored.cursor.time)[0].properties.x,
    100,
  );
  assert.equal(clock.skip(), true);
  assert.equal(clock.skip(), false);
  assert.throws(
    () =>
      new SequenceClock(sequence, { time: 10, waiting: null, finished: false }),
  );
});

test("sequence rejects duplicate ownership and unordered/out-of-range keys", () => {
  const sequence = sequenceSchema.parse({
    id: "bad",
    name: "bad",
    duration: 4,
    tracks: [
      {
        id: "a",
        target: "stage",
        kind: "camera",
        start: 0,
        duration: 3,
        properties: {
          x: [
            { at: 2, value: 0 },
            { at: 1, value: 3 },
          ],
        },
      },
      {
        id: "b",
        target: "stage",
        kind: "camera",
        start: 2,
        duration: 3,
        properties: { x: [{ at: 0, value: 1 }] },
      },
    ],
  });
  const issues = sequenceIssues(sequence);
  assert.ok(issues.some((i) => i.message.includes("关键帧")));
  assert.ok(issues.some((i) => i.message.includes("超出")));
  assert.ok(issues.some((i) => i.message.includes("重复控制")));
});

test("declarative tests run real reading/material/choice effects and keep project untouched", () => {
  const base = blankProject("modern");
  const project = assertProject({
    ...base,
    materials: [{ id: "clue", title: "信件", body: "线索", category: "clue" }],
    nodes: [
      {
        id: "scene-001",
        title: "大厅",
        lines: [{ id: "line-001", text: "阅读信件" }],
        onComplete: [{ type: "increment", key: "score", amount: 1 }],
        choices: [
          {
            id: "solve",
            label: "解答",
            target: "end",
            condition: { type: "material", id: "clue", state: "read" },
            effects: [{ type: "increment", key: "score", amount: 2 }],
          },
        ],
      },
      {
        id: "end",
        title: "结束",
        lines: [],
        ending: "truth",
        condition: { type: "count", key: "score", operator: "gte", value: 3 },
      },
    ],
  });
  const before = JSON.stringify(project);
  const report = runStorySuite(project, {
    formatVersion: 1,
    tests: [
      {
        id: "solve",
        name: "解答路线",
        steps: [
          { action: "advance", line: "line-001" },
          { action: "assert", choices: [] },
          { action: "read", id: "clue" },
          { action: "assert", choices: ["solve"] },
          { action: "choose", id: "solve" },
          { action: "assert", node: "end", variables: { score: 3 } },
          { action: "advance" },
          { action: "assert", endings: ["truth"] },
        ],
      },
    ],
  });
  assert.equal(report.passed, true);
  assert.deepEqual(report.results[0].coverage.choices, ["solve"]);
  assert.deepEqual(report.results[0].trace[4].variables.score, {
    before: undefined,
    after: 3,
  });
  assert.equal(JSON.stringify(project), before);
  const failed = runStorySuite(project, {
    formatVersion: 1,
    tests: [
      { id: "bad", name: "失败", steps: [{ action: "choose", id: "solve" }] },
    ],
  });
  assert.equal(failed.passed, false);
  assert.equal(failed.results[0].failure?.step, 1);
  assert.equal(JSON.stringify(project), before);
});
