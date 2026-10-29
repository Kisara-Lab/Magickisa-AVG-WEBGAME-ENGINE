import { useState } from "react";
import type { AuthorProject } from "./model";
import { uniqueId } from "./model";
import { Card, Field } from "./fields";
export function ProjectDetails({
  project,
  onChange,
}: {
  project: AuthorProject;
  onChange: (p: AuthorProject) => void;
}) {
  const [trackKey, setTrackKey] = useState("");
  const edit = (fn: (p: AuthorProject) => void) => {
    const p = structuredClone(project);
    fn(p);
    onChange(p);
  };
  return (
    <>
      <Card
        title="首页附加链接"
        action={
          <button
            onClick={() =>
              edit((p) => {
                p.titleScreen.footerLinks = [
                  ...(p.titleScreen.footerLinks || []),
                  { label: "新链接", url: "" },
                ];
              })
            }
          >
            添加链接
          </button>
        }
      >
        <p>
          填写完整的 HTTP(S)、mailto 或相对链接；未完成的链接会阻止保存和构建。
        </p>
        {(project.titleScreen.footerLinks || []).map((link, i) => (
          <div className="st-registry" key={i}>
            <Field
              label={`首页链接 ${i + 1} 文案`}
              value={link.label}
              onChange={(label) =>
                edit((p) => {
                  p.titleScreen.footerLinks![i].label = label;
                })
              }
            />
            <Field
              label={`首页链接 ${i + 1} 地址`}
              value={link.url}
              onChange={(url) =>
                edit((p) => {
                  p.titleScreen.footerLinks![i].url = url;
                })
              }
            />
            <button
              className="danger"
              onClick={() =>
                edit((p) => {
                  p.titleScreen.footerLinks = p.titleScreen.footerLinks!.filter(
                    (_, j) => j !== i,
                  );
                })
              }
            >
              删除链接
            </button>
          </div>
        ))}
      </Card>
      <Card title="章节背景音乐">
        <p>
          先设置音乐路径，再用关键词将场景匹配到对应音乐。规则按列表顺序匹配。
        </p>
        {Object.entries(project.media.chapterMusic || {}).map(([key, path]) => (
          <div className="st-registry" key={key}>
            <code>{key}</code>
            <Field
              label={`章节音乐 ${key} 路径`}
              value={path}
              onChange={(v) =>
                edit((p) => {
                  p.media.chapterMusic = { ...p.media.chapterMusic, [key]: v };
                })
              }
            />
            <button
              className="danger"
              onClick={() => {
                if (
                  project.media.chapterMusicRules?.some((r) => r.track === key)
                ) {
                  window.alert(
                    "此音乐仍被章节匹配规则使用，请先修改或移除相关规则。",
                  );
                  return;
                }
                edit((p) => {
                  delete p.media.chapterMusic?.[key];
                });
              }}
            >
              移除音乐
            </button>
          </div>
        ))}
        <div className="st-inline">
          <Field
            label="新章节音乐标识"
            value={trackKey}
            onChange={setTrackKey}
          />
          <button
            disabled={
              !trackKey ||
              Object.hasOwn(project.media.chapterMusic || {}, trackKey)
            }
            onClick={() => {
              edit((p) => {
                p.media.chapterMusic = {
                  ...p.media.chapterMusic,
                  [trackKey]: "",
                };
              });
              setTrackKey("");
            }}
          >
            添加章节音乐
          </button>
        </div>
        {(project.media.chapterMusicRules || []).map((rule, i) => (
          <div className="st-registry" key={i}>
            <Field
              label={`音乐规则 ${i + 1} 关键词`}
              value={rule.keywords.join(", ")}
              onChange={(v) =>
                edit((p) => {
                  p.media.chapterMusicRules![i].keywords = v
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                })
              }
            />
            <Field
              label={`音乐规则 ${i + 1} 音乐`}
              value={rule.track}
              options={Object.keys(project.media.chapterMusic || {}).map(
                (key) => ({ value: key, label: key }),
              )}
              onChange={(v) =>
                edit((p) => {
                  p.media.chapterMusicRules![i].track = v;
                })
              }
            />
            <button
              className="danger"
              onClick={() =>
                edit((p) => {
                  p.media.chapterMusicRules = p.media.chapterMusicRules!.filter(
                    (_, j) => j !== i,
                  );
                })
              }
            >
              删除匹配
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            edit((p) => {
              p.media.chapterMusicRules = [
                ...(p.media.chapterMusicRules || []),
                {
                  keywords: ["新场景"],
                  track:
                    Object.keys(p.media.chapterMusic || {})[0] || "default",
                },
              ];
            })
          }
        >
          添加音乐匹配规则
        </button>
      </Card>
      <Card
        title="音轨注册表"
        action={
          <button
            onClick={() =>
              edit((p) => {
                p.audio.push({
                  id: uniqueId(
                    "track",
                    p.audio.map((a) => a.id),
                  ),
                  src: "/audio/track.mp3",
                  group: "bgm",
                  volume: 1,
                });
              })
            }
          >
            添加音轨
          </button>
        }
      >
        {project.audio.map((a, i) => (
          <div className="st-rule" key={a.id}>
            <div className="st-inline">
              <code>{a.id}</code>
              <button
                className="danger"
                onClick={() =>
                  edit((p) => {
                    p.audio = p.audio.filter((_, j) => j !== i);
                  })
                }
              >
                移除音轨
              </button>
            </div>
            <div className="st-fields">
              <Field
                label={`音轨 ${a.id} 路径`}
                value={a.src}
                onChange={(v) =>
                  edit((p) => {
                    p.audio[i].src = v;
                  })
                }
              />
              <Field
                label={`音轨 ${a.id} 通道`}
                value={a.group || "bgm"}
                onChange={(v) =>
                  edit((p) => {
                    p.audio[i].group = v;
                  })
                }
              />
              <Field
                label={`音轨 ${a.id} 音量`}
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={a.volume ?? 1}
                onChange={(v) =>
                  edit((p) => {
                    p.audio[i].volume = Number(v);
                  })
                }
              />
            </div>
          </div>
        ))}
      </Card>
      <Card
        title="音乐鉴赏列表"
        action={
          <button
            onClick={() =>
              edit((p) => {
                p.media.musicGallery = [
                  ...(p.media.musicGallery || []),
                  {
                    id: uniqueId(
                      "music",
                      (p.media.musicGallery || []).map((m) => m.id),
                    ),
                    title: "新曲目",
                    src: project.audio[0]?.src || "/audio/track.mp3",
                  },
                ];
              })
            }
          >
            添加鉴赏曲目
          </button>
        }
      >
        {(project.media.musicGallery || []).map((m, i) => (
          <div className="st-rule" key={m.id}>
            <div className="st-fields">
              {(["title", "artist", "src", "mood"] as const).map((key, j) => (
                <Field
                  key={key}
                  label={`鉴赏 ${i + 1} ${["曲名", "作者", "路径", "氛围"][j]}`}
                  value={m[key]}
                  onChange={(v) =>
                    edit((p) => {
                      p.media.musicGallery![i][key] = v;
                    })
                  }
                />
              ))}
              <Field
                label={`鉴赏 ${i + 1} 解锁场景`}
                value={m.unlockNode || ""}
                options={[
                  { value: "", label: "始终可用" },
                  ...project.nodes.map((n) => ({
                    value: n.id,
                    label: n.title,
                  })),
                ]}
                onChange={(v) =>
                  edit((p) => {
                    if (v) p.media.musicGallery![i].unlockNode = v;
                    else delete p.media.musicGallery![i].unlockNode;
                  })
                }
              />
            </div>
            <button
              className="danger"
              onClick={() =>
                edit((p) => {
                  p.media.musicGallery = p.media.musicGallery!.filter(
                    (_, j) => j !== i,
                  );
                })
              }
            >
              移除鉴赏曲目
            </button>
          </div>
        ))}
      </Card>
    </>
  );
}
