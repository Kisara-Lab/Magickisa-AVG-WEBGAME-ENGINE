import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { blankProject, initializeProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { evaluateCondition, jsonEqual } from "../src/engine/condition";
import { explainBranches, explainNext } from "../src/engine/investigation";
import { analyzeGraph } from "../src/engine/graph";
import { StoryRuntime } from "../src/engine/runtime";
import { createSave } from "../src/engine/save";
import {
  emptyStudioData,
  presetSave,
  presetIssues,
  type TestPreset,
} from "../src/studio/investigationModel";
import { graphLayout } from "../src/studio/graphLayout";
import {
  readStudioData,
  saveStudioData,
  studioDataFile,
} from "../scripts/studio-data";
import { readSnapshot, saveProject } from "../scripts/project-service";
import { acquireProjectWrite } from "../scripts/project-locks";
import {
  beginCommit,
  finishCommit,
  recoverCommit,
  readState,
  journalFile,
  stateFile,
} from "../scripts/authoring/storage";
import {
  exportAuthoring,
  restoreAuthoring,
} from "../scripts/authoring/portable";
import type { ProjectContext } from "../scripts/workspaces";
import type { AuthorProject } from "../src/studio/model";

function investigation(): AuthorProject {
  return assertProject({
    ...blankProject("modern"),
    startNodeId: "hub",
    materials: [
      { id: "clue", title: "钥匙", category: "线索", body: "门口的钥匙" },
    ],
    nodes: [
      {
        id: "hub",
        title: "调查大厅",
        chapter: "第一章",
        lines: [{ id: "h1", text: "去哪里调查？" }],
        onEnter: [{ type: "increment", key: "visits", amount: 1 }],
        onComplete: [{ type: "set", key: "complete", value: true }],
        next: "end",
        choices: [
          {
            id: "search",
            label: "调查书房",
            target: "room",
            once: true,
            condition: { type: "flag", key: "complete" },
            effects: [{ type: "set", key: "canEnter", value: true }],
          },
          { id: "revisit", label: "再次询问", target: "hub" },
          { id: "alternate", label: "另一入口", target: "room" },
        ],
      },
      {
        id: "room",
        title: "书房",
        chapter: "第二章",
        lines: [{ id: "r1", text: "发现线索。" }],
        condition: { type: "flag", key: "canEnter" },
        onEnter: [{ type: "unlockMaterial", id: "clue" }],
        next: "hub",
      },
      {
        id: "end",
        title: "结局",
        lines: [{ id: "e1", text: "调查结束" }],
        ending: "case-closed",
      },
      { id: "isolated", title: "有意保留", lines: [] },
    ],
  });
}
test("material and contains conditions propagate complete state through recursion with deterministic JSON equality", () => {
  assert(
    jsonEqual({ a: 1, b: [2, { c: true }] }, { b: [2, { c: true }], a: 1 }),
  );
  assert(!jsonEqual([1, 2], [2, 1]));
  const condition = {
    type: "all",
    conditions: [
      { type: "material", id: "clue", state: "read" },
      {
        type: "any",
        conditions: [
          { type: "contains", key: "found", value: { a: 1, b: 2 } },
          {
            type: "not",
            condition: { type: "material", id: "clue", state: "unlocked" },
          },
        ],
      },
    ],
  } as const;
  const c = structuredClone(condition) as unknown as Parameters<
    typeof evaluateCondition
  >[0];
  assert(
    evaluateCondition(c, { found: [{ b: 2, a: 1 }] }, [], {
      readMaterials: ["clue"],
      unlockedMaterials: ["clue"],
    }),
  );
  assert(
    !evaluateCondition(c, { found: "not-list" }, [], {
      readMaterials: ["clue"],
      unlockedMaterials: ["clue"],
    }),
  );
  assert(
    evaluateCondition(
      { type: "material", id: "clue", state: "read", value: false },
      {},
    ),
  );
  const p = investigation();
  p.nodes[0].condition = { type: "material", id: "missing", state: "read" };
  assert.throws(() => assertProject(p), /missing/);
});
test("gate explanation is pure and agrees with actual completion/branch/target timing and next fallback", () => {
  const p = investigation(),
    runtime = new StoryRuntime(p, createSave(p));
  runtime.advance();
  const before = structuredClone(runtime.save),
    explanation = explainBranches(p, p.nodes[0], runtime.save);
  assert.deepEqual(runtime.save, before);
  assert(explanation.find((c) => c.choiceId === "search")?.allowed);
  assert.equal(
    explanation.find((c) => c.choiceId === "alternate")?.allowed,
    false,
  );
  assert.deepEqual(
    runtime.choices.map((c) => c.id),
    explanation.filter((c) => c.allowed).map((c) => c.choiceId),
  );
  assert.equal(explainNext(p, p.nodes[0], runtime.save).blockedByChoices, true);
  runtime.choose("search");
  assert.equal(runtime.save.nodeId, "room");
  assert(runtime.save.variables.complete);
  assert(runtime.save.unlockedMaterials.includes("clue"));
  assert(runtime.save.usedChoices.includes("search"));
});
test("test presets seed real runtime, preserve original saves and validate material relationships", () => {
  const p = investigation(),
    preset: TestPreset = {
      id: "test",
      name: "钥匙调查",
      nodeId: "hub",
      phase: "start",
      variables: { visits: 10 },
      visitedNodes: [],
      usedChoices: [],
      unlockedMaterials: [],
      readMaterials: [],
    };
  const original = JSON.stringify(p),
    r = new StoryRuntime(p, presetSave(p, preset));
  assert.equal(r.save.variables.visits, 11);
  assert.equal(JSON.stringify(p), original);
  preset.phase = "completed";
  const completed = new StoryRuntime(p, presetSave(p, preset));
  assert.equal(completed.save.variables.visits, 10);
  assert(completed.done);
  preset.readMaterials = ["clue"];
  assert(presetIssues(p, preset).some((i) => i.includes("已解锁")));
});
test("connection index preserves self loops, duplicate destinations, chapter boundaries and closed SCC diagnostics", () => {
  const p = investigation(),
    index = analyzeGraph(p);
  assert.equal(index.edges.filter((e) => e.to === "room").length, 2);
  assert.equal(new Set(index.edges.map((e) => e.key)).size, index.edges.length);
  assert(index.edges.some((e) => e.from === e.to));
  assert(index.edges.some((e) => e.crossChapter));
  assert(!index.reachable.has("isolated"));
  assert(index.cycles.some((c) => c.includes("hub") && c.includes("room")));
  p.nodes[0].next = undefined;
  p.nodes[0].choices = p.nodes[0].choices?.filter((c) => c.target !== "end");
  assert(analyzeGraph(p).issues.some((i) => i.code === "closed-cycle"));
});
test("1000 nodes / 5000 relations index and loop-aware layout stay bounded", () => {
  const p = investigation();
  p.startNodeId = "n0";
  p.nodes = Array.from({ length: 1000 }, (_, i) => ({
    id: "n" + i,
    title: "节点 " + i,
    chapter: String(i % 8),
    lines: [],
    choices: Array.from({ length: 5 }, (_, j) => ({
      id: `c${i}-${j}`,
      label: "调查",
      target: "n" + ((i + j + 1) % 1000),
    })),
  }));
  const start = performance.now(),
    index = analyzeGraph(p),
    positions = graphLayout(p.nodes, index.edges);
  assert.equal(index.edges.length, 5000);
  assert.equal(Object.keys(positions).length, 1000);
  assert.equal(index.reachable.size, 1000);
  assert(
    Object.values(positions).every(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    ),
  );
  assert(performance.now() - start < 10000, "index/layout exceeded 10 seconds");
});
test("independent revision, shared locks, backups, coordinated recovery and authoring portability", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "magickisa 调查 "));
  const ctx: ProjectContext = {
    id: crypto.randomUUID(),
    profile: "modern",
    name: "调查",
    directory,
    content: path.join(directory, "content"),
    public: path.join(directory, "public"),
    projectFile: path.join(directory, "project.json"),
    backups: path.join(directory, "backups"),
    output: path.join(directory, "dist"),
  };
  try {
    initializeProject(directory, "modern", "调查");
    const initial = readStudioData(ctx),
      data = emptyStudioData();
    data.positions["retained-orphan"] = { x: 12, y: 34 };
    const saved = saveStudioData(ctx, data, initial.revision);
    assert.notEqual(saved.revision, initial.revision);
    assert.throws(
      () => saveStudioData(ctx, emptyStudioData(), initial.revision),
      (e: any) => e.status === 409,
    );
    const lock = acquireProjectWrite(ctx);
    try {
      assert.throws(
        () => saveStudioData(ctx, data, saved.revision),
        (e: any) => e.code === "BUSY",
      );
    } finally {
      lock();
    }
    const snapshot = readSnapshot(ctx),
      next = {
        ...data,
        variables: {
          progress: {
            label: "进度",
            type: "number" as const,
            description: "调查进度",
          },
        },
      };
    saveProject(
      ctx,
      { ...snapshot.project, title: "合并提交" },
      snapshot.revision,
      false,
      undefined,
      { data: next, revision: saved.revision },
    );
    assert.equal(readSnapshot(ctx).project.title, "合并提交");
    assert.equal(readStudioData(ctx).data.variables.progress.label, "进度");
    assert.equal(fs.readdirSync(ctx.backups).length, 2);
    const projectBefore = fs.readFileSync(ctx.projectFile),
      studioBefore = fs.readFileSync(studioDataFile(ctx)),
      stateBefore = fs.readFileSync(stateFile(ctx));
    beginCommit(
      ctx,
      { ...readSnapshot(ctx).project, title: "中断提交" },
      readState(ctx),
      data,
    );
    fs.writeFileSync(
      ctx.projectFile,
      Buffer.from(
        JSON.parse(fs.readFileSync(journalFile(ctx), "utf8")).projectAfter,
        "base64",
      ),
    );
    // Simulate interruption before finalisation, then recover under lock.
    const unlock = acquireProjectWrite(ctx);
    unlock();
    assert.deepEqual(fs.readFileSync(ctx.projectFile), projectBefore);
    assert.deepEqual(fs.readFileSync(studioDataFile(ctx)), studioBefore);
    assert.deepEqual(fs.readFileSync(stateFile(ctx)), stateBefore);
    assert(!fs.existsSync(journalFile(ctx)));
    const stage = path.join(directory, "portable");
    const check = exportAuthoring(ctx, stage, false);
    check();
    restoreAuthoring(stage);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(path.join(stage, "authoring/studio.json"), "utf8"),
      ),
      next,
    );
    assert(!fs.existsSync(path.join(stage, "public/authoring")));
    // Disk failure must retain both authoritative files; joint commit rollback
    // also restores a sidecar that reached disk before the interruption.
    const rename = fs.renameSync;
    const failure = t.mock.method(fs, "renameSync", (from: any, to: any) => {
      if (to === studioDataFile(ctx)) throw new Error("simulated disk failure");
      return rename(from, to);
    });
    assert.throws(
      () => saveStudioData(ctx, data, readStudioData(ctx).revision),
      /disk failure/,
    );
    failure.mock.restore();
    assert.deepEqual(fs.readFileSync(studioDataFile(ctx)), studioBefore);
    beginCommit(ctx, readSnapshot(ctx).project, readState(ctx), data);
    const journal = JSON.parse(fs.readFileSync(journalFile(ctx), "utf8"));
    fs.writeFileSync(
      studioDataFile(ctx),
      Buffer.from(journal.studioAfter, "base64"),
    );
    assert(recoverCommit(ctx));
    assert.deepEqual(fs.readFileSync(studioDataFile(ctx)), studioBefore);
    beginCommit(ctx, readSnapshot(ctx).project, readState(ctx), data);
    fs.writeFileSync(studioDataFile(ctx), "{}");
    assert.throws(
      () => recoverCommit(ctx),
      (e: any) => e.code === "RECOVERY_CONFLICT",
    );
    assert.equal(fs.readFileSync(studioDataFile(ctx), "utf8"), "{}");
    fs.writeFileSync(studioDataFile(ctx), studioBefore);
    recoverCommit(ctx);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
