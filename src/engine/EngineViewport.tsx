import type { ReactNode } from "react";
import type { EngineRendererContext } from "./types";
import { resolveAsset, resolveScene } from "./media";
import { CharacterStage } from "./character";
export function EngineViewport({
  context,
  onAdvance,
  onChoose,
  onInput,
  children,
  visibleText,
  statusText,
}: {
  context: EngineRendererContext;
  onAdvance: () => void;
  onChoose: (id: string) => void;
  onInput: (key: string, text: string) => void;
  children?: ReactNode;
  visibleText?: string;
  statusText?: string;
}) {
  const { project, node, line, save, choices } = context;
  const input = line?.input;
  return (
    <section
      className={`stage ${node?.presentation === "dedication" && !context.save.presentation && !context.save.completed ? "dedication-stage" : ""}`}
      onClick={onAdvance}
    >
      <img
        key={node?.id}
        className="scene-image"
        src={
          node?.background
            ? resolveAsset(project, node.background)
            : resolveScene(project, node?.title || "")
        }
        alt="场景插图"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
      <CharacterStage project={project} line={line} />
      <div className="scene-vignette" />
      <div className="scene-caption">
        <span>{node?.chapter || project.title}</span>
        <strong>{node?.title.replace(/^【|】$/g, "")}</strong>
      </div>
      <div className="dialogue-box">
        <div className="speaker">
          {line?.speaker || node?.speaker || "旁白"}
        </div>
        <div className="dialogue-text">
          {line ? (
            <>
              <span className="line-in">
                {visibleText ??
                  line.text
                    .replace(/\*\*/g, "")
                    .replace(/\{\{([^}]+)\}\}/g, (_, key: string) =>
                      String(save.variables[key] ?? ""),
                    )}
              </span>
              {input && (
                <label
                  className="story-input"
                  onClick={(e) => e.stopPropagation()}
                >
                  {input.label}
                  <input
                    aria-label={input.label}
                    maxLength={input.maxLength}
                    value={String(save.variables[input.key] ?? "")}
                    onChange={(e) => onInput(input.key, e.target.value)}
                  />
                </label>
              )}
            </>
          ) : choices.length ? (
            <div className="choice-list">
              {choices.map((c, i) => (
                <button
                  key={c.id}
                  data-choice-id={c.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChoose(c.id);
                  }}
                >
                  <b>{String.fromCharCode(65 + i)}</b>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="continue-card">
              {statusText ??
                (node?.next ? "这一节点暂告一段落。" : "本段旅程已结束。")}
              <small>
                {node?.next
                  ? "点击或按 Space 继续"
                  : "可查看历史、复盘或重新开始。"}
              </small>
            </span>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
