import { useEffect, useRef } from "react";
import { playbackVolume } from "./playback.js";
export function GalleryAudio({
  src,
  audio,
  volume = 1,
}: {
  src: string;
  audio: { volume: number; muted: boolean };
  volume?: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);
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
        document
          .querySelectorAll<HTMLAudioElement>(".material-list audio")
          .forEach((other) => {
            if (other !== event.currentTarget) other.pause();
          });
      }}
    />
  );
}
