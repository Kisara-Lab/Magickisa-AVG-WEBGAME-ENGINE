import { useEffect, useRef, useState } from "react";
export function useVoice(
  source: string | undefined,
  identity: string,
  volume: number,
  paused: boolean,
  skip: boolean,
) {
  const audio = useRef<HTMLAudioElement>();
  const [state, setState] = useState({ identity: "", ended: false, error: "" });
  useEffect(() => {
    if (!source) {
      setState({ identity, ended: true, error: "" });
      return;
    }
    const element = new Audio(source);
    audio.current = element;
    element.volume = volume;
    setState({ identity, ended: false, error: "" });
    let alive = true;
    const ended = () => {
      if (alive) setState({ identity, ended: true, error: "" });
    };
    const error = () => {
      if (alive)
        setState({
          identity,
          ended: false,
          error: "配音加载或播放失败，可以重试或跳过此配音。",
        });
    };
    element.addEventListener("ended", ended);
    element.addEventListener("error", error);
    return () => {
      alive = false;
      element.pause();
      element.removeAttribute("src");
      element.load();
      element.removeEventListener("ended", ended);
      element.removeEventListener("error", error);
      if (audio.current === element) audio.current = undefined;
    };
  }, [source, identity]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    if (skip) {
      element.pause();
      setState({ identity, ended: true, error: "" });
      return;
    }
    if (paused || state.ended || state.error) {
      element.pause();
      return;
    }
    let alive = true;
    void element.play().catch(() => {
      if (alive)
        setState({
          identity,
          ended: false,
          error: "浏览器暂未允许配音播放，请点击重试或跳过配音。",
        });
    });
    return () => {
      alive = false;
    };
  }, [source, identity, paused, skip, state.ended, state.error]);
  return {
    playing:
      !!source &&
      state.identity === identity &&
      !state.ended &&
      !state.error &&
      !paused &&
      !skip,
    pending: !!source && !skip && (state.identity !== identity || !state.ended),
    error: state.identity === identity ? state.error : "",
    retry: () => {
      audio.current?.load();
      setState({ identity, ended: false, error: "" });
    },
    skip: () => {
      audio.current?.pause();
      setState({ identity, ended: true, error: "" });
    },
    replay: () => {
      if (audio.current) audio.current.currentTime = 0;
      setState({ identity, ended: false, error: "" });
    },
  };
}
