import test from "node:test";
import assert from "node:assert/strict";
import {
  absent,
  cell,
  flatten,
  get,
  merge,
  put,
} from "../scripts/authoring/merge";
import { manifestSchema, moduleSchema } from "../scripts/authoring/model";

const origin = { module: "modules/story.json", field: "" };
test("authoring module paths cannot alias metadata and unsupported scene fields are rejected", () => {
  for (const name of [
    "manifest.json",
    ".sync-state.json",
    "modules/../manifest.json",
    "modules\\story.json",
  ])
    assert.equal(
      manifestSchema.safeParse({ formatVersion: 1, modules: [name] }).success,
      false,
    );
  assert.equal(
    moduleSchema.safeParse({
      formatVersion: 1,
      nodes: [{ id: "n", executeScript: "user.js" }],
    }).success,
    false,
  );
});
test("source cells merge by stable ID, preserve local changes and acknowledge kept incoming revisions", () => {
  const first = {
    nodes: [{ id: "n", title: "A", lines: [{ id: "l", text: "base" }] }],
  };
  const entries = flatten(first, origin);
  const state = {
    formatVersion: 1 as const,
    entries: Object.fromEntries(entries.map((e) => [e.path, e.cell])),
    project: first,
  };
  const current = structuredClone(first);
  current.nodes[0].lines[0].text = "manual";
  const source = structuredClone(first);
  source.nodes[0].title = "B";
  const safe = merge(current, flatten(source, origin), state, []);
  assert.equal(safe.conflicts.length, 0);
  assert.equal(safe.project.nodes[0].title, "B");
  assert.equal(safe.project.nodes[0].lines[0].text, "manual");
  source.nodes[0].lines[0].text = "incoming";
  assert.equal(
    merge(current, flatten(source, origin), state, []).conflicts.length,
    1,
  );
  const kept = merge(current, flatten(source, origin), state, [
    { path: "/nodes/@n/lines/@l/text", take: "current" },
  ]);
  assert.equal(kept.project.nodes[0].lines[0].text, "manual");
  const repeat = merge(
    kept.project,
    flatten(source, origin),
    { ...state, entries: kept.nextEntries, project: kept.project },
    [],
  );
  assert.equal(repeat.conflicts.length, 0);
  assert.equal(repeat.changes.length, 0);
  const removal = merge(
    safe.project,
    [{ path: "/nodes/@n", mode: "remove", cell: absent, origin }],
    { ...state, entries: safe.nextEntries, project: safe.project },
    [],
  );
  assert.equal(
    removal.conflicts.length,
    1,
    "explicit deletion must detect manual values preserved by an earlier sync",
  );
});
test("manual deletion is retained until changed source explicitly resolves the missing stable target", () => {
  const source = { nodes: [{ id: "n", title: "A" }] },
    entries = flatten(source, origin);
  const state = {
    formatVersion: 1 as const,
    entries: Object.fromEntries(entries.map((e) => [e.path, e.cell])),
    project: source,
  };
  assert.deepEqual(merge({ nodes: [] }, entries, state, []).project, {
    nodes: [],
  });
  source.nodes[0].title = "B";
  assert.equal(
    merge({ nodes: [] }, flatten(source, origin), state, []).conflicts[0]
      .reason,
    "deleted-in-project",
  );
  const restored = merge(
    { nodes: [] as { id: string; title: string }[] },
    flatten(source, origin),
    state,
    [{ path: "/nodes/@n", take: "incoming" }],
  );
  assert.equal(restored.project.nodes[0].title, "B");
});
test("ED subtitles remain an atomic non-ID array, stable paths escape IDs and block prototype access", () => {
  const subtitles = [{ at: 0, zh: "字幕", en: "Caption" }];
  assert.ok(
    flatten({ media: { ending: { lines: subtitles } } }, origin).some(
      (e) => e.path === "/media/ending/lines",
    ),
  );
  const project = {
    nodes: [{ id: "n/a", lines: [{ id: "l~b", text: "original" }] }],
  };
  put(project, "/nodes/@n~1a/lines/@l~0b/text", cell("changed"));
  assert.deepEqual(
    get(project, "/nodes/@n~1a/lines/@l~0b/text"),
    cell("changed"),
  );
  assert.throws(() => put(project, "/__proto__/bad", cell(true)));
  assert.equal(({} as any).bad, undefined);
  const media = { pages: [{ text: "a" }, { text: "b" }] };
  put(media, "/pages/0", { present: false });
  assert.deepEqual(media.pages, [{ text: "b" }]);
  assert.throws(() => put(media, "/pages/4", cell("invalid")));
});
