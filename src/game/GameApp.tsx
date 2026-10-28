import { PlayerGate } from "./PlayerGate";
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
    fetch("/content/engine-story.json", { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw new Error("剧情加载失败");
        return r.json();
      })
      .then((p) => setProject(assertProject(p)))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e));
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
      setResult({ error: String(e) });
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
  const slotStorage = useMemo(() => storage ?? memoryStorage(), [storage]);
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
        value: readPreferences(slotStorage, project.id, store.save.audio),
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
  const [notice, setNotice] = useState("");
  const [noticeId, setNoticeId] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<string>();
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
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4200);
    return () => clearTimeout(timer);
  }, [notice]);
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
    setNoticeId(added.at(-1) ?? "");
    const category = project.materials.find(
      (m) => m.id === added.at(-1),
    )?.category;
    setNotice(
      project.ui?.notifications?.[
        category === "note" ? "notes" : category || ""
      ] || "有新的调查资料可读",
    );
    const timer = setTimeout(() => setNotice(""), 4200);
    return () => clearTimeout(timer);
  }, [save.unlockedMaterials.join("|"), project]);
  const node = store.runtime.node,
    line = store.runtime.line,
    choices = store.runtime.choices;
  const invoke = (action: () => unknown) => {
    try {
      action();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const text = (line?.text ?? "")
    .replace(/\*\*/g, "")
    .replace(/\{\{([^}]+)\}\}/g, (_, key: string) =>
      String(save.variables[key] ?? ""),
    );
  const segments = useMemo(() => graphemes(text), [text]);
  const revealKey = `${save.nodeId}:${line?.id}:${text}`;
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
  const next = useMemo(
    () => (node ? explainNext(project, node, save) : undefined),
    [project, node, save],
  );
  const canAdvance = !!line || !save.completed || !!next?.allowed;
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.shiftKey ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,button,[contenteditable=true]",
        )
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
    if (revealing) return;
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
  ]);
  const playback = resolvePlayback(
    project,
    node?.title || "",
    save.audio.currentTrackId,
  );
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const bgm =
    panel === "music"
      ? undefined
      : !started
        ? project.titleScreen.music
        : save.presentation
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
      0.65,
    );
    void audio
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
    const enable = () => {
      void audio
        .play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
    };
    window.addEventListener("pointerdown", enable, { once: true });
    return () => {
      audio.pause();
      if (musicRef.current === audio) musicRef.current = null;
      audio.removeAttribute("src");
      audio.load();
      window.removeEventListener("pointerdown", enable);
    };
  }, [bgm]);
  useEffect(() => {
    if (musicRef.current)
      musicRef.current.volume = playbackVolume(
        save.audio,
        started ? playback.volume : 1,
        0.65,
      );
  }, [save.audio.muted, save.audio.volume, playback.volume, started, bgm]);
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
        setError(String(e));
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
    "--player-font": `${preferences.fontSize}px`,
    "--player-leading": preferences.lineHeight,
    "--player-opacity": preferences.opacity,
  } as CSSProperties;
  const names: Record<string, string> = {
    menu: "游戏菜单",
    saves: "存读档",
    settings: "阅读与演出设置",
    history: "历史回看",
    chapters: "章节目录",
    notes: "旅者笔记",
    music: "音乐鉴赏",
    clue: "证据",
    encyclopedia: "百科全书",
    newspaper: "报刊",
  };
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
                "settings",
              ].map((id) => (
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
              {(project.media.musicGallery || [])
                .filter(
                  (t) =>
                    !t.unlockNode || save.visitedNodes.includes(t.unlockNode),
                )
                .map((t) => (
                  <article key={t.id}>
                    <h3>{t.title}</h3>
                    <GalleryAudio
                      src={t.src}
                      audio={save.audio}
                      volume={
                        project.audio.find((a) => a.src === t.src)?.volume
                      }
                    />
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
    <div className="app player-root" style={css}>
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
      {notice && !save.presentation && node?.presentation !== "dedication" && (
        <div className="unlock-notice" role="status">
          {notice}
          <button
            onClick={() => {
              const item = materials.find((m) => m.id === noticeId);
              if (item) {
                open(
                  materialCategory(item.category) === "note"
                    ? "notes"
                    : materialCategory(item.category),
                );
                setSelectedMaterial(item.id);
              }
            }}
          >
            查看
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
          <button onClick={() => open("history")}>历史</button>
          <button onClick={() => open("saves")}>存读档</button>
          <button onClick={() => open("menu")}>菜单</button>
        </nav>
      </header>
      {error && (
        <div className="runtime-error" role="alert">
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      {blocked && (
        <small className="audio-notice">
          点击画面开启音乐；无法播放时仍可继续游戏。
        </small>
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
        <EngineViewport
          context={selectContext(project, save, choices)}
          visibleText={segments.slice(0, count).join("")}
          statusText={statusText}
          onAdvance={advance}
          onChoose={(id) => invoke(() => store.choose(id))}
          onInput={(key, text) => invoke(() => store.setVariable(key, text))}
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
          <span role="status">{revealing ? "点击补全文字" : statusText}</span>
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
            onChange={(e) => invoke(() => store.setPlayerNotes(e.target.value))}
          />
        </section>
      </main>
      {overlays}
    </div>
  );
}
