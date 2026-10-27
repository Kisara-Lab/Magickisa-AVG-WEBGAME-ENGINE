// Include progress that can exist before the first history checkpoint.
export function hasPlayerProgress(save) {
  return (
    !!save &&
    (!!save.playerNotes ||
      save.lineIndex > 0 ||
      save.visitedNodes?.length > 1 ||
      Object.keys(save.variables || {}).length > 0 ||
      [
        "history",
        "notes",
        "materials",
        "unlockedMaterials",
        "readMaterials",
        "completedEndings",
        "seenPresentations",
        "usedChoices",
        "readLineIds",
      ].some((key) => save[key]?.length > 0))
  );
}

export function backupAndClearSlot(storage, key) {
  const raw = storage.getItem(key);
  if (raw !== null) storage.setItem(`${key}:recovery:${Date.now()}`, raw);
  // Storage is shared across tabs: retain newer progress observed during backup.
  if (storage.getItem(key) !== raw)
    throw new Error(
      "存档已被其他标签页更新，恢复已停止；请关闭其他游戏标签页后重试。",
    );
  storage.removeItem(key);
}
