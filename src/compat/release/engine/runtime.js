// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
import { evaluateCondition } from "./condition.js";
import { createCheckpoint } from "./history.js";
import { applyEffects } from "./effects.js";
export class StoryRuntime {
  constructor(project, save) {
    defineField(this, "project");
    defineField(this, "save");
    ((this.project = project), (this.save = save));
  }
  get node() {
    return this.project.nodes.find((t) => t.id === this.save.nodeId);
  }
  get line() {
    var t;
    return (t = this.node) == null ? void 0 : t.lines[this.save.lineIndex];
  }
  get done() {
    return !this.node || this.save.lineIndex >= this.node.lines.length;
  }
  get choices() {
    var t;
    return (((t = this.node) == null ? void 0 : t.choices) ?? [])
      .filter((n) => !n.once || !this.save.usedChoices.includes(n.id))
      .filter((n) =>
        evaluateCondition(
          n.condition,
          this.save.variables,
          this.save.visitedNodes,
        ),
      );
  }
  checkpoint(metadata = {}) {
    return (
      (this.save = {
        ...this.save,
        history: [
          ...this.save.history,
          createCheckpoint(this.save, metadata),
        ].slice(-500),
      }),
      this.save
    );
  }
  advance() {
    if (!this.node) return this.save;
    if (this.line?.input) {
      const value = this.save.variables[this.line.input.key];
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > (this.line.input.maxLength ?? 80)
      )
        return this.save;
    }
    if (
      (this.checkpoint(
        this.line
          ? {
              speaker: this.line.speaker || this.node.speaker,
              text: this.line.text,
            }
          : {},
      ),
      !this.done)
    )
      return (
        (this.save = {
          ...this.save,
          lineIndex: this.save.lineIndex + 1,
          savedAt: new Date().toISOString(),
        }),
        this.save
      );
    if (
      ((this.save = applyEffects(this.save, this.node.effects)),
      !this.choices.length && this.node.next)
    ) {
      const n = this.project.nodes.find((r) => r.id === this.node.next);
      n &&
        evaluateCondition(
          n.condition,
          this.save.variables,
          this.save.visitedNodes,
        ) &&
        (this.save = {
          ...this.save,
          nodeId: n.id,
          lineIndex: 0,
          visitedNodes: [...new Set([...this.save.visitedNodes, n.id])],
          savedAt: new Date().toISOString(),
        });
    }
    return this.save;
  }
  choose(choiceId) {
    const choice = this.choices.find((l) => l.id === choiceId);
    if (!choice) return this.save;
    (this.checkpoint(),
      (this.save = applyEffects(
        {
          ...this.save,
          usedChoices: choice.once
            ? [...new Set([...this.save.usedChoices, choice.id])]
            : this.save.usedChoices,
        },
        choice.effects,
      )));
    const targetNode = this.project.nodes.find((l) => l.id === choice.target);
    return !targetNode ||
      !evaluateCondition(
        targetNode.condition,
        this.save.variables,
        this.save.visitedNodes,
      )
      ? this.save
      : ((this.save = {
          ...this.save,
          nodeId: targetNode.id,
          lineIndex:
            targetNode.id === this.save.nodeId ? targetNode.lines.length : 0,
          visitedNodes: [
            ...new Set([...this.save.visitedNodes, targetNode.id]),
          ],
          savedAt: new Date().toISOString(),
        }),
        (this.save = applyEffects(this.save, targetNode.effects)),
        this.save);
  }
  jump(nodeId, lineIndex = 0) {
    const targetNode = this.project.nodes.find((l) => l.id === nodeId);
    return !targetNode ||
      !evaluateCondition(
        targetNode.condition,
        this.save.variables,
        this.save.visitedNodes,
      )
      ? this.save
      : ((this.save = {
          ...this.save,
          nodeId: nodeId,
          lineIndex: Math.max(0, Math.min(lineIndex, targetNode.lines.length)),
          visitedNodes: [...new Set([...this.save.visitedNodes, nodeId])],
          savedAt: new Date().toISOString(),
        }),
        this.save);
  }
}
