import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { StoryProject, StoryLine } from "./types";
import { sequenceVisualState, type Sequence } from "./sequence";
import { resolveAsset, resolveScene } from "./media";
import { CharacterStage, CharacterHost } from "./character";

function SequenceMedia({
  src,
  local,
  playing,
  active,
  volume,
  loop,
  video,
  onFailure,
}: {
  src: string;
  local: number;
  playing: boolean;
  active: boolean;
  volume: number;
  loop: boolean;
  video: boolean;
  onFailure: (message: string) => void;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const last = useRef(local);
  const failure = useRef(onFailure);
  failure.current = onFailure;
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    media.volume = Math.min(1, Math.max(0, volume));
    const target =
      loop && Number.isFinite(media.duration) && media.duration > 0
        ? local % media.duration
        : local;
    if (Math.abs(media.currentTime - target) > 0.35 || local < last.current) {
      try {
        media.currentTime = target;
      } catch {
        /* metadata may not be available yet */
      }
    }
    last.current = local;
  }, [local, volume, loop]);
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    let alive = true;
    if (playing && active)
      void media.play().catch(() => {
        if (alive) failure.current("媒体播放受阻，请重试或跳过演出。");
      });
    else media.pause();
    return () => {
      alive = false;
      media.pause();
    };
  }, [src, playing, active]);
  const props = {
    ref,
    src,
    loop,
    preload: "metadata",
    onError: () => onFailure("媒体无法加载或浏览器不支持该编码。"),
    onLoadedMetadata: () => {
      const media = ref.current;
      if (media)
        media.currentTime =
          loop && Number.isFinite(media.duration) && media.duration > 0
            ? local % media.duration
            : local;
    },
  };
  return video ? (
    <video
      {...props}
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  ) : (
    <audio {...props} />
  );
}

export function SequenceStage({
  project,
  sequence,
  time,
  playing,
  master = 1,
  bgm = 1,
  sound = 1,
  voice = 1,
  reduced = false,
  assetUrl = (url: string) => url,
  backdrop,
  line,
  onFailure,
}: {
  project: StoryProject;
  sequence: Sequence;
  time: number;
  playing: boolean;
  master?: number;
  bgm?: number;
  sound?: number;
  voice?: number;
  reduced?: boolean;
  assetUrl?: (url: string) => string;
  backdrop?: string;
  line?: StoryLine;
  onFailure: (message: string) => void;
}) {
  const { samples, camera, visual } = sequenceVisualState(sequence, time);
  const shake = (amount: number | undefined) =>
    reduced ? 0 : (amount ?? 0) * Math.sin(time * 83);
  const speaking = samples.some((s) => s.track.kind === "voice" && s.active);
  const replacedCharacters = new Set(
    visual.map((s) => s.track.characterId).filter(Boolean),
  );
  const baseLine = line
    ? {
        ...line,
        characterLayers: (
          line.characterLayers ??
          (line.characterId ? [{ characterId: line.characterId }] : [])
        ).filter((layer) => !replacedCharacters.has(layer.characterId)),
      }
    : undefined;
  return (
    <div className="sequence-stage" aria-label="演出画面">
      <div
        className="sequence-world"
        style={{
          transform: `translate(${camera.x ?? 0}%, ${camera.y ?? 0}%) translateX(${shake(camera.shake)}px) scale(${camera.scale ?? 1}) rotate(${camera.rotation ?? 0}deg)`,
        }}
      >
        {backdrop && (
          <img
            className="sequence-base"
            src={assetUrl(backdrop)}
            alt="场景背景"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            onError={() => onFailure("场景背景加载失败。 ")}
          />
        )}
        {baseLine && <CharacterStage project={project} line={baseLine} />}
        {visual.map(({ track, properties }) => {
          const style: CSSProperties = {
            position: "absolute",
            left: `${properties.x ?? (track.kind === "background" ? 0 : 50)}%`,
            top: `${properties.y ?? (track.kind === "background" ? 0 : 50)}%`,
            opacity: properties.opacity ?? 1,
            zIndex: track.zIndex,
            transform: `translate(${track.kind === "background" ? "0, 0" : "-50%, -50%"}) translateX(${shake(properties.shake)}px) scale(${properties.scale ?? 1}) rotate(${properties.rotation ?? 0}deg)`,
            width:
              track.kind === "background"
                ? "100%"
                : track.kind === "text"
                  ? "85%"
                  : track.characterId
                    ? "40%"
                    : "auto",
            height:
              track.kind === "background"
                ? "100%"
                : track.kind === "character"
                  ? "80%"
                  : "auto",
            objectFit: "cover",
            whiteSpace: "pre-wrap",
            textAlign: "center",
          };
          const character = track.characterId
            ? project.characters.find((c) => c.id === track.characterId)
            : undefined;
          return character ? (
            <div style={style} key={track.id}>
              <CharacterHost
                project={project}
                character={character}
                expression={track.expression}
                text={line?.text}
              />
            </div>
          ) : track.kind === "text" ? (
            <div style={style} key={track.id}>
              {track.text}
            </div>
          ) : (
            <img
              style={style}
              key={track.id}
              src={assetUrl(resolveAsset(project, track.asset!))}
              alt={track.target}
              onError={() => onFailure(`图片加载失败：${track.asset}`)}
            />
          );
        })}
        {samples
          .filter(
            (s) =>
              ["bgm", "sound", "voice", "video"].includes(s.track.kind) &&
              s.active,
          )
          .map(({ track, local, active, properties }) => (
            <SequenceMedia
              key={track.id}
              src={assetUrl(resolveAsset(project, track.asset!))}
              local={local + track.offset}
              active={active}
              playing={playing}
              loop={track.loop}
              volume={
                master *
                track.volume *
                (properties.volume ?? 1) *
                (track.kind === "bgm"
                  ? bgm * (speaking ? 0.35 : 1)
                  : track.kind === "voice"
                    ? voice
                    : sound)
              }
              video={track.kind === "video"}
              onFailure={onFailure}
            />
          ))}
      </div>
    </div>
  );
}

