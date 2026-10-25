import { EngineStore } from "./store";
import type { StoryProject, SessionOptions } from "./types";
export function createEngineHost(
  project: StoryProject,
  options: SessionOptions = {},
) {
  const session = new EngineStore(project, options);
  return { session, start: () => session, dispose: () => session.destroy() };
}
