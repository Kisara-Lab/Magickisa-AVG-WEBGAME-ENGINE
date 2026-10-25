// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
export class RendererRegistry {
  constructor() {
    defineField(this, "live2d", null);
  }
  registerLive2D(t) {
    return (
      (this.live2d = t),
      () => {
        this.live2d === t && (this.live2d = null);
      }
    );
  }
  getLive2D() {
    return this.live2d;
  }
}
export const rendererRegistry = new RendererRegistry();
