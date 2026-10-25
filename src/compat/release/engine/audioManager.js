// MAGICKISA release-compatible runtime.
import { defineField } from "./fields.js";
export class AudioManager {
  constructor() {
    defineField(this, "channels", new Map());
  }
  play(id, src, options = {}) {
    let audio = this.channels.get(id);
    return (
      audio || ((audio = new Audio(src)), this.channels.set(id, audio)),
      audio.src !== new URL(src, window.location.href).href &&
        (audio.src = src),
      (audio.volume = options.volume ?? 1),
      (audio.loop = options.loop ?? !0),
      audio.play().catch(() => {}),
      audio
    );
  }
  pause(id) {
    var n;
    (n = this.channels.get(id)) == null || n.pause();
  }
  stop(id) {
    const audio = this.channels.get(id);
    (audio == null || audio.pause(), audio && (audio.currentTime = 0));
  }
  stopAll() {
    this.channels.forEach((t) => t.pause());
  }
}
