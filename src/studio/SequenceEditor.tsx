import { useEffect, useState, useRef } from "react";
import type { StoryProject } from "../engine/types";
import {
  sequenceSchema,
  sequenceTrackSchema,
  sequenceIssues,
  type SequenceTrack,
} from "../engine/sequence";
import { SequenceStage } from "../engine/SequenceStage";
import { randomId } from "../engine/id";
import { Card, Field, Check } from "./fields";
import { Fold } from "./components";
import { PickAsset } from "./AssetPicker";
import { mediaUrl, type Profile } from "./model";
import "./production.css";
import { SequenceTimeline } from "./SequenceTimeline";
import { SequenceKeyframes } from "./SequenceKeyframes";

export function SequenceEditor({
  project,
  onChange,
  profile,
}: {
  project: StoryProject;
  onChange: (p: StoryProject) => void;
  profile: Profile;
}) {
  const [id, setId] = useState(project.sequences?.[0]?.id ?? "");
  const [trackId, setTrackId] = useState("");
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [zoom, setZoom] = useState(40);
  const [error, setError] = useState(""),
    [keys, setKeys] = useState("");
  const [drag, setDrag] = useState<{ x: number; y: number; id: string }>();
  const stage = useRef<HTMLDivElement>(null);
  const sequence = project.sequences?.find((s) => s.id === id);
  const track = sequence?.tracks.find((t) => t.id === trackId);
  const select = (id: string) => {
    setTrackId(id);
    setKeys("");
  };
  const change = (next: NonNullable<typeof sequence>) =>
    onChange({
      ...project,
      sequences: project.sequences!.map((s) => (s.id === id ? next : s)),
    });
  const changeTrack = (next: SequenceTrack) => {
    if (sequence)
      change({
        ...sequence,
        tracks: sequence.tracks.map((t) => (t.id === next.id ? next : t)),
      });
  };
  useEffect(() => {
    if (!playing || !sequence) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        if (t + dt >= sequence.duration) {
          setPlaying(false);
          return sequence.duration;
        }
        return t + dt;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [playing, sequence?.id, sequence?.duration]);
  const problems = sequence ? sequenceIssues(sequence) : [];
  const display =
    sequence && drag
      ? {
          ...sequence,
          tracks: sequence.tracks.map((t) =>
            t.id === drag.id
              ? {
                  ...t,
                  properties: {
                    ...t.properties,
                    x: [
                      {
                        at: Math.max(0, Math.min(t.duration, time - t.start)),
                        value: drag.x,
                        easing: "linear" as const,
                      },
                    ],
                    y: [
                      {
                        at: Math.max(0, Math.min(t.duration, time - t.start)),
                        value: drag.y,
                        easing: "linear" as const,
                      },
                    ],
                  },
                }
              : t,
          ),
        }
      : sequence;
  const setPosition = (x: number, y: number) => {
    if (!track) return;
    const at = Math.max(0, Math.min(track.duration, time - track.start));
    const insert = (axis: "x" | "y", value: number) =>
      [
        ...(track.properties[axis] ?? []).filter((k) => k.at !== at),
        { at, value, easing: "linear" as const },
      ].sort((a, b) => a.at - b.at);
    changeTrack({
      ...track,
      properties: { ...track.properties, x: insert("x", x), y: insert("y", y) },
    });
  };
  return (
    <Card title="多轨演出与舞台">
      <p>
        时间轴仅控制画面与媒体。剧情跳转、条件和变量仍在场景及分支配置。拖动播放头不会执行剧情。
      </p>
      <div className="st-inline">
        <select
          aria-label="选择通用演出"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setTrackId("");
            setTime(0);
            setPlaying(false);
          }}
        >
          <option value="">选择演出</option>
          {project.sequences?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.id}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const s = sequenceSchema.parse({
              id: randomId(),
              name: "新演出",
              duration: 10,
              tracks: [],
            });
            onChange({
              ...project,
              sequences: [...(project.sequences ?? []), s],
            });
            setId(s.id);
            setTime(0);
          }}
        >
          新增演出
        </button>
      </div>
      {sequence && (
        <>
          <div className="st-fields">
            <Field
              label="演出名称"
              value={sequence.name}
              onChange={(name) => change({ ...sequence, name })}
            />
            <label>
              演出长度（秒）
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={sequence.duration}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n > 0) change({ ...sequence, duration: n });
                }}
              />
            </label>
            <Check
              label="允许玩家跳过"
              value={sequence.skippable}
              onChange={(skippable) => change({ ...sequence, skippable })}
            />
            <Field
              label="等待点（秒，逗号分隔）"
              value={sequence.waits.join(",")}
              onChange={(v) => {
                const waits = v.trim() ? v.split(",").map(Number) : [];
                if (waits.every(Number.isFinite))
                  change({ ...sequence, waits });
              }}
            />
          </div>
          <div
            className="production-stage"
            ref={stage}
            onPointerDown={(e) => {
              if (
                !track ||
                !["character", "background", "text", "camera"].includes(
                  track.kind,
                )
              )
                return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setPlaying(false);
              const rect = e.currentTarget.getBoundingClientRect();
              setDrag({
                id: track.id,
                x: ((e.clientX - rect.left) / rect.width) * 100,
                y: ((e.clientY - rect.top) / rect.height) * 100,
              });
            }}
            onPointerMove={(e) => {
              if (!drag) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setDrag({
                ...drag,
                x: Math.round(((e.clientX - rect.left) / rect.width) * 100),
                y: Math.round(((e.clientY - rect.top) / rect.height) * 100),
              });
            }}
            onPointerUp={() => {
              if (drag) {
                setPosition(drag.x, drag.y);
                setDrag(undefined);
              }
            }}
            onPointerCancel={() => setDrag(undefined)}
          >
            <SequenceStage
              project={project}
              sequence={display!}
              time={time}
              playing={playing}
              onFailure={setError}
              assetUrl={(url) => mediaUrl(profile, url)}
            />
            <div className="production-safe-area" aria-hidden="true" />
          </div>
          <p>
            选中视觉轨道后可拖动舞台，为当前时间添加位置关键帧；拖动结束产生一次修改。数字输入与关键帧编辑可完成同样操作。
          </p>
          <div className="st-inline">
            <button
              onClick={() => {
                if (time >= sequence.duration) setTime(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "暂停演出预览" : "播放演出预览"}
            </button>
            <label>
              播放头
              <input
                type="number"
                min="0"
                max={sequence.duration}
                step="0.01"
                value={Number(time.toFixed(2))}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(
                    Math.max(
                      0,
                      Math.min(sequence.duration, Number(e.target.value)),
                    ),
                  );
                }}
              />
            </label>
            <label>
              时间轴缩放
              <input
                type="range"
                min="10"
                max="200"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
          </div>
          <input
            aria-label="演出播放头"
            type="range"
            min="0"
            max={sequence.duration}
            step="0.01"
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
          />
          <SequenceTimeline
            sequence={sequence}
            zoom={zoom}
            selected={trackId}
            onSelect={(id) => {
              setPlaying(false);
              select(id);
            }}
            onChange={changeTrack}
          />
          <button
            onClick={() => {
              const t = sequenceTrackSchema.parse({
                id: randomId(),
                kind: "text",
                target: "字幕",
                text: "",
                start: 0,
                duration: sequence.duration,
              });
              change({ ...sequence, tracks: [...sequence.tracks, t] });
              select(t.id);
            }}
          >
            新增轨道
          </button>
          {track && (
            <Fold
              title="当前轨道检查器"
              summary={`${track.kind} · ${track.id}`}
            >
              <div className="st-fields">
                <Field
                  label="轨道类型"
                  value={track.kind}
                  options={[
                    "background",
                    "character",
                    "camera",
                    "text",
                    "bgm",
                    "sound",
                    "voice",
                    "video",
                  ].map((value) => ({ value, label: value }))}
                  onChange={(kind) =>
                    changeTrack({
                      ...track,
                      kind: kind as SequenceTrack["kind"],
                    })
                  }
                />
                <Field
                  label="舞台目标标识"
                  value={track.target}
                  onChange={(target) => changeTrack({ ...track, target })}
                />
                <Field
                  label="素材 ID 或路径"
                  value={track.asset ?? ""}
                  onChange={(asset) =>
                    changeTrack({ ...track, asset: asset || undefined })
                  }
                />
                {track.kind !== "camera" && track.kind !== "text" && (
                  <PickAsset
                    kind={
                      track.kind === "video"
                        ? "video"
                        : ["bgm", "sound", "voice"].includes(track.kind)
                          ? "audio"
                          : "image"
                    }
                    label="选择轨道素材"
                    onPick={(asset) => changeTrack({ ...track, asset })}
                  />
                )}
                <Field
                  label="叠字或字幕"
                  value={track.text ?? ""}
                  onChange={(text) => changeTrack({ ...track, text })}
                />
                {(
                  [
                    ["start", "开始时间"],
                    ["duration", "片段长度"],
                    ["offset", "素材起点"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={key === "duration" ? 0.01 : 0}
                      step="0.01"
                      value={track[key]}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (
                          Number.isFinite(n) &&
                          n >= (key === "duration" ? 0.01 : 0)
                        )
                          changeTrack({ ...track, [key]: n });
                      }}
                    />
                  </label>
                ))}
                <label>
                  轨道音量
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={track.volume}
                    onChange={(e) =>
                      changeTrack({ ...track, volume: Number(e.target.value) })
                    }
                  />
                </label>
                <Check
                  label="循环素材"
                  value={track.loop}
                  onChange={(loop) => changeTrack({ ...track, loop })}
                />
                <Check
                  label="禁用此轨道"
                  value={track.muted}
                  onChange={(muted) => changeTrack({ ...track, muted })}
                />
              </div>
              <button
                onClick={() => {
                  const copy = {
                    ...structuredClone(track),
                    id: randomId(),
                    target: `${track.target}-副本`,
                  };
                  change({ ...sequence, tracks: [...sequence.tracks, copy] });
                  select(copy.id);
                }}
              >
                复制轨道
              </button>
              <button
                onClick={() => {
                  change({
                    ...sequence,
                    tracks: sequence.tracks.filter((t) => t.id !== track.id),
                  });
                  select("");
                }}
              >
                删除当前轨道
              </button>
              <button
                onClick={() =>
                  setKeys(JSON.stringify(track.properties, null, 2))
                }
              >
                编辑精确关键帧
              </button>
              <SequenceKeyframes
                key={track.id}
                track={track}
                time={time}
                onChange={changeTrack}
              />
              {keys && (
                <>
                  <textarea
                    aria-label="轨道关键帧 JSON"
                    value={keys}
                    onChange={(e) => setKeys(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      try {
                        changeTrack({
                          ...track,
                          properties:
                            sequenceTrackSchema.shape.properties.parse(
                              JSON.parse(keys),
                            ),
                        });
                        setKeys("");
                        setError("");
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    应用关键帧
                  </button>
                </>
              )}
            </Fold>
          )}
          {problems.map((p, i) => (
            <p role="alert" key={i}>
              {p.path}：{p.message}
            </p>
          ))}
        </>
      )}
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => setError("")}>关闭提示</button>
        </p>
      )}
    </Card>
  );
}
