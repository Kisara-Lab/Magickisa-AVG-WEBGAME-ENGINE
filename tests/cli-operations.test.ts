import test from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../scripts/blank-project";
import {
  applyOperations,
  pointer,
  transactionSchema,
} from "../scripts/cli/operations";
import { assertProject } from "../src/engine/schema";

test("transactions support forward references and coordinated deletion without editing the source", () => {
  const p = blankProject("modern");
  const before = JSON.stringify(p);
  const operations = transactionSchema.parse({
    operations: [
      { op: "scene.link", id: "scene-001", value: "next" },
      { op: "scene.add", id: "next", value: { title: "Next", lines: [] } },
      {
        op: "condition.set",
        target: "scene",
        scene: "next",
        value: { type: "all", conditions: [] },
      },
      {
        op: "effect.add",
        phase: "complete",
        scene: "scene-001",
        value: { type: "set", key: "flag", value: true },
      },
    ],
  }).operations;
  const created = applyOperations(p, operations);
  assertProject(created.project);
  assert.equal(JSON.stringify(p), before);
  const removed = applyOperations(created.project, [
    { op: "scene.link", id: "scene-001", value: null },
    { op: "scene.remove", id: "next" },
  ]);
  assertProject(removed.project);
  assert.equal(removed.project.nodes.length, 1);
});
test("advanced JSON Pointer supports escaping, append, remove and assertions while rejecting prototype paths", () => {
  const data = { values: [1, 2], "a/b": { "~key": "old" } };
  pointer(data, "/a~1b/~0key", "set", "new");
  pointer(data, "/values/-", "set", 3);
  pointer(data, "/values/0", "remove");
  assert.deepEqual(data.values, [2, 3]);
  assert.equal(pointer(data, "/a~1b/~0key", "get"), "new");
  for (const path of [
    "",
    "/values/01",
    "/values/9",
    "/values/NaN",
    "/__proto__/x",
    "/constructor",
    "/a~2b",
  ])
    assert.throws(() => pointer(data, path, "set", 1));
  const p = blankProject("modern");
  assert.throws(() =>
    applyOperations(p, [{ op: "json.test", path: "/title", value: "wrong" }]),
  );
});
test("invalid operations cannot silently succeed or recycle stable identities", () => {
  const p = blankProject("modern");
  for (const value of [
    { op: "scene.update", id: "scene-001", value: { id: "renamed" } },
    { op: "line.add", id: "x", value: { text: "missing scene" } },
    { op: "scene.add", id: "scene-001" },
    { op: "scene.move", id: "scene-001", index: 9 },
    { op: "scene.add", before: "missing" },
    { op: "project.update", value: { nodes: [] } },
    { op: "scene.update", id: "scene-001", collection: "audio", value: {} },
  ])
    assert.throws(() =>
      applyOperations(
        p,
        transactionSchema.parse({ operations: [value] }).operations,
      ),
    );
  assert.equal(p.nodes[0].id, "scene-001");
});
