import { z } from "zod";

export const easingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);
const keyframeSchema = z
  .object({
    at: z.number().finite().nonnegative(),
    value: z.number().finite(),
    easing: easingSchema.default("linear"),
  })
  .strict();
export const sequenceTrackSchema = z
  .object({
    id: z.string().min(1),
    target: z.string().min(1),
    kind: z.enum([
      "background",
      "character",
      "camera",
      "text",
      "bgm",
      "sound",
      "voice",
      "video",
    ]),
    start: z.number().finite().nonnegative(),
    duration: z.number().finite().positive(),
    asset: z.string().min(1).optional(),
    text: z.string().optional(),
    expression: z.string().optional(),
    offset: z.number().finite().nonnegative().default(0),
    loop: z.boolean().default(false),
    volume: z.number().min(0).max(1).default(1),
    muted: z.boolean().default(false),
    properties: z
      .object({
        x: z.array(keyframeSchema).optional(),
        y: z.array(keyframeSchema).optional(),
        scale: z.array(keyframeSchema).optional(),
        opacity: z.array(keyframeSchema).optional(),
        rotation: z.array(keyframeSchema).optional(),
        shake: z.array(keyframeSchema).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export const sequenceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    duration: z.number().finite().positive(),
    skippable: z.boolean().default(true),
    waits: z.array(z.number().finite().nonnegative()).default([]),
    tracks: z.array(sequenceTrackSchema),
  })
  .strict();
export type Sequence = z.infer<typeof sequenceSchema>;
export type SequenceTrack = z.infer<typeof sequenceTrackSchema>;
export interface SequenceIssue {
  path: string;
  message: string;
}

export function sequenceIssues(sequence: Sequence): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  const ids = new Set<string>();
  const controls = new Map<
    string,
    { start: number; end: number; index: number }[]
  >();
  const add = (path: string, message: string) => issues.push({ path, message });
  sequence.waits.forEach((at, i) => {
    if (at >= sequence.duration || (i > 0 && at <= sequence.waits[i - 1]))
      add(`waits.${i}`, "等待点必须严格递增且位于演出结束之前");
  });
  sequence.tracks.forEach((track, i) => {
    const prefix = `tracks.${i}`;
    if (ids.has(track.id)) add(`${prefix}.id`, "轨道 ID 重复");
    ids.add(track.id);
    if (track.start + track.duration > sequence.duration)
      add(`${prefix}.duration`, "片段超出演出长度");
    if (!["camera", "text"].includes(track.kind) && !track.asset)
      add(`${prefix}.asset`, "此轨道需要素材引用");
    if (track.kind === "text" && !track.text)
      add(`${prefix}.text`, "字幕不能为空");
    for (const [property, keys] of Object.entries(track.properties)) {
      keys?.forEach((key, j) => {
        if (key.at > track.duration || (j > 0 && key.at <= keys[j - 1].at))
          add(
            `${prefix}.properties.${property}.${j}`,
            "关键帧时间必须严格递增并位于片段内",
          );
        if (property === "opacity" && (key.value < 0 || key.value > 1))
          add(
            `${prefix}.properties.${property}.${j}.value`,
            "透明度必须在 0–1 之间",
          );
        if (["scale", "shake"].includes(property) && key.value < 0)
          add(
            `${prefix}.properties.${property}.${j}.value`,
            "缩放和震动不能为负数",
          );
      });
    }
    if (track.muted) return;
    // A target owns its appearance/media and each animated property independently.
    const channels = [
      ...Object.keys(track.properties),
      ...(track.kind === "camera" ? [] : ["appearance"]),
    ];
    for (const property of channels) {
      const key = `${track.kind}:${track.target}:${property}`;
      const existing = controls.get(key) ?? [];
      for (const other of existing)
        if (
          track.start < other.end &&
          track.start + track.duration > other.start
        )
          add(
            prefix,
            `与轨道 ${sequence.tracks[other.index].id} 重复控制 ${property}`,
          );
      existing.push({
        start: track.start,
        end: track.start + track.duration,
        index: i,
      });
      controls.set(key, existing);
    }
  });
  return issues;
}

function ease(t: number, name: z.infer<typeof easingSchema>) {
  return name === "ease-in"
    ? t * t
    : name === "ease-out"
      ? 1 - (1 - t) ** 2
      : name === "ease-in-out"
        ? t < 0.5
          ? 2 * t * t
          : 1 - (-2 * t + 2) ** 2 / 2
        : t;
}
export function keyframeValue(
  keys: z.infer<typeof keyframeSchema>[],
  time: number,
): number | undefined {
  if (!keys.length) return undefined;
  if (time <= keys[0].at) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const left = keys[i - 1],
      right = keys[i];
    if (time <= right.at) {
      const t = ease((time - left.at) / (right.at - left.at), right.easing);
      return left.value + (right.value - left.value) * t;
    }
  }
  return keys[keys.length - 1].value;
}

