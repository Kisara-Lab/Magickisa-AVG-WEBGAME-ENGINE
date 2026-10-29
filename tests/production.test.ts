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
import { EngineStore } from "../src/engine/store";
import { RouteRecorder } from "../src/engine/routeRecorder";
import { CollectionStore } from "../src/engine/collections";
import { evaluateCondition } from "../src/engine/condition";

test("nested extension edits preserve event snapshots and chronological delivery", () => {
  const store = new EngineStore(assertProject(blankProject("modern")), {
    persist: false,
  });
  const seen: string[][] = [];
  let nested = false;
  store.subscribe(() => {
    if (!nested) {
      nested = true;
      store.setVariable("second", 2);
    }
  });
  store.subscribeEvents((event) => {
    seen.push(Object.keys(event.variables));
    if (event.variables.first) store.setVariable("third", 3);
  });
  store.setVariable("first", 1);
  assert.deepEqual(seen, [["first"], ["second"], ["third"]]);
  assert.deepEqual(store.save.variables, { first: 1, second: 2, third: 3 });
});

test("runtime node cache observes in-place node replacement and stable array reordering", () => {
  const project = assertProject(blankProject("modern"));
  const runtime = new StoryRuntime(project, createSave(project, "test"));
  const original = project.nodes[0];
  project.nodes[0] = { ...original, title: "修改后的标题" };
  assert.equal(runtime.node?.title, "修改后的标题");
  project.nodes.push({ id: "second", title: "第二场景", lines: [] });
  assert.equal(runtime.node?.id, original.id);
  project.nodes.reverse();
  assert.equal(runtime.node?.id, original.id);
});

test("condition observations reflect only evaluated short-circuit branches", () => {
  const first = { type: "flag" as const, key: "first" };
  const skipped = { type: "flag" as const, key: "skipped" };
  const root = { type: "all" as const, conditions: [first, skipped] };
  const observed: unknown[] = [];
  assert.equal(
    evaluateCondition(
      root,
      { first: false, skipped: true },
      [],
      {},
      (condition, result) => observed.push([condition, result]),
    ),
    false,
  );
  assert.deepEqual(observed, [
    [first, false],
    [root, false],
  ]);
});

test("audio envelopes support deterministic crossfades and reject invalid gain", () => {
  const sequence = sequenceSchema.parse({
    id: "mix",
    name: "交叉淡化",
    duration: 4,
    tracks: [
      {
        id: "a",
        target: "music-a",
        kind: "bgm",
        asset: "/a.ogg",
        start: 0,
        duration: 4,
        properties: {
          volume: [
            { at: 0, value: 1 },
            { at: 4, value: 0 },
          ],
        },
      },
      {
        id: "b",
        target: "music-b",
        kind: "bgm",
        asset: "/b.ogg",
        start: 0,
        duration: 4,
        properties: {
          volume: [
            { at: 0, value: 0 },
            { at: 4, value: 1 },
          ],
        },
      },
    ],
  });
  assert.deepEqual(sequenceIssues(sequence), []);
  assert.deepEqual(
    sampleSequence(sequence, 2).map((s) => s.properties.volume),
    [0.5, 0.5],
  );
  sequence.tracks[0].properties.volume![0].value = 2;
  assert(sequenceIssues(sequence).some((i) => i.path.includes("volume")));
});

test("gallery progress survives new playthroughs, preserves corrupt originals and keeps preview in memory", () => {
  const p = assertProject(blankProject("modern"));
  p.gallery = [
    {
      id: "cg",
      title: "真相",
      asset: "/cg.png",
      unlock: { type: "flag", key: "solved" },
    },
  ];
  const values = new Map<string, string>();
  let fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error("quota");
      values.set(key, value);
    },
  };
  const first = new EngineStore(p, { storage });
  first.setVariable("solved", true);
  first.reset();
  assert.equal(first.save.variables.solved, undefined);
  assert.deepEqual(first.collections.snapshot.gallery, ["cg"]);
  const second = new EngineStore(p, { storage });
  assert.deepEqual(second.collections.snapshot.gallery, ["cg"]);
  const before = new Map(values);
  const preview = new EngineStore(p, { storage, persist: false });
  preview.setVariable("solved", true);
  assert.deepEqual(values, before);
  const progress = new CollectionStore("new-project", storage);
  fail = true;
  progress.update(p, { ...first.save, variables: { solved: true } });
  assert.match(progress.error, /尚未保存/);
  assert.deepEqual(progress.snapshot.gallery, ["cg"]);
  fail = false;
  progress.update(p, first.save);
  assert.equal(progress.error, "");
  values.set(progress.key, "broken");
  const broken = new CollectionStore("new-project", storage);
  broken.update(p, first.save);
  assert.equal(values.get(progress.key), "broken");
  assert.match(broken.error, /原数据已保留/);
});

test("recorded preview actions replay from exact initial state without reapplying entry effects", () => {
  const p = assertProject(blankProject("modern"));
  p.nodes[0].onEnter = [{ type: "increment", key: "entered", amount: 1 }];
  p.nodes[0].lines = [
    {
      id: "input",
      text: "姓名",
      input: { key: "name", label: "姓名", maxLength: 20 },
    },
    { id: "reply", text: "你好" },
  ];
  p.nodes[0].choices = [
    { id: "repeat", label: "重新询问", target: p.startNodeId },
  ];
  const store = new EngineStore(p, { persist: false });
  const recorder = new RouteRecorder(store);
  store.setVariable("name", "小林");
  store.advance();
  store.advance();
  const recorded = recorder.stop("问询");
  assert.equal(recorded.initialSave?.variables.entered, 1);
  assert.equal(
    runStorySuite(p, { formatVersion: 1, tests: [recorded] }).passed,
    true,
  );
  const invalid = new RouteRecorder(store);
  store.setVariable("debug", true);
  assert.throws(() => invalid.stop("invalid"), /调试赋值/);
  let called = 0;
  store.subscribeEvents((event) => {
    event.after.node = "tampered";
    throw new Error("observer failed");
  });
  store.subscribeEvents((event) => {
    called++;
    assert.notEqual(event.after.node, "tampered");
  });
  store.setVariable("debug", false);
  assert.equal(called, 1);
  assert.equal(store.save.nodeId, p.startNodeId);
  assert.match(store.observerError, /observer failed/);
  store.destroy();
});
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
