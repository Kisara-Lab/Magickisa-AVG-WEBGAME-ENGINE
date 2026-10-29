import test from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { EngineStore } from "../src/engine/store";
import { createSave } from "../src/engine/save";
import {
  variableDiagnostics,
  createConditionDiagnostics,
} from "../src/engine/logicDiagnostics";
import { authorWarnings } from "../src/studio/authorWarnings";
import { choiceHints } from "../src/engine/choiceHints";

test("#104 variables diagnostics cover nested conditions, effects, inputs, clues and gallery without blocking dynamic keys", () => {
  const p = assertProject(blankProject("modern")),
    n = p.nodes[0];
  p.variables = { known: { type: "number", initial: 0 } };
  n.condition = {
    type: "all",
    conditions: [{ type: "count", key: "typo", operator: "gte", value: 1 }],
  };
  n.onComplete = [{ type: "increment", key: "wrong", amount: 1 }];
  n.lines[0].input = { key: "inputName", label: "姓名", maxLength: 40 };
  p.materials = [
    {
      id: "m",
      title: "线索",
      body: "",
      category: "clue",
      unlock: { type: "contains", key: "bag", value: 1 },
    },
  ];
  p.gallery = [
    {
      id: "cg",
      title: "画面",
      asset: "/cg.png",
      unlock: { type: "flag", key: "cgTypo" },
    },
  ];
  assertProject(p);
  const warnings = variableDiagnostics(p);
  assert.deepEqual(
    new Set(warnings.map((w) => w.path.join("."))),
    new Set([
      "nodes.0.condition.conditions.0.key",
      "nodes.0.onComplete.0.key",
      "nodes.0.lines.0.input.key",
      "materials.0.unlock.key",
      "gallery.0.unlock.key",
    ]),
  );
  const located = authorWarnings(p, "modern").find(
    (w) => w.code === "undeclared-variable" && w.nodeId === n.id,
  );
  assert.equal(located?.position?.nodeId, n.id);
  delete p.variables;
  assert.ok(
    !variableDiagnostics(p).some((w) => w.path.includes("onComplete")),
    "dynamic effect creation remains supported",
  );
});

test("#104 real runtime observations preserve short-circuiting and record skipped stable IDs without touching save schema", () => {
  const p = assertProject(blankProject("modern")),
    n = p.nodes[0];
  n.lines = [
    {
      id: "hidden",
      text: "不可见",
      condition: {
        type: "all",
        conditions: [
          { type: "flag", key: "off" },
          { type: "flag", key: "notEvaluated" },
        ],
      },
    },
    { id: "shown", text: "可见" },
  ];
  const diagnostics = createConditionDiagnostics(p);
  const store = new EngineStore(p, { persist: false, ...diagnostics });
  assert.equal(store.runtime.line?.id, "shown");
  const report = diagnostics.snapshot();
  assert.deepEqual(report.skipped, [{ nodeId: n.id, lineId: "hidden" }]);
  assert.equal(report.observations.length, 2, "root and evaluated child only");
  assert.ok(report.observations.every((r) => r.result === false));
  assert.ok(!JSON.stringify(store.save).includes("observations"));
  assert.deepEqual(
    Object.keys(store.save).sort(),
    Object.keys(createSave(p)).sort(),
  );
  store.destroy();
});

test("#103 hints respect runtime availability, completion effects, once records and fresh playthroughs", () => {
  const p = assertProject(blankProject("modern")),
    n = p.nodes[0];
  n.lines = [];
  n.onComplete = [{ type: "set", key: "ready", value: true }];
  n.choices = [
    { id: "once", label: "调查", target: n.id, once: true },
    {
      id: "locked",
      label: "秘密",
      target: n.id,
      condition: { type: "flag", key: "secret" },
    },
    {
      id: "ready",
      label: "完成后可选",
      target: n.id,
      condition: { type: "flag", key: "ready" },
    },
  ];
  const store = new EngineStore(p, { persist: false });
  store.choose("once");
  const before = structuredClone(store.save);
  const hints = choiceHints(n, store.save, store.runtime.choices);
  assert.match(hints[0].reason, /已选择/);
  assert.equal(hints[0].allowed, false);
  assert.match(hints[1].reason, /选项条件/);
  assert.equal(hints[2].allowed, true);
  assert.deepEqual(store.save, before, "hinting has no effects");
  const fresh = new EngineStore(p, { persist: false });
  assert.equal(
    choiceHints(n, fresh.save, fresh.runtime.choices)[0].allowed,
    true,
    "once is per playthrough, not permanent",
  );
  store.destroy();
  fresh.destroy();
});
