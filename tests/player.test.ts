import test from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { createSave, slotKey } from "../src/engine/save";
import {
  PlayerSlots,
  guardedStorage,
  memoryStorage,
  recoveryKey,
  manualSlots,
} from "../src/game/persistence";
import {
  graphemes,
  readPreferences,
  preferenceKey,
} from "../src/game/preferences";

test("player manual snapshots preserve auto and recover replaced auto without changing save format", () => {
  const p = assertProject(blankProject("modern")),
    storage = memoryStorage(),
    slots = new PlayerSlots(p, storage);
  const first = createSave(p);
  first.variables.phase = "first";
  slots.write("auto", first);
  const autoBefore = storage.getItem(slotKey(p.id));
  slots.write("manual-01", first);
  assert.equal(storage.getItem(slotKey(p.id)), autoBefore);
  const later = createSave(p);
  later.variables.phase = "later";
  slots.write("auto", later);
  assert.equal(slots.recovery()?.variables.phase, "first");
  slots.write("auto", slots.read("manual-01").save);
  assert.equal(slots.read("auto").save?.variables.phase, "first");
  assert.equal(slots.recovery()?.variables.phase, "later");
  assert.equal(slots.read("manual-01").save?.slotId, "manual-01");
  assert.equal(manualSlots.length, 12);
  assert.equal(slots.list().length, 13);
  assert.throws(() => slots.remove("auto"));
});
test("invalid imports, failed backup and full storage preserve existing slots", () => {
  const p = assertProject(blankProject("modern")),
    storage = memoryStorage(),
    save = createSave(p),
    slots = new PlayerSlots(p, storage);
  slots.write("auto", save);
  slots.write("manual-01", save);
  const before = storage.getItem(slotKey(p.id));
  assert.throws(() => slots.write("auto", { ...save, projectId: "other" }));
  assert.equal(storage.getItem(slotKey(p.id)), before);
  const failing = new PlayerSlots(p, {
    ...storage,
    setItem: () => {
      throw new Error("quota");
    },
  });
  assert.throws(() => failing.write("auto", save), /quota/);
  assert.equal(storage.getItem(slotKey(p.id)), before);
  assert.throws(() => failing.write("manual-01", save), /quota/);
  storage.setItem(slotKey(p.id, "manual-02"), "broken JSON");
  assert.equal(slots.read("manual-02").raw, "broken JSON");
  assert.ok(slots.read("manual-02").error);
  assert.ok(slots.read("manual-01").save);
  assert.equal(storage.getItem(recoveryKey(p.id)), null);
});
test("revoked player permission rejects every write path and fresh instances load latest state", () => {
  const p = assertProject(blankProject("modern")),
    base = memoryStorage();
  let owned = true;
  const storage = guardedStorage(base, () => owned),
    slots = new PlayerSlots(p, storage);
  slots.write("auto", createSave(p));
  owned = false;
  assert.throws(() => slots.write("auto", createSave(p)), /权限/);
  assert.throws(() => slots.write("manual-01", createSave(p)), /权限/);
  assert.throws(() => slots.remove("manual-01"), /权限/);
  assert.ok(new PlayerSlots(p, base).read("auto").save);
});
test("preferences isolate projects, migrate music label and clamp values; text splits by grapheme", () => {
  const storage = memoryStorage();
  storage.setItem("magickisa:music-label", "off");
  assert.equal(readPreferences(storage, "one").musicLabel, false);
  storage.setItem(
    preferenceKey("one"),
    JSON.stringify({
      fontSize: 999,
      autoDelay: -10,
      wheel: true,
      musicLabel: true,
    }),
  );
  assert.equal(readPreferences(storage, "one").fontSize, 32);
  assert.equal(readPreferences(storage, "one").autoDelay, 1);
  assert.equal(readPreferences(storage, "two").wheel, false);
  assert.deepEqual(graphemes("中👨‍👩‍👧‍👦e\u0301𠮷"), ["中", "👨‍👩‍👧‍👦", "e\u0301", "𠮷"]);
});
