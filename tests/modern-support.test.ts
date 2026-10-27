import test from "node:test";
import assert from "node:assert/strict";
import {
  requireModernProfile,
  requireModernProject,
  LEGACY_RELEASE_URL,
} from "../src/engine/support";
import { blankProject } from "../scripts/blank-project";
import { authorWarnings } from "../src/studio/authorWarnings";

test("modern defaults remain valid and legacy inputs fail with a frozen release link", () => {
  for (const value of [undefined, null, "", "modern"])
    assert.equal(requireModernProfile(value), "modern");
  assert.throws(
    () => requireModernProfile("release"),
    (error) => String(error).includes(LEGACY_RELEASE_URL),
  );
  assert.throws(() => requireModernProfile("unknown"));
  const project = blankProject("modern");
  requireModernProject(project);
  for (const schemaVersion of [undefined, 1, "2"]) {
    const old = { ...project, schemaVersion };
    const original = JSON.stringify(old);
    assert.throws(
      () => requireModernProject(old),
      (error) => String(error).includes(LEGACY_RELEASE_URL),
    );
    assert.equal(JSON.stringify(old), original);
  }
});

test("modern author warnings retain target-condition and empty-condition diagnostics", () => {
  const p = blankProject("modern");
  Object.assign(p.nodes[0], {
    condition: { type: "flag", key: "gate" },
    next: p.startNodeId,
  });
  assert.ok(
    authorWarnings(p, "modern").some((i) => i.code === "branch-fallback"),
  );
  Object.assign(p.nodes[0], { condition: { type: "any", conditions: [] } });
  assert.ok(
    authorWarnings(p, "modern").some((i) => i.code === "empty-condition"),
  );
});
