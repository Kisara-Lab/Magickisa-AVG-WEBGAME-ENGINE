import { useEffect, useRef, useState } from "react";
import type {
  StoryProject,
  StoryLine,
  Character,
  CharacterLayer,
} from "./types";
import { resolveAsset } from "./media";
import { rendererRegistry, type Live2DInstance } from "./renderer";
import { LipSyncController } from "./lipSync";
export function CharacterHost({
  character,
  expression,
  text = "",
  project,
}: {
  character: Character;
  expression?: string;
  text?: string;
  project: StoryProject;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<Live2DInstance | null>(null),
    [failed, setFailed] = useState(false);
  const adapter = rendererRegistry.getLive2D();
  useEffect(() => {
    setFailed(false);
    if (character.renderer !== "live2d" || !adapter || !host.current) return;
    try {
      instance.current = adapter.mount({
        container: host.current,
        character,
        expression,
      });
    } catch {
      setFailed(true);
    }
    return () => {
      instance.current?.dispose();
      instance.current = null;
    };
  }, [character, adapter]);
  useEffect(() => {
    instance.current?.setExpression?.(expression);
  }, [expression]);
  useEffect(() => {
    if (!instance.current || failed) return;
    const sync = new LipSyncController({
      mode: "text",
      text,
      onMouthOpen: (v) => instance.current?.setMouthOpen?.(v),
    });
    sync.start();
    return () => sync.stop();
  }, [text, failed, adapter]);
  const portrait =
    (expression && character.expressions?.[expression]) || character.portrait;
  return (
    <div ref={host} className="character-host" data-character-id={character.id}>
      {(!adapter || character.renderer !== "live2d" || failed) && portrait && (
        <img src={resolveAsset(project, portrait)} alt={character.name} />
      )}
    </div>
  );
}
export function CharacterStage({
  project,
  line,
}: {
  project: StoryProject;
  line?: StoryLine;
}) {
  const layers: CharacterLayer[] =
    line?.characterLayers ||
    (line?.characterId
      ? [{ characterId: line.characterId, position: "center" }]
      : []);
  return (
    <div className="character-stage">
      {layers.map((l) => {
        const c = project.characters.find((c) => c.id === l.characterId);
        return c ? (
          <div
            key={`${c.id}-${l.position||'center'}`}
            className={`character-layer restored-character character-position-${l.position || "center"} character-enter-${l.enter||'fade'} ${!line?.characterId||line.characterId===c.id?'character-active':'character-muted'}`}
            style={{
              left: `${l.x ?? (l.position === "left" ? 25 : l.position === "right" ? 75 : 50)}%`,
              bottom: `${100 - (l.y ?? 74)}%`,
              transform: `translateX(-50%) scale(${l.scale ?? 1})`,
              opacity: (l.opacity ?? 1)*(!line?.characterId||line.characterId===c.id?1:.52),
              zIndex: l.zIndex ?? (!line?.characterId||line.characterId===c.id?2:1),
            }}
          >
            <CharacterHost
              character={c}
              expression={l.expression || line?.expression}
              text={line?.text}
              project={project}
            />
          </div>
        ) : null;
      })}
    </div>
  );
}
