import test from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { StoryRuntime } from "../src/engine/runtime";
import { createSave, importSave } from "../src/engine/save";
import * as release from "../src/compat/release/engine/index.js";
import { uniqueId, newNode, type AuthorProject } from "../src/studio/model";
import { authorWarnings } from "../src/studio/authorWarnings";
import { issuePosition } from "../src/studio/issuePosition";
import { resolvePlayback, playbackVolume } from "../src/engine/playback.js";
import { usages } from "../src/studio/discovery";

test("self-target reload and legacy completed checkpoints do not replay onEnter", () => {
  const p = assertProject(blankProject("modern")),
    n = p.nodes[0];
  n.onEnter = [{ type: "increment", key: "enters", amount: 1 }];
  n.choices = [{ id: "self", label: "self", target: n.id }];
  const r = new StoryRuntime(p, createSave(p));
  r.advance();
  r.choose("self");
  assert.equal(r.save.entered, true);
  assert.equal(
    new StoryRuntime(p, importSave(r.save, p)).save.variables.enters,
    1,
  );
  const old = structuredClone(r.save);
  old.entered = false;
  old.history.forEach((h) => {
    if (h.completed) h.entered = false;
  });
  const restored = new StoryRuntime(p, importSave(old, p));
  assert.equal(restored.save.variables.enters, 1);
  assert.ok(
    restored.save.history.filter((h) => h.completed).every((h) => h.entered),
  );
});

test("new identities survive deletion and recreation without recycling old IDs", () => {
  const p: AuthorProject = blankProject("modern");
  const first = newNode(p);
  p.nodes.push(first);
  p.nodes.pop();
  const second = newNode(structuredClone(p));
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.lines[0].id, second.lines[0].id);
  assert.notEqual(uniqueId("character", []), uniqueId("character", []));
  assert.equal(p.nodes[0].id, blankProject("modern").nodes[0].id);
});

test("warnings account for target conditions and preserve compat timing contracts", () => {
  const p: AuthorProject = blankProject("release"),
    n = p.nodes[0];
  n.condition = { type: "flag", key: "gate" };
  n.choices = [{ id: "c", label: "c", target: n.id }];
  n.effects = [{ type: "increment", key: "count", amount: 1 }];
  const codes = authorWarnings(p, "release").map((i) => i.code);
  assert.ok(codes.includes("branch-fallback"));
  assert.ok(codes.includes("release-choice-timing"));
  assert.ok(codes.includes("release-repeat-effects"));
  n.condition = { type: "any", conditions: [] };
  assert.ok(
    authorWarnings(p, "modern").some((i) => i.code === "empty-condition"),
  );
});

test("explicit setAudio takes precedence and gain multiplies without losing zero", () => {
  const p: AuthorProject = blankProject("modern");
  p.audio = [{ id: "explicit", src: "/explicit.wav", volume: 0.5 }];
  p.media.chapterMusic = { default: "/default.wav" };
  assert.deepEqual(resolvePlayback(p, "chapter", "explicit"), {
    src: "/explicit.wav",
    volume: 0.5,
  });
  assert.equal(resolvePlayback(p, "chapter", "missing").src, "/default.wav");
  assert.equal(playbackVolume({ volume: 0.4, muted: false }, 0.5, 0.6), 0.12);
  assert.equal(playbackVolume({ volume: 0.4, muted: true }, 0.5), 0);
  assert.equal(playbackVolume({ volume: 0.4, muted: false }, 0), 0);
  p.nodes[0].onEnter = [{ type: "setAudio", trackId: "missing" }];
  assert.ok(
    usages(p).some((r) => r.kind === "audio" && r.target === "missing"),
  );
});

test("compat player notes roundtrip independently from story appendNote and rollback", () => {
  const p = blankProject("release");
  const save = release.createSave(p.startNodeId, "auto", p);
  save.playerNotes = "my notes";
  save.notes = ["story note"];
  const r = new release.AvgEngine(p, release.importSave(save, p));
  r.advance();
  r.rollback(0);
  assert.equal(r.runtime.save.playerNotes, "my notes");
  assert.deepEqual(r.runtime.save.notes, ["story note"]);
  const old = { ...save };
  delete old.playerNotes;
  assert.equal(release.importSave(old, p).playerNotes, "");
});

test("diagnostic locations distinguish layer/effect fields and tolerate missing arrays", () => {
  const p = blankProject("modern");
  const layer = issuePosition(p, [
    "nodes",
    0,
    "lines",
    0,
    "characterLayers",
    1,
    "characterId",
  ]);
  assert.equal(layer.nodeId, p.startNodeId);
  assert.equal(layer.lineId, p.nodes[0].lines[0].id);
  assert.match(layer.selector!, /data-layer-index="1"/);
  assert.match(layer.field!, /2/);
  const effect = issuePosition(p, ["nodes", 0, "onEnter", 2, "trackId"]);
  assert.match(effect.selector!, /data-effect-index="2"/);
  assert.equal(issuePosition(p, ["startNodeId"]).field, "起始场景");
  assert.doesNotThrow(() =>
    issuePosition({ ...p, nodes: undefined } as never, ["nodes", 99, "title"]),
  );
});
