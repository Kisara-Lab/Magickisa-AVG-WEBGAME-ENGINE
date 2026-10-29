import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { blankProject } from "../scripts/blank-project";
import { assertProject, validateProject } from "../src/engine/schema";
import { createSave, writeSave, importSave, slotKey } from "../src/engine/save";
import { StoryRuntime } from "../src/engine/runtime";
import { applyEffects } from "../src/engine/effects";
import { evaluateCondition } from "../src/engine/condition";
import { selectUnlockedMaterials } from "../src/engine/selectors";
import {
  PlayerSlots,
  memoryStorage,
  recoveryKey,
} from "../src/game/persistence";
import { readPreferences, preferenceKey } from "../src/game/preferences";
import { CollectionStore } from "../src/engine/collections";
import { authorWarnings } from "../src/studio/authorWarnings";
import { interpolate } from "../src/engine/interpolation";
import { featureEnabled, uiLabel } from "../src/engine/uiConfig";
import { absent, cell, flatten, merge } from "../scripts/authoring/merge";
import { lockInfo, acquireLock, recoverLock } from "../scripts/project-locks";
import {
  exportAuthoring,
  restoreAuthoring,
} from "../scripts/authoring/portable";
import type { ProjectContext } from "../scripts/workspaces";

const project = () => assertProject(blankProject("modern"));
test("#74 manual overwrite/delete/restore keeps independent backups; backup failure preserves slot", () => {
  const p = project(),
    storage = memoryStorage(),
    slots = new PlayerSlots(p, storage);
  const first = createSave(p);
  first.variables.route = "first";
  slots.write("manual-01", first);
  slots.write("manual-02", first);
  slots.write("manual-01", { ...first, variables: { route: "second" } });
  assert.equal(slots.recovery("manual-01")?.variables.route, "first");
  slots.remove("manual-01");
  assert.equal(slots.read("manual-01").save, null);
  assert.equal(slots.recovery("manual-01")?.variables.route, "second");
  slots.write("manual-01", slots.recovery("manual-01"));
  assert.equal(slots.read("manual-01").save?.variables.route, "second");
  assert.equal(slots.recovery("manual-02"), null);
  const before = storage.getItem(slotKey(p.id, "manual-01"));
  const fail = new PlayerSlots(p, {
    ...storage,
    setItem(k, v) {
      if (k === recoveryKey(p.id, "manual-01")) throw new Error("quota");
      storage.setItem(k, v);
    },
  });
  assert.throws(() => fail.write("manual-01", first), /quota/);
  assert.throws(() => fail.remove("manual-01"), /quota/);
  assert.equal(storage.getItem(slotKey(p.id, "manual-01")), before);
  storage.setItem(recoveryKey(p.id, "manual-01"), "broken");
  assert.equal(slots.recoveryEntry("manual-01").raw, "broken");
  assert.ok(slots.recoveryEntry("manual-01").error);
});
test("#82 invalid input declarations, nonfinite effects and saves fail before storage mutation", () => {
  const p = project(),
    n = p.nodes[0];
  p.variables = { count: { type: "number", initial: 0 } };
  n.lines[0].input = { key: "count", label: "计数", maxLength: 20 };
  assert.ok(validateProject(p).some((i) => i.path.endsWith("input.key")));
  const save = createSave(p),
    storage = memoryStorage();
  assert.throws(
    () =>
      applyEffects({ ...save, variables: { count: "abc" } }, [
        { type: "increment", key: "count", amount: 1 },
      ]),
    /有限数值/,
  );
  assert.throws(
    () =>
      applyEffects({ ...save, variables: { count: Number.MAX_VALUE } }, [
        { type: "increment", key: "count", amount: Number.MAX_VALUE },
      ]),
    /有限数值/,
  );
  assert.throws(() =>
    writeSave({ ...save, variables: { nested: [NaN] } }, storage),
  );
  assert.equal(storage.getItem(slotKey(p.id)), null);
  const good = applyEffects({ ...save, variables: { count: "2" } }, [
    { type: "increment", key: "count", amount: 1 },
  ]);
  writeSave(good, storage);
  assert.equal(
    importSave(JSON.parse(storage.getItem(slotKey(p.id))!), p).variables.count,
    3,
  );
});
test("#83 flag, contains and list mutations share JSON object equality without ignoring array order", () => {
  const a = { x: 1, y: [2, 3] },
    b = { y: [2, 3], x: 1 },
    save = createSave(project());
  assert.equal(
    evaluateCondition({ type: "flag", key: "x", equals: a }, { x: b }),
    true,
  );
  assert.equal(
    evaluateCondition({ type: "contains", key: "x", value: a }, { x: [b] }),
    true,
  );
  assert.equal(
    evaluateCondition(
      { type: "flag", key: "x", equals: [1, 2] },
      { x: [2, 1] },
    ),
    false,
  );
  const added = applyEffects({ ...save, variables: { items: [a] } }, [
    { type: "addToList", key: "items", value: b },
  ]);
  assert.deepEqual(added.variables.items, [a]);
  assert.deepEqual(
    applyEffects(added, [{ type: "removeFromList", key: "items", value: b }])
      .variables.items,
    [],
  );
});
test("#84 chapter review does not repeat effects, normal story revisits still do", () => {
  const p = project(),
    n = p.nodes[0];
  n.lines = [];
  n.next = "second";
  n.onComplete = [{ type: "increment", key: "count", amount: 1 }];
  p.nodes.push({ id: "second", title: "第二处", lines: [] });
  const runtime = new StoryRuntime(p, createSave(p));
  runtime.advance();
  assert.equal(runtime.save.variables.count, 1);
  runtime.jump(n.id);
  runtime.advance();
  assert.equal(runtime.save.variables.count, 1);
  // Actual narrative transitions start another visit and apply its effects.
  p.nodes[1].next = n.id;
  runtime.advance();
  runtime.advance();
  assert.equal(runtime.save.variables.count, 2);
});
test("#88 explicit material unlock stays visible after its automatic condition becomes false", () => {
  const p = project();
  p.materials = [
    {
      id: "clue",
      title: "线索",
      body: "正文",
      category: "clue",
      unlock: { type: "flag", key: "gate" },
    },
  ];
  const save = applyEffects(createSave(p), [
    { type: "unlockMaterial", id: "clue" },
    { type: "markRead", id: "clue" },
  ]);
  assert.deepEqual(
    selectUnlockedMaterials(p, save).map((m) => m.id),
    ["clue"],
  );
  assert.deepEqual(save.readMaterials, ["clue"]);
});
test("#85 collection recovery retries transient reads, backs up corruption and refuses failed rebuild", () => {
  const p = project(),
    storage = memoryStorage(),
    key = `magickisa-avg:collections:v1:${p.id}`;
  storage.setItem(key, "broken");
  const broken = new CollectionStore(p.id, storage);
  broken.reload();
  assert.equal(broken.needsRecovery, true);
  const failing = new CollectionStore(p.id, {
    ...storage,
    setItem() {
      throw new Error("quota");
    },
  });
  assert.throws(() => failing.rebuild(), /quota/);
  assert.equal(storage.getItem(key), "broken");
  broken.rebuild();
  assert.equal(storage.getItem(key + ":recovery"), "broken");
  assert.equal(broken.needsRecovery, false);
  assert.deepEqual(JSON.parse(storage.getItem(key)!).gallery, []);
  let denied = true;
  const transient = new CollectionStore(p.id, {
    ...storage,
    getItem(k) {
      if (denied) throw new Error("denied");
      return storage.getItem(k);
    },
  });
  assert.equal(transient.needsRecovery, true);
  denied = false;
  transient.reload();
  assert.equal(transient.needsRecovery, false);
});
test("#81 interpolation accepts surrounding spaces and exposes unknown/empty variables with locations", () => {
  const p = project();
  p.variables = { name: { type: "string", initial: "小明" } };
  p.nodes[0].lines[0].text = "你好 {{ name }} {{typo}} {{ }}";
  assert.equal(interpolate("你好 {{ name }}", { name: "小明" }), "你好 小明");
  const warnings = authorWarnings(p, "modern").filter(
    (i) => i.code === "unknown-interpolation",
  );
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].lineId, p.nodes[0].lines[0].id);
});
test("#89 unknown music unlock keys are rejected rather than silently removed", () => {
  const p = project();
  p.media.musicGallery = [
    {
      id: "song",
      title: "曲目",
      src: "/song.mp3",
      unlock: { type: "flag", key: "gate" },
    } as any,
  ];
  assert.ok(validateProject(p).some((i) => i.path.includes("musicGallery")));
  p.media.musicGallery = [
    { id: "song", title: "曲目", src: "/song.mp3" },
    { id: "song", title: "重复曲目", src: "/other.mp3" },
  ];
  assert.ok(
    validateProject(p).some((i) => i.message.includes("duplicate id: song")),
  );
});
test("#82 invalid projected numeric effects remain reportable without corrupting progress or history", () => {
  const p = project();
  p.nodes[0].lines = [];
  p.nodes[0].onComplete = [{ type: "increment", key: "count", amount: 1 }];
  const save = createSave(p);
  save.variables.count = "abc";
  const runtime = new StoryRuntime(p, save),
    before = structuredClone(runtime.save);
  assert.deepEqual(runtime.choices, []);
  assert.match(runtime.availabilityError, /有限数值/);
  assert.throws(() => runtime.advance(), /有限数值/);
  assert.deepEqual(runtime.save, before);
});
test("#90 player overrides retain the full author font size range", () => {
  const storage = memoryStorage();
  for (const size of [33, 36, 40]) {
    storage.setItem(
      preferenceKey("p"),
      JSON.stringify({ fontSize: size, volume: 0.4 }),
    );
    assert.equal(
      readPreferences(storage, "p", undefined, { fontSize: size }).fontSize,
      size,
    );
  }
});
test("#91 invalid public links block validation; safe relative and external links work", () => {
  const p = project();
  for (const url of ["https://", "javascript:alert(1)", "data:text/html,x"]) {
    p.titleScreen.footerLinks = [{ label: "作品", url }];
    assert.ok(validateProject(p).some((i) => i.path.endsWith(".url")));
  }
  for (const url of [
    "https://example.org/game",
    "/game/",
    "./about.html",
    "mailto:author@example.org",
  ]) {
    p.titleScreen.footerLinks = [{ label: "作品", url }];
    assert.deepEqual(validateProject(p), []);
  }
});
test("#92 labels and feature aliases have explicit consumers and unknown-key warnings", () => {
  const p = project();
  p.ui = {
    labels: { music: "曲库", load: "读档", typo: "??" },
    enabled: { musicGallery: false },
  };
  assert.equal(uiLabel(p, "music"), "曲库");
  assert.equal(uiLabel(p, "load"), "读档");
  assert.equal(featureEnabled(p, "music"), false);
  assert.ok(
    authorWarnings(p, "modern").some((i) => i.field === "ui.labels.typo"),
  );
});
test("#75 refused records preserve child baselines and remain visible until explicit adoption", () => {
  const origin = { module: "modules/story.json", field: "" },
    current = { nodes: [{ id: "n", title: "手工" }] };
  const entries = flatten({ nodes: [{ id: "n", title: "原稿" }] }, origin);
  const first = merge(current, entries, { formatVersion: 1, entries: {} }, [
    { path: "/nodes/@n", take: "current" },
  ]);
  assert.equal(first.project.nodes[0].title, "手工");
  assert.equal(first.nextEntries["/nodes/@n/title"], undefined);
  const state = {
    formatVersion: 1 as const,
    entries: first.nextEntries,
    refusals: first.nextRefusals,
  };
  const repeat = merge(current, entries, state, []);
  assert.equal(repeat.deferred.length, 1);
  assert.equal(repeat.project.nodes[0].title, "手工");
  const adopted = merge(current, entries, state, [
    { path: "/nodes/@n", take: "incoming" },
  ]);
  assert.equal(adopted.deferred.length, 0);
  assert.equal(adopted.project.nodes[0].title, "原稿");
  const removal = [
    { path: "/nodes/@n", mode: "remove" as const, cell: absent, origin },
  ];
  const rejected = merge(
    current,
    removal,
    {
      formatVersion: 1,
      entries: { "/nodes/@n": cell({ id: "n", title: "原稿" }) },
    },
    [{ path: "/nodes/@n", take: "current" }],
  );
  const retry = merge(
    current,
    removal,
    {
      formatVersion: 1,
      entries: rejected.nextEntries,
      refusals: rejected.nextRefusals,
    },
    [],
  );
  assert.equal(retry.deferred.length, 1);
  assert.equal(retry.changes.length, 0);
  assert.equal(
    merge(
      current,
      removal,
      {
        formatVersion: 1,
        entries: retry.nextEntries,
        refusals: retry.nextRefusals,
      },
      [{ path: "/nodes/@n", take: "incoming" }],
    ).project.nodes.length,
    0,
  );
});
test("#79 damaged ownership is actionable but never treated as evidence that a live process is absent", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "magickisa-lock-"));
  try {
    fs.writeFileSync(path.join(directory, "owner.json"), "{");
    assert.equal(lockInfo(directory)?.state, "unknown");
    assert.match(lockInfo(directory)?.recoveryHint ?? "", /离线/);
    assert.throws(() => recoverLock(directory, "null"), /无法证明/);
    assert.throws(() => acquireLock(directory));
    assert.equal(
      fs.readFileSync(path.join(directory, "owner.json"), "utf8"),
      "{",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("#76 portable authoring keeps edited Chinese/space documentation without raw sources", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "magickisa-文档 "));
  try {
    const ctx = { directory } as ProjectContext,
      home = path.join(directory, "authoring"),
      stage = path.join(directory, "stage");
    fs.mkdirSync(home);
    fs.mkdirSync(stage);
    fs.writeFileSync(
      path.join(home, "AGENTS.md"),
      "# 项目约定\n不要改写角色 ID。\n",
    );
    fs.writeFileSync(
      path.join(home, "README.md"),
      "# 接入说明\n作者定制内容。\n",
    );
    fs.writeFileSync(path.join(home, "private-source.txt"), "不应携带");
    const verify = exportAuthoring(ctx, stage, false);
    verify();
    restoreAuthoring(stage);
    for (const name of ["AGENTS.md", "README.md"])
      assert.equal(
        fs.readFileSync(path.join(stage, "authoring", name), "utf8"),
        fs.readFileSync(path.join(home, name), "utf8"),
      );
    assert.equal(
      fs.existsSync(path.join(stage, "authoring/private-source.txt")),
      false,
    );
    fs.appendFileSync(path.join(home, "AGENTS.md"), "changed");
    assert.throws(verify, /变化/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
