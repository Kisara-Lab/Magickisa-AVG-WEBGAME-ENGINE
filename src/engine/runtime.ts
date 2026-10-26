import type { EngineSave, StoryProject, StoryChoice, Value } from "./types";
import { evaluateCondition } from "./condition";
import { applyEffects } from "./effects";
import { snapshot, importSave } from "./save";
export class StoryRuntime {
  constructor(
    public project: StoryProject,
    public save: EngineSave,
  ) {
    this.enter();
    this.skipHidden();
  }
  get node() {
    return this.project.nodes.find((n) => n.id === this.save.nodeId);
  }
  get line() {
    return this.node?.lines[this.save.lineIndex];
  }
  get done() {
    return !this.node || this.save.lineIndex >= this.node.lines.length;
  }
  get choices(): StoryChoice[] {
    if (!this.done || this.save.presentation) return [];
    const basis = this.save.completed
      ? this.save
      : applyEffects(this.save, this.node?.onComplete);
    return (this.node?.choices || []).filter(
      (c) =>
        (!c.once || !basis.usedChoices.includes(c.id)) &&
        evaluateCondition(c.condition, basis.variables, basis.visitedNodes) &&
        this.targetAllowed(c, basis),
    );
  }
  private targetAllowed(c: StoryChoice, basis: EngineSave) {
    const simulated = applyEffects(basis, c.effects);
    const target = this.project.nodes.find((n) => n.id === c.target);
    return (
      !!target &&
      evaluateCondition(
        target.condition,
        simulated.variables,
        simulated.visitedNodes,
      )
    );
  }
  checkpoint(metadata: { speaker?: string; text?: string } = {}) {
    this.save.history.push({
      ...snapshot(this.save),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      section: this.node?.title,
      ...metadata,
    });
    this.save.history = this.save.history.slice(-500);
  }
  private enter() {
    if (!this.save.entered) {
      this.save = applyEffects(this.save, this.node?.onEnter);
      this.save.entered = true;
    }
    this.unlock();
  }
  private unlock() {
    for (const m of this.project.materials)
      if (
        (!m.unlockNode || this.save.visitedNodes.includes(m.unlockNode)) &&
        evaluateCondition(
          m.unlock,
          this.save.variables,
          this.save.visitedNodes,
        ) &&
        !this.save.unlockedMaterials.includes(m.id)
      )
        this.save.unlockedMaterials.push(m.id);
  }
  private skipHidden() {
    while (
      this.line &&
      !evaluateCondition(
        this.line.condition,
        this.save.variables,
        this.save.visitedNodes,
      )
    )
      this.save.lineIndex++;
  }
  private complete() {
    if (this.save.completed) return;
    this.save = applyEffects(this.save, this.node?.onComplete);
    this.save.completed = true;
    if (
      this.node?.ending &&
      !this.save.completedEndings.includes(this.node.ending)
    )
      this.save.completedEndings.push(this.node.ending);
    this.unlock();
  }
  private move(id: string, same = false) {
    this.save.nodeId = id;
    this.save.lineIndex = same ? (this.node?.lines.length ?? 0) : 0;
    this.save.entered = false;
    this.save.completed = same;
    this.save.visitedNodes = [...new Set([...this.save.visitedNodes, id])];
    if (!same) this.enter();
    this.skipHidden();
  }
  advance() {
    if (this.save.presentation || !this.node) return this.save;
    if (this.line?.input) {
      const v = this.save.variables[this.line.input.key];
      if (
        typeof v !== "string" ||
        !v.trim() ||
        v.length > this.line.input.maxLength
      )
        return this.save;
    }
    if (!this.done) {
      if (this.line && !this.save.readLineIds.includes(this.line.id))
        this.save.readLineIds.push(this.line.id);
      this.checkpoint({
        speaker: this.line?.speaker || this.node.speaker,
        text: this.line?.text,
      });
      this.save.lineIndex++;
      this.skipHidden();
      return this.save;
    }
    if (!this.save.completed) {
      this.checkpoint();
      this.complete();
      const kind =
        this.node.presentation === "dedication"
          ? "opening"
          : this.node.presentation === "ending"
            ? "ending"
            : null;
      const token = kind === "opening" ? "opening" : `ending:${this.node.id}`;
      if (kind && !this.save.seenPresentations.includes(token)) {
        this.save.presentation = { id: kind, nodeId: this.node.id };
        return this.save;
      }
    }
    if (this.choices.length) return this.save;
    const next = this.node.next;
    if (next) {
      const target = this.project.nodes.find((n) => n.id === next);
      if (
        target &&
        evaluateCondition(
          target.condition,
          this.save.variables,
          this.save.visitedNodes,
        )
      ) {
        this.checkpoint();
        this.move(next);
      }
    }
    return this.save;
  }
  choose(id: string) {
    const c = this.choices.find((c) => c.id === id);
    if (!c) return this.save;
    this.checkpoint({ speaker: "选择", text: c.label });
    this.complete();
    this.save = applyEffects(this.save, c.effects);
    if (c.once) this.save.usedChoices.push(c.id);
    this.move(c.target, c.target === this.save.nodeId);
    return this.save;
  }
  finishPresentation() {
    const p = this.save.presentation;
    if (!p) return this.save;
    this.save.seenPresentations.push(
      p.id === "opening" ? "opening" : `ending:${p.nodeId}`,
    );
    this.save.presentation = null;
    return this.save;
  }
  rollback(index = this.save.history.length - 1) {
    const point = this.save.history[index];
    if (!point) return this.save;
    const { id, createdAt, speaker, text, section, ...state } = point;
    this.save = {
      ...this.save,
      ...structuredClone(state),
      history: this.save.history.slice(0, index),
    };
    return this.save;
  }
  jump(nodeId: string, lineIndex = 0) {
    if (!this.project.nodes.some((n) => n.id === nodeId))
      throw new Error("节点不存在。");
    this.checkpoint();
    this.save.presentation = null;
    this.move(nodeId);
    this.save.lineIndex = Math.max(
      0,
      Math.min(lineIndex, this.node?.lines.length ?? 0),
    );
    this.skipHidden();
    return this.save;
  }
  setVariable(key: string, value: Value) {
    this.save.variables[key] = structuredClone(value);
    this.unlock();
    this.skipHidden();
    return this.save;
  }
  setPlayerNotes(text: string) {
    this.save.playerNotes = text;
    return this.save;
  }
  markRead(id: string) {
    if (
      this.save.unlockedMaterials.includes(id) &&
      !this.save.readMaterials.includes(id)
    )
      this.save.readMaterials.push(id);
    return this.save;
  }
  restore(input: unknown) {
    this.save = importSave(input, this.project, this.save.slotId);
    this.enter();
    this.skipHidden();
    return this.save;
  }
}
