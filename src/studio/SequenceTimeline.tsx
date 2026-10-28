import { useRef, useState } from "react";
import type { Sequence, SequenceTrack } from "../engine/sequence";

/** Pointer previews stay local; release commits one history operation. */
export function SequenceTimeline({
  sequence,
  zoom,
  selected,
  onSelect,
  onChange,
  locked = [],
}: {
  sequence: Sequence;
  zoom: number;
  selected: string;
  onSelect: (id: string) => void;
  onChange: (track: SequenceTrack) => void;
  locked?: string[];
}) {
  const [snap, setSnap] = useState(true);
  const [preview, setPreview] = useState<SequenceTrack>();
  const gesture = useRef<{
    x: number;
    track: SequenceTrack;
    resize: boolean;
    next: SequenceTrack;
  }>();
  const cancel = () => {
    gesture.current = undefined;
    setPreview(undefined);
  };
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={snap}
          onChange={(e) => setSnap(e.target.checked)}
        />
        吸附至 0.1 秒（按住 Alt 临时关闭）
      </label>
      <p>
        拖动片段移动，拖动右端调整长度；选中片段后方向键移动，Shift＋方向键调整长度。精确数值仍可在检查器中修改。
      </p>
      <div className="production-timeline">
        <div style={{ width: Math.max(500, sequence.duration * zoom) }}>
          {sequence.tracks.map((original) => {
            const track = preview?.id === original.id ? preview : original;
            return (
              <div className="production-track" key={track.id}>
                <button
                  aria-pressed={selected === track.id}
                  aria-label={`${track.kind} ${track.target}，开始 ${track.start} 秒，长度 ${track.duration} 秒`}
                  style={{
                    marginLeft: track.start * zoom,
                    width: Math.max(24, track.duration * zoom),
                    position: "relative",
                    touchAction: "none",
                    overflow: "hidden",
                  }}
                  onClick={() => onSelect(track.id)}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || locked.includes(original.id)) return;
                    onSelect(original.id);
                    e.currentTarget.setPointerCapture(e.pointerId);
                    gesture.current = {
                      x: e.clientX,
                      track: original,
                      next: original,
                      resize:
                        (e.target as HTMLElement).dataset.resize === "true",
                    };
                  }}
                  onPointerMove={(e) => {
                    const g = gesture.current;
                    if (!g || g.track.id !== original.id) return;
                    const delta = (e.clientX - g.x) / zoom;
                    const quantize = (value: number) =>
                      Math.round(value * (snap && !e.altKey ? 10 : 1000)) /
                      (snap && !e.altKey ? 10 : 1000);
                    const next = g.resize
                      ? {
                          ...g.track,
                          duration: Math.max(
                            0.01,
                            Math.min(
                              sequence.duration - g.track.start,
                              quantize(g.track.duration + delta),
                            ),
                          ),
                        }
                      : {
                          ...g.track,
                          start: Math.max(
                            0,
                            Math.min(
                              sequence.duration - g.track.duration,
                              quantize(g.track.start + delta),
                            ),
                          ),
                        };
                    // Do not silently discard keyframes when shortening a clip.
                    if (
                      g.resize &&
                      Object.values(g.track.properties).some((keys) =>
                        keys?.some((k) => k.at > next.duration),
                      )
                    )
                      return;
                    g.next = next;
                    setPreview(next);
                  }}
                  onPointerUp={() => {
                    const g = gesture.current;
                    if (
                      g &&
                      (g.next.start !== g.track.start ||
                        g.next.duration !== g.track.duration)
                    )
                      onChange(g.next);
                    cancel();
                  }}
                  onPointerCancel={cancel}
                  onLostPointerCapture={cancel}
                  onKeyDown={(e) => {
                    if (locked.includes(original.id)) return;
                    if (e.key === "Escape") {
                      cancel();
                      return;
                    }
                    if (
                      e.ctrlKey ||
                      e.metaKey ||
                      e.altKey ||
                      !["ArrowLeft", "ArrowRight"].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    const delta = e.key === "ArrowLeft" ? -0.1 : 0.1;
                    const key = e.shiftKey ? "duration" : "start";
                    const value =
                      Math.round((original[key] + delta) * 100) / 100;
                    const next = { ...original, [key]: value };
                    if (
                      next.start < 0 ||
                      next.duration <= 0 ||
                      next.start + next.duration > sequence.duration
                    )
                      return;
                    if (
                      Object.values(next.properties).some((keys) =>
                        keys?.some((k) => k.at > next.duration),
                      )
                    )
                      return;
                    onChange(next);
                  }}
                >
                  {track.kind} · {track.target} {track.muted ? "（禁用）" : ""}
                  {locked.includes(track.id) ? "（锁定）" : ""}
                  <span
                    data-resize="true"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      height: "100%",
                      width: 16,
                      cursor: "ew-resize",
                      borderLeft: "2px solid currentColor",
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {preview && (
        <p role="status">
          开始 {preview.start.toFixed(2)} 秒 · 长度{" "}
          {preview.duration.toFixed(2)} 秒；释放应用，Esc 取消。
        </p>
      )}
    </>
  );
}
