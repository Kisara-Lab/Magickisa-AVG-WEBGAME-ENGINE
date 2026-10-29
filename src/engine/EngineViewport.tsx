import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { EngineRendererContext } from "./types";
import { resolveAsset, resolveScene } from "./media";
import { CharacterStage } from "./character";
import { evaluateCondition } from "./condition";
import { SequenceStage } from "./SequenceStage";
import { interpolate } from "./interpolation";
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
  const [stageError, setStageError] = useState<{
    id: string;
    message: string;
  }>();
  const terminal = project.sequences?.find(
    (s) => s.id === save.terminalSequence,
  );
  const nvl = (node?.readingMode ?? project.theme?.mode) === "nvl";
  const dialogueBox = useRef<HTMLDivElement>(null),
    currentText = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = dialogueBox.current,
      text = currentText.current;
    if (nvl && box && text)
      box.scrollTop +=
        text.getBoundingClientRect().top - box.getBoundingClientRect().top - 20;
  }, [nvl, node?.id, line?.id]);
  const previous =
    nvl && node
      ? node.lines.slice(0, line ? context.lineIndex : node.lines.length)
      : [];
  const pageStart = previous.reduce(
    (last, entry, i) => (entry.pageBreak ? i : last),
    0,
  );
  const paragraph = (text: string) =>
    interpolate(text.replace(/\*\*/g, ""), save.variables);
  return (
    <section
      className={`stage ${nvl ? "stage-nvl" : ""} ${node?.presentation === "dedication" && !context.save.presentation && !context.save.completed ? "dedication-stage" : ""}`}
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
      {terminal && (
        <div className="sequence-terminal" aria-label="演出保留画面">
          <SequenceStage
            project={project}
            sequence={terminal}
            time={terminal.duration}
            playing={false}
            backdrop={
              node?.background
                ? resolveAsset(project, node.background)
                : resolveScene(project, node?.title ?? "")
            }
            line={line}
            onFailure={(message) => setStageError({ id: terminal.id, message })}
          />
        </div>
      )}
      <div className="scene-vignette" />
      <div className="scene-caption">
        <span>{node?.chapter || project.title}</span>
        <strong>{node?.title.replace(/^【|】$/g, "")}</strong>
      </div>
      <div className="dialogue-box" ref={dialogueBox}>
        {terminal && stageError?.id === terminal.id && (
          <p role="alert">{stageError.message}</p>
        )}
        <div className="speaker">
          {line?.speaker || node?.speaker || "旁白"}
        </div>
        <div className="dialogue-text">
          {nvl &&
            !line?.pageBreak &&
            previous
              .slice(pageStart)
              .filter(
                (l) =>
                  save.readLineIds.includes(l.id) &&
                  evaluateCondition(
                    l.condition,
                    save.variables,
                    save.visitedNodes,
                    save,
                  ),
              )
              .map((l) => (
                <p className="nvl-previous" key={l.id}>
                  {l.speaker && <strong>{l.speaker}： </strong>}
                  {paragraph(l.text)}
                </p>
              ))}
          {line ? (
            <>
              <span className="line-in" ref={currentText}>
                {visibleText ?? paragraph(line.text)}
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
