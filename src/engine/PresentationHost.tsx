import { useEffect, useRef, useState } from "react";
import type { StoryProject, PresentationState } from "./types";
import { ReleasePresentation } from "./ReleasePresentation";
import { resolveAsset } from "./media";
import { SequenceClock, sequenceSchema } from "./sequence";

/** Special visual renderers share the same finite clock as ordinary sequences. */
export function PresentationHost({
  project,
  presentation,
  onFinish,
  onProgress,
  volume = 1,
  paused: externalPause = false,
}: {
  project: StoryProject;
  presentation: PresentationState;
  onFinish: () => void;
  onProgress?: (time: number) => void;
  volume?: number;
  paused?: boolean;
}) {
  const media =
    presentation.id === "opening"
      ? project.media.opening
      : project.media.ending;
  const duration =
    media?.duration ?? (presentation.id === "opening" ? 89 : 198);
  const [time, setTime] = useState(
    Math.min(presentation.position || 0, duration),
  );
  const [blocked, setBlocked] = useState(false),
    [paused, setPaused] = useState(false),
    [retry, setRetry] = useState(0);
  const audio = useRef<HTMLAudioElement>(null),
    clock = useRef<SequenceClock>(),
    finished = useRef(false);
  const callbacks = useRef({ onFinish, onProgress });
  callbacks.current = { onFinish, onProgress };
  const finish = () => {
    if (!finished.current) {
      finished.current = true;
      callbacks.current.onFinish();
    }
  };
  useEffect(() => {
    const initial = Math.min(presentation.position || 0, duration);
    clock.current = new SequenceClock(
      sequenceSchema.parse({
        id: presentation.id,
        name: presentation.id,
        duration,
        tracks: [],
      }),
      { time: initial, waiting: null, finished: initial === duration },
    );
    finished.current = false;
    setTime(initial);
    if (initial === duration) finish();
  }, [presentation.id, presentation.nodeId, duration]);
  const stopped = externalPause || paused || blocked;
  useEffect(() => {
    const element = audio.current;
    if (!element || !media?.audio) return;
    let alive = true;
    element.volume = Math.max(0, Math.min(1, volume));
    const align = () => {
      if (Number.isFinite(element.duration))
        element.currentTime = Math.min(
          clock.current?.cursor.time ?? 0,
          element.duration,
        );
    };
    const fail = () => {
      if (alive) setBlocked(true);
    };
    element.addEventListener("loadedmetadata", align);
    element.addEventListener("error", fail);
    if (stopped) element.pause();
    else {
      align();
      void element.play().catch(fail);
    }
    return () => {
      alive = false;
      element.pause();
      element.removeEventListener("loadedmetadata", align);
      element.removeEventListener("error", fail);
    };
  }, [media?.audio, stopped, volume, retry]);
  useEffect(() => {
    if (stopped) return;
    let previous = performance.now(),
      reported = time;
    const timer = setInterval(() => {
      const now = performance.now(),
        dt = Math.min(0.25, (now - previous) / 1000);
      previous = now;
      if (!clock.current || finished.current) return;
      const done = clock.current.tick(dt),
        value = clock.current.cursor.time;
      setTime(value);
      const element = audio.current;
      if (
        element &&
        !element.paused &&
        Math.abs(element.currentTime - value) > 0.35 &&
        value < element.duration
      )
        element.currentTime = value;
      if (value - reported >= 1 || done) {
        callbacks.current.onProgress?.(value);
        reported = value;
      }
      if (done) finish();
    }, 50);
    return () => clearInterval(timer);
  }, [stopped, presentation.id, presentation.nodeId, duration]);
  return (
    <ReleasePresentation
      project={project}
      mode={presentation.id}
      time={time}
      audioRef={audio}
      resolveAsset={(asset) => resolveAsset(project, asset)}
      onSkip={finish}
    >
      <div className="restored-presentation-controls">
        {blocked && (
          <>
            <p role="alert">演出音频加载失败或播放受阻，时间已暂停。</p>
            <button
              onClick={() => {
                audio.current?.load();
                setBlocked(false);
                setRetry((value) => value + 1);
              }}
            >
              重试播放音乐
            </button>
          </>
        )}
        <button onClick={() => setPaused((value) => !value)}>
          {paused ? "继续演出" : "暂停演出"}
        </button>
      </div>
    </ReleasePresentation>
  );
}
