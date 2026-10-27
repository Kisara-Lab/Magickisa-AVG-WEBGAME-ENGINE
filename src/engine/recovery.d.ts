export function hasPlayerProgress(save: unknown): boolean;
export function backupAndClearSlot(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  key: string,
): void;
