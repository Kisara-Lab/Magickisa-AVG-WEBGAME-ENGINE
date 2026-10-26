// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
import { assertProject } from "./project.js";
import { readSave, importSave } from "./save.js";
import { AvgEngine } from "./engine.js";
import { createSave } from "./save.js";
import { writeSave } from "./save.js";
export class EngineSession {
  constructor(project, options = {}) {
    defineField(this, "project");
    defineField(this, "engine");
    defineField(this, "slotId");
    defineField(this, "persist");
    ((this.project = project),
      assertProject(project),
      (this.slotId = options.slotId || "auto"),
      (this.persist = options.persist ?? !0));
    const initialSave =
      (options.initialSave
        ? importSave(options.initialSave, project)
        : null) || (this.persist ? readSave(this.slotId, project) : null);
    this.engine = new AvgEngine(
      project,
      initialSave || createSave(project.startNodeId, this.slotId, project),
    );
  }
  get save() {
    return this.engine.runtime.save;
  }
  commit() {
    return (this.persist && writeSave(this.save, this.project), this.save);
  }
  advance() {
    const t = this.engine.advance();
    return this.commit() || t;
  }
  choose(choiceId) {
    const n = this.engine.choose(choiceId);
    return this.commit() || n;
  }
  jump(nodeId, lineIndex = 0) {
    const r = this.engine.jump(nodeId, lineIndex);
    return this.commit() || r;
  }
  rollback(historyIndex) {
    const n = this.engine.rollback(historyIndex);
    return this.commit() || n;
  }
  reset() {
    return (
      (this.engine.runtime.save = createSave(
        this.project.startNodeId,
        this.slotId,
        this.project,
      )),
      this.commit()
    );
  }
  destroy() {
    this.engine.destroy();
  }
}