/** Pure sampling: seeking cannot emit audio, complete a scene or change variables. */
export function sampleSequence(sequence: Sequence, time: number) {
  const at = Math.max(0, Math.min(sequence.duration, time));
  return sequence.tracks
    .filter((t) => !t.muted && t.start <= at)
    .sort((a, b) => a.start - b.start)
    .map((track) => {
      const local = Math.min(track.duration, at - track.start);
      return {
        track,
        active: at < track.start + track.duration,
        local,
        properties: Object.fromEntries(
          Object.entries(track.properties).map(([key, frames]) => [
            key,
            keyframeValue(frames ?? [], local),
          ]),
        ),
      };
    });
}

/** Retain previous channels when a later clip animates only part of a target. */
export function sequenceVisualState(sequence: Sequence, time: number) {
  const samples = sampleSequence(sequence, time);
  const visual = new Map<string, (typeof samples)[number]>();
  let camera: (typeof samples)[number]["properties"] = {};
  for (const sample of samples) {
    if (sample.track.kind === "camera")
      camera = { ...camera, ...sample.properties };
    if (["background", "character", "text"].includes(sample.track.kind)) {
      const key = `${sample.track.kind}:${sample.track.target}`;
      const previous = visual.get(key);
      visual.set(key, {
        ...sample,
        properties: { ...previous?.properties, ...sample.properties },
      });
    }
  }
  return { samples, camera, visual: [...visual.values()] };
}

export interface SequenceCursor {
  time: number;
  waiting: number | null;
  finished: boolean;
}
/** Caller supplies elapsed seconds; visibility/media pauses simply stop calling tick. */
export class SequenceClock {
  cursor: SequenceCursor;
  constructor(
    readonly sequence: Sequence,
    cursor?: SequenceCursor,
  ) {
    this.cursor = cursor
      ? { ...cursor }
      : {
          time: 0,
          waiting: sequence.waits.includes(0) ? 0 : null,
          finished: false,
        };
    if (
      !Number.isFinite(this.cursor.time) ||
      this.cursor.time < 0 ||
      this.cursor.time > sequence.duration ||
      (this.cursor.waiting !== null &&
        (!sequence.waits.includes(this.cursor.waiting) ||
          this.cursor.time !== this.cursor.waiting)) ||
      (this.cursor.finished && this.cursor.time !== sequence.duration)
    )
      throw new Error("无效演出恢复位置");
  }
  tick(seconds: number): boolean {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error("无效演出时间增量");
    if (this.cursor.finished || this.cursor.waiting !== null) return false;
    const next = Math.min(this.sequence.duration, this.cursor.time + seconds);
    const wait = this.sequence.waits.find(
      (at) => at > this.cursor.time && at <= next,
    );
    this.cursor.time = wait ?? next;
    this.cursor.waiting = wait ?? null;
    if (next === this.sequence.duration && wait === undefined) {
      this.cursor.finished = true;
      return true;
    }
    return false;
  }
  resume() {
    this.cursor.waiting = null;
  }
  skip(): boolean {
    if (!this.sequence.skippable || this.cursor.finished) return false;
    this.cursor = {
      time: this.sequence.duration,
      waiting: null,
      finished: true,
    };
    return true;
  }
}
