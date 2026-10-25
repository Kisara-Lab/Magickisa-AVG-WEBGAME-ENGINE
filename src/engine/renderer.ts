import type { Character } from "./types";
export interface Live2DInstance {
  dispose(): void;
  setExpression?(expression?: string): void;
  setMouthOpen?(value: number): void;
}
export interface Live2DAdapter {
  mount(options: {
    container: HTMLElement;
    character: Character;
    expression?: string;
  }): Live2DInstance;
}
class RendererRegistry {
  private adapter: Live2DAdapter | null = null;
  registerLive2D(adapter: Live2DAdapter) {
    this.adapter = adapter;
    return () => {
      if (this.adapter === adapter) this.adapter = null;
    };
  }
  getLive2D() {
    return this.adapter;
  }
}
export const rendererRegistry = new RendererRegistry();
