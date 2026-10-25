import test from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { StoryRuntime } from "../src/engine/runtime";
import { createSave, importSave } from "../src/engine/save";
import { resolveScene } from "../src/engine/media";

test("blank projects have independent stable identities and no media dependencies", () => {
  const first = assertProject(blankProject("modern"));
  const second = assertProject(blankProject("modern"));
  assert.notEqual(first.id, second.id);
  assert.equal(first.nodes[0].lines[0].text, "");
  assert.equal(first.audio.length + first.backdrops.length + first.characters.length, 0);
  assert.match(resolveScene(first, ""), /^data:image\/svg/);
  assert.equal("schemaVersion" in blankProject("release"), false);
});

test("branch conditions, effects and rollback preserve editing-independent runtime behavior", () => {
  const project = assertProject({ ...blankProject("modern"), nodes: [
    { id: "start", title: "start", lines: [{ id: "a", text: "test" }], choices: [
      { id: "branch", label: "go", target: "end", effects: [{ type: "set", key: "ready", value: true }] },
    ] },
    { id: "end", title: "end", lines: [{ id: "b", text: "done" }], condition: { type: "flag", key: "ready" } },
  ], startNodeId: "start" });
  const runtime = new StoryRuntime(project, createSave(project));
  runtime.advance();
  assert.equal(runtime.choices[0].id, "branch");
  runtime.choose("branch");
  assert.equal(runtime.save.nodeId, "end");
  assert.equal(runtime.save.variables.ready, true);
  assert.equal(importSave(runtime.save, project).nodeId, "end");
  assert.throws(() => importSave(runtime.save, { ...project, id: "another" }));
  runtime.rollback();
  assert.equal(runtime.save.nodeId, "start");
  assert.equal(runtime.save.variables.ready, undefined);
});

test("presentation state does not require bundled game music or images", () => {
  const project = assertProject(blankProject("modern"));
  project.nodes[0].presentation = "dedication";
  const runtime = new StoryRuntime(project, createSave(project));
  runtime.advance(); runtime.advance();
  assert.equal(runtime.save.presentation?.id, "opening");
});
