import type { StoryProject, MaterialEntry, EngineSave } from "./types";
export function isMaterialAvailable(
  project: StoryProject,
  material: MaterialEntry,
  save?: EngineSave,
): boolean;
export function isMusicAvailable(
  track: { unlockNode?: string },
  save?: EngineSave,
): boolean;
