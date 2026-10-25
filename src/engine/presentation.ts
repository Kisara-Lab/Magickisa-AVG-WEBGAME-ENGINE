import type { PresentationState } from "./types";
export class PresentationRegistry {
  private handlers = new Map<
    string,
    (presentation: PresentationState) => void
  >();
  register(id: string, handler: (presentation: PresentationState) => void) {
    this.handlers.set(id, handler);
    return () => {
      if (this.handlers.get(id) === handler) this.handlers.delete(id);
    };
  }
  play(presentation: PresentationState | null) {
    if (presentation) this.handlers.get(presentation.id)?.(presentation);
  }
  has(id: string) {
    return this.handlers.has(id);
  }
}
