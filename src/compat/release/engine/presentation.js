// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
export class PresentationRegistry {
  constructor() {
    defineField(this, "handlers", new Map());
  }
  register(t, n) {
    return (this.handlers.set(t, n), () => this.handlers.delete(t));
  }
  play(t) {
    var n;
    t && ((n = this.handlers.get(t.id)) == null || n(t));
  }
  has(t) {
    return this.handlers.has(t);
  }
}
