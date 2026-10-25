import { EngineSession } from "./session.js";

/** Create a renderer-independent session. Use persist:false outside a browser. */
export function createEngineHost(project, options) {
  const session = new EngineSession(project, options);
  return {
    session,
    start: () => session,
    dispose: () => session.destroy(),
  };
}
