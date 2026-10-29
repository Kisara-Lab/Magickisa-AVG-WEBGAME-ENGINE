import { describeError } from "../engine/errors";
import { useSelection, useNavigationSignal } from "./workspace";
import { useEffect, useState } from "react";
import type { AuthorProject, Profile } from "./model";
import { assetUrl, uniqueId, mediaUrl } from "./model";
import { Card, Field, ConditionEditor } from "./fields";
import { TargetPicker } from "./TargetPicker";
import { PickAsset } from "./AssetPicker";
import { Fold } from "./components";
import { expressionReferences } from "./discovery";
import { assetKind } from "../authoring/assetKind";
import { AssetMaintenance } from "./AssetMaintenance";
export interface AssetFile {
  url: string;
  bytes: number;
}
export function AssetEditor({
  project,
  profile,
  files,
  onChange,
  onUpload,
  nodeId,
  notice,
  dirty,
  onReload,
}: {
  project: AuthorProject;
  profile: Profile;
  files: AssetFile[];
  onChange: (p: AuthorProject) => void;
  onUpload: (file: File) => Promise<string | undefined>;
  nodeId: string;
  notice: (s: string) => void;
  dirty: boolean;
  onReload: () => Promise<void>;
}) {
  const navigationVersion = useNavigationSignal();
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [selected, setSelected] = useSelection("assets"),
    [character, setCharacter] = useSelection(
      "characters",
      project.characters[0]?.id || "",
    );
  const [uploads, setUploads] = useState<
    {
      name: string;
      state: string;
    }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [metadata, setMetadata] = useState<{ url: string; text: string }>();
  async function importFiles(files: FileList | File[]) {
    if (uploading) return;
    setUploading(true);
    const queue = Array.from(files);
    setUploads(
      queue.map((f) => ({
        name: f.name,
        state: "等待导入",
      })),
    );
    for (const [i, file] of queue.entries()) {
      setUploads((v) =>
        v.map((x, j) =>
          j === i
            ? {
                ...x,
                state: "导入中…",
              }
            : x,
        ),
      );
      try {
        const url = await onUpload(file);
        setUploads((v) =>
          v.map((x, j) =>
            j === i
              ? {
                  ...x,
                  state: `✓ 已导入 ${url || ""}`,
                }
              : x,
          ),
        );
      } catch (e) {
        setUploads((v) =>
          v.map((x, j) =>
            j === i
              ? {
                  ...x,
                  state: `失败：${describeError(e)}`,
                }
              : x,
          ),
        );
      }
    }
    setUploading(false);
  }
  const selectedFile = files.find((f) => f.url === selected),
    audio = assetKind(selected) === "audio",
    image = assetKind(selected) === "image",
    video = assetKind(selected) === "video";
  const visible = files.filter(
    (f) =>
      (!search || f.url.toLowerCase().includes(search.toLowerCase())) &&
      (kind === "all" || assetKind(f.url) === kind),
  );
  useEffect(() => {
    if (selected && !visible.some((file) => file.url === selected)) {
      setSearch("");
      setKind("all");
    }
  }, [selected, navigationVersion]);
  function backdrop() {
    const existing = project.backdrops.find((b) => b.src === selected);
    return (
      existing?.id ||
      uniqueId(
        "backdrop",
        project.backdrops.map((b) => b.id),
      )
    );
  }
  function assign(target: string) {
    if (
      !selected ||
      (target === "character" &&
        !project.characters.some((c) => c.id === character)) ||
      (target === "scene" && !project.nodes.some((n) => n.id === nodeId))
    ) {
      notice("未找到所选素材或目标，未做任何修改。请重新选择。");
      return;
    }
    const p = structuredClone(project),
      id = backdrop();
    if (
      (target === "scene" || target === "op") &&
      !p.backdrops.some((b) => b.id === id)
    )
      p.backdrops.push({
        id,
        src: selected,
      });
    if (target === "scene") {
      const node = p.nodes.find((n) => n.id === nodeId)!;
      node.background = id;
    }
    if (target === "op")
      p.media.opening = {
        ...p.media.opening,
        images: [...(p.media.opening?.images || []), id],
      };
    if (target === "ed")
      p.media.ending = {
        ...p.media.ending,
        image: selected,
      };
    if (target === "character") {
      const c = p.characters.find((c) => c.id === character);
      if (c) c.portrait = selected;
    }
    if (target === "op-audio")
      p.media.opening = {
        ...p.media.opening,
        audio: selected,
      };
    if (target === "ed-audio")
      p.media.ending = {
        ...p.media.ending,
        audio: selected,
      };
    onChange(p);
    notice("资源已应用到草稿。保存工程后可用于发行构建。");
  }
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">ASSET LIBRARY</span>
          <h2>资源库</h2>
          <p>{files.length} 项素材 · 图片、音乐与歌词</p>
        </div>
        <label className="st-upload primary">
          导入资源
          <input
            type="file"
            multiple
            disabled={uploading}
            aria-label="资源文件"
            accept="image/*,audio/*,video/*,.lrc,.vtt"
            onChange={(e) => {
              const input = e.currentTarget,
                files = input.files;
              if (files?.length)
                void importFiles(files).finally(() => {
                  input.value = "";
                });
            }}
          />
        </label>
      </div>
      <div
        className="st-dropzone"
        aria-label="拖入素材"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          void importFiles(e.dataTransfer.files);
        }}
      >
        ✦ 拖入图片、音乐、视频或字幕，也可点击上方导入 · 每个文件最大 512 MiB
      </div>
      {!!uploads.length && (
        <div className="st-upload-results" role="status">
          {uploads.map((u, i) => (
            <p key={i}>
              <strong>{u.name}</strong> · {u.state}
            </p>
          ))}
        </div>
      )}
      <div className="st-graph-tools">
        <input
          aria-label="搜索资源"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索文件名…"
        />
        <select
          aria-label="资源类型"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {[
            ["all", "全部素材"],
            ["image", "图片"],
            ["audio", "音乐"],
            ["video", "视频"],
            ["lyrics", "歌词／字幕"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {selectedFile && (
        <Card title="选中资源">
          <div className="st-asset-detail">
            {image ? (
              <img
                key={selected}
                src={mediaUrl(profile, selected)}
                alt="选中资源预览"
                onLoad={(e) =>
                  setMetadata({
                    url: selected,
                    text: `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} 像素`,
                  })
                }
              />
            ) : audio ? (
              <audio
                key={selected}
                controls
                preload="metadata"
                src={mediaUrl(profile, selected)}
                onLoadedMetadata={(e) =>
                  setMetadata({
                    url: selected,
                    text: `时长 ${e.currentTarget.duration.toFixed(2)} 秒`,
                  })
                }
              />
            ) : video ? (
              <video
                key={selected}
                controls
                playsInline
                preload="metadata"
                style={{ maxWidth: "100%", maxHeight: 320 }}
                src={mediaUrl(profile, selected)}
                onLoadedMetadata={(e) =>
                  setMetadata({
                    url: selected,
                    text: `${e.currentTarget.videoWidth} × ${e.currentTarget.videoHeight} 像素 · ${e.currentTarget.duration.toFixed(2)} 秒`,
                  })
                }
              />
            ) : (
              <a
                href={mediaUrl(profile, selected)}
                target="_blank"
                rel="noreferrer"
              >
                查看歌词文件
              </a>
            )}
            <div>
              <code>{selected}</code>
              <p>{(selectedFile.bytes / 1024).toFixed(1)} KB</p>
              {metadata?.url === selected && <p>{metadata.text}</p>}
              <div className="st-action-grid">
                {(image || audio || video) && (
                  <button
                    onClick={() => {
                      if (project.assets?.some((a) => a.src === selected)) {
                        notice("此文件已注册通用资源 ID。");
                        return;
                      }
                      const id = uniqueId(
                        "asset",
                        [
                          ...(project.assets ?? []),
                          ...project.backdrops,
                          ...project.audio,
                        ].map((a) => a.id),
                      );
                      onChange({
                        ...project,
                        assets: [
                          ...(project.assets ?? []),
                          {
                            id,
                            kind: image ? "image" : audio ? "audio" : "video",
                            src: selected,
                            name: selected.split("/").at(-1),
                          },
                        ],
                      });
                      notice(
                        `已注册资源 ${id}，可用于台词配音、演出轨道及完整 JSON。`,
                      );
                    }}
                  >
                    注册通用资源 ID
                  </button>
                )}
                {image && (
                  <>
                    <button onClick={() => assign("scene")}>
                      设为当前场景背景
                    </button>
                    <button onClick={() => assign("op")}>加入 OP 镜头</button>
                    <button onClick={() => assign("ed")}>设为 ED 背景</button>
                    <Field
                      label="资源目标人物"
                      value={character}
                      options={project.characters.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      onChange={setCharacter}
                    />
                    <button onClick={() => assign("character")}>
                      设为人物立绘
                    </button>
                  </>
                )}
                {audio && (
                  <>
                    <button onClick={() => assign("op-audio")}>
                      用作 OP 音乐
                    </button>
                    <button onClick={() => assign("ed-audio")}>
                      用作 ED 音乐
                    </button>
                    <button
                      onClick={() => {
                        const p = structuredClone(project);
                        p.audio.push({
                          id: uniqueId(
                            "track",
                            p.audio.map((a) => a.id),
                          ),
                          src: selected,
                        });
                        onChange(p);
                        notice("音轨已加入工程。");
                      }}
                    >
                      加入音轨列表
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
      <AssetMaintenance url={selected} dirty={dirty} onReload={onReload} />
      <div className="st-asset-grid">
        {visible.map((f) => (
          <button
            key={f.url}
            data-entity-id={f.url}
            className={`st-asset-tile ${selected === f.url ? "selected" : ""}`}
            onClick={() => setSelected(f.url)}
          >
            {assetKind(f.url) === "image" ? (
              <img loading="lazy" src={mediaUrl(profile, f.url)} alt="" />
            ) : (
              <div className="st-file-icon">
                {
                  {
                    image: "图片",
                    audio: "音频",
                    video: "视频",
                    lyrics: "字幕",
                    other: "文件",
                  }[assetKind(f.url)]
                }
              </div>
            )}
            <span>{f.url.split("/").pop()}</span>
            <small>{(f.bytes / 1024).toFixed(0)} KB</small>
          </button>
        ))}
      </div>
      {!visible.length && (
        <div className="st-empty-actions">
          <p>
            {files.length
              ? "当前筛选没有匹配素材。"
              : "还没有素材，可选择文件或拖入上方导入区。"}
          </p>
          <button
            onClick={() => {
              setSearch("");
              setKind("all");
            }}
          >
            清除素材筛选
          </button>
          <button
            onClick={() =>
              document
                .querySelector<HTMLInputElement>('[aria-label="资源文件"]')
                ?.click()
            }
          >
            选择素材文件
          </button>
        </div>
      )}
      <Card
        title="背景注册表"
        collapsible
        summary={`${project.backdrops.length} 项 · 高级资源映射`}
        action={
          <PickAsset
            kind="image"
            label="添加背景"
            onPick={(src) =>
              onChange({
                ...project,
                backdrops: [
                  ...project.backdrops,
                  {
                    id: uniqueId(
                      "backdrop",
                      project.backdrops.map((b) => b.id),
                    ),
                    src,
                  },
                ],
              })
            }
          />
        }
      >
        {project.backdrops.map((b, i) => (
          <div className="st-registry" key={b.id}>
            <code>{b.id}</code>
            <Field
              label={`背景 ${b.id} 路径`}
              value={b.src}
              onChange={(src) =>
                onChange({
                  ...project,
                  backdrops: project.backdrops.map((v, j) =>
                    j === i
                      ? {
                          ...v,
                          src,
                        }
                      : v,
                  ),
                })
              }
            />
            <button
              className="danger"
              onClick={() => {
                if (
                  i === 0 &&
                  !window.confirm(
                    "这是未匹配背景时的默认首项。移除会改变这些画面，确认继续？",
                  )
                )
                  return;
                onChange({
                  ...project,
                  backdrops: project.backdrops.filter((_, j) => j !== i),
                });
              }}
            >
              移除注册
            </button>
          </div>
        ))}
      </Card>
      <Card
        title="场景背景匹配规则"
        collapsible
        summary={`${project.resources.sceneRules?.length || 0} 条 · 按关键词匹配`}
        action={
          <PickAsset
            kind="image"
            label="添加规则"
            onPick={(asset) =>
              onChange({
                ...project,
                resources: {
                  ...project.resources,
                  sceneRules: [
                    ...(project.resources.sceneRules || []),
                    {
                      keywords: ["新场景"],
                      asset,
                    },
                  ],
                },
              })
            }
          />
        }
      >
        {(project.resources.sceneRules || []).map((r, i) => (
          <div className="st-registry" key={i}>
            <Field
              label={`规则 ${i + 1} 关键词`}
              value={r.keywords.join(", ")}
              onChange={(v) =>
                onChange({
                  ...project,
                  resources: {
                    ...project.resources,
                    sceneRules: project.resources.sceneRules!.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            keywords: v
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          }
                        : x,
                    ),
                  },
                })
              }
            />
            <Field
              label={`规则 ${i + 1} 背景`}
              value={r.asset}
              options={project.backdrops.map((b) => ({
                value: b.id,
                label: b.id,
              }))}
              onChange={(asset) =>
                onChange({
                  ...project,
                  resources: {
                    ...project.resources,
                    sceneRules: project.resources.sceneRules!.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            asset,
                          }
                        : x,
                    ),
                  },
                })
              }
            />
            <button
              className="danger"
              onClick={() =>
                onChange({
                  ...project,
                  resources: {
                    ...project.resources,
                    sceneRules: project.resources.sceneRules!.filter(
                      (_, j) => j !== i,
                    ),
                  },
                })
              }
            >
              删除规则
            </button>
          </div>
        ))}
      </Card>
    </>
  );
}
export function CharacterEditor({
  project,
  onChange,
}: {
  project: AuthorProject;
  onChange: (p: AuthorProject) => void;
}) {
  const [expressionError, setExpressionError] = useState("");
  const [selected, setSelected] = useSelection(
    "characters",
    project.characters[0]?.id || "",
  );
  const [selectedExpression, setSelectedExpression] =
    useSelection("expression");
  const character =
    project.characters.find((c) => c.id === selected) || project.characters[0];
  const update = (patch: Partial<NonNullable<typeof character>>) =>
    onChange({
      ...project,
      characters: project.characters.map((c) =>
        c.id === character.id
          ? {
              ...c,
              ...patch,
            }
          : c,
      ),
    });
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">CHARACTER CAST</span>
          <h2>人物与表情</h2>
        </div>
        <button
          onClick={() => {
            const id = uniqueId(
              "character",
              project.characters.map((c) => c.id),
            );
            onChange({
              ...project,
              characters: [
                ...project.characters,
                {
                  id,
                  name: "新人物",
                  renderer: "portrait",
                },
              ],
            });
            setSelected(id);
          }}
        >
          添加人物
        </button>
      </div>
      {expressionError && (
        <p role="alert" className="st-error">
          {expressionError}
        </p>
      )}
      <div className="st-character-list">
        {project.characters.map((c) => (
          <button
            key={c.id}
            data-entity-id={c.id}
            className={c.id === character?.id ? "selected" : ""}
            onClick={() => {
              setSelected(c.id);
              setSelectedExpression("");
            }}
          >
            {c.portrait ? (
              <img src={assetUrl(project, c.portrait)} alt="" />
            ) : (
              <span>◌</span>
            )}
            <b>{c.name}</b>
            <small>{c.id}</small>
          </button>
        ))}
      </div>
      {!project.characters.length && (
        <p className="st-empty-actions">
          还没有人物，点击上方“添加人物”开始。高级立绘与表情设置会保留。
        </p>
      )}
      {character && (
        <>
          <Card title={character.name}>
            <div className="st-fields">
              <Field
                label="人物名称"
                value={character.name}
                onChange={(name) =>
                  update({
                    name,
                  })
                }
              />
              <Field
                label="人物立绘路径"
                value={character.portrait}
                onChange={(portrait) =>
                  update({
                    portrait,
                  })
                }
              />
              <PickAsset
                kind="image"
                label="挑选人物立绘"
                onPick={(portrait) =>
                  update({
                    portrait,
                  })
                }
              />
              <div className="wide">
                <Fold
                  title="人物高级渲染"
                  summary={character.renderer || "portrait"}
                >
                  <Field
                    label="渲染方式"
                    value={character.renderer || "portrait"}
                    options={[
                      {
                        value: "portrait",
                        label: "图片立绘",
                      },
                      {
                        value: "live2d",
                        label: "Live2D（需模型与适配器）",
                      },
                    ]}
                    onChange={(renderer) =>
                      update({
                        renderer: renderer as "portrait" | "live2d",
                      })
                    }
                  />
                  {character.renderer === "live2d" && (
                    <Field
                      label="Live2D 模型路径"
                      value={character.live2d?.model}
                      onChange={(model) =>
                        update({
                          live2d: {
                            model,
                          },
                        })
                      }
                    />
                  )}
                </Fold>
              </div>
            </div>
            {character.portrait && (
              <div className="st-portrait-preview">
                <img
                  src={assetUrl(project, character.portrait)}
                  alt={character.name}
                />
              </div>
            )}
          </Card>
          <Card
            title="表情资源"
            action={
              <button
                onClick={() => {
                  const id = uniqueId(
                    "expression",
                    Object.keys(character.expressions || {}),
                  );
                  update({
                    expressions: {
                      ...character.expressions,
                      [id]: character.portrait || "",
                    },
                  });
                  setSelectedExpression(id);
                }}
              >
                添加表情
              </button>
            }
          >
            <div className="st-page-tabs">
              {Object.keys(character.expressions || {}).map((key) => (
                <button
                  key={key}
                  className={
                    key ===
                    (selectedExpression in (character.expressions || {})
                      ? selectedExpression
                      : Object.keys(character.expressions || {})[0])
                      ? "selected"
                      : ""
                  }
                  onClick={() => setSelectedExpression(key)}
                >
                  {key}
                </button>
              ))}
            </div>
            {!Object.keys(character.expressions || {}).length && (
              <p>尚无表情。添加后可以选择图片并在台词中引用。</p>
            )}
            {Object.entries(character.expressions || {}).map(([key, value]) => (
              <div
                className="st-registry"
                key={key}
                hidden={
                  key !==
                  (selectedExpression in (character.expressions || {})
                    ? selectedExpression
                    : Object.keys(character.expressions || {})[0])
                }
              >
                <code>{key}</code>
                <Field
                  label={`表情 ${key} 路径`}
                  value={value}
                  onChange={(v) =>
                    update({
                      expressions: {
                        ...character.expressions,
                        [key]: v,
                      },
                    })
                  }
                />
                <PickAsset
                  kind="image"
                  label={`挑选表情 ${key}`}
                  onPick={(v) =>
                    update({
                      expressions: {
                        ...character.expressions,
                        [key]: v,
                      },
                    })
                  }
                />
                <button
                  className="danger"
                  onClick={() => {
                    const refs = expressionReferences(
                      project,
                      character.id,
                      key,
                    );
                    if (refs.length) {
                      setExpressionError(
                        `表情仍在使用，请先修改：${refs.map((r) => `${r.label}（${r.field}）`).join("、")}`,
                      );
                      return;
                    }
                    setExpressionError("");
                    const expressions = {
                      ...character.expressions,
                    };
                    delete expressions[key];
                    update({
                      expressions,
                    });
                  }}
                >
                  删除表情
                </button>
              </div>
            ))}
          </Card>
          <button
            className="danger"
            disabled={project.nodes.some((n) =>
              n.lines.some(
                (l) =>
                  l.characterId === character.id ||
                  l.characterLayers?.some(
                    (c) => c.characterId === character.id,
                  ),
              ),
            )}
            title="场景仍引用的人物需要先解除引用，才能删除。"
            onClick={() => {
              if (
                project.nodes.some((n) =>
                  n.lines.some(
                    (l) =>
                      l.characterId === character.id ||
                      l.characterLayers?.some(
                        (c) => c.characterId === character.id,
                      ),
                  ),
                )
              )
                return;
              onChange({
                ...project,
                characters: project.characters.filter(
                  (c) => c.id !== character.id,
                ),
              });
            }}
          >
            删除未使用的人物
          </button>
        </>
      )}
    </>
  );
}
export function MaterialEditor({
  project,
  onChange,
}: {
  project: AuthorProject;
  onChange: (p: AuthorProject) => void;
}) {
  const navigationVersion = useNavigationSignal();
  const [selected, setSelected] = useSelection(
      "materials",
      project.materials[0]?.id || "",
    ),
    [search, setSearch] = useState("");
  const material =
    project.materials.find((m) => m.id === selected) || project.materials[0];
  useEffect(() => {
    if (material && !`${material.title} ${material.category}`.includes(search))
      setSearch("");
  }, [selected, navigationVersion]);
  const update = (patch: Partial<NonNullable<typeof material>>) =>
    onChange({
      ...project,
      materials: project.materials.map((m) =>
        m.id === material.id
          ? {
              ...m,
              ...patch,
            }
          : m,
      ),
    });
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">WORLD & RECORDS</span>
          <h2>百科、报纸与笔记</h2>
        </div>
        <button
          onClick={() => {
            const id = uniqueId(
              "material",
              project.materials.map((m) => m.id),
            );
            onChange({
              ...project,
              materials: [
                ...project.materials,
                {
                  id,
                  title: "新的资料",
                  category: "encyclopedia",
                  body: "",
                },
              ],
            });
            setSelected(id);
          }}
        >
          添加资料
        </button>
      </div>
      <input
        className="st-search"
        aria-label="搜索资料"
        placeholder="搜索资料…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="st-material-list">
        {project.materials
          .filter((m) => `${m.title} ${m.category}`.includes(search))
          .map((m) => (
            <button
              key={m.id}
              data-entity-id={m.id}
              className={m.id === material?.id ? "selected" : ""}
              onClick={() => setSelected(m.id)}
            >
              <small>{m.category}</small>
              {m.title}
            </button>
          ))}
      </div>
      {!project.materials.some((m) =>
        `${m.title} ${m.category}`.includes(search),
      ) && (
        <div className="st-empty-actions">
          <p>
            {project.materials.length
              ? "没有匹配资料。"
              : "还没有资料，可点击上方“添加资料”。"}
          </p>
          <button onClick={() => setSearch("")}>清除资料筛选</button>
        </div>
      )}
      {material && (
        <Card title={material.id}>
          <div className="st-fields">
            <Field
              label="资料标题"
              value={material.title}
              onChange={(title) =>
                update({
                  title,
                })
              }
            />
            <Field
              label="资料类别"
              value={material.category}
              options={[
                "encyclopedia",
                "newspaper",
                "note",
                "clue",
                "items",
              ].map((v) => ({
                value: v,
                label: (
                  {
                    encyclopedia: "百科",
                    newspaper: "报纸",
                    note: "旅者笔记",
                    clue: "证据",
                    items: "道具",
                  } as Record<string, string>
                )[v],
              }))}
              onChange={(category) =>
                update({
                  category,
                })
              }
            />
            <TargetPicker
              label="解锁场景"
              nodes={project.nodes}
              allowEmpty
              emptyLabel="不按场景解锁"
              value={material.unlockNode || ""}
              onChange={(v) => {
                const next = {
                  ...material,
                };
                if (v) next.unlockNode = v;
                else delete next.unlockNode;
                onChange({
                  ...project,
                  materials: project.materials.map((m) =>
                    m.id === material.id ? next : m,
                  ),
                });
              }}
            />
          </div>
          <Field
            label="资料正文"
            value={material.body}
            multiline
            onChange={(body) =>
              update({
                body,
              })
            }
          />
          <Fold
            title="资料高级解锁条件"
            summary={material.unlock ? "1 个条件" : "无附加条件"}
          >
            <ConditionEditor
              label="资料解锁条件"
              materials={project.materials}
              value={material.unlock}
              nodes={project.nodes}
              onChange={(unlock) => {
                const next = {
                  ...material,
                };
                if (unlock) next.unlock = unlock;
                else delete next.unlock;
                onChange({
                  ...project,
                  materials: project.materials.map((m) =>
                    m.id === material.id ? next : m,
                  ),
                });
              }}
            />
          </Fold>
          <button
            className="danger"
            onClick={() =>
              onChange({
                ...project,
                materials: project.materials.filter(
                  (m) => m.id !== material.id,
                ),
              })
            }
          >
            删除资料
          </button>
        </Card>
      )}
    </>
  );
}
