import test from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { blankProject } from "../scripts/blank-project";
import { resourceReferences } from "../scripts/content";
import { assertProject } from "../src/engine/schema";
import { StoryRuntime } from "../src/engine/runtime";
import { createSave } from "../src/engine/save";
import { importSave } from "../src/engine/save";
import { EngineStore } from "../src/engine/store";
import { ReleasePresentation } from "../src/engine/ReleasePresentation";
import {
  resolveImage,
  keywordMatches,
  materialCategory,
  isExternalResource,
} from "../src/engine/resource.js";
import { authorWarnings } from "../src/studio/authorWarnings";
import { registerPackagePath } from "../scripts/package-paths";
import {
  hasPlayerProgress,
  backupAndClearSlot,
} from "../src/engine/recovery.js";
test("portable package paths reject files colliding with directories in either order", () => {
  for (const names of [
    ["public/foo", "public/FOO/a"],
    ["public/FOO/a", "public/foo"],
    ["public/caf\u00e9/a", "public/cafe\u0301/a"],
  ]) {
    const paths = new Map<string, "file" | "directory">();
    registerPackagePath(paths, names[0]);
    assert.throws(() => registerPackagePath(paths, names[1]), /Unicode/);
  }
});
test("restart guards cover early progress; recovery preserves quota failures and concurrent updates", () => {
  assert.equal(
    hasPlayerProgress({
      history: [],
      playerNotes: "keep",
    }),
    true,
  );
  assert.equal(
    hasPlayerProgress({
      history: [],
      variables: {
        name: "player",
      },
    }),
    true,
  );
  assert.equal(
    hasPlayerProgress({
      history: [],
      variables: {},
    }),
    false,
  );
  let current: string | null = "old",
    fail = false;
  const storage = {
    getItem: () => current,
    setItem: () => {
      if (fail) throw new Error("quota");
      current = "newer-from-other-tab";
    },
    removeItem: () => {
      current = null;
    },
  };
  assert.throws(() => backupAndClearSlot(storage, "slot"));
  assert.equal(current, "newer-from-other-tab");
  fail = true;
  assert.throws(() => backupAndClearSlot(storage, "slot"), /quota/);
  assert.equal(current, "newer-from-other-tab");
});
test("resource IDs, literal paths and external URLs share validation/runtime resolution", () => {
  const p = assertProject(blankProject("modern"));
  p.characters = [
    {
      id: "hero",
      name: "Hero",
      portrait: "hero",
      expressions: {
        smile: "images/smile.webp",
      },
    },
  ];
  assert.ok(resourceReferences(p).includes("/assets/hero.png"));
  assert.ok(resourceReferences(p).includes("/images/smile.webp"));
  p.audio = [
    {
      id: "literal",
      src: "music/theme.mp3",
    },
  ];
  assert.ok(resourceReferences(p).includes("/music/theme.mp3"));
  assert.equal(resolveImage(p, "//cdn.example/a.png"), "//cdn.example/a.png");
  assert.ok(isExternalResource("HTTPS://example/a"));
  assert.equal(keywordMatches("anything", [""]), false);
  assert.equal(keywordMatches("Intro", ["", "Intro"]), true);
  assert.equal(materialCategory("evidence"), "clue");
  assert.equal(materialCategory("notes"), "note");
});
test("OP renderer tolerates both absent and empty subtitle arrays", () => {
  for (const opening of [
    undefined,
    {},
    {
      pages: [],
    },
  ]) {
    const p = assertProject(blankProject("modern"));
    p.media.opening = opening;
    assert.doesNotThrow(() =>
      renderToString(
        createElement(ReleasePresentation, {
          project: p,
          mode: "opening",
          time: 0,
          onSkip() {},
          resolveAsset: (s) => s,
        }),
      ),
    );
  }
});
test("read chapter jumps do not reapply onEnter and blocked chapters reject jumps", () => {
  const p = assertProject(blankProject("modern"));
  p.nodes[0].onEnter = [
    {
      type: "increment",
      key: "count",
      amount: 1,
    },
  ];
  const r = new StoryRuntime(p, createSave(p));
  r.jump(p.startNodeId);
  assert.equal(r.save.variables.count, 1);
  assert.equal(r.save.lineIndex, 0);
  p.nodes[0].condition = {
    type: "flag",
    key: "blocked",
  };
  assert.throws(() => r.jump(p.startNodeId), /条件/);
});
test("storage quota failure stays visible across gameplay and retry can recover", () => {
  const p = assertProject(blankProject("modern"));
  let fails = true,
    written = "";
  const store = new EngineStore(p, {
    storage: {
      getItem: () => null,
      setItem: (_k, v) => {
        if (fails) throw new Error("quota");
        written = v;
      },
    },
  });
  store.advance();
  assert.match(store.persistenceError, /quota/);
  store.setVariable("test", true);
  assert.match(store.persistenceError, /quota/);
  fails = false;
  store.retrySave();
  assert.equal(store.persistenceError, "");
  assert.ok(written);
});
test("new saves detect reordered positional lines in modern mode; old saves remain readable", () => {
  const p = assertProject(blankProject("modern"));
  p.nodes[0].lines.push({
    id: "second",
    text: "second",
  });
  const modern = createSave(p);
  p.nodes[0].lines.reverse();
  assert.throws(() => importSave(modern, p), /结构/);
  delete modern.contentLayout;
  assert.doesNotThrow(() => importSave(modern, p));
});
test("rollback retains player notes, achievements and collected/read materials", () => {
  const p = assertProject(blankProject("modern")),
    r = new StoryRuntime(p, createSave(p));
  r.advance();
  r.save.playerNotes = "keep";
  r.save.completedEndings = ["end"];
  r.save.unlockedMaterials = ["m"];
  r.save.readMaterials = ["m"];
  r.rollback(0);
  assert.equal(r.save.playerNotes, "keep");
  assert.deepEqual(r.save.completedEndings, ["end"]);
  assert.deepEqual(r.save.unlockedMaterials, ["m"]);
});
