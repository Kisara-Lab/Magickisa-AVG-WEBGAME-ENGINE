export function textMouthOpen(text: string, elapsed: number, rate = 9) {
  if (!text.trim()) return 0;
  const i = Math.floor(elapsed / Math.max(40, 1000 / rate)) % text.length;
  return /[\u4e00-\u9fffA-Za-z]/.test(text[i] || "")
    ? 0.35 + (i % 3) * 0.2
    : 0.08;
}
export class LipSyncController {
  private frame = 0;
  private startTime = 0;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private source?: MediaElementAudioSourceNode;
  constructor(
    private options: {
      mode: "text" | "audio";
      text?: string;
      audio?: HTMLAudioElement | null;
      onMouthOpen: (value: number) => void;
    },
  ) {}
  start() {
    this.startTime = performance.now();
    if (this.options.mode === "audio" && this.options.audio)
      try {
        this.context = new AudioContext();
        this.analyser = this.context.createAnalyser();
        this.source = this.context.createMediaElementSource(this.options.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      } catch {
        this.options.onMouthOpen(0);
      }
    this.tick();
  }
  private tick = () => {
    let value = textMouthOpen(
      this.options.text || "",
      performance.now() - this.startTime,
    );
    if (this.analyser) {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      value = Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 180);
    }
    this.options.onMouthOpen(value);
    this.frame = requestAnimationFrame(this.tick);
  };
  stop() {
    cancelAnimationFrame(this.frame);
    this.options.onMouthOpen(0);
    this.source?.disconnect();
    this.analyser?.disconnect();
    void this.context?.close();
  }
}
