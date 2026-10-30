import { describeError } from "../engine/errors";
import {
  menuLabels,
  uiLabel,
  featureEnabled,
  notificationKey,
} from "../engine/uiConfig";
import { usePlayerNotices } from "./usePlayerNotices";
import { choiceHints } from "../engine/choiceHints";
import { interpolate } from "../engine/interpolation";
import { PlayerGate } from "./PlayerGate";
import { useVoice } from "./useVoice";
import { SequencePlayer } from "../engine/SequenceStage";
import { GalleryPanel } from "./GalleryPanel";
import {
  mapProjectResources,
  deploymentResource,
} from "../engine/projectResources";
import { SaveRecovery } from "./SaveRecovery";
import { PlayerDialog } from "./PlayerDialog";
import {
  PlayerSlots,
  memoryStorage,
  saveSummary,
  type PlayerStorage,
} from "./persistence";
import {
  defaultPreferences,
  readPreferences,
  preferenceKey,
  graphemes,
  type PlayerPreferences,
} from "./preferences";
import { ReadingSettings } from "./ReadingSettings";
import { SavePanel, downloadText } from "./SavePanel";
import { MaterialReader } from "./MaterialReader";
import { explainNext } from "../engine/investigation";
import "./player.css";
import {
  useCallback,
  useMemo,
  type CSSProperties,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { EngineStore } from "../engine/store";
import { slotKey } from "../engine/save";
import { hasPlayerProgress } from "../engine/recovery.js";
import { assertProject } from "../engine/schema";
import { selectContext, selectUnlockedMaterials } from "../engine/selectors";
import { resolveAsset } from "../engine/media";
import { resolvePlayback, playbackVolume } from "../engine/playback.js";
import { GalleryAudio } from "../engine/GalleryAudio";
import { materialCategory } from "../engine/resource.js";
import { EngineViewport } from "../engine/EngineViewport";
import { TitleScreenHost } from "../engine/TitleScreenHost";
import { EngineSplash } from "../engine/EngineSplash";
import { ReleasePresentation } from "../engine/ReleasePresentation";
import { PresentationHost } from "../engine/PresentationHost";
import type { StoryProject, Value, Condition } from "../engine/types";
import { evaluateCondition } from "../engine/condition";

declare global {
  interface Window {
    __MAGICKISA_ENGINE__?: EngineStore;
    __MAGICKISA_DEBUG__?: {
      snapshot: () => unknown;
      setVariable: (k: string, v: Value) => void;
      jump: (id: string) => void;
      project: StoryProject;
      getVariables: () => Record<string, Value>;
      testCondition: (condition: Condition) => boolean;
    };
  }
}
export function GameApp() {
  const [project, setProject] = useState<StoryProject | null>(null),
    [error, setError] = useState(""),
    [fresh, setFresh] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    fetch(`${import.meta.env.BASE_URL}content/engine-story.json`, {
      signal: c.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("剧情加载失败");
        return r.json();
      })
      .then((p) =>
        setProject(
          mapProjectResources(assertProject(p), (value) =>
            deploymentResource(value, import.meta.env.BASE_URL),
          ),
        ),
      )
      .catch((e) => {
        if (e.name !== "AbortError") setError(describeError(e));
      });
    return () => c.abort();
  }, []);
  return error ? (
    <div className="loading" role="alert">
      {error}
    </div>
  ) : project ? (
    <PlayerGate id={project.id}>
      {(storage, release, temporary) => (
        <LoadSession
          project={project}
          fresh={fresh || temporary}
          storage={storage}
          onRelease={release}
          onFresh={() => setFresh(true)}
        />
      )}
    </PlayerGate>
  ) : (
    <div className="loading">Loading MAGICKISA...</div>
  );
}
function LoadSession({
  project,
  fresh,
  onFresh,
  storage,
  onRelease,
}: {
  project: StoryProject;
  fresh: boolean;
  onFresh: () => void;
  storage: PlayerStorage;
  onRelease: () => void;
}) {
  const sessionStorage = useMemo(
    () => (fresh ? memoryStorage() : storage),
    [fresh, storage],
  );
  const [result, setResult] = useState<{ store?: EngineStore; error?: string }>(
    {},
  );
  useEffect(() => {
    try {
      const store = new EngineStore(
        project,
        fresh ? { persist: false } : { storage: sessionStorage },
      );
      setResult({ store });
      return () => store.destroy();
    } catch (e) {
      setResult({ error: describeError(e) });
    }
  }, [project, fresh, sessionStorage]);
  return result.error ? (
    <SaveRecovery
      project={project}
      storage={storage}
      error={result.error}
      onTemporary={onFresh}
      onRecover={(save) => {
        new PlayerSlots(project, storage).write("auto", save);
        setResult({ store: new EngineStore(project, { storage }) });
      }}
    />
  ) : result.store ? (
    <GameSession
      store={result.store}
      storage={sessionStorage}
      onRelease={onRelease}
    />
  ) : (
    <div className="loading">正在读取存档……</div>
  );
}
export function GameSession({
  store,
  embedded = false,
  storage,
  onRelease,
}: {
  store: EngineStore;
  embedded?: boolean;
  storage?: PlayerStorage;
  onRelease?: () => void;
}) {
  const save = useSyncExternalStore(store.subscribe, store.getSnapshot),
    project = store.project;
  const [splash, setSplash] = useState(false);
  const ready = useCallback(() => setSplash(false), []);
  const [started, setStarted] = useState(embedded),
    [panel, setPanel] = useState<string | null>(null),
    [auto, setAuto] = useState(false),
    [fast, setFast] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [search, setSearch] = useState("");
  const slotStorage = useMemo(
    () =>
      embedded || store.temporary
        ? memoryStorage()
        : (storage ?? memoryStorage()),
    [storage, embedded, store.temporary],
  );
  const slots = useMemo(
    () => new PlayerSlots(project, slotStorage),
    [project, slotStorage],
  );
  useEffect(() => {
    if (embedded || store.temporary)
      slotStorage.setItem(slotKey(project.id), JSON.stringify(save));
  }, [embedded, store.temporary, slotStorage, project.id, save]);
  const initialPreferences = useMemo(() => {
    try {
      return {
        value: readPreferences(
          slotStorage,
          project.id,
          store.save.audio,
          project.theme
            ? {
                fontSize: project.theme.fontSize,
                opacity: project.theme.panelOpacity,
              }
            : undefined,
        ),
        error: "",
      };
    } catch {
      return {
        value: defaultPreferences,
        error: "无法读取浏览器偏好，本次使用默认设置。",
      };
    }
  }, [slotStorage, project.id]);
  const [preferences, setPreferences] = useState<PlayerPreferences>(
    initialPreferences.value,
  );
  const [preferenceError, setPreferenceError] = useState(
    initialPreferences.error,
  );
  const [played, setPlayed] = useState(embedded);
  const hadStoredProgress = useMemo(
    () => !store.temporary && !!slots.read("auto").save,
    [store, slots],
  );
  const resumable = played || (hadStoredProgress && hasPlayerProgress(save));
  useEffect(() => {
    const audio = initialPreferences.value;
    store.setAudio(audio.volume, audio.muted, false);
  }, [store, initialPreferences]);
  const [selectedMaterial, setSelectedMaterial] = useState<string>();
  useEffect(() => {
    if (panel === "music" && selectedMaterial) {
      const item = document.querySelector<HTMLElement>(
        `[data-music-id="${CSS.escape(selectedMaterial)}"]`,
      );
      item?.focus();
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [panel, selectedMaterial]);
  const [confirmation, setConfirmation] = useState<{
    message: string;
    action: () => void;
  }>();
  const confirm = (message: string, action: () => void) =>
    setConfirmation({ message, action });
  const historyScroll = useRef(0);
  const [historySearch, setHistorySearch] = useState("");
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setReduced(q.matches);
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  const updatePreferences = (next: PlayerPreferences) => {
    setPreferences(next);
    try {
      slotStorage.setItem(preferenceKey(project.id), JSON.stringify(next));
      setPreferenceError("");
    } catch {
      setPreferenceError("阅读设置仅在本次生效，浏览器偏好未保存。");
    }
  };
  const previousMaterials = useRef(save.unlockedMaterials);
  useEffect(() => {
    const added = save.unlockedMaterials.filter(
      (id) => !previousMaterials.current.includes(id),
    );
    previousMaterials.current = save.unlockedMaterials;
    if (!added.length) return;
    const category = project.materials.find(
      (m) => m.id === added.at(-1),
    )?.category;
    const targetPanel =
      materialCategory(category || "clue") === "note"
        ? "notes"
        : materialCategory(category || "clue");
    if (!featureEnabled(project, targetPanel)) return;
    setNotice(
      project.ui?.notifications?.[notificationKey(category || "")] ||
        "有新的调查资料可读",
      {
        panel: targetPanel,
        id: added.at(-1),
      },
    );
  }, [save.unlockedMaterials.join("|"), project]);
  const node = store.runtime.node,
    line = store.runtime.line,
    choices = store.runtime.choices;
  const invoke = (action: () => unknown) => {
    try {
      action();
      setError("");
    } catch (e) {
      setError(describeError(e));
    }
  };
  const text = interpolate(
    (line?.text ?? "").replace(/\*\*/g, ""),
    save.variables,
  );
  const segments = useMemo(() => graphemes(text), [text]);
  const revealKey = `${save.nodeId}:${line?.id}:${text}`;
  const [pageActive, setPageActive] = useState(true);
  const {
    notice,
    target: noticeTarget,
    notify: setNotice,
  } = usePlayerNotices(
    !!panel ||
      !!confirmation ||
      !pageActive ||
      !!save.presentation ||
      !!save.sequence ||
      node?.presentation === "dedication" ||
      splash,
  );
  const collectionProgress = store.collections.snapshot;
  const previousCollections = useRef(collectionProgress);
  useEffect(() => {
    for (const kind of ["gallery", "music"] as const) {
      const added = collectionProgress[kind].filter(
        (id) => !previousCollections.current[kind].includes(id),
      );
      if (added.length && featureEnabled(project, kind))
        setNotice(kind === "gallery" ? "画廊有新收录" : "音乐鉴赏有新曲目", {
          panel: kind,
          id: added.at(-1),
        });
    }
    previousCollections.current = collectionProgress;
  }, [
    collectionProgress.gallery.join("|"),
    collectionProgress.music.join("|"),
    setNotice,
  ]);
  useEffect(() => {
    const pause = () => setPageActive(false);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", pause);
    return () => {
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);
  const voice = useVoice(
    line?.voice ? resolveAsset(project, line.voice) : undefined,
    `${save.nodeId}:${line?.id}`,
    save.audio.muted ? 0 : save.audio.volume * preferences.voiceVolume,
    !!panel ||
      !!confirmation ||
      !started ||
      splash ||
      !!save.presentation ||
      !!save.sequence ||
      !pageActive,
    fast,
  );
  const [reveal, setReveal] = useState({ key: "", count: 0 });
  const typed = !reduced && preferences.characterDelay > 0 && !fast;
  const count = typed
    ? reveal.key === revealKey
      ? reveal.count
      : 0
    : segments.length;
  const revealing = count < segments.length;
  useEffect(() => {
    if (!typed || !line) return;
    setReveal({ key: revealKey, count: 0 });
    const timer = setInterval(
      () =>
        setReveal((old) => {
          const count = Math.min(
            segments.length,
            old.key === revealKey ? old.count + 1 : 1,
          );
          if (count >= segments.length) clearInterval(timer);
          return { key: revealKey, count };
        }),
      preferences.characterDelay,
    );
    return () => clearInterval(timer);
  }, [revealKey, typed, preferences.characterDelay]);
  const next = useMemo(() => {
    try {
      return node ? explainNext(project, node, save) : undefined;
    } catch (error) {
      return { allowed: false, error: `无法检查出口：${describeError(error)}` };
    }
  }, [project, node, save]);
  const logicError =
    store.runtime.availabilityError ||
    (next && "error" in next ? next.error : "");
  const canAdvance =
    !!line || (!logicError && (!save.completed || !!next?.allowed));
  const statusText = line?.input
    ? "等待输入"
    : line
      ? "阅读中"
      : choices.length
        ? "请选择下一步"
        : node?.ending
          ? "本段旅程已结束。"
          : next?.allowed
            ? "点击或按 Space 继续"
            : "当前没有可用出口，可查看资料、历史或返回标题。";
  const advance = () => {
    if (panel || confirmation || !started || splash || save.presentation)
      return;
    if (revealing) {
      setReveal({ key: revealKey, count: segments.length });
      return;
    }
    if (canAdvance)
      invoke(() => {
        store.advance();
        if (
          store.runtime.node?.presentation === "dedication" &&
          store.runtime.done
        )
          store.advance();
      });
  };
  const stopPlayback = () => {
    setAuto(false);
    setFast(false);
  };
  useEffect(() => {
    const stop = () => stopPlayback();
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);
  useEffect(() => {
    window.__MAGICKISA_ENGINE__ = store;
    if (import.meta.env.DEV)
      window.__MAGICKISA_DEBUG__ = {
        project,
        getVariables: () => structuredClone(store.save.variables),
        testCondition: (condition) =>
          evaluateCondition(
            condition,
            store.save.variables,
            store.save.visitedNodes,
            store.save,
          ),
        snapshot: () => structuredClone(store.save),
        setVariable: (k, v) => store.setVariable(k, v),
        jump: (id) => store.jump(id),
      };
    return () => {
      delete window.__MAGICKISA_ENGINE__;
      delete window.__MAGICKISA_DEBUG__;
    };
  }, [store]);
  const pointerNavigation = useRef(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Tab") pointerNavigation.current = false;
      if (
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.shiftKey ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      // Preserve native button activation, but allow story arrows after focus return.
      if (
        (e.target as HTMLElement).closest("button,[role=button],a") &&
        (e.code === "Enter" ||
          (e.code === "Space" && !pointerNavigation.current))
      )
        return;
      if (e.code === "Escape") {
        setPanel(null);
        return;
      }
      if (panel || confirmation || save.presentation || !started || splash)
        return;
      if (e.code === "Space" || e.code === "ArrowRight") {
        e.preventDefault();
        advance();
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        confirm(
          "回退会截断之后的剧情历史；玩家笔记与已获得收藏保留。继续？",
          () => invoke(() => store.rollback()),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => {
    if (!auto && !fast) return;
    if (
      panel ||
      confirmation ||
      !started ||
      splash ||
      save.presentation ||
      save.sequence ||
      choices.length ||
      line?.input ||
      !canAdvance
    ) {
      stopPlayback();
      return;
    }
    if (fast && line && !save.readLineIds.includes(line.id)) {
      setFast(false);
      setNotice("已到达未读文本，快进已停止");
      return;
    }
    if (revealing || voice.pending) return;
    const timer = setTimeout(
      () => invoke(() => store.advance()),
      fast ? 180 : preferences.autoDelay * 1000,
    );
    return () => clearTimeout(timer);
  }, [
    auto,
    fast,
    panel,
    confirmation,
    started,
    splash,
    save,
    choices.length,
    line?.input,
    revealing,
    preferences.autoDelay,
    canAdvance,
    voice.pending,
  ]);
  const playback = resolvePlayback(
    project,
    node?.title || "",
    save.audio.currentTrackId,
  );
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const galleryAudioGroup = useRef(new Set<HTMLAudioElement>()).current;
  const bgm = !started
    ? project.titleScreen.music
    : save.presentation || save.sequence
      ? undefined
      : playback.src;
  useEffect(() => {
    const src = bgm;
    if (!src) return;
    const audio = new Audio(src);
    musicRef.current = audio;
    audio.loop = true;
    audio.volume = playbackVolume(
      save.audio,
      started ? playback.volume : 1,
      0.65 * preferences.bgmVolume * (voice.playing ? 0.35 : 1),
    );
    return () => {
      audio.pause();
      if (musicRef.current === audio) musicRef.current = null;
      audio.removeAttribute("src");
      audio.load();
    };
  }, [bgm]);
  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    if (panel === "music") {
      audio.pause();
      setBlocked(false);
      return;
    }
    let active = true;
    const enable = () => {
      void audio
        .play()
        .then(() => {
          if (active) setBlocked(false);
        })
        .catch(() => {
          if (active) setBlocked(true);
        });
    };
    enable();
    window.addEventListener("pointerdown", enable, { once: true });
    return () => {
      active = false;
      window.removeEventListener("pointerdown", enable);
    };
  }, [bgm, panel === "music"]);
  useEffect(() => {
    if (musicRef.current)
      musicRef.current.volume = playbackVolume(
        save.audio,
        started ? playback.volume : 1,
        0.65 * preferences.bgmVolume * (voice.playing ? 0.35 : 1),
      );
  }, [
    save.audio.muted,
    save.audio.volume,
    playback.volume,
    started,
    bgm,
    preferences.bgmVolume,
    voice.playing,
  ]);
  const materials = selectUnlockedMaterials(project, save);
  const unread = (category: string) =>
    materials.some(
      (m) =>
        materialCategory(m.category) ===
          (category === "notes" ? "note" : category) &&
        !save.readMaterials.includes(m.id),
    );
  const musicTitle =
    project.media.musicGallery?.find((t) => t.src === bgm)?.title ||
    bgm
      ?.split("/")
      .at(-1)
      ?.replace(/\.mp3$/, "");
  useEffect(() => {
    if (!started || !preferences.wheel) return;
    let last = 0;
    const handle = (e: WheelEvent) => {
      if (Date.now() - last < 300 || Math.abs(e.deltaY) < 20) return;
      last = Date.now();
      if (
        panel ||
        confirmation ||
        splash ||
        save.presentation ||
        (e.target as HTMLElement).closest("input,textarea,select,.choice-list")
      )
        return;
      e.preventDefault();
      if (e.deltaY > 0) advance();
      else if (e.deltaY < 0) open("history");
    };
    const stage = document.querySelector(".stage");
    stage?.addEventListener("wheel", handle as EventListener, {
      passive: false,
    });
    return () => stage?.removeEventListener("wheel", handle as EventListener);
  });
  const open = (id: string) => {
    stopPlayback();
    setPanel(id);
    setSelectedMaterial(undefined);
  };
  const markRead = useCallback(
    (id: string) => {
      try {
        store.markRead(id);
      } catch (e) {
        setError(describeError(e));
      }
    },
    [store],
  );
  const load = (input: unknown) => {
    const saved = slots.write("auto", input);
    store.restore(saved);
    setPlayed(true);
    stopPlayback();
    setPanel(null);
    setStarted(true);
    setNotice("存档已读取");
  };
  const restart = () => {
    const action = () =>
      invoke(() => {
        const fresh = new EngineStore(project, { persist: false });
        fresh.runtime.save.readLineIds = [...store.save.readLineIds];
        fresh.setAudio(preferences.volume, preferences.muted, false);
        // Prepare and persist before replacing live progress; quota errors leave it intact.
        const saved = slots.write("auto", fresh.save);
        store.restore(saved);
        setPlayed(true);
        stopPlayback();
        setPanel(null);
        setSplash(true);
        setStarted(true);
      });
    if (resumable)
      confirm(
        "重新开始将替换当前自动进度，先保留最近恢复副本。手动槽保持不变。继续？",
        action,
      );
    else action();
  };
  function exportSave() {
    downloadText(JSON.stringify(save, null, 2), `${project.id}-save.json`);
  }
  const css = {
    "--work-text": project.theme?.textColor,
    "--work-accent": project.theme?.accentColor,
    "--work-panel-rgb": project.theme
      ? [1, 3, 5]
          .map((i) => parseInt(project.theme!.panelColor.slice(i, i + 2), 16))
          .join(" ")
      : undefined,
    "--work-width": project.theme
      ? `${project.theme.dialogueWidth}%`
      : undefined,
    fontFamily: project.theme?.fontFamily,
    "--player-font": `${preferences.fontSize}px`,
    "--player-leading": preferences.lineHeight,
    "--player-opacity": preferences.opacity,
  } as CSSProperties;
  const names = Object.fromEntries(
    Object.keys(menuLabels).map((key) => [key, uiLabel(project, key)]),
  );
  const showMaterials = (category: string) => (
    <MaterialReader
      key={category}
      entries={materials.filter(
        (m) => materialCategory(m.category) === category,
      )}
      read={save.readMaterials}
      selected={selectedMaterial}
      markRead={markRead}
    />
  );
  const overlays = (
    <>
      {preferenceError && (
        <p className="player-status" role="alert">
          {preferenceError}
        </p>
      )}
      {panel && (
        <PlayerDialog
          title={names[panel] || panel}
          onClose={() => setPanel(null)}
        >
          {panel === "menu" ? (
            <nav className="player-menu">
              {[
                "saves",
                "history",
                "chapters",
                "clue",
                "encyclopedia",
                "newspaper",
                "notes",
                "music",
                "gallery",
                "settings",
              ]
                .filter((id) => featureEnabled(project, id))
                .map((id) => (
                  <button key={id} onClick={() => open(id)}>
                    {names[id]}
                    {["clue", "encyclopedia", "newspaper", "notes"].includes(
                      id,
                    ) && unread(id)
                      ? " · 未读"
                      : ""}
                  </button>
                ))}
              <button onClick={exportSave}>导出当前进度</button>
              <button
                onClick={() => {
                  if (
                    !document.fullscreenEnabled &&
                    !document.fullscreenElement
                  ) {
                    setError("此浏览器不支持全屏，可使用浏览器菜单调整显示。");
                    return;
                  }
                  void (
                    document.fullscreenElement
                      ? document.exitFullscreen()
                      : document.documentElement.requestFullscreen()
                  ).catch(() =>
                    setError("无法进入全屏，请使用浏览器菜单调整显示。"),
                  );
                }}
              >
                全屏
              </button>
              <button
                onClick={() => {
                  setStarted(false);
                  setPanel(null);
                  stopPlayback();
                }}
              >
                返回标题
              </button>
              <button onClick={restart}>重新开始</button>
              {onRelease && (
                <button
                  onClick={() =>
                    confirm(
                      "释放后当前页面停止游玩，其他页面可以重新接管最新进度。继续？",
                      onRelease,
                    )
                  }
                >
                  释放存档写权限
                </button>
              )}
            </nav>
          ) : panel === "gallery" ? (
            <GalleryPanel
              store={store}
              confirm={confirm}
              selectedId={selectedMaterial}
            />
          ) : panel === "settings" ? (
            <>
              <ReadingSettings
                value={preferences}
                onChange={updatePreferences}
              />
              <label>
                主音量
                <input
                  aria-label="主音量"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={save.audio.volume}
                  onChange={(e) =>
                    invoke(() => {
                      const volume = Number(e.target.value);
                      updatePreferences({
                        ...preferences,
                        volume,
                        muted: save.audio.muted,
                      });
                      store.setAudio(
                        volume,
                        save.audio.muted,
                        started || resumable,
                      );
                    })
                  }
                />
              </label>
              <button
                onClick={() =>
                  invoke(() => {
                    const muted = !save.audio.muted;
                    updatePreferences({
                      ...preferences,
                      volume: save.audio.volume,
                      muted,
                    });
                    store.setAudio(
                      save.audio.volume,
                      muted,
                      started || resumable,
                    );
                  })
                }
              >
                {save.audio.muted ? "恢复声音" : "静音"}
              </button>
            </>
          ) : panel === "saves" ? (
            <>
              <p>
                {embedded || store.temporary
                  ? "当前使用临时内存槽位，刷新后丢失，请导出进度。"
                  : "存档保存在此浏览器，不会自动上传。"}
              </p>
              <SavePanel
                project={project}
                slots={slots}
                current={save}
                confirm={confirm}
                onLoad={load}
                notify={setNotice}
              />
            </>
          ) : panel === "history" ? (
            <>
              <label>
                搜索历史
                <input
                  aria-label="搜索历史"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </label>
              <div
                className="player-history"
                ref={(el) => {
                  if (el) el.scrollTop = historyScroll.current;
                }}
                onScroll={(e) => {
                  historyScroll.current = e.currentTarget.scrollTop;
                }}
              >
                {save.history
                  .filter(
                    (h) =>
                      h.text &&
                      `${h.speaker} ${h.text}`.includes(historySearch),
                  )
                  .map((h) => (
                    <article key={h.id}>
                      <strong>{h.speaker}</strong>
                      <small>{h.section}</small>
                      <p>{h.text}</p>
                      <button
                        onClick={() =>
                          confirm(
                            "回到此处会截断之后的剧情历史；玩家笔记与已获得收藏保留。继续？",
                            () => {
                              invoke(() =>
                                store.rollback(
                                  save.history.findIndex((x) => x.id === h.id),
                                ),
                              );
                              setPanel(null);
                            },
                          )
                        }
                      >
                        回到这里
                      </button>
                    </article>
                  ))}
                {!save.history.some(
                  (h) =>
                    h.text && `${h.speaker} ${h.text}`.includes(historySearch),
                ) && <p>暂无匹配的历史。</p>}
              </div>
            </>
          ) : panel === "chapters" ? (
            <>
              <input
                aria-label="搜索章节"
                placeholder="搜索已读章节"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="chapter-grid">
                {project.nodes
                  .filter(
                    (n) =>
                      n.playable !== false &&
                      save.visitedNodes.includes(n.id) &&
                      n.title.includes(search),
                  )
                  .map((n) => (
                    <button
                      key={n.id}
                      onClick={() =>
                        confirm(
                          "跳转将改变当前剧情位置并保存自动进度。继续？",
                          () => {
                            invoke(() => store.jump(n.id));
                            setPanel(null);
                          },
                        )
                      }
                    >
                      {n.title}
                    </button>
                  ))}
              </div>
            </>
          ) : panel === "notes" ? (
            <>
              <label>
                旅者自由笔记
                <textarea
                  aria-label="旅者自由笔记"
                  value={save.playerNotes}
                  onChange={(e) =>
                    invoke(() => store.setPlayerNotes(e.target.value))
                  }
                />
              </label>
              <h3>剧情笔记</h3>
              {save.notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
              {showMaterials("note")}
            </>
          ) : panel === "music" ? (
            <div className="material-list">
              <p>
                已解锁{" "}
                {
                  (project.media.musicGallery || []).filter((t) =>
                    collectionProgress.music.includes(t.id),
                  ).length
                }{" "}
                / {(project.media.musicGallery || []).length}{" "}
                首。已获得的音乐跨周目保留；关闭后继续播放剧情音乐。
              </p>
              {!project.media.musicGallery?.length && (
                <p>作者尚未设置音乐鉴赏内容。</p>
              )}
              {(project.media.musicGallery || []).map((t) => (
                <article key={t.id} data-music-id={t.id} tabIndex={-1}>
                  <h3>
                    {collectionProgress.music.includes(t.id)
                      ? t.title
                      : "尚未解锁"}
                  </h3>
                  {collectionProgress.music.includes(t.id) && (
                    <GalleryAudio
                      group={galleryAudioGroup}
                      src={t.src}
                      audio={save.audio}
                      volume={
                        project.audio.find((a) => a.src === t.src)?.volume
                      }
                    />
                  )}
                </article>
              ))}
            </div>
          ) : (
            showMaterials(panel)
          )}
        </PlayerDialog>
      )}
      {confirmation && (
        <PlayerDialog
          title="确认操作"
          onClose={() => setConfirmation(undefined)}
        >
          <p>{confirmation.message}</p>
          <button autoFocus onClick={() => setConfirmation(undefined)}>
            取消
          </button>
          <button
            onClick={() => {
              const action = confirmation.action;
              setConfirmation(undefined);
              action();
            }}
          >
            确认继续
          </button>
        </PlayerDialog>
      )}
    </>
  );
  if (!started)
    return (
      <div className="player-root" style={css}>
        <TitleScreenHost
          project={project}
          audioBlocked={blocked}
          onStart={restart}
          onContinue={() => setStarted(true)}
          canContinue={resumable}
          continueSummary={
            resumable
              ? `${saveSummary(project, save)} · ${new Date(save.savedAt).toLocaleString()}`
              : "暂无可继续的进度，请开始游戏或读取存档。"
          }
          onLoad={() => open("saves")}
          onSettings={() => open("settings")}
          onEnableAudio={() => window.dispatchEvent(new Event("pointerdown"))}
        >
          {import.meta.env.DEV && (
            <a href="/engine.html">
              {project.ui?.labels?.development || "开发预览"}
            </a>
          )}
        </TitleScreenHost>
        {overlays}
        {error && (
          <p role="alert" className="player-status">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div
      className="app player-root"
      style={css}
      onPointerDownCapture={() => {
        pointerNavigation.current = true;
      }}
    >
      {(store.temporary || store.persistenceError) && !embedded && (
        <div className="recovery-error" role="alert">
          <p>
            {store.persistenceError ||
              "临时周目：当前进度不会自动保存，刷新前请导出存档。"}
          </p>
          <button onClick={exportSave}>导出当前存档</button>
          {!store.temporary && (
            <button onClick={() => invoke(() => store.retrySave())}>
              重试保存
            </button>
          )}
        </div>
      )}
      {notice &&
        pageActive &&
        !panel &&
        !confirmation &&
        !splash &&
        !save.presentation &&
        !save.sequence &&
        node?.presentation !== "dedication" && (
          <div className="unlock-notice" role="status">
            {notice}
            <button
              onClick={() => {
                if (noticeTarget) {
                  open(noticeTarget.panel);
                  setSelectedMaterial(noticeTarget.id);
                }
                setNotice("");
              }}
            >
              {noticeTarget ? "查看" : "关闭提示"}
            </button>
          </div>
        )}
      {preferences.musicLabel &&
        musicTitle &&
        !save.presentation &&
        !splash && (
          <div className="music-now-playing">
            <span>
              <small>NOW PLAYING</small>
              {musicTitle}
            </span>
          </div>
        )}
      {splash && <EngineSplash project={project} onReady={ready} />}
      {!splash &&
        !save.presentation &&
        node?.presentation === "dedication" &&
        !store.runtime.done && (
          <ReleasePresentation
            project={project}
            mode="dedication"
            time={0}
            pageIndex={save.lineIndex}
            resolveAsset={(asset) => resolveAsset(project, asset)}
            onSkip={() =>
              invoke(() => {
                store.advance();
                if (store.runtime.done) store.advance();
              })
            }
          >
            <button
              className="dedication-next"
              onClick={(e) => {
                e.stopPropagation();
                invoke(() => {
                  store.advance();
                  if (store.runtime.done) store.advance();
                });
              }}
            >
              继续献词
            </button>
          </ReleasePresentation>
        )}

      {save.presentation && (
        <PresentationHost
          key={`${save.presentation.id}:${save.presentation.nodeId}`}
          project={project}
          presentation={save.presentation}
          paused={!!panel || !!confirmation || !pageActive}
          onProgress={(time) => store.setPresentationPosition(time)}
          volume={save.audio.muted ? 0 : save.audio.volume}
          onFinish={() => invoke(() => store.finishPresentation())}
        />
      )}
      <header className="topbar player-topbar">
        <div className="brand">{project.title}</div>
        <nav aria-label="游戏操作" className="player-actions">
          <button
            aria-pressed={auto}
            onClick={() => {
              setAuto(!auto);
              setFast(false);
            }}
          >
            自动{auto ? " ●" : ""}
          </button>
          <button
            aria-pressed={fast}
            onClick={() => {
              setFast(!fast);
              setAuto(false);
            }}
          >
            快进
          </button>
          {featureEnabled(project, "history") && (
            <button onClick={() => open("history")}>
              {uiLabel(project, "history", "历史")}
            </button>
          )}
          <button onClick={() => open("saves")}>
            {uiLabel(project, "saves")}
          </button>
          <button onClick={() => open("menu")}>
            {uiLabel(project, "menu", "菜单")}
          </button>
        </nav>
      </header>
      {(error || logicError) && (
        <div className="runtime-error" role="alert">
          {error || logicError}
          {error ? (
            <button onClick={() => setError("")}>关闭</button>
          ) : (
            <p>
              当前出口逻辑无法计算，请从菜单导出进度或读取其他存档，并向作者反馈。
            </p>
          )}
        </div>
      )}
      {blocked && (
        <small className="audio-notice">
          点击画面开启音乐；无法播放时仍可继续游戏。
        </small>
      )}
      {!pageActive && (
        <div className="player-status">
          <button onClick={() => setPageActive(true)}>继续音画播放</button>
        </div>
      )}
      {voice.error && (
        <div role="alert" className="player-status">
          {voice.error}
          <button onClick={voice.retry}>重试配音</button>
          <button onClick={voice.skip}>跳过配音</button>
        </div>
      )}
      <div className="progressbar player-location">
        <span>{node?.chapter}</span>
        <span>{node?.title}</span>
        <span role="status">
          {store.temporary
            ? "临时周目 · 不自动保存"
            : store.persistenceError
              ? "自动保存失败"
              : "进度自动保存"}
        </span>
      </div>
      <main className="avg-shell">
        {save.sequence && (
          <SequencePlayer
            store={store}
            paused={splash || !!panel || !!confirmation || !pageActive}
            volume={save.audio.muted ? 0 : save.audio.volume}
            bgm={preferences.bgmVolume}
            sound={preferences.soundVolume}
            voice={preferences.voiceVolume}
            onSave={() => open("saves")}
          />
        )}
        {!save.sequence && (
          <>
            <EngineViewport
              choiceHints={
                project.ui?.enabled?.choiceHints === true &&
                store.runtime.done &&
                !save.presentation &&
                !save.sequence &&
                node
                  ? choiceHints(node, save, choices)
                  : undefined
              }
              context={selectContext(project, save, choices)}
              visibleText={segments.slice(0, count).join("")}
              statusText={statusText}
              onAdvance={advance}
              onChoose={(id) => invoke(() => store.choose(id))}
              onInput={(key, text) =>
                invoke(() => store.setVariable(key, text))
              }
            />
            <footer className="stage-footer">
              <button
                title="上一句"
                disabled={!save.history.length || !!save.presentation}
                onClick={() =>
                  confirm(
                    "回退会截断之后的剧情历史；玩家笔记与已获得收藏保留。继续？",
                    () => invoke(() => store.rollback()),
                  )
                }
              >
                ‹ 上一句
              </button>
              <span role="status">
                {revealing ? "点击补全文字" : statusText}
              </span>
              <button
                title="下一句"
                disabled={
                  !!save.presentation ||
                  (!canAdvance && !revealing) ||
                  !!choices.length
                }
                onClick={advance}
              >
                继续 ›
              </button>
            </footer>
            <section className="notebook-strip">
              <span>旅者笔记</span>
              <input
                aria-label="自由笔记"
                value={save.playerNotes}
                placeholder="写下你的推理……"
                onChange={(e) =>
                  invoke(() => store.setPlayerNotes(e.target.value))
                }
              />
            </section>
          </>
        )}
      </main>
      {overlays}
    </div>
  );
}
