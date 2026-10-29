import { useEffect, useRef } from "react";
import { playbackVolume } from "./playback.js";
export function GalleryAudio({
  src,
  audio,
  volume = 1,
  group,
}: {
  src: string;
  audio: { volume: number; muted: boolean };
  volume?: number;
  group: Set<HTMLAudioElement>;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current!;
    group.add(audio);
    return () => {
      audio.pause();
      group.delete(audio);
    };
  }, [group]);
  useEffect(() => {
    if (ref.current) {
      ref.current.volume = playbackVolume(audio, volume);
      ref.current.muted = audio.muted;
    }
  }, [audio.volume, audio.muted, volume]);
  return (
    <audio
      ref={ref}
      controls
      preload="none"
      src={src}
      onPlay={(event) => {
        group.forEach((other) => {
          if (other !== event.currentTarget) other.pause();
        });
      }}
    />
  );
}
