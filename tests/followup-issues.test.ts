import test from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../scripts/blank-project";
import { assertProject } from "../src/engine/schema";
import { createSave } from "../src/engine/save";
import { CollectionStore } from "../src/engine/collections";
import { memoryStorage } from "../src/game/persistence";
import { describeError, errorSentence } from "../src/engine/errors";
import {
  interfaceLabels,
  projectNotificationKeys,
  notificationKey,
} from "../src/engine/uiConfig";
import { authorWarnings } from "../src/studio/authorWarnings";
import { waitPointsError } from "../src/studio/sequenceInput";

test("#94 configurable notifications follow custom categories; development is not a player label", () => {
  const p = assertProject(blankProject("modern"));
  p.materials = [
    { id: "photo", title: "照片", body: "线索", category: "photos" },
  ];
  p.ui = {
    notifications: { photos: "发现新照片" },
    labels: { development: "预览" },
  };
  assert.equal(notificationKey("note"), "notes");
  assert.ok(projectNotificationKeys(p).includes("photos"));
  assert.ok(!Object.hasOwn(interfaceLabels, "development"));
  const warnings = authorWarnings(p, "modern").filter(
    (i) => i.code === "unknown-ui-key",
  );
  assert.deepEqual(
    warnings.map((i) => i.field),
    ["ui.labels.development"],
  );
});
test("#95 error messages keep details without repeated prefixes or punctuation", () => {
  assert.equal(
    describeError(new SyntaxError("存档格式无效。")),
    "存档格式无效。",
  );
  assert.equal(
    describeError({ name: "DOMException", message: "浏览器拒绝播放" }),
    "浏览器拒绝播放",
  );
  assert.equal(describeError("磁盘错误"), "磁盘错误");
  assert.equal(errorSentence(new Error("写权限已失效。")), "写权限已失效。");
  assert.equal(errorSentence(new Error("quota.")), "quota。");
});
test("#96 old collections migrate without touching player saves and music survives rollback, restart and reload", () => {
  const p = assertProject(blankProject("modern"));
  p.media.musicGallery = [
    {
      id: "track",
      title: "终章",
      src: "/ending.wav",
      unlockNode: p.startNodeId,
    },
  ];
  const storage = memoryStorage(),
    key = `magickisa-avg:collections:v1:${p.id}`;
  storage.setItem(
    key,
    JSON.stringify({ formatVersion: 1, gallery: ["cg"], endings: ["end"] }),
  );
  const collections = new CollectionStore(p.id, storage);
  assert.equal(collections.needsRecovery, false);
  assert.deepEqual(collections.snapshot.music, []);
  const save = createSave(p);
  save.visitedNodes = [p.startNodeId];
  collections.update(p, save);
  save.visitedNodes = [];
  collections.update(p, save);
  const reloaded = new CollectionStore(p.id, storage);
  assert.deepEqual(reloaded.snapshot, {
    formatVersion: 2,
    gallery: ["cg"],
    endings: ["end"],
    music: ["track"],
  });
  assert.equal(Object.keys(save).includes("music"), false);
  storage.setItem(
    key,
    JSON.stringify({ formatVersion: 99, gallery: [], endings: [] }),
  );
  const future = new CollectionStore(p.id, storage),
    raw = storage.getItem(key);
  future.update(p, save);
  assert.equal(future.needsRecovery, true);
  assert.equal(storage.getItem(key), raw);
});
test("#100 wait points reject incomplete lists, duplicates, negative and out-of-range values", () => {
  for (const text of [
    "2,",
    "1,,2",
    "-1",
    "3,2",
    "2,2",
    "10",
    "NaN",
    "Infinity",
  ])
    assert.ok(waitPointsError(text, 10), text);
  for (const text of ["", "0, 2.5, 9.99"])
    assert.equal(waitPointsError(text, 10), undefined);
});
