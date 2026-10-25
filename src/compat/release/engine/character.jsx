// MAGICKISA release-compatible runtime.
import React from "react";
import { rendererRegistry } from "./renderer.js";
import { LipSyncController } from "./lipSync.js";
export function CharacterHost({
  character: character,
  expression: expression,
  resolveAsset = (u) => u,
  className = "",
  lipSync: lipSync,
  lineText = "",
  voiceElement: voiceElement,
}) {
  var w;
  const canvasRef = React.useRef(null),
    live2dRef = React.useRef(null),
    lipSyncRef = React.useRef(null),
    [failed, setFailed] = React.useState(!1),
    portrait =
      (expression &&
        ((w = character.expressions) == null ? void 0 : w[expression])) ||
      character.portrait,
    adapter = rendererRegistry.getLive2D();
  return (
    React.useEffect(() => {
      var x, L;
      if (
        (setFailed(!1),
        (L = (x = live2dRef.current) == null ? void 0 : x.dispose) == null ||
          L.call(x),
        (live2dRef.current = null),
        !(
          character.renderer !== "live2d" ||
          !character.live2d ||
          !canvasRef.current ||
          !adapter
        ))
      ) {
        try {
          const h = adapter.mount({
            container: canvasRef.current,
            character: character,
            expression: expression,
            onMouthOpen: (d) => {
              var p, k;
              return (k =
                (p = live2dRef.current) == null ? void 0 : p.setMouthOpen) ==
                null
                ? void 0
                : k.call(p, d);
            },
          });
          live2dRef.current = h && "dispose" in h ? h : null;
        } catch {
          setFailed(!0);
        }
        return () => {
          var h, d;
          ((d = (h = live2dRef.current) == null ? void 0 : h.dispose) == null ||
            d.call(h),
            (live2dRef.current = null));
        };
      }
    }, [adapter, character, expression]),
    React.useEffect(() => {
      var x, L;
      (L = (x = live2dRef.current) == null ? void 0 : x.setExpression) ==
        null || L.call(x, expression);
    }, [expression]),
    React.useEffect(() => {
      var L;
      if (
        ((L = lipSyncRef.current) == null || L.stop(),
        (lipSyncRef.current = null),
        character.renderer !== "live2d" ||
          failed ||
          !live2dRef.current ||
          !lipSync ||
          lipSync.mode === "off")
      )
        return;
      const x = new LipSyncController({
        mode: lipSync.mode,
        text: lineText,
        rate: lipSync.textRate,
        audio: lipSync.mode === "audio" ? voiceElement : null,
        sensitivity: lipSync.sensitivity,
        onMouthOpen: (h) => {
          var d, p;
          return (p =
            (d = live2dRef.current) == null ? void 0 : d.setMouthOpen) == null
            ? void 0
            : p.call(d, h);
        },
      });
      return (
        (lipSyncRef.current = x),
        x.start(),
        () => {
          (x.stop(), lipSyncRef.current === x && (lipSyncRef.current = null));
        }
      );
    }, [character.renderer, failed, lipSync, lineText, voiceElement]),
    character.renderer === "live2d" && character.live2d && !failed ? (
      <div
        className={`character-host character-live2d ${className}`}
        data-character-id={character.id}
        data-live2d-model={character.live2d.model}
      >
        <div
          ref={canvasRef}
          className="character-live2d-canvas"
          aria-label={`${character.name} Live2D`}
        />
        {!adapter && portrait && (
          <img
            className="character-live2d-fallback"
            src={resolveAsset(portrait)}
            alt={character.name}
          />
        )}
      </div>
    ) : portrait ? (
      <img
        className={`character-host character-portrait ${className}`}
        src={resolveAsset(portrait)}
        alt={character.name}
        data-character-id={character.id}
      />
    ) : null
  );
}
export function CharacterStage({
  project: project,
  layers: layers,
  activeCharacterId: activeCharacterId,
  line: line,
  resolveAsset: resolveAsset,
  lipSync: lipSync,
  voiceElement: voiceElement,
  className = "",
}) {
  const characters = project.characters || [];
  return (
    <div
      className={`character-stage ${className}`}
      aria-label="Character stage"
    >
      {layers.map((c) => {
        const v = characters.find((E) => E.id === c.characterId);
        if (!v) return null;
        const y = !activeCharacterId || activeCharacterId === v.id,
          m = {
            "--character-x": `${c.x ?? 50}%`,
            "--character-y": `${c.y ?? 100}%`,
            "--character-scale": c.scale ?? 1,
            opacity: (c.opacity ?? 1) * (y ? 1 : 0.52),
            zIndex: c.zIndex ?? (y ? 2 : 1),
          };
        return (
          <div
            className={`character-layer character-position-${c.position} character-enter-${c.enter || "fade"} ${y ? "character-active" : "character-muted"}`}
            style={m}
            key={`${v.id}-${c.position}`}
          >
            <CharacterHost
              character={v}
              expression={
                c.expression || (line == null ? void 0 : line.expression)
              }
              resolveAsset={resolveAsset}
              lineText={line == null ? void 0 : line.text}
              lipSync={
                y
                  ? lipSync
                  : {
                      mode: "off",
                    }
              }
              voiceElement={voiceElement}
            />
          </div>
        );
      })}
    </div>
  );
}
