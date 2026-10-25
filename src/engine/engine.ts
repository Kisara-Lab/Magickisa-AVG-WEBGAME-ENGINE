import type { StoryProject, EngineSave } from "./types";
import { assertProject } from "./schema";
import { StoryRuntime } from "./runtime";
// Renderer-independent facade retained from the release API.
export class AvgEngine {
  readonly runtime: StoryRuntime;
  constructor(
    public project: StoryProject,
    save: EngineSave,
  ) {
    assertProject(project);
    this.runtime = new StoryRuntime(project, save);
  }
  start() {
    return this.runtime.save;
  }
  pause() {
    return this.runtime.save;
  }
  resume() {
    return this.runtime.save;
  }
  advance() {
    return this.runtime.advance();
  }
  choose(id: string) {
    return this.runtime.choose(id);
  }
  jump(id: string, line = 0) {
    return this.runtime.jump(id, line);
  }
  rollback(index?: number) {
    return this.runtime.rollback(index);
  }
  destroy() {
    return this.runtime.save;
  }
}
