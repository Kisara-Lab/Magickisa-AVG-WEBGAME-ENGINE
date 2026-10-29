import { useState } from "react";
import { sequenceTrackSchema, type SequenceTrack } from "../engine/sequence";

const properties = {
  x: "横向位置 (%)",
  y: "纵向位置 (%)",
  scale: "缩放",
  opacity: "透明度",
  rotation: "旋转 (°)",
  shake: "震动强度",
  volume: "音量包络 (0–1)",
} as const;
export function SequenceKeyframes({
  track,
  time,
  onChange,
}: {
  track: SequenceTrack;
  time: number;
  onChange: (track: SequenceTrack) => void;
}) {
  const [property, setProperty] = useState<keyof typeof properties>("x");
  const [error, setError] = useState("");
  const frames = track.properties[property] ?? [];
  const apply = (next: typeof frames) => {
    try {
      const sorted = [...next].sort((a, b) => a.at - b.at);
      if (
        sorted.some(
          (k, i) =>
            k.at > track.duration || (i > 0 && k.at === sorted[i - 1].at),
        )
      )
        throw new Error("关键帧必须位于片段内，且时间不能重复。");
      if (
        ["opacity", "volume"].includes(property) &&
        sorted.some((k) => k.value < 0 || k.value > 1)
      )
        throw new Error("透明度和音量必须为 0–1。");
      if (
        ["scale", "shake"].includes(property) &&
        sorted.some((k) => k.value < 0)
      )
        throw new Error("缩放和震动不能为负数。");
      const props = { ...track.properties };
      if (sorted.length) props[property] = sorted;
      else delete props[property];
      onChange(sequenceTrackSchema.parse({ ...track, properties: props }));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <section aria-label="可视关键帧编辑">
      <h4>关键帧</h4>
      <label>
        动画属性
        <select
          value={property}
          onChange={(e) => {
            setProperty(e.target.value as keyof typeof properties);
            setError("");
          }}
        >
          {Object.entries(properties).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p>
        时间相对于当前片段起点；删除全部关键帧后使用该属性默认值。其他属性保持不变。
      </p>
      <button
        onClick={() => {
          const at =
            Math.round(
              Math.max(0, Math.min(track.duration, time - track.start)) * 1000,
            ) / 1000;
          if (frames.some((k) => k.at === at)) {
            setError("当前时间已有关键帧，请直接编辑。 ");
            return;
          }
          apply([
            ...frames,
            {
              at,
              value: ["scale", "opacity", "volume"].includes(property) ? 1 : 0,
              easing: "linear",
            },
          ]);
        }}
      >
        在播放头添加关键帧
      </button>
      {frames.map((frame, index) => (
        <div className="st-fields" key={`${track.id}:${property}:${index}`}>
          <label>
            时间（秒）
            <input
              type="number"
              min={0}
              max={track.duration}
              step="0.01"
              value={frame.at}
              onChange={(e) =>
                apply(
                  frames.map((k, i) =>
                    i === index ? { ...k, at: Number(e.target.value) } : k,
                  ),
                )
              }
            />
          </label>
          <label>
            {properties[property]}
            <input
              type="number"
              step="0.01"
              value={frame.value}
              onChange={(e) =>
                apply(
                  frames.map((k, i) =>
                    i === index ? { ...k, value: Number(e.target.value) } : k,
                  ),
                )
              }
            />
          </label>
          <label>
            到达此帧的缓动
            <select
              value={frame.easing}
              onChange={(e) =>
                apply(
                  frames.map((k, i) =>
                    i === index
                      ? { ...k, easing: e.target.value as typeof frame.easing }
                      : k,
                  ),
                )
              }
            >
              <option value="linear">线性</option>
              <option value="ease-in">渐入</option>
              <option value="ease-out">渐出</option>
              <option value="ease-in-out">渐入渐出</option>
            </select>
          </label>
          <button onClick={() => apply(frames.filter((_, i) => i !== index))}>
            删除关键帧 {index + 1}
          </button>
        </div>
      ))}
      {!frames.length && <p>此属性尚未设置动画。</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
