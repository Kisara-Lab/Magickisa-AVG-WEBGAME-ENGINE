import type { AuthorProject, AuthorNode } from "./model";
import { uniqueId } from "./model";
import type { StoryNode, StoryLine, StoryChoice } from "../engine/types";
import { Card, Field, Check, ConditionEditor, EffectsEditor } from "./fields";
import { Fold } from "./components";
import { PickAsset, registerBackdrop } from "./AssetPicker";
export function ScriptEditor({
  project,
  node,
  lineIndex,
  setLine,
  onChange,
  onPreview,
  onClone,
  onDelete,
  sourceLevel,
  onProjectChange,
}: {
  project: AuthorProject;
  node: AuthorNode;
  lineIndex: number;
  setLine: (i: number) => void;
  onChange: (n: AuthorNode) => void;
  onPreview: () => void;
  onClone: () => void;
  onDelete: () => void;
  sourceLevel?: number;
  onProjectChange: (p: AuthorProject) => void;
}) {
  const line = node.lines[lineIndex];
  const changeLine = (next: StoryLine) =>
    onChange({
      ...node,
      lines: node.lines.map((l, i) => (i === lineIndex ? next : l)),
    });
  const targets = [
    {
      value: "",
      label: "无 / 停止于此",
    },
    ...project.nodes.map((n) => ({
      value: n.id,
      label: `${n.id} · ${n.title}`,
    })),
  ];
  return (
    <>
      <div className="st-section-title">
        <div>
          <span className="st-kicker">SCENE / {node.id}</span>
          <input
            className="st-scene-title-input"
            aria-label="场景标题"
            value={node.title}
            onChange={(e) =>
              onChange({
                ...node,
                title: e.target.value,
              })
            }
          />
        </div>
        <div className="st-inline">
          <button onClick={onClone}>复制场景</button>
          <button className="danger" onClick={onDelete}>
            删除场景
          </button>
        </div>
      </div>
      <Fold
        title="场景属性"
        summary={`${node.speaker || "旁白"} · ${node.next || "末场景"}`}
      >
        <div className="st-fields">
          <Field
            label="默认说话人"
            value={node.speaker}
            onChange={(speaker) =>
              onChange({
                ...node,
                speaker,
              })
            }
          />
          <Field
            label="下一场景"
            value={node.next}
            options={targets}
            onChange={(next) => {
              const n = {
                ...node,
              };
              if (next) n.next = next;
              else delete n.next;
              onChange(n);
            }}
          />
          <Field
            label="场景背景"
            value={node.background}
            options={[
              {
                value: "",
                label: "按场景规则自动匹配",
              },
              ...project.backdrops.map((b) => ({
                value: b.id,
                label: b.id,
              })),
            ]}
            onChange={(background) => {
              const n = {
                ...node,
              };
              if (background) n.background = background;
              else delete n.background;
              onChange(n);
            }}
          />
          <PickAsset
            kind="image"
            label="挑选场景背景"
            onPick={(url) => {
              const p = structuredClone(project);
              const background = registerBackdrop(p, url);
              p.nodes = p.nodes.map((n) =>
                n.id === node.id
                  ? {
                      ...n,
                      background,
                    }
                  : n,
              );
              onProjectChange(p);
            }}
          />
        </div>
        <Fold title="章节与演出属性" summary={node.chapter || "高级设置"}>
          <div className="st-fields">
            <Field
              label="所属章节"
              value={node.chapter}
              onChange={(chapter) =>
                onChange({
                  ...node,
                  chapter,
                })
              }
            />
            <Field
              label="目录层级"
              value={String(node.sourceLevel || sourceLevel || 2)}
              options={[
                {
                  value: "1",
                  label: "一级 · 章节",
                },
                {
                  value: "2",
                  label: "二级 · 场景",
                },
                {
                  value: "3",
                  label: "三级 · 小节",
                },
              ]}
              onChange={(v) =>
                onChange({
                  ...node,
                  sourceLevel: Number(v),
                })
              }
            />
            {
              <Field
                label="结局标识"
                value={node.ending}
                onChange={(v) => {
                  const n = {
                    ...node,
                  };
                  if (v) n.ending = v;
                  else delete n.ending;
                  onChange(n);
                }}
              />
            }
            <Field
              label="标签（逗号分隔）"
              value={node.tags?.join(", ")}
              onChange={(v) =>
                onChange({
                  ...node,
                  tags: v
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <Field
              label="场景演出"
              value={node.presentation || ""}
              options={[
                {
                  value: "",
                  label: "普通剧情",
                },
                {
                  value: "dedication",
                  label: "开场献词 → OP",
                },
                {
                  value: "ending",
                  label: "结局 → ED",
                },
              ]}
              onChange={(v) => {
                const n = {
                  ...node,
                };
                if (v) {
                  n.presentation = v as "dedication" | "ending";
                } else {
                  delete n.presentation;
                }
                onChange(n);
              }}
            />
            <Check
              label="可游玩场景"
              value={node.playable !== false}
              onChange={(playable) =>
                onChange({
                  ...node,
                  playable,
                })
              }
            />
          </div>
        </Fold>
      </Fold>
      <Card
        title={`台词与演出 · ${node.lines.length} 句`}
        action={
          <button
            onClick={() => {
              const id = uniqueId(
                `${node.id}-line`,
                project.nodes.flatMap((n) => n.lines.map((l) => l.id)),
              );
              onChange({
                ...node,
                lines: [
                  ...node.lines,
                  {
                    id,
                    text: "新的台词。",
                  },
                ],
              });
              setLine(node.lines.length);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLTextAreaElement>(
                    ".st-line.selected textarea",
                  )
                  ?.focus(),
              );
            }}
          >
            添加台词
          </button>
        }
      >
        <div className="st-line-list">
          {node.lines.map((l, i) => (
            <div
              key={l.id}
              data-line-id={l.id}
              className={`st-line ${lineIndex === i ? "selected" : ""}`}
            >
              <button
                className="st-line-number"
                onClick={() => setLine(i)}
                aria-label={`选择台词 ${i + 1}`}
              >
                {String(i + 1).padStart(2, "0")}
              </button>
              <label>
                <small>{l.speaker || node.speaker || "旁白"}</small>
                <textarea
                  aria-label={
                    lineIndex === i ? "台词正文" : `台词 ${i + 1} 正文`
                  }
                  rows={2}
                  value={l.text}
                  onFocus={() => setLine(i)}
                  onChange={(e) =>
                    onChange({
                      ...node,
                      lines: node.lines.map((v, j) =>
                        j === i
                          ? {
                              ...v,
                              text: e.target.value,
                            }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              <div className="st-line-actions">
                <button
                  aria-label={`复制台词 ${i + 1}`}
                  title="复制台词"
                  onClick={() => {
                    const lines = [...node.lines];
                    lines.splice(i + 1, 0, {
                      ...structuredClone(l),
                      id: uniqueId(
                        `${node.id}-line`,
                        node.lines.map((l) => l.id),
                      ),
                    });
                    onChange({
                      ...node,
                      lines,
                    });
                    setLine(i + 1);
                  }}
                >
                  ⧉
                </button>
                <button
                  aria-label={`在台词 ${i + 1} 后新增`}
                  onClick={() => {
                    const lines = [...node.lines];
                    lines.splice(i + 1, 0, {
                      id: uniqueId(
                        `${node.id}-line`,
                        node.lines.map((l) => l.id),
                      ),
                      text: "",
                    });
                    onChange({
                      ...node,
                      lines,
                    });
                    setLine(i + 1);
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLTextAreaElement>(
                          ".st-line.selected textarea",
                        )
                        ?.focus(),
                    );
                  }}
                >
                  ＋
                </button>
                <button
                  aria-label={`上移台词 ${i + 1}`}
                  disabled={i === 0}
                  onClick={() => {
                    const lines = [...node.lines];
                    [lines[i - 1], lines[i]] = [lines[i], lines[i - 1]];
                    onChange({
                      ...node,
                      lines,
                    });
                    setLine(i - 1);
                  }}
                >
                  ↑
                </button>
                <button
                  aria-label={`下移台词 ${i + 1}`}
                  disabled={i === node.lines.length - 1}
                  onClick={() => {
                    const lines = [...node.lines];
                    [lines[i + 1], lines[i]] = [lines[i], lines[i + 1]];
                    onChange({
                      ...node,
                      lines,
                    });
                    setLine(i + 1);
                  }}
                >
                  ↓
                </button>
                <button
                  aria-label={`删除台词 ${i + 1}`}
                  onClick={() => {
                    onChange({
                      ...node,
                      lines: node.lines.filter((_, j) => j !== i),
                    });
                    setLine(
                      Math.max(0, Math.min(lineIndex, node.lines.length - 2)),
                    );
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
        {line && (
          <div className="st-line-detail">
            <div className="st-inline">
              <span className="st-kicker">
                LINE {lineIndex + 1} / {line.id}
              </span>
              <div>
                <button
                  disabled={lineIndex === 0}
                  onClick={() => {
                    const lines = [...node.lines];
                    [lines[lineIndex - 1], lines[lineIndex]] = [
                      lines[lineIndex],
                      lines[lineIndex - 1],
                    ];
                    onChange({
                      ...node,
                      lines,
                    });
                    setLine(lineIndex - 1);
                  }}
                >
                  上移
                </button>
                <button
                  disabled={lineIndex === node.lines.length - 1}
                  onClick={() => {
                    const lines = [...node.lines];
                    [lines[lineIndex + 1], lines[lineIndex]] = [
                      lines[lineIndex],
                      lines[lineIndex + 1],
                    ];
                    onChange({
                      ...node,
                      lines,
                    });
                    setLine(lineIndex + 1);
                  }}
                >
                  下移
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    onChange({
                      ...node,
                      lines: node.lines.filter((_, i) => i !== lineIndex),
                    });
                    setLine(Math.max(0, lineIndex - 1));
                  }}
                >
                  删除台词
                </button>
              </div>
            </div>
            <Fold
              title="本句立绘与高级属性"
              summary={`${line.characterId || "无人物"} · ${line.characterLayers?.length || 0} 个图层`}
            >
              <div className="st-fields">
                {
                  <Field
                    label="本句说话人"
                    value={line.speaker}
                    placeholder="沿用场景说话人"
                    onChange={(speaker) =>
                      changeLine({
                        ...line,
                        speaker,
                      })
                    }
                  />
                }
                <Field
                  label="本句人物"
                  value={line.characterId || ""}
                  options={[
                    {
                      value: "",
                      label: "无 / 使用多人物层",
                    },
                    ...project.characters.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                  onChange={(characterId) => {
                    const l = {
                      ...line,
                    };
                    if (characterId) l.characterId = characterId;
                    else delete l.characterId;
                    changeLine(l);
                  }}
                />
                <Field
                  label="本句表情"
                  value={line.expression}
                  options={[
                    {
                      value: "",
                      label: "默认表情",
                    },
                    ...Object.keys(
                      project.characters.find((c) => c.id === line.characterId)
                        ?.expressions || {},
                    ).map((e) => ({
                      value: e,
                      label: e,
                    })),
                  ]}
                  onChange={(expression) =>
                    changeLine({
                      ...line,
                      expression,
                    })
                  }
                />
              </div>
              <Fold
                title="人物图层与位置"
                summary={`${line.characterLayers?.length || 0} 层`}
              >
                {(line.characterLayers || []).map((layer, i) => {
                  const update = (patch: Partial<typeof layer>) =>
                    changeLine({
                      ...line,
                      characterLayers: line.characterLayers!.map((l, j) =>
                        j === i
                          ? {
                              ...l,
                              ...patch,
                            }
                          : l,
                      ),
                    });
                  return (
                    <div className="st-rule" key={i} data-layer-index={i}>
                      <div className="st-fields">
                        <Field
                          label={`图层 ${i + 1} 人物`}
                          value={layer.characterId}
                          options={project.characters.map((c) => ({
                            value: c.id,
                            label: c.name,
                          }))}
                          onChange={(characterId) =>
                            update({
                              characterId,
                            })
                          }
                        />
                        <Field
                          label="图层表情"
                          value={layer.expression || ""}
                          options={[
                            {
                              value: "",
                              label: "默认",
                            },
                            ...Object.keys(
                              project.characters.find(
                                (c) => c.id === layer.characterId,
                              )?.expressions || {},
                            ).map((e) => ({
                              value: e,
                              label: e,
                            })),
                          ]}
                          onChange={(expression) =>
                            update({
                              expression,
                            })
                          }
                        />
                        <Field
                          label="图层位置"
                          value={layer.position || "center"}
                          options={["left", "center", "right", "custom"].map(
                            (v, i) => ({
                              value: v,
                              label: ["左侧", "中央", "右侧", "自定义"][i],
                            }),
                          )}
                          onChange={(position) =>
                            update({
                              position,
                            })
                          }
                        />
                        {(
                          ["x", "y", "scale", "opacity", "zIndex"] as const
                        ).map((key, i) => (
                          <Field
                            key={key}
                            label={
                              [
                                "横坐标 %",
                                "纵坐标 %",
                                "缩放",
                                "透明度",
                                "层级",
                              ][i]
                            }
                            type="number"
                            allowEmpty
                            min={
                              key === "scale"
                                ? 0.01
                                : key === "opacity"
                                  ? 0
                                  : undefined
                            }
                            max={key === "opacity" ? 1 : undefined}
                            step={
                              key === "scale" || key === "opacity" ? 0.1 : 1
                            }
                            value={layer[key]}
                            placeholder="自动（清空以使用运行时默认值）"
                            onChange={(v) =>
                              update({
                                [key]: v === "" ? undefined : Number(v),
                              })
                            }
                          />
                        ))}
                        <Field
                          label="入场方式"
                          value={layer.enter || "fade"}
                          options={[
                            "fade",
                            "slide-left",
                            "slide-right",
                            "none",
                          ].map((v) => ({
                            value: v,
                            label: v,
                          }))}
                          onChange={(enter) =>
                            update({
                              enter,
                            })
                          }
                        />
                      </div>
                      <button
                        className="danger"
                        onClick={() =>
                          changeLine({
                            ...line,
                            characterLayers: line.characterLayers!.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        删除图层
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() =>
                    changeLine({
                      ...line,
                      characterLayers: [
                        ...(line.characterLayers || []),
                        {
                          characterId: project.characters[0]?.id || "",
                          position: "center",
                          scale: 1,
                          opacity: 1,
                        },
                      ],
                    })
                  }
                >
                  添加人物图层
                </button>
              </Fold>
              {
                <Fold title="本句条件与玩家输入">
                  <ConditionEditor
                    nodes={project.nodes}
                    value={line.condition}
                    onChange={(condition) => {
                      const l = {
                        ...line,
                      };
                      if (condition) l.condition = condition;
                      else delete l.condition;
                      changeLine(l);
                    }}
                  />
                  <Check
                    label="要求玩家输入"
                    value={!!line.input}
                    onChange={(v) => {
                      const l = {
                        ...line,
                      };
                      if (v)
                        l.input = {
                          key: "playerText",
                          label: "请输入",
                          maxLength: 80,
                        };
                      else delete l.input;
                      changeLine(l);
                    }}
                  />
                  {line.input && (
                    <div className="st-fields">
                      <Field
                        label="输入变量"
                        value={line.input.key}
                        onChange={(key) =>
                          changeLine({
                            ...line,
                            input: {
                              ...line.input!,
                              key,
                            },
                          })
                        }
                      />
                      <Field
                        label="输入提示"
                        value={line.input.label}
                        onChange={(label) =>
                          changeLine({
                            ...line,
                            input: {
                              ...line.input!,
                              label,
                            },
                          })
                        }
                      />
                      <Field
                        label="输入长度上限"
                        type="number"
                        min={1}
                        step={1}
                        value={line.input.maxLength}
                        onChange={(v) =>
                          changeLine({
                            ...line,
                            input: {
                              ...line.input!,
                              maxLength: Number(v),
                            },
                          })
                        }
                      />
                    </div>
                  )}
                </Fold>
              }
            </Fold>
            <button className="primary" onClick={onPreview}>
              从本句预览
            </button>
          </div>
        )}
      </Card>
      <Card
        title={`分支选择 · ${node.choices?.length || 0}`}
        action={
          <button
            onClick={() =>
              onChange({
                ...node,
                choices: [
                  ...(node.choices || []),
                  {
                    id: uniqueId(
                      `${node.id}-choice`,
                      (node.choices || []).map((c) => c.id),
                    ),
                    label: "新的选择",
                    target: node.next || node.id,
                  },
                ],
              })
            }
          >
            添加分支
          </button>
        }
      >
        {(node.choices || []).map((c, i) => {
          const change = (next: StoryChoice) =>
            onChange({
              ...node,
              choices: node.choices!.map((v, j) => (j === i ? next : v)),
            });
          return (
            <div className="st-rule" key={c.id} data-branch-id={c.id}>
              <div className="st-inline">
                <strong>
                  分支 {i + 1} <small>{c.id}</small>
                </strong>
                <button
                  className="danger"
                  onClick={() =>
                    onChange({
                      ...node,
                      choices: node.choices!.filter((_, j) => j !== i),
                    })
                  }
                >
                  删除分支
                </button>
              </div>
              <div className="st-fields">
                <Field
                  label={`分支 ${i + 1} 文案`}
                  value={c.label}
                  onChange={(label) =>
                    change({
                      ...c,
                      label,
                    })
                  }
                />
                <Field
                  label={`分支 ${i + 1} 目标`}
                  value={c.target}
                  options={targets.filter((t) => t.value)}
                  onChange={(target) =>
                    change({
                      ...c,
                      target,
                    })
                  }
                />
              </div>
              <Fold
                title="分支条件与效果"
                summary={`${c.condition ? 1 : 0} 个条件 · ${c.effects?.length || 0} 个效果`}
              >
                <Check
                  label="仅可选择一次"
                  value={c.once}
                  onChange={(once) =>
                    change({
                      ...c,
                      once,
                    })
                  }
                />
                <ConditionEditor
                  label="可选条件"
                  nodes={project.nodes}
                  value={c.condition}
                  onChange={(condition) => {
                    const next = {
                      ...c,
                    };
                    if (condition) next.condition = condition;
                    else delete next.condition;
                    change(next);
                  }}
                />
                <EffectsEditor
                  audio={project.audio}
                  materials={project.materials}
                  label="选择后效果"
                  value={c.effects}
                  onChange={(effects) =>
                    change({
                      ...c,
                      effects,
                    })
                  }
                />
              </Fold>
            </div>
          );
        })}
        {!node.choices?.length && (
          <p className="st-muted">没有分支。阅读结束后将进入“下一场景”。</p>
        )}
      </Card>
      <Fold
        title="场景逻辑"
        summary={`${node.condition ? 1 : 0} 个进入条件 · ${(node.onEnter?.length || 0) + (node.onComplete?.length || 0)} 个效果`}
      >
        <ConditionEditor
          label="进入条件"
          nodes={project.nodes}
          value={node.condition}
          onChange={(condition) => {
            const n = {
              ...node,
            };
            if (condition) n.condition = condition;
            else delete n.condition;
            onChange(n);
          }}
        />
        {
          <>
            <EffectsEditor
              audio={project.audio}
              materials={project.materials}
              label="进入时效果"
              value={node.onEnter}
              onChange={(onEnter) =>
                onChange({
                  ...node,
                  onEnter,
                })
              }
            />
            <EffectsEditor
              audio={project.audio}
              materials={project.materials}
              label="完成时效果"
              value={node.onComplete}
              onChange={(onComplete) =>
                onChange({
                  ...node,
                  onComplete,
                })
              }
            />
          </>
        }
      </Fold>
    </>
  );
}
