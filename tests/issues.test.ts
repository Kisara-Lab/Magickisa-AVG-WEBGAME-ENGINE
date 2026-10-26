import test from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { StoryRuntime } from "../src/engine/runtime";
import { createSave, importSave, readSave, slotKey } from "../src/engine/save";
import * as release from "../src/compat/release/engine/index.js";
import {
  isMaterialAvailable,
  isMusicAvailable,
} from "../src/compat/release/engine/unlocks.js";
import {
  expressionReferences,
  sceneDeletionReferences,
} from "../src/studio/discovery";

test("release public ESM entry point has only implemented exports", () => {
  assert.equal(typeof release.EngineSession, "function");
  assert.equal(typeof release.importSave, "function");
  assert.equal("migrateLegacySave" in release, false);
});

function branchingProject() {
  const p = assertProject({
    ...blankProject("modern"),
    startNodeId: "start",
    nodes: [
      {
        id: "start",
        title: "Start",
        lines: [{ id: "a", text: "first" }],
        next: "end",
        choices: [
          {
            id: "c",
            label: "conditional",
            target: "end",
            condition: { type: "flag", key: "ready" },
          },
        ],
      },
      { id: "end", title: "End", lines: [{ id: "b", text: "end" }] },
    ],
  });
  return {
    ...p,
    media: { ...p.media },
    titleScreen: { ...p.titleScreen },
    ui: { ...p.ui },
  };
}

for (const mode of ["modern", "release"] as const) {
  const runtime = (p: ReturnType<typeof branchingProject>) =>
    mode === "modern"
      ? new StoryRuntime(p, createSave(p))
      : new release.StoryRuntime(
          p,
          release.createSave(p.startNodeId, "auto", p),
        );
  for (const reason of ["condition", "once"] as const) {
    test(`${mode}: ${reason}-filtered choices use next fallback`, () => {
      const p = branchingProject();
      if (reason === "once") {
        delete p.nodes[0].choices![0].condition;
        p.nodes[0].choices![0].once = true;
      }
      const r = runtime(p);
      if (reason === "once") r.save.usedChoices.push("c");
      r.advance();
      r.advance();
      assert.equal(r.save.nodeId, "end");
    });
  }
  test(`${mode}: available choices wait, blocked next and terminal nodes stay put`, () => {
    const p = branchingProject(),
      r = runtime(p);
    r.save.variables.ready = true;
    r.advance();
    r.advance();
    assert.equal(r.save.nodeId, "start");
    r.save.variables.ready = false;
    p.nodes[1].condition = { type: "flag", key: "blocked" };
    r.advance();
    assert.equal(r.save.nodeId, "start");
    delete p.nodes[0].next;
    r.advance();
    assert.equal(r.save.nodeId, "start");
  });
  test(`${mode}: completion effects are evaluated before fallback`, () => {
    const p = branchingProject();
    const effects = [{ type: "set" as const, key: "ready", value: true }];
    if (mode === "modern") p.nodes[0].onComplete = effects;
    else Object.assign(p.nodes[0], { effects });
    const r = runtime(p);
    r.advance();
    r.advance();
    assert.equal(r.save.nodeId, "start");
    assert.equal(r.choices[0].id, "c");
  });
  test(`${mode}: input requires nonempty bounded text without recording failed advances`, () => {
    const p = branchingProject();
    p.nodes[0].lines[0].input = { key: "name", label: "Name", maxLength: 8 };
    const r = runtime(p);
    for (const value of [undefined, "", "   ", "123456789", 42]) {
      if (value !== undefined) r.save.variables.name = value;
      r.advance();
      assert.equal(r.save.lineIndex, 0);
      assert.equal(r.save.history.length, 0);
    }
    r.save.variables.name = "小 明";
    r.advance();
    assert.equal(r.save.lineIndex, 1);
    assert.equal(r.save.variables.name, "小 明");
  });
}

test("modern save mismatch messages are actionable and reads preserve malformed originals", () => {
  const p = branchingProject(),
    save = createSave(p);
  assert.throws(
    () => importSave({ ...save, contentVersion: "old" }, p),
    /对应内容版本/,
  );
  assert.throws(() => importSave({ schemaVersion: 1 }, p), /发行兼容版/);
  const data = new Map([[slotKey(p.id), "{broken"]]);
  assert.throws(
    () =>
      readSave(p, "auto", {
        getItem: (k) => data.get(k) || null,
        setItem: () => assert.fail("read must not write"),
      }),
    /原数据未被覆盖/,
  );
  assert.equal(data.get(slotKey(p.id)), "{broken");
});

