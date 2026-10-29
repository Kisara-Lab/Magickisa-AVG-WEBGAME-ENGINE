import { describeError } from "../engine/errors";
import { useEffect, useState, useRef } from "react";
import type { StoryProject } from "../engine/types";
import {
  sequenceSchema,
  sequenceTrackSchema,
  sequenceIssues,
  sampleSequence,
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
import { SequencePreset } from "./SequencePreset";
import { waitPointsError } from "./sequenceInput";

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
  const [locked, setLocked] = useState<string[]>([]);
  const [solo, setSolo] = useState("");
  const [removeId, setRemoveId] = useState("");
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [zoom, setZoom] = useState(40);
  const [error, setError] = useState(""),
    [keys, setKeys] = useState("");
  const [drag, setDrag] = useState<{ x: number; y: number; id: string }>();
  const stage = useRef<HTMLDivElement>(null);
  const stageGesture = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  }>();
  const sequence = project.sequences?.find((s) => s.id === id);
  const track = sequence?.tracks.find((t) => t.id === trackId);
  const sequenceUsers = sequence
    ? project.nodes.flatMap((node) => [
        ...(node.enterSequence === sequence.id
          ? [`${node.title} · 进入演出`]
          : []),
        ...(node.exitSequence === sequence.id
          ? [`${node.title} · 离开演出`]
          : []),
        ...node.lines
          .filter((line) => line.sequence === sequence.id)
          .map((line) => `${node.title} · 台词 ${line.id}`),
      ])
    : [];
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
    if (sequence && !locked.includes(next.id))
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
            setSolo("");
            setLocked([]);
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
      <Fold title="复用演出预设" summary="复制、导出与检查导入">
        <SequencePreset
          project={project}
          sequence={sequence}
          onAdd={(next) => {
            onChange({
              ...project,
              sequences: [...(project.sequences ?? []), next],
            });
            setId(next.id);
            setTrackId("");
            setTime(0);
            setPlaying(false);
            setSolo("");
            setLocked([]);
          }}
        />
      </Fold>
      {sequence && (
        <>
          <Fold
            title="演出引用与删除"
            summary={`${sequenceUsers.length} 处使用`}
          >
            {sequenceUsers.length ? (
              <ul>
                {sequenceUsers.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>当前已应用工程没有引用此演出。</p>
            )}
            <button
              disabled={sequenceUsers.length > 0}
              onClick={() => setRemoveId(sequence.id)}
            >
              检查删除此演出
            </button>
            {removeId === sequence.id && (
              <div role="group" aria-label="删除演出确认">
                <p>
                  删除“{sequence.name}
                  ”及其全部轨道？可通过工程撤销恢复，素材文件保留。
                </p>
                <button
                  disabled={sequenceUsers.length > 0}
                  onClick={() => {
                    onChange({
                      ...project,
                      sequences: project.sequences!.filter(
                        (s) => s.id !== sequence.id,
                      ),
                    });
                    setId("");
                    setTrackId("");
                    setPlaying(false);
                    setRemoveId("");
                    setSolo("");
                  }}
                >
                  确认删除未引用演出
                </button>
                <button onClick={() => setRemoveId("")}>取消删除演出</button>
              </div>
            )}
          </Fold>
          <div className="st-fields">
            <Field
              label="演出名称"
              value={sequence.name}
              onChange={(name) => change({ ...sequence, name })}
            />
            <Field
              label="演出长度（秒）"
              type="number"
              min={0.1}
              step={0.1}
              value={sequence.duration}
              onChange={(v) => change({ ...sequence, duration: Number(v) })}
            />
            <Check
              label="允许玩家跳过"
              value={sequence.skippable}
              onChange={(skippable) => change({ ...sequence, skippable })}
            />
            <Field
              label="等待点（秒，逗号分隔）"
              value={sequence.waits.join(",")}
              validate={(text) => waitPointsError(text, sequence.duration)}
              onChange={(v) => {
                const waits = v.trim() ? v.split(",").map(Number) : [];
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
                locked.includes(track.id) ||
                !["character", "background", "text", "camera"].includes(
                  track.kind,
                )
              )
                return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setPlaying(false);
              const rect = e.currentTarget.getBoundingClientRect();
              const sampled = sampleSequence(sequence, time).find(
                (sample) => sample.track.id === track.id,
              )?.properties;
              const x =
                sampled?.x ??
                (["background", "camera"].includes(track.kind) ? 0 : 50);
              const y =
                sampled?.y ??
                (["background", "camera"].includes(track.kind) ? 0 : 50);
              stageGesture.current = {
                x,
                y,
                startX: e.clientX,
                startY: e.clientY,
              };
              setDrag({
                id: track.id,
                x,
                y,
              });
            }}
            onPointerMove={(e) => {
              if (!drag || !stageGesture.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const gesture = stageGesture.current;
              setDrag({
                ...drag,
                x: Math.round(
                  gesture.x + ((e.clientX - gesture.startX) / rect.width) * 100,
                ),
                y: Math.round(
                  gesture.y +
                    ((e.clientY - gesture.startY) / rect.height) * 100,
                ),
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
              sequence={
                solo
                  ? {
                      ...display!,
                      tracks: display!.tracks.filter((t) => t.id === solo),
                    }
                  : display!
              }
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
            <Field
              label="播放头"
              type="number"
              min={0}
              max={sequence.duration}
              step={0.01}
              value={Number(time.toFixed(2))}
              onChange={(v) => {
                setPlaying(false);
                setTime(Number(v));
              }}
            />
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
            locked={locked}
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
              <div className="st-inline">
                <Check
                  label="锁定当前轨道（本次编辑）"
                  value={locked.includes(track.id)}
                  onChange={(value) =>
                    setLocked(
                      value
                        ? [...locked, track.id]
                        : locked.filter((id) => id !== track.id),
                    )
                  }
                />
                <Check
                  label="独奏预览（不影响发行）"
                  value={solo === track.id}
                  onChange={(value) => setSolo(value ? track.id : "")}
                />
              </div>
              <fieldset disabled={locked.includes(track.id)}>
                <legend>轨道属性与操作</legend>
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
                  {track.kind === "character" && (
                    <>
                      <Field
                        label="轨道人物"
                        value={track.characterId ?? ""}
                        options={[
                          { value: "", label: "直接使用图片素材" },
                          ...project.characters.map((c) => ({
                            value: c.id,
                            label: c.name,
                          })),
                        ]}
                        onChange={(characterId) =>
                          changeTrack({
                            ...track,
                            characterId: characterId || undefined,
                            expression: undefined,
                          })
                        }
                      />
                      {track.characterId && (
                        <Field
                          label="轨道人物表情"
                          value={track.expression ?? ""}
                          options={[
                            { value: "", label: "默认立绘" },
                            ...Object.keys(
                              project.characters.find(
                                (c) => c.id === track.characterId,
                              )?.expressions ?? {},
                            ).map((value) => ({ value, label: value })),
                          ]}
                          onChange={(expression) =>
                            changeTrack({
                              ...track,
                              expression: expression || undefined,
                            })
                          }
                        />
                      )}
                    </>
                  )}
                  <Field
                    label="轨道层级"
                    type="number"
                    min={-100}
                    max={100}
                    step={1}
                    value={track.zIndex}
                    onChange={(value) => {
                      const zIndex = Number(value);
                      if (Number.isInteger(zIndex) && Math.abs(zIndex) <= 100)
                        changeTrack({ ...track, zIndex });
                    }}
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
                    <Field
                      key={key}
                      label={label}
                      type="number"
                      min={key === "duration" ? 0.01 : 0}
                      step={0.01}
                      value={track[key]}
                      onChange={(v) =>
                        changeTrack({ ...track, [key]: Number(v) })
                      }
                    />
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
                        changeTrack({
                          ...track,
                          volume: Number(e.target.value),
                        })
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
                    if (solo === track.id) setSolo("");
                  }}
                >
                  删除当前轨道
                </button>
                {([-1, 1] as const).map((direction) => {
                  const index = sequence.tracks.indexOf(track);
                  return (
                    <button
                      key={direction}
                      disabled={
                        index + direction < 0 ||
                        index + direction >= sequence.tracks.length
                      }
                      onClick={() => {
                        const tracks = [...sequence.tracks];
                        [tracks[index], tracks[index + direction]] = [
                          tracks[index + direction],
                          tracks[index],
                        ];
                        change({ ...sequence, tracks });
                      }}
                    >
                      {direction < 0 ? "上移轨道" : "下移轨道"}
                    </button>
                  );
                })}
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
                          setError(describeError(e));
                        }
                      }}
                    >
                      应用关键帧
                    </button>
                  </>
                )}
              </fieldset>
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
