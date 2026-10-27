import { requireModernProfile, requireModernProject } from "../engine/support";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
const send = (data) => parent.postMessage(data, location.origin);
// Preview sessions never write the player's real saves, notes, or audio settings.
const memory = new Map();
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
    clear: () => memory.clear(),
    key: (i) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  },
});
let project,
  profile,
  root,
  store,
  generation = 0;
const workspaceId = new URLSearchParams(location.search).get("workspaceId");
const fileUrl = (ref) =>
  ref?.startsWith("/") &&
  !ref.startsWith("//") &&
  !ref.startsWith("/__studio/media/")
    ? `/__studio/media/${profile}${workspaceId ? "/@" + workspaceId : ""}${ref.split("/").map(encodeURIComponent).join("/")}`
    : ref;
function previewProject(input) {
  const p = structuredClone(input);
  p.resources.assetsBase = fileUrl(
    p.resources.assetsBase || "/assets/generated",
  );
  p.resources.sceneRules = p.resources.sceneRules?.map((rule) => ({
    ...rule,
    asset: fileUrl(rule.asset),
  }));
  p.backdrops = p.backdrops.map((b) => ({
    ...b,
    src: fileUrl(b.src),
  }));
  p.audio = p.audio.map((a) => ({
    ...a,
    src: fileUrl(a.src),
  }));
  p.characters = p.characters.map((c) => ({
    ...c,
    portrait: fileUrl(c.portrait),
    ...(c.live2d
      ? {
          live2d: {
            ...c.live2d,
            model: fileUrl(c.live2d.model),
          },
        }
      : {}),
    expressions: Object.fromEntries(
      Object.entries(c.expressions || {}).map(([k, v]) => [k, fileUrl(v)]),
    ),
  }));
  p.titleScreen = {
    ...p.titleScreen,
    music: fileUrl(p.titleScreen.music),
    backdrop: fileUrl(p.titleScreen.backdrop),
  };
  if (p.media.opening) {
    p.media.opening.lyrics = fileUrl(p.media.opening.lyrics);
    p.media.opening.audio = fileUrl(p.media.opening.audio);
    p.media.opening.images = p.media.opening.images?.map(fileUrl);
  }
  if (p.media.ending) {
    p.media.ending.lyrics = fileUrl(p.media.ending.lyrics);
    p.media.ending.audio = fileUrl(p.media.ending.audio);
    p.media.ending.image = fileUrl(p.media.ending.image);
  }
  p.media.chapterMusic = Object.fromEntries(
    Object.entries(p.media.chapterMusic || {}).map(([k, v]) => [k, fileUrl(v)]),
  );
  p.media.musicGallery = p.media.musicGallery?.map((m) => ({
    ...m,
    src: fileUrl(m.src),
  }));
  p.nodes = p.nodes.map((n) => ({
    ...n,
    background: fileUrl(n.background),
  }));
  return p;
}
function Director({ Component, data }) {
  const [time, setTime] = useState(data.time || 0),
    audio = useRef(null),
    requestedTime = useRef(data.time || 0);
  useEffect(() => {
    const listener = (e) => {
      if (e.origin !== location.origin || e.source !== parent) return;
      if (e.data.type === "studio:time") {
        requestedTime.current = e.data.time;
        setTime(e.data.time);
        if (audio.current && audio.current.readyState)
          audio.current.currentTime = e.data.time;
      }
      if (e.data.type === "studio:play") {
        if (e.data.play)
          audio.current?.play().catch((e) =>
            send({
              type: "studio:error",
              error: e.message,
            }),
          );
        else audio.current?.pause();
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const update = () => {
      requestedTime.current = a.currentTime;
      setTime(a.currentTime);
      send({
        type: "studio:time",
        time: a.currentTime,
      });
    };
    a.addEventListener("timeupdate", update);
    const ended = () =>
      send({
        type: "studio:skip",
      });
    a.addEventListener("ended", ended);
    return () => {
      a.removeEventListener("timeupdate", update);
      a.removeEventListener("ended", ended);
    };
  }, []);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const loaded = () => {
      a.currentTime = requestedTime.current;
    };
    a.addEventListener("loadedmetadata", loaded);
    return () => a.removeEventListener("loadedmetadata", loaded);
  }, []);
  return (
    <Component
      project={project}
      mode={data.mode}
      time={time}
      pageIndex={data.pageIndex || 0}
      audioRef={audio}
      resolveAsset={(s) =>
        s.startsWith("/")
          ? s
          : project.backdrops.find((b) => b.id === s)?.src ||
            fileUrl(
              `${project.resources.assetsBase || "/assets/generated"}/${s}.png`,
            )
      }
      onSkip={() => {
        audio.current?.pause();
        send({
          type: "studio:skip",
        });
      }}
    />
  );
}
window.addEventListener("message", async (e) => {
  if (e.origin !== location.origin || e.source !== parent) return;
  try {
    const d = e.data;
    if (d.type === "studio:load") {
      const current = ++generation;
      requireModernProfile(d.profile);
      requireModernProject(d.project);
      profile = "modern";
      project = previewProject(d.project);
      memory.clear();
      store?.destroy();
      store = null;
      root?.unmount();
      window.__MAGICKISA_ENGINE__ = null;
      document.getElementById("root").innerHTML = "";
      root = createRoot(document.getElementById("root"));
      await import("../styles.css");
      if (d.mode !== "scene") {
        const Component = (await import("../engine/ReleasePresentation"))
          .ReleasePresentation;
        if (current !== generation) return;
        root.render(<Director Component={Component} data={d} />);
        return;
      }
      {
        await import("../restored.css");
        const { EngineStore } = await import("../engine/store");
        const { GameSession } = await import("../game/GameApp");
        if (current !== generation) return;
        store = new EngineStore(project, {
          persist: false,
          slotId: "studio-preview",
        });
        store.jump(d.nodeId || project.startNodeId, d.line || 0);
        store.subscribe(() =>
          send({
            type: "studio:state",
            save: store.getSnapshot(),
          }),
        );
        root.render(<GameSession store={store} embedded />);
        send({
          type: "studio:state",
          save: store.getSnapshot(),
        });
      }
    }
    if (d.type === "studio:variable") {
      if (store) store.setVariable(d.key, d.value);
    }
  } catch (error) {
    send({
      type: "studio:error",
      error: String(error),
    });
  }
});
send({ type: "studio:ready" });
