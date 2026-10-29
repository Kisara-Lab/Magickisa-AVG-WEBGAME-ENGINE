import { describeError } from "../engine/errors";
import {
  mapProjectResources,
  deploymentResource,
} from "../engine/projectResources";
import { requireModernProfile, requireModernProject } from "../engine/support";
import { explainBranches, explainNext } from "../engine/investigation";
import React, { useEffect, useRef, useState } from "react";
import { RouteRecorder } from "../engine/routeRecorder";
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
  recorder,
  profile,
  root,
  store,
  generation = 0;
const workspaceId = new URLSearchParams(location.search).get("workspaceId");
const fileUrl = (ref) =>
  !ref || ref.startsWith("/__studio/media/")
    ? ref
    : deploymentResource(
        ref,
        `/__studio/media/${profile}${workspaceId ? "/@" + workspaceId : ""}/`,
      );
function previewProject(input) {
  return mapProjectResources(input, fileUrl);
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
              type:
                e.name === "NotAllowedError" ? "studio:notice" : "studio:error",
              error:
                e.name === "NotAllowedError"
                  ? "预览音频被浏览器阻止，请在预览画面中点击后重试播放。"
                : `音频无法播放：${describeError(e)}`,
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
      recorder?.cancel();
      recorder = null;
      send({ type: "studio:recording", active: false });
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
          initialSave: d.testState,
        });
        if (!d.testState)
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
        const explain = () =>
          send({
            type: "studio:explanation",
            nodeId: store.runtime.node.id,
            completed: store.getSnapshot().completed,
            explanations: explainBranches(
              project,
              store.runtime.node,
              store.getSnapshot(),
            ),
            next: explainNext(project, store.runtime.node, store.getSnapshot()),
          });
        store.subscribe(explain);
        explain();
      }
    }
    if (d.type === "studio:variable") {
      if (store) store.setVariable(d.key, d.value);
    }
    if (d.type === "studio:record" && store) {
      if (d.start) {
        recorder?.cancel();
        recorder = new RouteRecorder(store);
        send({ type: "studio:recording", active: true });
      } else if (recorder) {
        const stopped = recorder;
        recorder = null;
        send({ type: "studio:recording", active: false });
        send({
          type: "studio:recorded",
          test: stopped.stop(d.name || "预览录制路线"),
        });
      }
    }
    if (d.type === "studio:explain" && store?.runtime.node)
      send({
        type: "studio:explanation",
        nodeId: store.runtime.node.id,
        completed: store.getSnapshot().completed,
        explanations: explainBranches(
          project,
          store.runtime.node,
          store.getSnapshot(),
        ),
        next: explainNext(project, store.runtime.node, store.getSnapshot()),
      });
  } catch (error) {
    send({
      type: e.data.type === "studio:record" ? "studio:notice" : "studio:error",
      error: e.data.type === "studio:record" ? `路线录制：${describeError(error)}` : describeError(error),
    });
  }
});
send({ type: "studio:ready" });
