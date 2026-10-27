import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { EngineStore } from "../engine/store";
import { slotKey } from "../engine/save";
import { hasPlayerProgress, backupAndClearSlot } from "../engine/recovery.js";
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
    <LoadSession
      project={project}
      fresh={fresh}
      onFresh={() => setFresh(true)}
    />
  ) : (
    <div className="loading">Loading MAGICKISA...</div>
  );
}
function LoadSession({
  project,
  fresh,
  onFresh,
}: {
  project: StoryProject;
  fresh: boolean;
  onFresh: () => void;
}) {
  const [result, setResult] = useState<{ store?: EngineStore; error?: string }>(
    {},
  );
  useEffect(() => {
    try {
      const store = new EngineStore(project, fresh ? { persist: false } : {});
      setResult({ store });
      return () => store.destroy();
    } catch (e) {
      setResult({ error: String(e) });
    }
  }, [project, fresh]);
  return result.error ? (
    <div className="recovery-error" role="alert">
      <h1>存档需要处理</h1>
      <p>{result.error}</p>
      <p>
        原存档保持原样。临时新周目仅在内存中运行，导入存档后也不会自动保存；请在刷新前导出进度。需要恢复自动保存时，先备份原存档并建立可保存新周目，再导入有效存档。
      </p>
      <button onClick={onFresh}>打开临时新周目（不保存）</button>
      <button
        onClick={() => {
          if (
            !window.confirm(
              "将保留原始自动存档副本，并为当前工程创建可自动保存的新周目。继续？",
            )
          )
            return;
          try {
            backupAndClearSlot(localStorage, slotKey(project.id));
            location.reload();
          } catch (e) {
            setResult({
              error:
                e instanceof DOMException && e.name === "QuotaExceededError"
                  ? "浏览器存储空间不足，无法备份，原存档未删除。请释放存储空间后重试；不要直接清除本站点数据。"
                  : `恢复失败，原存档未删除：${String(e)}`,
            });
          }
        }}
      >
        备份原存档并建立可保存新周目
      </button>
    </div>
  ) : result.store ? (
    <GameSession store={result.store} />
  ) : (
    <div className="loading">正在读取存档……</div>
  );
}
export function GameSession({
  store,
  embedded = false,
}: {
  store: EngineStore;
  embedded?: boolean;
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
  const [showMusicLabel, setShowMusicLabel] = useState(
    () => localStorage.getItem("magickisa:music-label") !== "off",
  );
  const [notice, setNotice] = useState("");
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
  const advance = () => {
    if (!panel && started && !splash && !save.presentation)
      invoke(() => {
        store.advance();
        if (
          store.runtime.node?.presentation === "dedication" &&
          store.runtime.done
        )
          store.advance();
      });
  };
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
      if ((e.target as HTMLElement).closest("input,textarea,select,button"))
        return;
      if (e.code === "Escape") {
        setPanel(null);
        return;
      }
      if (panel || save.presentation || !started || splash) return;
      if (e.code === "Space" || e.code === "ArrowRight") {
        e.preventDefault();
        advance();
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        invoke(() => store.rollback());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => {
    if (!auto && !fast) return;
    const timer = setInterval(
      () => {
        if (
          !panel &&
          started &&
          !splash &&
          !save.presentation &&
          !choices.length &&
          !line?.input &&
          (!fast || !line || save.readLineIds.includes(line.id))
        )
          invoke(() => store.advance());
      },
      fast ? 180 : 2600,
    );
    return () => clearInterval(timer);
  }, [
    auto,
    fast,
    panel,
    started,
    splash,
    save.presentation,
    save.nodeId,
    save.lineIndex,
    choices.length,
    line?.input,
    store,
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
    if (!started) return;
    const handle = (e: WheelEvent) => {
      if (
        panel ||
        splash ||
        save.presentation ||
        (e.target as HTMLElement).closest("input,textarea,select,.choice-list")
      )
        return;
      e.preventDefault();
      if (e.deltaY > 0) advance();
      else if (e.deltaY < 0) setPanel("history");
    };
    const stage = document.querySelector(".stage");
    stage?.addEventListener("wheel", handle as EventListener, {
      passive: false,
    });
    return () => stage?.removeEventListener("wheel", handle as EventListener);
  });
  const open = (id: string) => {
    setPanel(id);
    if (id !== "history" && id !== "chapters")
      for (const m of materials.filter(
        (m) => materialCategory(m.category) === (id === "notes" ? "note" : id),
      ))
        invoke(() => store.markRead(m.id));
  };
  function exportSave() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(save, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.id}-save.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!started)
    return (
      <TitleScreenHost
        project={project}
        audioBlocked={blocked}
        onStart={() =>
          invoke(() => {
            if (
              hasPlayerProgress(save) &&
              !window.confirm(
                "重新开始会覆盖当前自动存档。请先导出存档以保留进度，确认继续？",
              )
            )
              return;
            store.reset();
            setSplash(true);
            setStarted(true);
          })
        }
        onContinue={() => setStarted(true)}
        onEnableAudio={() => window.dispatchEvent(new Event("pointerdown"))}
      >
        {import.meta.env.DEV && (
          <a href="/engine.html">
            {project.ui?.labels?.development || "开发预览"}
          </a>
        )}
      </TitleScreenHost>
    );
  return (
    <div className="app">
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
        </div>
      )}
      {showMusicLabel && musicTitle && !save.presentation && !splash && (
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
      <header className="topbar">
        <div className="brand">{project.title}</div>
        <div className="top-actions">
          <button title="演出设置" onClick={() => open("settings")}>
            设置
          </button>
          <button
            title="全屏"
            onClick={() =>
              invoke(() => {
                const request = document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen();
                void request.catch((e) => setError(String(e)));
              })
            }
          >
            全屏
          </button>
          <button
            title="返回标题"
            onClick={() => {
              setStarted(false);
              setAuto(false);
              setFast(false);
            }}
          >
            标题
          </button>
          <button
            title="自动播放"
            onClick={() => {
              setAuto(!auto);
              setFast(false);
            }}
          >
            自动{auto ? " ●" : ""}
          </button>
          <button
            title="快进已读"
            onClick={() => {
              setFast(!fast);
              setAuto(false);
            }}
          >
            快进
          </button>
          <button title="历史回看" onClick={() => open("history")}>
            历史
          </button>
          <button
            className={unread("encyclopedia") ? "has-unread" : ""}
            title="百科全书"
            onClick={() => open("encyclopedia")}
          >
            百科
          </button>
          <button
            className={unread("newspaper") ? "has-unread" : ""}
            title="新闻报纸"
            onClick={() => open("newspaper")}
          >
            新闻
          </button>
          <button title="证据板" onClick={() => open("clue")}>
            证据
          </button>
          <button
            className={unread("notes") ? "has-unread" : ""}
            title="旅者笔记"
            onClick={() => open("notes")}
          >
            笔记
          </button>
          <button title="章节目录" onClick={() => open("chapters")}>
            章节
          </button>
          <button title="音乐鉴赏" onClick={() => open("music")}>
            音乐
          </button>
          <button title="导出存档" onClick={exportSave}>
            导出
          </button>
          <label className="import-label" title="导入存档">
            导入
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file)
                  try {
                    const raw = await file.text();
                    localStorage.setItem(
                      `magickisa-import-backup:${Date.now()}`,
                      raw,
                    );
                    invoke(() => store.restore(JSON.parse(raw)));
                  } catch (err) {
                    setError(String(err));
                  }
                e.target.value = "";
              }}
            />
          </label>
          <button
            title="静音切换"
            onClick={() =>
              invoke(() => store.setAudio(save.audio.volume, !save.audio.muted))
            }
          >
            {save.audio.muted ? "恢复声音" : "静音"}
          </button>
          <input
            aria-label="主音量"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={save.audio.volume}
            onChange={(e) =>
              invoke(() =>
                store.setAudio(Number(e.target.value), save.audio.muted),
              )
            }
          />
          <button
            title="重新开始"
            onClick={() => {
              if (
                window.confirm(
                  "重新开始会覆盖当前自动存档，请先导出存档。确认继续？",
                )
              )
                invoke(() => store.reset());
            }}
          >
            重开
          </button>
        </div>
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
      <div className="progressbar">
        <span>{node?.chapter}</span>
        <i
          style={{
            width: `${Math.min(100, (save.visitedNodes.length / project.nodes.filter((n) => n.playable !== false).length) * 100)}%`,
          }}
        />
      </div>
      <main className="avg-shell">
        <EngineViewport
          context={selectContext(project, save, choices)}
          onAdvance={advance}
          onChoose={(id) => invoke(() => store.choose(id))}
          onInput={(key, text) => invoke(() => store.setVariable(key, text))}
        />
        <footer className="stage-footer">
          <button
            title="上一句"
            disabled={!save.history.length || !!save.presentation}
            onClick={() => invoke(() => store.rollback())}
          >
            ‹ 上一句
          </button>
          <span>
            {store.runtime.done
              ? "节点结束"
              : `${save.lineIndex + 1} / ${node?.lines.length}`}
          </span>
          <button
            title="下一句"
            disabled={!!save.presentation}
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
      {panel && (
        <div className="drawer-backdrop" onClick={() => setPanel(null)}>
          <aside
            className={
              panel === "history"
                ? "material-panel backlog-shell"
                : "material-panel"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <strong>
                {{
                  history: "历史回看",
                  chapters: "章节目录",
                  notes: "旅者笔记",
                  music: "音乐鉴赏",
                  clue: "证据板",
                  encyclopedia: "百科全书",
                  newspaper: "报刊",
                  settings: "演出设置",
                }[panel] || panel}
              </strong>
              <button title="关闭面板" onClick={() => setPanel(null)}>
                ×
              </button>
            </div>
            {panel === "settings" ? (
              <section className="restored-settings">
                <label>
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => {
                      setAuto(e.target.checked);
                      if (e.target.checked) setFast(false);
                    }}
                  />
                  自动播放
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={fast}
                    onChange={(e) => {
                      setFast(e.target.checked);
                      if (e.target.checked) setAuto(false);
                    }}
                  />
                  快进已读文本
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showMusicLabel}
                    onChange={(e) => {
                      setShowMusicLabel(e.target.checked);
                      localStorage.setItem(
                        "magickisa:music-label",
                        e.target.checked ? "on" : "off",
                      );
                    }}
                  />
                  显示当前音乐名
                </label>
                <p>
                  快捷键：Space / 右方向键继续，左方向键回退，Esc 关闭面板。
                </p>
              </section>
            ) : panel === "history" ? (
              <div className="backlog-scroll">
                {save.history
                  .filter((h) => h.text)
                  .map((h) => (
                    <article key={h.id}>
                      <b>{h.speaker}</b>
                      <small>{h.section}</small>
                      <p>{h.text}</p>
                      <button
                        className="restore-button"
                        onClick={() => {
                          if (
                            !window.confirm(
                              "回到此处会截断之后的剧情回退记录；玩家笔记和已获得的收藏保留。确认继续？",
                            )
                          )
                            return;
                          invoke(() =>
                            store.rollback(
                              save.history.findIndex((x) => x.id === h.id),
                            ),
                          );
                          setPanel(null);
                        }}
                      >
                        回到这里
                      </button>
                    </article>
                  ))}
              </div>
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
                        onClick={() => {
                          invoke(() => store.jump(n.id));
                          setPanel(null);
                        }}
                      >
                        {n.title}
                      </button>
                    ))}
                </div>
              </>
            ) : panel === "notes" ? (
              <div className="notes-modal">
                <textarea
                  aria-label="旅者自由笔记"
                  value={save.playerNotes}
                  onChange={(e) =>
                    invoke(() => store.setPlayerNotes(e.target.value))
                  }
                />
                {save.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
                {materials
                  .filter((m) => materialCategory(m.category) === "note")
                  .map((m) => (
                    <article key={m.id}>
                      <h3>{m.title}</h3>
                      <p>{m.body}</p>
                    </article>
                  ))}
              </div>
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
              <div className="material-list">
                {materials
                  .filter((m) => materialCategory(m.category) === panel)
                  .map((m) => (
                    <article key={m.id}>
                      <h3>{m.title}</h3>
                      <p className="prewrap">{m.body}</p>
                    </article>
                  ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
