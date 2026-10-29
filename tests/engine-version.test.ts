import test from "node:test";
import assert from "node:assert/strict";
import { compareEngineVersions } from "../scripts/engine-version";

test("minimum engine ordering follows SemVer without integer precision loss", () => {
  const versions = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
    "2.0.0-dev.5",
    "2.0.0",
  ];
  for (let i = 1; i < versions.length; i++) {
    assert.equal(compareEngineVersions(versions[i - 1], versions[i]), -1);
    assert.equal(compareEngineVersions(versions[i], versions[i - 1]), 1);
  }
  assert.equal(compareEngineVersions("2.0.0+build.12", "2.0.0+other"), 0);
  assert.equal(
    compareEngineVersions(
      "2.0.0-dev.9007199254740992",
      "2.0.0-dev.9007199254740993",
    ),
    -1,
  );
  assert.equal(
    compareEngineVersions("9007199254740992.0.0", "9007199254740993.0.0"),
    -1,
  );
  for (const invalid of [
    "2.0.0-dev.01",
    "2.0.0+.",
    "2.0.0+a..b",
    "02.0.0",
    "2.0",
  ]) {
    assert.throws(() => compareEngineVersions(invalid, "2.0.0"));
  }
});
