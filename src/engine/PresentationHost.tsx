import { useEffect, useRef, useState } from "react";
import type { StoryProject, PresentationState } from "./types";
import { ReleasePresentation } from "./ReleasePresentation";
import { resolveAsset } from "./media";
export function PresentationHost({
  project,
  presentation,
  onFinish,
  onProgress,
  volume = 1,
}: {
  project: StoryProject;
  presentation: PresentationState;
  onFinish: () => void;
  onProgress?: (time: number) => void;
  volume?: number;
}) {
  const [time, setTime] = useState(presentation.position || 0),
    [blocked, setBlocked] = useState(false),
    [paused, setPaused] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    lastReported = useRef(presentation.position || 0);
  const media =
    presentation.id === "opening"
      ? project.media.opening
      : project.media.ending;
  const src = media?.audio;
  useEffect(() => {
    const a = audio.current;
    if (a) a.volume = volume;
  }, [volume]);
  useEffect(() => {
    setPaused(false);
    setBlocked(false);
    if (!src) return;
    const a = audio.current;
    void a?.play().catch(() => setBlocked(true));
    return () => {
      a?.pause();
    };
  }, [src, presentation.nodeId]);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const update = () => {
      const value = a.currentTime;
      setTime((t) => Math.max(t, value));
      if (Math.abs(value - lastReported.current) >= 2) {
        lastReported.current = value;
        onProgress?.(value);
      }
    };
    const loaded = () => {
      if (presentation.position)
        a.currentTime = Math.min(
          presentation.position,
          a.duration || presentation.position,
        );
    };
    const fail = () => setBlocked(true);
    a.addEventListener("timeupdate", update);
    a.addEventListener("loadedmetadata", loaded);
    a.addEventListener("ended", onFinish);
    a.addEventListener("error", fail);
    return () => {
      a.removeEventListener("timeupdate", update);
      a.removeEventListener("loadedmetadata", loaded);
      a.removeEventListener("ended", onFinish);
      a.removeEventListener("error", fail);
    };
  }, [onFinish, onProgress]);
  useEffect(() => {
    if (paused) return;
    let previous = audio.current?.currentTime || 0,
      lastChange = performance.now();
    const timer = setInterval(() => {
      const current = audio.current?.currentTime || 0;
      if (current > previous) {
        previous = current;
        lastChange = performance.now();
        setTime((t) => Math.max(t, current));
      } else if (!src || blocked || performance.now() - lastChange >= 2000) {
        setTime((t) => t + 0.25);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [src, blocked, paused]);
  useEffect(() => {
    if (time >= (media?.duration ?? (presentation.id === "opening" ? 89 : 198)))
      onFinish();
  }, [time, media?.duration, onFinish]);
  return (
    <ReleasePresentation
      project={project}
      mode={presentation.id}
      time={time}
      audioRef={audio}
      resolveAsset={(asset) => resolveAsset(project, asset)}
      onSkip={onFinish}
    >
      <div className="restored-presentation-controls">
        {blocked && (
          <button
            onClick={() =>
              void audio.current
                ?.play()
                .then(() => setBlocked(false))
                .catch(() => setBlocked(true))
            }
          >
            播放音乐
          </button>
        )}
        <button
          onClick={() => {
            if (paused)
              void audio.current?.play().catch(() => setBlocked(true));
            else audio.current?.pause();
            setPaused(!paused);
          }}
        >
          {paused ? "继续演出" : "暂停演出"}
        </button>
      </div>
    </ReleasePresentation>
  );
}
