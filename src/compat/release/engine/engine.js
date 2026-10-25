// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
import { assertProject } from "./project.js";
import { StoryRuntime } from "./runtime.js";
export class AvgEngine {
  constructor(project, save) {
    defineField(this, "project");
    defineField(this, "runtime");
    ((this.project = project),
      assertProject(project),
      (this.runtime = new StoryRuntime(project, save)));
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
  choose(choiceId) {
    return this.runtime.choose(choiceId);
  }
  jump(nodeId, lineIndex = 0) {
    return this.runtime.jump(nodeId, lineIndex);
  }
  rollback(historyIndex) {
    const checkpoint = this.runtime.save.history[historyIndex];
    return (
      checkpoint &&
        (this.runtime.save = {
          ...this.runtime.save,
          nodeId: checkpoint.nodeId,
          lineIndex: checkpoint.lineIndex,
          variables: structuredClone(checkpoint.variables),
          visitedNodes: [...checkpoint.visitedNodes],
          unlockedMaterials: [...checkpoint.unlockedMaterials],
          readMaterials: [...checkpoint.readMaterials],
          notes: [...checkpoint.notes],
          usedChoices: [...(checkpoint.usedChoices || [])],
          audio: {
            ...checkpoint.audio,
          },
        }),
      this.runtime.save
    );
  }
  destroy() {
    return this.runtime.save;
  }
}
