// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
import { EngineSession } from "./session.js";
export class EngineStore {
  constructor(project, options) {
    defineField(this, "session");
    defineField(this, "listeners", new Set());
    this.session = new EngineSession(project, options);
  }
  get runtime() {
    return this.session.engine.runtime;
  }
  getSnapshot() {
    return this.session.save;
  }
  subscribe(listener) {
    return (
      this.listeners.add(listener),
      () => this.listeners.delete(listener)
    );
  }
  emit(save) {
    return (this.listeners.forEach((n) => n(save)), save);
  }
  advance() {
    return this.emit(this.session.advance());
  }
  choose(choiceId) {
    return this.emit(this.session.choose(choiceId));
  }
  jump(nodeId, lineIndex = 0) {
    return this.emit(this.session.jump(nodeId, lineIndex));
  }
  rollback(historyIndex) {
    return this.emit(this.session.rollback(historyIndex));
  }
  reset() {
    return this.emit(this.session.reset());
  }
  destroy() {
    (this.listeners.clear(), this.session.destroy());
  }
}
