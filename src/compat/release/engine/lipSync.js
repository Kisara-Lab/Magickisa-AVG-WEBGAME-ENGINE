// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
export function textMouthOpen(text, elapsedMs, rate = 9) {
  if (!text.trim()) return 0;
  const index = Math.floor(elapsedMs / Math.max(40, 1e3 / rate)) % text.length;
  return /[\u4e00-\u9fffA-Za-z]/.test(text[index] || "")
    ? 0.35 + (index % 3) * 0.2
    : 0.08;
}
export class LipSyncController {
  constructor(t) {
    defineField(this, "timer", null);
    defineField(this, "startedAt", 0);
    defineField(this, "context");
    defineField(this, "analyser");
    defineField(this, "source");
    defineField(this, "options");
    defineField(this, "tick", () => {
      if (this.options.mode === "audio" && this.analyser) {
        const t = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(t);
        const n = t.reduce((r, l) => r + l, 0) / Math.max(1, t.length);
        this.options.onMouthOpen(
          Math.min(1, (n / 255) * (this.options.sensitivity ?? 1.4)),
        );
      } else
        this.options.onMouthOpen(
          textMouthOpen(
            this.options.text || "",
            performance.now() - this.startedAt,
            this.options.rate,
          ),
        );
      this.timer = requestAnimationFrame(this.tick);
    });
    this.options = t;
  }
  start() {
    ((this.startedAt = performance.now()),
      this.options.mode === "audio" && this.options.audio && this.setupAudio(),
      this.tick());
  }
  stop() {
    var t, n, r;
    (this.timer !== null && cancelAnimationFrame(this.timer),
      (this.timer = null),
      this.options.onMouthOpen(0),
      (t = this.source) == null || t.disconnect(),
      (n = this.analyser) == null || n.disconnect(),
      (r = this.context) == null || r.close().catch(() => {}),
      (this.source = void 0),
      (this.analyser = void 0),
      (this.context = void 0));
  }
  setupAudio() {
    try {
      ((this.context = new AudioContext()),
        (this.analyser = this.context.createAnalyser()),
        (this.analyser.fftSize = 256),
        (this.source = this.context.createMediaElementSource(
          this.options.audio,
        )),
        this.source.connect(this.analyser),
        this.analyser.connect(this.context.destination));
    } catch {
      this.options.onMouthOpen(0);
    }
  }
}