export function SequencePlayer({
  store,
  paused,
  volume,
  bgm,
  voice,
  sound,
  onSave,
}: {
  store: import("./store").EngineStore;
  paused: boolean;
  volume: number;
  bgm: number;
  voice: number;
  sound: number;
  onSave: () => void;
}) {
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const cursor = store.save.sequence;
  const sequence = store.project.sequences?.find((s) => s.id === cursor?.id);
  useEffect(() => {
    setError("");
    setRetry(0);
  }, [cursor?.id, cursor?.trigger]);
  useEffect(() => {
    if (!cursor || paused || error || cursor.waiting !== null) return;
    let previous = performance.now(),
      accumulated = 0;
    const timer = setInterval(() => {
      const now = performance.now(),
        dt = Math.min(0.25, (now - previous) / 1000);
      previous = now;
      store.tickSequence(dt);
      accumulated += dt;
      if (
        accumulated >= 1 ||
        !store.save.sequence ||
        store.save.sequence.waiting !== null
      ) {
        store.retrySave();
        accumulated = 0;
      }
    }, 50);
    return () => clearInterval(timer);
  }, [store, cursor?.id, cursor?.trigger, cursor?.waiting, paused, error]);
  if (!sequence || !cursor) return null;
  return (
    <section className="sequence-player">
      <SequenceStage
        key={`${cursor.trigger}:${retry}`}
        project={store.project}
        sequence={sequence}
        time={cursor.time}
        playing={!paused && !error && cursor.waiting === null}
        master={volume}
        bgm={bgm}
        voice={voice}
        backdrop={
          store.runtime.node?.background
            ? resolveAsset(store.project, store.runtime.node.background)
            : resolveScene(store.project, store.runtime.node?.title ?? "")
        }
        line={store.runtime.line}
        sound={sound}
        onFailure={setError}
        reduced={matchMedia("(prefers-reduced-motion: reduce)").matches}
      />
      <div className="sequence-controls">
        <span>
          {sequence.name} · {cursor.time.toFixed(1)} / {sequence.duration}s
        </span>
        {cursor.waiting !== null && (
          <button onClick={() => store.resumeSequence()}>继续演出</button>
        )}
        <button
          disabled={!sequence.skippable}
          onClick={() => store.skipSequence()}
        >
          跳过演出
        </button>
        <button onClick={onSave}>存读档</button>
        {error && (
          <div role="alert">
            {error}
            <button
              onClick={() => {
                setRetry((n) => n + 1);
                setError("");
              }}
            >
              重试媒体
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