test("release saves isolate projects, preserve global keys, and validate all checkpoint positions", () => {
  const p = branchingProject(),
    other = { ...p, id: "other-project" };
  const data = new Map<string, string>([
    ["magickisa-avg:slot:auto", "legacy-original"],
  ]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    },
  });
  try {
    const first = new release.EngineSession(p);
    first.advance();
    const second = new release.EngineSession(other);
    assert.equal(second.save.lineIndex, 0);
    assert.equal(new release.EngineSession(p).save.lineIndex, 1);
    assert.equal(data.get("magickisa-avg:slot:auto"), "legacy-original");
    assert.throws(() => release.importSave(first.save, other), /其他工程/);
    assert.throws(
      () => release.importSave({ ...first.save, contentVersion: "old" }, p),
      /版本不一致/,
    );
    for (const patch of [
      { variables: null },
      { lineIndex: -1 },
      { lineIndex: 50 },
      { audio: { volume: "bad", muted: false } },
      { history: [{ ...first.save.history[0], nodeId: "missing" }] },
    ])
      assert.throws(() => release.importSave({ ...first.save, ...patch }, p));
    const legacy = release.createSave(p.startNodeId);
    assert.throws(() => release.importSave(legacy, p), /未绑定/);
    assert.equal(
      release.importSave(legacy, p, { allowUnbound: true }).projectId,
      p.id,
    );
    data.set(release.slotKey("auto", p.id), "{invalid");
    assert.throws(() => release.readSave("auto", p), /原数据未被覆盖/);
    assert.equal(data.get(release.slotKey("auto", p.id)), "{invalid");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("release material and music unlocks use stable IDs after reordering", () => {
  const p = branchingProject();
  p.nodes[0].id = "scene-custom";
  p.nodes[1].id = "node-000";
  p.nodes.reverse();
  const save = release.createSave("scene-custom", "auto", p);
  const material = { id: "m", title: "M", body: "", unlockNode: "node-000" };
  assert.equal(isMaterialAvailable(p, material, save), false);
  assert.equal(isMusicAvailable(material, save), false);
  save.visitedNodes.push("node-000");
  assert.equal(isMaterialAvailable(p, material, save), true);
  assert.equal(isMusicAvailable(material, save), true);
  assert.equal(
    isMaterialAvailable(
      p,
      { ...material, unlock: { type: "flag", key: "gate" } },
      save,
    ),
    false,
  );
  save.unlockedMaterials.push("m");
  assert.equal(
    isMaterialAvailable(p, { ...material, unlockNode: "never" }, save),
    true,
  );
});

test("deletion checks include recursive conditions, material/music unlocks and expression layers", () => {
  const p = branchingProject();
  p.nodes[0].condition = {
    type: "not",
    condition: {
      type: "all",
      conditions: [{ type: "visited", nodeId: "end" }],
    },
  };
  p.materials = [
    {
      id: "m",
      title: "M",
      body: "",
      category: "clue",
      unlockNode: "end",
      unlock: { type: "any", conditions: [{ type: "visited", nodeId: "end" }] },
    },
  ];
  p.media.musicGallery = [
    { id: "song", title: "Song", src: "", unlockNode: "end" },
  ];
  p.nodes[1].next = "end"; // Self-reference disappears with its owner.
  const refs = sceneDeletionReferences(p, "end");
  assert.ok(refs.some((r) => r.field === "场景条件"));
  assert.ok(refs.some((r) => r.field === "解锁场景"));
  assert.ok(refs.some((r) => r.field === "解锁条件"));
  assert.ok(refs.some((r) => r.field === "音乐解锁场景"));
  assert.equal(
    refs.some((r) => r.position.nodeId === "end"),
    false,
  );
  p.nodes[0].lines[0].characterId = "hero";
  p.nodes[0].lines[0].expression = "smile";
  p.nodes[0].lines[0].characterLayers = [
    { characterId: "hero", expression: "smile" },
    { characterId: "other", expression: "smile" },
  ];
  assert.equal(expressionReferences(p, "hero", "smile").length, 2);
  assert.equal(expressionReferences(p, "unused", "smile").length, 0);
});
