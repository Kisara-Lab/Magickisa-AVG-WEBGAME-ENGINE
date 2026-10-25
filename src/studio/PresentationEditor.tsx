import { useSequenceSelection } from "./workspace";
import type { AuthorProject } from "./model";
import { assetUrl } from "./model";
import { Card, Field } from "./fields";
import { useRef, useState } from "react";
import { PickAsset, registerBackdrop } from "./AssetPicker";
export type PresentationMode = "dedication" | "opening" | "ending";
export function PresentationEditor({
  project,
  onChange,
  mode,
  setMode,
  time,
  setTime,
  onPreview,
}: {
  project: AuthorProject;
  onChange: (p: AuthorProject) => void;
  mode: PresentationMode;
  setMode: (m: PresentationMode) => void;
  time: number;
  setTime: (t: number) => void;
  onPreview: (page?: number) => void;
}) {
  const media = project.media;
  const [zoom, setZoom] = useState(1);
  const [pageIndex, setPageIndex] = useSequenceSelection("dedication-page");
  const [cueIndex, setCueIndex] = useSequenceSelection(`cue:${mode}`);
  const shotDrag = useRef<number | null>(null);
  const dragMoved = useRef(false);
  const change = (patch: Partial<typeof media>) =>
    onChange({ ...project, media: { ...media, ...patch } });
  const opening = media.opening || {},
    ending = media.ending || {},
    dedication = media.dedication || {};
  const duration =
    (mode === "opening" ? opening.duration : ending.duration) || 1;
  const cues =
    mode === "opening"
      ? (opening.pages || []).map((c) => ({ at: c.at, text: c.text }))
      : (ending.lines || []).map((c) => ({ at: c.at, text: c.zh || c.en }));
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">PRESENTATION DIRECTOR</span>
          <h2>特殊演出</h2>
          <p>献词、片头与片尾，在同一时间轴中编排。</p>
        </div>
        <button className="primary" onClick={() => onPreview()}>
          应用并预览演出
        </button>
      </div>
      <div className="st-tabs">
        {(["dedication", "opening", "ending"] as const).map((m, i) => (
          <button
            key={m}
            className={mode === m ? "active" : ""}
            onClick={() => {
              setMode(m);
              setTime(0);
            }}
          >
            {["开场献词", "OP · 片头", "ED · 片尾"][i]}
          </button>
        ))}
      </div>
      {mode === "dedication" ? (
        <>
          <Card title="献词设置">
            <Field
              label="献词标题"
              value={dedication.title}
              onChange={(title) =>
                change({ dedication: { ...dedication, title } })
              }
            />
            <Field
              label="献词继续提示"
              value={dedication.hint}
              onChange={(hint) =>
                change({ dedication: { ...dedication, hint } })
              }
            />
          </Card>
          <Card
            title={`献词分页 · ${dedication.pages?.length || 0}`}
            action={
              <button
                onClick={() =>
                  change({
                    dedication: {
                      ...dedication,
                      pages: [...(dedication.pages || []), ["新的一页献词。"]],
                    },
                  })
                }
              >
                添加献词页
              </button>
            }
          >
            <div className="st-page-tabs">
              {(dedication.pages || []).map((page, i) => (
                <button
                  key={i}
                  className={
                    i ===
                    Math.min(pageIndex, (dedication.pages?.length || 1) - 1)
                      ? "selected"
                      : ""
                  }
                  onClick={() => setPageIndex(i)}
                  title={page.join(" ")}
                >
                  ✦ 第 {i + 1} 页
                </button>
              ))}
            </div>
            {(dedication.pages || []).map((page, i) => (
              <div
                className="st-rule"
                key={i}
                hidden={
                  i !== Math.min(pageIndex, (dedication.pages?.length || 1) - 1)
                }
              >
                <Field
                  label={`献词第 ${i + 1} 页（每行一句）`}
                  value={page.join("\n")}
                  multiline
                  onChange={(v) =>
                    change({
                      dedication: {
                        ...dedication,
                        pages: dedication.pages!.map((p, j) =>
                          j === i ? v.split("\n") : p,
                        ),
                      },
                    })
                  }
                />
                <div className="st-inline">
                  <button onClick={() => onPreview(i)}>
                    预览第 {i + 1} 页
                  </button>
                  <button
                    className="danger"
                    onClick={() =>
                      change({
                        dedication: {
                          ...dedication,
                          pages: dedication.pages!.filter((_, j) => j !== i),
                        },
                      })
                    }
                  >
                    删除此页
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : (
        <>
          <Card title="演出设置">
            <div className="st-fields">
              <Field
                label="演出标题"
                value={mode === "opening" ? opening.title : ending.title}
                onChange={(title) =>
                  mode === "opening"
                    ? change({ opening: { ...opening, title } })
                    : change({ ending: { ...ending, title } })
                }
              />
              <Field
                label="总时长（秒）"
                type="number"
                min={1}
                step={0.1}
                value={mode === "opening" ? opening.duration : ending.duration}
                onChange={(v) =>
                  mode === "opening"
                    ? change({ opening: { ...opening, duration: Number(v) } })
                    : change({ ending: { ...ending, duration: Number(v) } })
                }
              />
              <Field
                label="演出音乐路径"
                value={mode === "opening" ? opening.audio : ending.audio}
                onChange={(audio) =>
                  mode === "opening"
                    ? change({ opening: { ...opening, audio } })
                    : change({ ending: { ...ending, audio } })
                }
              />
              <PickAsset
                kind="audio"
                label="挑选演出音乐"
                onPick={(audio) =>
                  mode === "opening"
                    ? change({ opening: { ...opening, audio } })
                    : change({ ending: { ...ending, audio } })
                }
              />
              <Field
                label="LRC 歌词路径"
                value={mode === "opening" ? opening.lyrics : ending.lyrics}
                onChange={(lyrics) =>
                  mode === "opening"
                    ? change({ opening: { ...opening, lyrics } })
                    : change({ ending: { ...ending, lyrics } })
                }
              />
              <PickAsset
                kind="lyrics"
                label="挑选歌词文件"
                onPick={(lyrics) =>
                  mode === "opening"
                    ? change({ opening: { ...opening, lyrics } })
                    : change({ ending: { ...ending, lyrics } })
                }
              />
            </div>
          </Card>
          <Card
            title="字幕时间轴"
            action={
              <span className="st-time">
                {time.toFixed(2)}s / {duration}s
              </span>
            }
          >
            <div className="st-timeline-tools">
              <label>
                时间轴缩放
                <input
                  aria-label="时间轴缩放"
                  type="range"
                  min="1"
                  max="4"
                  step="0.25"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <button onClick={() => setZoom(1)}>适应时长</button>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <div className="st-timeline-scroll">
              <div className="st-timeline" style={{ width: `${zoom * 100}%` }}>
                <div
                  className="st-timeline-track"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setTime(
                      Math.max(
                        0,
                        Math.min(
                          duration,
                          ((e.clientX - r.left) / r.width) * duration,
                        ),
                      ),
                    );
                  }}
                >
                  <div
                    className="st-playhead"
                    style={{ left: `${(time / duration) * 100}%` }}
                  />
                  {cues.map((cue, i) => (
                    <button
                      key={i}
                      title={`${cue.at}s · ${cue.text}`}
                      aria-label={`定位字幕 ${i + 1}`}
                      style={{
                        left: `${(cue.at / duration) * 100}%`,
                        top: 7 + (i % 3) * 17,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!dragMoved.current) setTime(cue.at);
                        setCueIndex(i);
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const element = e.currentTarget,
                          track = element.parentElement!,
                          rect = track.getBoundingClientRect(),
                          start = e.clientX;
                        element.setPointerCapture(e.pointerId);
                        dragMoved.current = false;
                        let next = cue.at;
                        const move = (ev: PointerEvent) => {
                          if (Math.abs(ev.clientX - start) > 3)
                            dragMoved.current = true;
                          next =
                            Math.round(
                              Math.max(
                                cues[i - 1]?.at ?? 0,
                                Math.min(
                                  Math.min(
                                    duration,
                                    cues[i + 1]?.at ?? duration,
                                  ),
                                  ((ev.clientX - rect.left) / rect.width) *
                                    duration,
                                ),
                              ) * 100,
                            ) / 100;
                          element.style.left = `${(next / duration) * 100}%`;
                        };
                        const cleanup = () => {
                          element.removeEventListener("pointermove", move);
                          element.removeEventListener("pointerup", end);
                          element.removeEventListener("pointercancel", cancel);
                        };
                        const cancel = () => {
                          cleanup();
                          element.style.left = `${(cue.at / duration) * 100}%`;
                        };
                        const end = () => {
                          cleanup();
                          if (!dragMoved.current) return;
                          setCueIndex(i);
                          setTime(next);
                          if (mode === "opening")
                            change({
                              opening: {
                                ...opening,
                                pages: opening.pages!.map((c, j) =>
                                  j === i ? { ...c, at: next } : c,
                                ),
                              },
                            });
                          else
                            change({
                              ending: {
                                ...ending,
                                lines: ending.lines!.map((c, j) =>
                                  j === i ? { ...c, at: next } : c,
                                ),
                              },
                            });
                        };
                        element.addEventListener("pointermove", move);
                        element.addEventListener("pointerup", end);
                        element.addEventListener("pointercancel", cancel);
                      }}
                    />
                  ))}
                </div>
                <div className="st-ticks">
                  <span>00:00</span>
                  <span>{Math.round(duration / 2)}s</span>
                  <span>{duration}s</span>
                </div>
              </div>
            </div>
            <div className="st-cues">
              {mode === "opening"
                ? (opening.pages || []).map((cue, i) => (
                    <div
                      className={`st-cue ${cueIndex === i ? "current" : ""}`}
                      key={i}
                    >
                      <button
                        className="st-cue-index"
                        aria-label={`编辑字幕 ${i + 1}`}
                        onClick={() => {
                          setCueIndex(i);
                          setTime(cue.at);
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </button>
                      <Field
                        label={`OP 字幕 ${i + 1} 时间`}
                        type="number"
                        min={0}
                        step={0.01}
                        value={cue.at}
                        onChange={(v) =>
                          change({
                            opening: {
                              ...opening,
                              pages: opening.pages!.map((c, j) =>
                                j === i ? { ...c, at: Number(v) } : c,
                              ),
                            },
                          })
                        }
                      />
                      <Field
                        label={`OP 字幕 ${i + 1} 内容`}
                        value={cue.text}
                        onChange={(text) =>
                          change({
                            opening: {
                              ...opening,
                              pages: opening.pages!.map((c, j) =>
                                j === i ? { ...c, text } : c,
                              ),
                            },
                          })
                        }
                      />
                      {cueIndex !== i && (
                        <button
                          className="st-cue-summary"
                          onClick={() => setCueIndex(i)}
                        >
                          {cue.text || "空白字幕"}
                        </button>
                      )}
                      <button
                        className="danger"
                        aria-label={`删除 OP 字幕 ${i + 1}`}
                        onClick={() =>
                          change({
                            opening: {
                              ...opening,
                              pages: opening.pages!.filter((_, j) => j !== i),
                            },
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))
                : (ending.lines || []).map((cue, i) => (
                    <div
                      className={`st-cue bilingual ${cueIndex === i ? "current" : ""}`}
                      key={i}
                    >
                      <button
                        className="st-cue-index"
                        aria-label={`编辑字幕 ${i + 1}`}
                        onClick={() => {
                          setCueIndex(i);
                          setTime(cue.at);
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </button>
                      <Field
                        label={`ED 字幕 ${i + 1} 时间`}
                        type="number"
                        min={0}
                        step={0.01}
                        value={cue.at}
                        onChange={(v) =>
                          change({
                            ending: {
                              ...ending,
                              lines: ending.lines!.map((c, j) =>
                                j === i ? { ...c, at: Number(v) } : c,
                              ),
                            },
                          })
                        }
                      />
                      <div hidden={cueIndex !== i}>
                        <Field
                          label={`ED 字幕 ${i + 1} 英文`}
                          multiline
                          value={cue.en}
                          onChange={(en) =>
                            change({
                              ending: {
                                ...ending,
                                lines: ending.lines!.map((c, j) =>
                                  j === i ? { ...c, en } : c,
                                ),
                              },
                            })
                          }
                        />
                        <Field
                          label={`ED 字幕 ${i + 1} 中文`}
                          multiline
                          value={cue.zh}
                          onChange={(zh) =>
                            change({
                              ending: {
                                ...ending,
                                lines: ending.lines!.map((c, j) =>
                                  j === i ? { ...c, zh } : c,
                                ),
                              },
                            })
                          }
                        />
                      </div>
                      {cueIndex !== i && (
                        <button
                          className="st-cue-summary"
                          onClick={() => setCueIndex(i)}
                        >
                          {cue.zh || cue.en || "空白字幕"}
                        </button>
                      )}
                      <button
                        className="danger"
                        aria-label={`删除 ED 字幕 ${i + 1}`}
                        onClick={() =>
                          change({
                            ending: {
                              ...ending,
                              lines: ending.lines!.filter((_, j) => j !== i),
                            },
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
            </div>
            <div className="st-inline">
              <button
                onClick={() =>
                  mode === "opening"
                    ? change({
                        opening: {
                          ...opening,
                          pages: [
                            ...(opening.pages || []),
                            {
                              at: Math.round(time * 100) / 100,
                              text: "新的歌词",
                            },
                          ].sort((a, b) => a.at - b.at),
                        },
                      })
                    : change({
                        ending: {
                          ...ending,
                          lines: [
                            ...(ending.lines || []),
                            {
                              at: Math.round(time * 100) / 100,
                              en: "New subtitle",
                              zh: "新的字幕",
                            },
                          ].sort((a, b) => a.at - b.at),
                        },
                      })
                }
              >
                在当前时间添加字幕
              </button>
              <button
                onClick={() =>
                  mode === "opening"
                    ? change({
                        opening: {
                          ...opening,
                          pages: [...(opening.pages || [])].sort(
                            (a, b) => a.at - b.at,
                          ),
                        },
                      })
                    : change({
                        ending: {
                          ...ending,
                          lines: [...(ending.lines || [])].sort(
                            (a, b) => a.at - b.at,
                          ),
                        },
                      })
                }
              >
                按时间排序
              </button>
            </div>
          </Card>
          {mode === "opening" ? (
            <>
              <Card
                title="OP 镜头 · 每 14 秒轮换"
                action={
                  <button
                    onClick={() =>
                      change({
                        opening: {
                          ...opening,
                          images: [
                            ...(opening.images || []),
                            project.backdrops[0]?.id || "",
                          ],
                        },
                      })
                    }
                  >
                    添加镜头
                  </button>
                }
              >
                <div className="st-filmstrip">
                  {(opening.images || []).map((image, i) => (
                    <div
                      className="st-shot"
                      key={i}
                      draggable
                      onDragStart={(e) => {
                        shotDrag.current = i;
                        e.dataTransfer.setData("text/plain", String(i));
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = shotDrag.current;
                        if (from === null || from === i) return;
                        const images = [...opening.images!];
                        images.splice(i, 0, images.splice(from, 1)[0]);
                        change({ opening: { ...opening, images } });
                        shotDrag.current = null;
                      }}
                    >
                      <button onClick={() => setTime(i * 14)}>
                        <img
                          src={assetUrl(project, image)}
                          alt={`OP 镜头 ${i + 1}`}
                        />
                        <span>
                          SHOT {String(i + 1).padStart(2, "0")} · {i * 14}s
                        </span>
                      </button>
                      <Field
                        label={`镜头 ${i + 1} 背景`}
                        value={image}
                        options={[
                          { value: image, label: image },
                          ...project.backdrops
                            .filter((b) => b.id !== image)
                            .map((b) => ({
                              value: b.id,
                              label: b.id,
                            })),
                        ]}
                        onChange={(v) =>
                          change({
                            opening: {
                              ...opening,
                              images: opening.images!.map((s, j) =>
                                j === i ? v : s,
                              ),
                            },
                          })
                        }
                      />
                      <PickAsset
                        kind="image"
                        label={`挑选镜头 ${i + 1}`}
                        onPick={(url) => {
                          const p = structuredClone(project);
                          const id = registerBackdrop(p, url);
                          p.media.opening = {
                            ...p.media.opening,
                            images: opening.images!.map((s, j) =>
                              j === i ? id : s,
                            ),
                          };
                          onChange(p);
                        }}
                      />
                      <div className="st-inline">
                        <button
                          disabled={i === 0}
                          onClick={() => {
                            const images = [...opening.images!];
                            [images[i - 1], images[i]] = [
                              images[i],
                              images[i - 1],
                            ];
                            change({ opening: { ...opening, images } });
                          }}
                        >
                          前移
                        </button>
                        <button
                          disabled={i === (opening.images?.length || 0) - 1}
                          onClick={() => {
                            const images = [...opening.images!];
                            [images[i + 1], images[i]] = [
                              images[i],
                              images[i + 1],
                            ];
                            change({ opening: { ...opening, images } });
                          }}
                        >
                          后移
                        </button>
                        <button
                          className="danger"
                          onClick={() =>
                            change({
                              opening: {
                                ...opening,
                                images: opening.images!.filter(
                                  (_, j) => j !== i,
                                ),
                              },
                            })
                          }
                        >
                          删除镜头
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="OP 署名">
                <div className="st-fields">
                  {(["artist", "website", "studio", "studioUrl"] as const).map(
                    (key, i) => (
                      <Field
                        key={key}
                        label={
                          ["作者署名", "作者网址", "工作室署名", "工作室链接"][
                            i
                          ]
                        }
                        value={opening.credits?.[key]}
                        onChange={(v) =>
                          change({
                            opening: {
                              ...opening,
                              credits: { ...opening.credits, [key]: v },
                            },
                          })
                        }
                      />
                    ),
                  )}
                </div>
                <Field
                  label="制作组（每行一项）"
                  value={opening.credits?.production?.join("\n")}
                  multiline
                  onChange={(v) =>
                    change({
                      opening: {
                        ...opening,
                        credits: {
                          ...opening.credits,
                          production: v.split("\n"),
                        },
                      },
                    })
                  }
                />
              </Card>
            </>
          ) : (
            <Card title="ED 背景与鸣谢">
              <Field
                label="ED 背景图片"
                value={ending.image}
                onChange={(image) => change({ ending: { ...ending, image } })}
              />
              <PickAsset
                kind="image"
                label="挑选 ED 背景"
                onPick={(image) => change({ ending: { ...ending, image } })}
              />
              {ending.image && (
                <img
                  className="st-ed-image"
                  src={assetUrl(project, ending.image)}
                  alt="ED 背景预览"
                />
              )}
              <div className="st-fields">
                <Field
                  label="鸣谢模式"
                  value={ending.creditsMode || "crawl"}
                  options={[
                    { value: "crawl", label: "滚动鸣谢" },
                    { value: "slides", label: "每七秒轮播" },
                  ]}
                  onChange={(creditsMode) =>
                    change({ ending: { ...ending, creditsMode } })
                  }
                />
                <Field
                  label="鸣谢滚动时长（秒）"
                  type="number"
                  min={1}
                  value={ending.creditsDuration || 42}
                  onChange={(v) =>
                    change({
                      ending: { ...ending, creditsDuration: Number(v) },
                    })
                  }
                />
              </div>
              <Field
                label="ED 鸣谢（每行一项）"
                value={ending.credits?.join("\n")}
                multiline
                onChange={(v) =>
                  change({ ending: { ...ending, credits: v.split("\n") } })
                }
              />
            </Card>
          )}
        </>
      )}
    </>
  );
}
