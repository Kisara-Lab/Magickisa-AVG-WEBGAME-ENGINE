// MAGICKISA release-compatible runtime.
import { resolveAsset } from "../engine/resourceManager.js";
import React from "react";
import { AudioManager } from "../engine/audioManager.js";
import { PresentationRegistry } from "../engine/presentation.js";
import { EngineStore } from "../engine/store.js";
import {
  createSave,
  readSave,
  writeSave,
  importSave as validateSave,
  slotKey,
} from "../engine/save.js";
import { isMaterialAvailable, isMusicAvailable } from "../engine/unlocks.js";
import { attachDebug } from "../engine/debug.js";
import { preloadCharacters } from "../engine/resourceManager.js";
import { resolvePlayback, playbackVolume } from "../../../engine/playback.js";
import { GalleryAudio } from "../../../engine/GalleryAudio";
import { materialCategory } from "../../../engine/resource.js";
import {
  hasPlayerProgress,
  backupAndClearSlot,
} from "../../../engine/recovery.js";
import { TitleScreenHost } from "../engine/TitleScreenHost.jsx";
import { PresentationHost } from "../engine/PresentationHost.jsx";
import { Music2 } from "lucide-react";
import { BookOpen } from "lucide-react";
import { Square } from "lucide-react";
import { Play } from "lucide-react";
import { FastForward } from "lucide-react";
import { History } from "lucide-react";
import { FileText } from "lucide-react";
import { Menu } from "lucide-react";
import { Settings2 } from "lucide-react";
import { Maximize2 } from "lucide-react";
import { GalleryHorizontalEnd } from "lucide-react";
import { Download } from "lucide-react";
import { Upload } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { resolveScene } from "../engine/resourceManager.js";
import { CharacterStage } from "../engine/character.jsx";
import { ChevronLeft } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { X } from "lucide-react";
import { Search } from "lucide-react";
export const fallbackOpening = {
  duration: 89,
};
export const fallbackEnding = {
  duration: 198,
};
export const fallbackMusicGallery = [];
export const fallbackMedia = { musicGallery: [] };
export const fallbackBackdrops = [];
export const fallbackAudio = [];
export const fallbackManifest = { backdrops: [], audio: [] };
export function nodeIndex(project, nodeId, fallback = 0) {
  const index = project.nodes.findIndex((l) => l.id === nodeId);
  return index >= 0 ? index : fallback;
}
export function syncLegacyView(view, save, project) {
  const index = nodeIndex(project, save.nodeId, view.index),
    visitedIndices = save.visitedNodes
      .map((i) => nodeIndex(project, i, -1))
      .filter((i) => i >= 0);
  return {
    ...view,
    index: index,
    line: save.lineIndex,
    flags: save.variables,
    blackTide: Number(save.variables.blackTide || 0),
    visited: visitedIndices,
    notes: save.playerNotes ?? "",
    unlockedMaterials: [...save.unlockedMaterials],
    history: save.history
      .map((h, engineHistoryIndex) => ({
        speaker: h.speaker || "旁白",
        text: h.text || "",
        section: project.nodes.find((n) => n.id === h.nodeId)?.title || "",
        sectionIndex: nodeIndex(project, h.nodeId),
        lineIndex: h.lineIndex,
        engineHistoryIndex,
      }))
      .filter((h) => h.text)
      .slice(-200),
  };
}
export const LEGACY_SAVE_KEY = "magickisa:view";
export const AUTO_SAVE_KEY = "magickisa-avg:slot:auto";
export var Qu;
export const HOME_BACKDROP =
  ((Qu = fallbackManifest.backdrops.find((e) => e.id === "home")) == null
    ? void 0
    : Qu.src) || "";
export var Ku;
export const gameAsset = (e, t) => {
  var n;
  return t
    ? resolveAsset(t, e)
    : e.startsWith("/") || e.startsWith("http")
      ? e
      : ((n = fallbackManifest.backdrops.find((r) => r.id === e)) == null
          ? void 0
          : n.src) || `/assets/generated/${e}.png`;
};
export const musicEntries = fallbackMedia.musicGallery || [];
export const trackTitle = (e) => {
  var t, n;
  return (
    ((t = musicEntries.find((r) => e.endsWith(r.src.replace("/music/", "")))) ==
    null
      ? void 0
      : t.title) ||
    ((n = e.split("/").pop()) == null ? void 0 : n.replace(/\.mp3$/i, "")) ||
    "未命名曲目"
  );
};
export function GameApp() {
  var So, Eo, No, Co, jo, _o, Mo, zo, Io;
  const [script, setScript] = React.useState(null),
    [project, setProject] = React.useState(null),
    [loadError, setLoadError] = React.useState(""),
    [saveError, setSaveError] = React.useState(""),
    [writeError, setWriteError] = React.useState(""),
    [chapterMenuOpen, setChapterMenuOpen] = React.useState(!1),
    [activePanel, setActivePanel] = React.useState(null),
    [chapterSearch, setChapterSearch] = React.useState(""),
    [notice, setNotice] = React.useState(""),
    [pendingRestore, setPendingRestore] = React.useState(null),
    [autoAdvance, setAutoAdvance] = React.useState(!1),
    [fastForward, setFastForward] = React.useState(!1),
    [settingsOpen, setSettingsOpen] = React.useState(!1),
    [showMusicLabel, setShowMusicLabel] = React.useState(
      () => localStorage.getItem("magickisa:music-label") !== "off",
    ),
    [currentMusicTitle, setCurrentMusicTitle] = React.useState(""),
    [openingActive, setOpeningActive] = React.useState(!1),
    [openingTime, setOpeningTime] = React.useState(0),
    openingAudioRef = React.useRef(null),
    [endingActive, setEndingActive] = React.useState(!1),
    [endingTime, setEndingTime] = React.useState(0),
    endingAudioRef = React.useRef(null),
    [gameStarted, setGameStarted] = React.useState(!1),
    [splashActive, setSplashActive] = React.useState(!1),
    [audioBlocked, setAudioBlocked] = React.useState(!1),
    titleAudioRef = React.useRef(null),
    audioManagerRef = React.useRef(new AudioManager()),
    backlogRef = React.useRef(null),
    engineStoreRef = React.useRef(null),
    saveBlockedRef = React.useRef(false),
    wheelHandlerRef = React.useRef(null),
    presentationsRef = React.useRef(new PresentationRegistry()),
    [view, setView] = React.useState(() => {
      return {
        index: 0,
        line: 0,
        notes: "",
        visited: [],
        flags: {},
        blackTide: 0,
        history: [],
        materialRead: [],
        notified: [],
        unlockedMaterials: [],
        version: 3,
        npcTopics: [],
        sealQuestions: 0,
      };
    });
  React.useEffect(() => {
    Promise.all([
      fetch("/content/script.json"),
      fetch("/content/engine-story.json"),
    ])
      .then(async ([f, g]) => {
        if (!f.ok || !g.ok) throw new Error();
        (setScript(await f.json()), setProject(await g.json()));
      })
      .catch(() => setLoadError("正式文案加载失败，请刷新页面重试。"));
  }, []);
  const sections = (script == null ? void 0 : script.sections) ?? [];
  const currentAudio = engineStoreRef.current?.runtime.save.audio || {
    volume: 1,
    muted: false,
  };
  const captureTitleAudio = React.useCallback((element) => {
    if (!element) titleAudioRef.current?.pause();
    titleAudioRef.current = element;
  }, []);
  const playback = project
    ? resolvePlayback(
        project,
        project.nodes[view.index]?.title || "",
        currentAudio.currentTrackId,
      )
    : { src: "", volume: 1 };
  const setPlayerNotes = (text) => {
    const store = engineStoreRef.current;
    if (!store) return;
    store.runtime.save = { ...store.runtime.save, playerNotes: text };
    store.emit(store.runtime.save);
    setView((v) => syncView(v, store.runtime.save));
  };
  const setAudioSettings = (patch) => {
    const store = engineStoreRef.current;
    if (!store) return;
    store.runtime.save = {
      ...store.runtime.save,
      audio: { ...store.runtime.save.audio, ...patch },
    };
    store.emit(store.runtime.save);
    setView((v) => syncView(v, store.runtime.save));
  };
  React.useEffect(
    () => () => {
      titleAudioRef.current?.pause();
      audioManagerRef.current.stopAll();
    },
    [],
  );
  (React.useEffect(() => {
    var N;
    if (!((N = project == null ? void 0 : project.nodes) != null && N.length))
      return;
    const f = project;
    let g = null;
    try {
      g = readSave("auto", f);
    } catch (error) {
      saveBlockedRef.current = true;
      setSaveError(String(error));
      g = null;
    }
    return (
      (engineStoreRef.current = new EngineStore(f, {
        initialSave: g || createSave(f.startNodeId, "auto", f),
        persist: !1,
      })),
      setView((P) => syncView(P, engineStoreRef.current.runtime.save)),
      typeof window < "u" &&
        (window.__MAGICKISA_ENGINE__ = engineStoreRef.current),
      attachDebug(engineStoreRef.current.session.engine, f),
      () => {
        var P;
        ((P = engineStoreRef.current) == null || P.destroy(),
          (engineStoreRef.current = null));
      }
    );
  }, [project]),
    React.useEffect(() => {
      project && preloadCharacters(project, (f) => gameAsset(f, project));
    }, [project]),
    React.useEffect(() => {
      const f = presentationsRef.current,
        g = f.register("dedication", () => {
          (audioManagerRef.current.pause("chapter"), setOpeningActive(!0));
        }),
        N = f.register("ending", () => {
          (audioManagerRef.current.pause("chapter"), setEndingActive(!0));
        });
      return () => {
        (g(), N());
      };
    }, []),
    React.useEffect(() => {
      var g;
      const f = (g = engineStoreRef.current) == null ? void 0 : g.runtime.save;
      if (f && project && gameStarted && !saveBlockedRef.current) {
        try {
          writeSave(f, project);
          setWriteError("");
        } catch (error) {
          setWriteError(
            `存档未保存：${String(error)}。请导出存档，释放空间后重试。`,
          );
        }
      }
    }, [view, gameStarted, project]));
  const section = sections[view.index],
    node = project == null ? void 0 : project.nodes[view.index],
    labels =
      ((So = project == null ? void 0 : project.ui) == null
        ? void 0
        : So.labels) || {},
    media = (project == null ? void 0 : project.media) || fallbackMedia,
    lineTexts =
      ((Eo = node == null ? void 0 : node.lines) == null
        ? void 0
        : Eo.map((f) => f.text)) || [],
    line =
      (No = node == null ? void 0 : node.lines) == null
        ? void 0
        : No[view.line],
    characterLayers =
      (line == null ? void 0 : line.characterLayers) ||
      (line != null && line.characterId
        ? [
            {
              characterId: line.characterId,
              position: "center",
              enter: "fade",
            },
          ]
        : []),
    fallbackChoices = [],
    engineChoices = (
      ((Co = engineStoreRef.current) == null ? void 0 : Co.runtime.choices) ||
      []
    ).map((f, g) => ({
      key: String.fromCharCode(65 + g),
      id: f.id,
      label: f.label,
      target: f.target,
      engine: !0,
    })),
    choices = engineChoices.length ? engineChoices : fallbackChoices;
  React.useEffect(() => {
    var f, g;
    (f = project == null ? void 0 : project.nodes) != null &&
      f.length &&
      (!((g = project.nodes[view.index]) != null && g.playable) ||
        !sections[view.index]) &&
      setView((N) => {
        var P, H;
        return {
          ...N,
          index: nodeIndex(project, project.startNodeId),
          line: 0,
          visited: [
            ...new Set([...N.visited, nodeIndex(project, project.startNodeId)]),
          ],
        };
      });
  }, [project, sections, view.index]);
  const nodeDone = lineTexts.length === 0 || view.line >= lineTexts.length,
    chapterTitle = (() => {
      var f;
      for (let g = view.index; g >= 0; g -= 1)
        if (((f = sections[g]) == null ? void 0 : f.level) === 1)
          return sections[g].title.replace(/^【|】$/g, "");
      return "序章";
    })(),
    visibleChapters = React.useMemo(
      () =>
        sections
          .map((f, g) => ({
            s: f,
            i: g,
          }))
          .filter(({ i: f }) => {
            var g;
            return (
              ((g = project == null ? void 0 : project.nodes[f]) == null
                ? void 0
                : g.playable) &&
              view.visited.includes(f) &&
              (!chapterSearch ||
                `${sections[f].title} ${sections[f].body}`.includes(
                  chapterSearch,
                ))
            );
          }),
      [sections, project, chapterSearch, view.visited],
    ),
    materialsByCategory = React.useMemo(() => {
      const g = ((project == null ? void 0 : project.materials) || []).filter(
        (N) =>
          isMaterialAvailable(project, N, engineStoreRef.current?.runtime.save),
      );
      return {
        encyclopedia: g.filter((N) => N.category === "encyclopedia"),
        newspaper: g.filter((N) => N.category === "newspaper"),
        notes: g.filter((N) => materialCategory(N.category) === "note"),
        clues: g.filter((N) => materialCategory(N.category) === "clue"),
      };
    }, [project, sections, view.visited, view.flags, view.unlockedMaterials]),
    currentMaterialCategory = () => {
      var f, g, N;
      return (f = node == null ? void 0 : node.tags) != null &&
        f.includes("encyclopedia")
        ? "encyclopedia"
        : (g = node == null ? void 0 : node.tags) != null &&
            g.includes("newspaper")
          ? "newspaper"
          : (N = node == null ? void 0 : node.tags) != null &&
              N.includes("note")
            ? "notes"
            : "";
    };
  React.useEffect(() => {
    var N, P;
    const f = currentMaterialCategory();
    if (!f || view.notified.includes(`${f}:${view.index}`)) return;
    (setNotice(
      ((P =
        (N = project == null ? void 0 : project.ui) == null
          ? void 0
          : N.notifications) == null
        ? void 0
        : P[f]) ||
        (f === "encyclopedia"
          ? "《阿努拉志》有新条目可读"
          : f === "newspaper"
            ? "报刊有新一期可读"
            : "旅者笔记有新记录"),
    ),
      setView((H) => ({
        ...H,
        notified: [...H.notified, `${f}:${H.index}`],
      })));
    const g = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(g);
  }, [
    view.index,
    section == null ? void 0 : section.title,
    project,
    (jo = node == null ? void 0 : node.tags) == null ? void 0 : jo.join("|"),
  ]);
  const advance = () =>
    setView((f) => {
      if (
        !gameStarted ||
        splashActive ||
        settingsOpen ||
        openingActive ||
        endingActive ||
        !engineStoreRef.current
      )
        return f;
      const N = engineStoreRef.current.advance(),
        P = syncView(f, N);
      return (
        f.line >= lineTexts.length &&
          (node == null ? void 0 : node.presentation) === "ending" &&
          !endingActive &&
          !f.edSeen &&
          presentationsRef.current.play({
            id: "ending",
            sequenceId: node.sequenceId,
            skippable: !0,
          }),
        f.line >= lineTexts.length &&
          (node == null ? void 0 : node.presentation) === "dedication" &&
          !f.opSeen &&
          presentationsRef.current.play({
            id: "dedication",
            sequenceId: node.sequenceId,
            skippable: !0,
          }),
        P
      );
    });
  (React.useEffect(() => {
    if (!openingActive && !endingActive) return;
    const opening = openingActive;
    const audio = opening ? openingAudioRef.current : endingAudioRef.current;
    const duration =
      (opening ? media.opening?.duration : media.ending?.duration) ??
      (opening ? 89 : 198);
    let time = 0,
      stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      audio?.pause();
      if (opening) setOpeningActive(false);
      else setEndingActive(false);
      setView((v) => ({
        ...v,
        ...(opening ? { opSeen: true } : { edSeen: true }),
      }));
    };
    const update = () => {
      if (stopped) return;
      if (time >= duration) {
        finish();
        return;
      }
      if (opening) setOpeningTime(time);
      else setEndingTime(time);
    };
    const tick = () => {
      time =
        audio && !audio.paused && !audio.ended && audio.currentTime > time
          ? audio.currentTime
          : time + 0.25;
      update();
    };
    if (audio) {
      audio.currentTime = 0;
      if (audio.getAttribute("src")) audio.play().catch(() => {});
    }
    const timer = window.setInterval(tick, 250);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      audio?.pause();
    };
  }, [
    openingActive,
    endingActive,
    media.opening?.duration,
    media.ending?.duration,
  ]),
    React.useEffect(() => {
      gameStarted ||
        !titleAudioRef.current ||
        ((titleAudioRef.current.volume = playbackVolume(currentAudio, 1, 0.72)),
        titleAudioRef.current
          .play()
          .then(() => setAudioBlocked(!1))
          .catch(() => setAudioBlocked(!0)));
    }, [gameStarted, project?.id, currentAudio.volume, currentAudio.muted]),
    React.useEffect(() => {
      for (const audio of [openingAudioRef.current, endingAudioRef.current])
        if (audio) audio.volume = playbackVolume(currentAudio);
    }, [openingActive, endingActive, currentAudio.volume, currentAudio.muted]),
    React.useEffect(() => {
      if (!gameStarted) return;
      if (splashActive) {
        audioManagerRef.current.pause("chapter");
        return;
      }
      if ((node == null ? void 0 : node.presentation) === "dedication") {
        (audioManagerRef.current.stop("chapter"), setCurrentMusicTitle(""));
        return;
      }
      if (openingActive || endingActive || activePanel === "music") {
        audioManagerRef.current.pause("chapter");
        return;
      }
      const f = playback.src;
      if (!f) {
        (audioManagerRef.current.pause("chapter"), setCurrentMusicTitle(""));
        return;
      }
      audioManagerRef.current.play("chapter", f, {
        volume: playbackVolume(currentAudio, playback.volume, 0.6),
        loop: true,
      });
      return () => audioManagerRef.current.pause("chapter");
    }, [
      gameStarted,
      splashActive,
      openingActive,
      endingActive,
      section == null ? void 0 : section.title,
      showMusicLabel,
      playback.src,
      playback.volume,
      currentAudio.volume,
      currentAudio.muted,
      activePanel,
    ]),
    React.useEffect(() => {
      if (!splashActive) return;
      const f = window.setTimeout(() => setSplashActive(!1), 3e3);
      return () => window.clearTimeout(f);
    }, [splashActive]));
  React.useEffect(() => {
    if (!gameStarted || !showMusicLabel || !playback.src) {
      setCurrentMusicTitle("");
      return;
    }
    setCurrentMusicTitle(trackTitle(playback.src));
    const timer = window.setTimeout(() => setCurrentMusicTitle(""), 5200);
    return () => window.clearTimeout(timer);
  }, [gameStarted, playback.src, showMusicLabel, node?.id]);
  const rollbackOne = () =>
      setView((f) => {
        const g = engineStoreRef.current;
        return !g || g.runtime.save.history.length === 0
          ? f
          : syncView(f, g.rollback(g.runtime.save.history.length - 1));
      }),
    handleWheel = (f) => {
      (f.preventDefault(),
        f.deltaY > 0 ? advance() : f.deltaY < 0 && setActivePanel("history"));
    };
  React.useEffect(() => {
    if (!autoAdvance && !fastForward) return;
    const f = window.setInterval(
      () => {
        !activePanel && !chapterMenuOpen && advance();
      },
      fastForward ? 180 : 2600,
    );
    return () => window.clearInterval(f);
  }, [
    autoAdvance,
    fastForward,
    activePanel,
    chapterMenuOpen,
    view.index,
    view.line,
  ]);
  wheelHandlerRef.current = (e) => {
    if (
      !gameStarted ||
      splashActive ||
      openingActive ||
      endingActive ||
      settingsOpen ||
      activePanel ||
      chapterMenuOpen ||
      e.target.closest("input,textarea,select,button")
    )
      return;
    handleWheel(e);
  };
  React.useEffect(() => {
    const stage = document.querySelector(".stage");
    const wheel = (e) => wheelHandlerRef.current?.(e);
    stage?.addEventListener("wheel", wheel, { passive: false });
    return () => stage?.removeEventListener("wheel", wheel);
  }, [project, gameStarted]);
  const toggleFullscreen = async () => {
      var f, g, N;
      document.fullscreenElement
        ? await ((N = document.exitFullscreen) == null
            ? void 0
            : N.call(document))
        : await ((g = (f = document.documentElement).requestFullscreen) == null
            ? void 0
            : g.call(f));
    },
    jumpToSection = (f) => {
      (setView((g) => {
        var P;
        const N =
          (P = project == null ? void 0 : project.nodes[f]) == null
            ? void 0
            : P.id;
        return !engineStoreRef.current || !N
          ? {
              ...g,
              index: f,
              line: 0,
            }
          : syncView(g, engineStoreRef.current.jump(N));
      }),
        setChapterMenuOpen(!1));
    },
    syncView = (f, g) => (project ? syncLegacyView(f, g, project) : f),
    resetGame = () => {
      saveBlockedRef.current = false;
      setSaveError("");
      var N;
      const f = project ? nodeIndex(project, project.startNodeId) : 0,
        g = project ? createSave(project.startNodeId, "auto", project) : null;
      (g && engineStoreRef.current && (engineStoreRef.current.runtime.save = g),
        project && localStorage.removeItem(slotKey("auto", project.id)),
        setView((P) =>
          g
            ? {
                ...syncView(P, g),
                index: f,
                line: 0,
                notes: "",
                visited: [f],
                flags: {},
                blackTide: 0,
                history: [],
                materialRead: [],
                notified: [],
                version: 3,
                opSeen: !1,
                edSeen: !1,
                noteSelections: [],
                npcTopics: [],
                sealQuestions: 0,
                unlockedMaterials: [],
              }
            : {
                ...P,
                index: f,
                line: 0,
                notes: "",
                visited: [f],
                flags: {},
                blackTide: 0,
                history: [],
                materialRead: [],
                notified: [],
                version: 3,
                opSeen: !1,
                edSeen: !1,
                noteSelections: [],
                npcTopics: [],
                sealQuestions: 0,
                unlockedMaterials: [],
              },
        ));
    },
    startNewGame = () => {
      if (
        hasPlayerProgress(engineStoreRef.current?.runtime.save) &&
        !window.confirm("重新开始会覆盖当前自动存档，请先导出存档。确认继续？")
      )
        return;
      var f;
      (resetGame(),
        (f = titleAudioRef.current) == null || f.pause(),
        setSplashActive(!0),
        setGameStarted(!0));
    },
    choose = (f) => {
      var P, H, be, We;
      if (
        f.id &&
        (P = engineStoreRef.current) != null &&
        P.runtime.choices.some((Qe) => Qe.id === f.id)
      ) {
        setView((Qe) => syncView(Qe, engineStoreRef.current.choose(f.id)));
        return;
      }
      ((H = engineStoreRef.current) == null ||
        H.runtime.checkpoint({
          speaker: "choice",
          text: f.label,
        }),
        f.id &&
          setView((Qe) => ({
            ...Qe,
            npcTopics: f.id
              ? [...new Set([...(Qe.npcTopics || []), f.id])]
              : Qe.npcTopics,
            sealQuestions: f.seal
              ? (Qe.sealQuestions || 0) + 1
              : Qe.sealQuestions,
          })));
      const g =
          (We = (be = f.target) == null ? void 0 : be.match(/^node-(\d+)$/)) ==
          null
            ? void 0
            : We[1],
        N = g
          ? Number(g)
          : f.target
            ? sections.findIndex((Qe) =>
                Qe.title.includes(f.target.replace(/^场景/, "场景")),
              )
            : -1;
      jumpToSection(N >= 0 ? N : view.index);
    },
    exportSave = () => {
      var P;
      const f = (P = engineStoreRef.current) == null ? void 0 : P.runtime.save;
      if (!f) return;
      const g = new Blob([JSON.stringify(f, null, 2)], {
          type: "application/json",
        }),
        N = document.createElement("a");
      ((N.href = URL.createObjectURL(g)),
        (N.download = "magickisa-save.json"),
        N.click(),
        URL.revokeObjectURL(N.href));
    },
    importSave = (f) => {
      if (!f || !project) return;
      const g = new FileReader();
      ((g.onload = () => {
        try {
          const N = JSON.parse(String(g.result));
          const P = validateSave(N, project, { allowUnbound: true });
          P.slotId = "auto";
          if (
            !N.projectId &&
            !window.confirm(
              "此旧存档未记录工程归属。仅在确认它属于当前工程时继续导入；原全局存档不会被删除。",
            )
          )
            return;
          writeSave(P, project);
          saveBlockedRef.current = false;
          setSaveError("");
          ((engineStoreRef.current.runtime.save = P),
            setView((H) => syncView({ ...H, visited: [], history: [] }, P)));
        } catch (error) {
          window.alert(`无法导入，当前进度未改变：${String(error)}`);
        }
      }),
        g.readAsText(f));
    },
    openPanel = (f) => {
      (setActivePanel(f),
        f !== "history" &&
          setView((g) => ({
            ...g,
            materialRead: [...new Set([...(g.materialRead || []), f])],
          })));
    },
    restoreHistory = (f, g) => {
      if (pendingRestore !== g) {
        setPendingRestore(g);
        return;
      }
      (setView((N) =>
        f.engineHistoryIndex === void 0 || !engineStoreRef.current
          ? N
          : syncView(N, engineStoreRef.current.rollback(f.engineHistoryIndex)),
      ),
        setPendingRestore(null),
        setActivePanel(null));
    };
  if (
    (React.useEffect(() => {
      const f = (g) => {
        if (g.isComposing) return;
        if (
          g.code === "Escape" &&
          (activePanel || chapterMenuOpen || settingsOpen)
        ) {
          (g.preventDefault(),
            setActivePanel(null),
            setChapterMenuOpen(!1),
            setSettingsOpen(!1));
          return;
        }
        if (
          !gameStarted ||
          splashActive ||
          openingActive ||
          endingActive ||
          settingsOpen ||
          g.target?.closest?.(
            "input,textarea,select,button,a,[contenteditable]:not([contenteditable=false])",
          )
        )
          return;
        activePanel ||
          chapterMenuOpen ||
          ((g.code === "Space" || g.code === "ArrowRight") &&
            (g.preventDefault(), advance()),
          g.code === "ArrowLeft" && (g.preventDefault(), rollbackOne()));
      };
      return (
        window.addEventListener("keydown", f),
        () => window.removeEventListener("keydown", f)
      );
    }),
    React.useEffect(() => {
      activePanel === "history" &&
        requestAnimationFrame(() => {
          var f;
          return (f = backlogRef.current) == null
            ? void 0
            : f.scrollTo({
                top: backlogRef.current.scrollHeight,
              });
        });
    }, [activePanel]),
    loadError)
  )
    return <div className="app loading">{loadError}</div>;
  if (!script || !section || !project)
    return <div className="app loading">{"Loading MAGICKISA..."}</div>;
  if (saveError && !gameStarted)
    return (
      <div className="app loading" role="alert">
        <h1>存档需要处理</h1>
        <p>{saveError}</p>
        <p>
          原存档保留；在导入有效存档或明确重新开始前，临时周目不会覆盖原存档。
        </p>
        <button onClick={() => setGameStarted(true)}>
          打开临时新周目（不保存）
        </button>
        <button
          onClick={() => {
            if (
              !window.confirm(
                "将保留原始存档副本，并建立可自动保存的新周目。继续？",
              )
            )
              return;
            try {
              backupAndClearSlot(localStorage, slotKey("auto", project.id));
              location.reload();
            } catch (e) {
              setSaveError(
                e?.name === "QuotaExceededError"
                  ? "浏览器存储空间不足，无法备份，原存档未删除。请释放存储空间后重试；不要直接清除本站点数据。"
                  : `恢复失败，原存档未删除：${String(e)}`,
              );
            }
          }}
        >
          备份原存档并建立可保存新周目
        </button>
      </div>
    );
  if (!gameStarted) {
    const f = (project == null ? void 0 : project.titleScreen) || {},
      g = f.backdrop
        ? gameAsset(f.backdrop, project)
        : resolveScene(project, "");
    return (
      <TitleScreenHost
        project={project}
        backdrop={g}
        audioRef={captureTitleAudio}
        audioBlocked={audioBlocked}
        onStart={startNewGame}
        onContinue={() => {
          var N;
          ((N = titleAudioRef.current) == null || N.pause(),
            setGameStarted(!0));
        }}
        onEnableAudio={() => {
          var N;
          (N = titleAudioRef.current) == null ||
            N.play()
              .then(() => setAudioBlocked(!1))
              .catch(() => setAudioBlocked(!0));
        }}
      />
    );
  }
  const Ed = Math.round(
    ((view.index - 6) / Math.max(1, sections.length - 7)) * 100,
  );
  return (
    <div className="app">
      {openingActive && (
        <PresentationHost
          project={project}
          mode="opening"
          time={openingTime}
          onSkip={() => {
            var f;
            ((f = openingAudioRef.current) == null || f.pause(),
              setOpeningActive(!1),
              setView((g) => ({
                ...g,
                opSeen: !0,
              })));
          }}
          audioRef={(f) => {
            openingAudioRef.current = f;
          }}
          resolveAsset={(f) => gameAsset(f, project || void 0)}
        />
      )}
      {endingActive && (
        <PresentationHost
          project={project}
          mode="ending"
          time={endingTime}
          onSkip={() => {
            var f;
            ((f = endingAudioRef.current) == null || f.pause(),
              setEndingActive(!1),
              setView((g) => ({
                ...g,
                edSeen: !0,
              })));
          }}
          audioRef={(f) => {
            endingAudioRef.current = f;
          }}
        />
      )}
      {showMusicLabel &&
        currentMusicTitle &&
        !openingActive &&
        !endingActive && (
          <div className="music-now-playing" role="status">
            <Music2 size={14} />
            <span>
              <small>{"NOW PLAYING"}</small>
              {currentMusicTitle}
            </span>
          </div>
        )}
      {splashActive && (
        <div
          className="engine-splash"
          role="status"
          aria-label="Magickisa AVG 引擎加载中"
        >
          <div className="engine-splash-mark">
            <span>{"M"}</span>
          </div>
          <div className="engine-splash-name">{"MAGICKISA"}</div>
          <div className="engine-splash-subtitle">{"AVG · WEBGAME ENGINE"}</div>
          <div className="engine-splash-rule" />
          <div className="engine-splash-status">{"正在载入叙事场景"}</div>
          <div className="engine-splash-progress">
            <i />
          </div>
          <div className="engine-splash-version">
            {"Magickisa-AVG-webgame-Engine · v1.0"}
          </div>
        </div>
      )}
      <header className="topbar">
        {(writeError || saveBlockedRef.current) && (
          <div role="alert">
            <p>
              {writeError ||
                "临时周目不会自动保存；刷新前请导出存档。导入有效存档可恢复自动保存。"}
            </p>
            <button onClick={exportSave}>导出当前存档</button>
            {writeError && (
              <button onClick={() => setView((v) => ({ ...v }))}>
                重试保存
              </button>
            )}
          </div>
        )}
        <div className="brand">
          <BookOpen size={18} /> <span>{project?.title || "MAGICKISA"}</span>
        </div>
        <div className="top-actions">
          <button
            className={autoAdvance ? "mode-on" : ""}
            title="自动播放"
            onClick={() => {
              (setAutoAdvance(!autoAdvance), setFastForward(!1));
            }}
          >
            {autoAdvance ? <Square size={16} /> : <Play size={16} />}
            <span>{"自动"}</span>
          </button>
          <button
            className={fastForward ? "mode-on" : ""}
            title="快进已读"
            onClick={() => {
              (setFastForward(!fastForward), setAutoAdvance(!1));
            }}
          >
            <FastForward size={16} />
            <span>{"快进"}</span>
          </button>
          <button title="历史回看" onClick={() => openPanel("history")}>
            <History size={17} />
            <span>{"历史"}</span>
          </button>
          <button
            className={
              !view.materialRead.includes("encyclopedia") &&
              materialsByCategory.encyclopedia.length
                ? "has-unread"
                : ""
            }
            title="百科全书"
            onClick={() => openPanel("encyclopedia")}
          >
            <BookOpen size={17} />
            <span>{"百科"}</span>
            <i />
          </button>
          <button
            className={
              !view.materialRead.includes("newspaper") &&
              materialsByCategory.newspaper.length
                ? "has-unread"
                : ""
            }
            title="新闻报纸"
            onClick={() => openPanel("newspaper")}
          >
            <FileText size={17} />
            <span>{"新闻"}</span>
            <i />
          </button>
          <button title="章节目录" onClick={() => setChapterMenuOpen(!0)}>
            <Menu size={18} />
            <span>{"章节"}</span>
          </button>
          <button title="演出设置" onClick={() => setSettingsOpen(!0)}>
            <Settings2 size={17} />
          </button>
          <button title="全屏" onClick={toggleFullscreen}>
            <Maximize2 size={16} />
          </button>
          <a title="素材画廊" href="/gallery.html">
            <GalleryHorizontalEnd size={17} />
          </a>
          <button title="导出存档" onClick={exportSave}>
            <Download size={17} />
          </button>
          <label title="导入存档">
            <Upload size={17} />
            <input
              type="file"
              accept=".json"
              onChange={(f) => {
                var g;
                return importSave((g = f.target.files) == null ? void 0 : g[0]);
              }}
            />
          </label>
          <button title="重新开始" onClick={startNewGame}>
            <RefreshCw size={17} />
          </button>
        </div>
      </header>
      <div className="progressbar">
        <span>{chapterTitle}</span>
        <div>
          <i
            style={{
              width: `${Math.max(2, Math.min(100, Ed))}%`,
            }}
          />
        </div>
        <span>{nodeDone ? "继续进入下一节点" : "点击舞台继续"}</span>
      </div>
      {((Mo =
        (_o = project == null ? void 0 : project.ui) == null
          ? void 0
          : _o.enabled) == null
        ? void 0
        : Mo.musicGallery) !== !1 && (
        <button
          className="music-entry"
          onClick={() => openPanel("music")}
          title={labels.music || "音乐鉴赏"}
        >
          <Music2 size={16} />
          <span>{labels.music || "音乐鉴赏"}</span>
        </button>
      )}
      <main className="avg-shell">
        <section
          className={`stage ${(zo = node == null ? void 0 : node.tags) != null && zo.includes("dedication") ? "dedication-stage" : ""}`}
          onClick={advance}
        >
          {((Io = node == null ? void 0 : node.tags) == null
            ? void 0
            : Io.includes("dedication")) && (
            <PresentationHost
              project={project}
              mode="dedication"
              pageIndex={view.line}
              time={0}
              onSkip={advance}
            />
          )}
          <img
            className="scene-image"
            src={
              project
                ? resolveScene(project, section.title)
                : resolveScene(project, "")
            }
            alt="场景插图"
            onError={(f) => {
              f.currentTarget.style.display = "none";
            }}
          />
          {!nodeDone && characterLayers.length > 0 && (
            <CharacterStage
              project={project}
              layers={characterLayers}
              activeCharacterId={line == null ? void 0 : line.characterId}
              line={line}
              resolveAsset={(f) => gameAsset(f, project)}
              lipSync={{
                mode: "text",
                textRate: 9,
              }}
            />
          )}
          <div className="scene-vignette" />
          <div className="scene-caption">
            <span>{project?.title || "MAGICKISA"}</span>
            <strong>{section.title.replace(/^【|】$/g, "")}</strong>
          </div>
          <div className="dialogue-box">
            <div className="speaker">
              {line?.speaker || node?.speaker || "旁白"}
            </div>
            <div className="dialogue-text">
              {nodeDone ? (
                choices.length ? (
                  <div className="choice-list">
                    {choices.map((f) => (
                      <button
                        onClick={(g) => {
                          (g.stopPropagation(), choose(f));
                        }}
                        key={f.key}
                      >
                        <b>{f.key}</b>
                        <span>{f.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="continue-card">
                    {"这一节点暂告一段落。"}
                    <small>{"点击或按 Space 继续"}</small>
                  </span>
                )
              ) : (
                <span className="line-in" key={`${view.index}-${view.line}`}>
                  {lineTexts[view.line]}
                </span>
              )}
            </div>
            {!nodeDone && line?.input && (
              <label
                className="story-input"
                onClick={(event) => event.stopPropagation()}
              >
                {line.input.label || "请输入"}
                <input
                  aria-label={line.input.label || "请输入"}
                  maxLength={line.input.maxLength ?? 80}
                  value={
                    typeof view.flags[line.input.key] === "string"
                      ? view.flags[line.input.key]
                      : ""
                  }
                  onChange={(event) => {
                    const store = engineStoreRef.current;
                    if (!store) return;
                    store.runtime.save = {
                      ...store.runtime.save,
                      variables: {
                        ...store.runtime.save.variables,
                        [line.input.key]: event.target.value,
                      },
                    };
                    store.emit(store.runtime.save);
                    setView((v) => syncView(v, store.runtime.save));
                  }}
                />
              </label>
            )}
            <div className="advance-mark">
              {nodeDone && !choices.length ? "›" : "▼"}
            </div>
          </div>
        </section>
        <footer className="stage-footer">
          <button
            title="上一句"
            onClick={(f) => {
              (f.stopPropagation(), rollbackOne());
            }}
            disabled={view.index === 0 && view.line === 0}
          >
            <ChevronLeft size={18} />
            {" 上一句"}
          </button>
          <span>
            {nodeDone ? "节点结束" : `${view.line + 1} / ${lineTexts.length}`}
          </span>
          <button
            title="下一句"
            onClick={(f) => {
              (f.stopPropagation(), advance());
            }}
          >
            {"继续 "}
            <ChevronRight size={18} />
          </button>
        </footer>
        <section className="notebook-strip">
          <FileText size={16} />
          <span>{"旅者笔记"}</span>
          <input
            aria-label="旅者笔记"
            value={view.notes}
            onChange={(f) => setPlayerNotes(f.target.value)}
            placeholder="写下你的推理……"
          />
        </section>
      </main>
      {chapterMenuOpen && (
        <div className="drawer-backdrop" onClick={() => setChapterMenuOpen(!1)}>
          <aside
            className="chapter-drawer"
            onClick={(f) => f.stopPropagation()}
          >
            <div className="drawer-head">
              <strong>{"章节目录"}</strong>
              <button title="关闭目录" onClick={() => setChapterMenuOpen(!1)}>
                <X size={18} />
              </button>
            </div>
            <div className="drawer-search">
              <Search size={15} />
              <input
                value={chapterSearch}
                onChange={(f) => setChapterSearch(f.target.value)}
                placeholder="搜索章节或正文"
              />
            </div>
            <div className="chapter-grid">
              {visibleChapters.map(({ s: f, i: g }) => (
                <button
                  className={g === view.index ? "selected" : ""}
                  onClick={() => jumpToSection(g)}
                  key={g}
                >
                  <small>{String(g - 5).padStart(2, "0")}</small>
                  <span>{f.title.replace(/^【|】$/g, "")}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
      {notice && (
        <div className="unlock-notice" role="status">
          {notice}
        </div>
      )}
      {settingsOpen && (
        <div className="drawer-backdrop" onClick={() => setSettingsOpen(!1)}>
          <aside
            className="settings-panel"
            onClick={(f) => f.stopPropagation()}
          >
            <div className="drawer-head">
              <strong>{"演出设置"}</strong>
              <button title="关闭设置" onClick={() => setSettingsOpen(!1)}>
                <X size={18} />
              </button>
            </div>
            <label>
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(f) => {
                  (setAutoAdvance(f.target.checked),
                    f.target.checked && setFastForward(!1));
                }}
              />
              {" 自动播放"}
            </label>
            <label>
              <input
                type="checkbox"
                checked={fastForward}
                onChange={(f) => {
                  (setFastForward(f.target.checked),
                    f.target.checked && setAutoAdvance(!1));
                }}
              />
              {" 快进已读文本"}
            </label>
            <label>
              音量{" "}
              <input
                aria-label="音量"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={currentAudio.volume}
                onChange={(e) =>
                  setAudioSettings({ volume: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={currentAudio.muted}
                onChange={(e) => setAudioSettings({ muted: e.target.checked })}
              />
              静音
            </label>
            <p>
              {"快捷键：Space / 右方向键继续，左方向键回退，Esc 关闭面板。"}
            </p>
          </aside>
        </div>
      )}
      {activePanel === "history" && (
        <div
          className="backlog"
          onClick={() => {
            (setActivePanel(null), setPendingRestore(null));
          }}
        >
          <div className="backlog-shell" onClick={(f) => f.stopPropagation()}>
            <header>
              <div>
                <small>{"BACKLOG"}</small>
                <strong>{"历史回想"}</strong>
              </div>
              <button
                title="关闭面板"
                onClick={() => {
                  (setActivePanel(null), setPendingRestore(null));
                }}
              >
                <X size={20} />
              </button>
            </header>
            <div className="backlog-scroll" ref={backlogRef}>
              {view.history.length ? (
                view.history.map((f, g) => (
                  <article
                    className={pendingRestore === g ? "restore-pending" : ""}
                    key={`${g}-${f.text}`}
                  >
                    <div>
                      <b>{f.speaker}</b>
                      <small>{f.section}</small>
                    </div>
                    <p>{f.text}</p>
                    <button
                      className="restore-button"
                      onClick={() => restoreHistory(f, g)}
                    >
                      {pendingRestore === g ? "再次点击，返回这里" : "返回这里"}
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty-material">{"尚未产生可回看的台词。"}</p>
              )}
            </div>
            <footer>
              {"滚轮浏览 · 悬停台词边缘可返回 · 点击右上角返回故事"}
            </footer>
          </div>
        </div>
      )}
      {activePanel && activePanel !== "history" && (
        <div className="drawer-backdrop" onClick={() => setActivePanel(null)}>
          <aside
            className="material-panel"
            onClick={(f) => f.stopPropagation()}
          >
            <div className="drawer-head">
              <strong>
                {activePanel === "music"
                  ? labels.music || "音乐鉴赏"
                  : activePanel === "encyclopedia"
                    ? "《阿努拉志》百科"
                    : activePanel === "newspaper"
                      ? "报刊"
                      : activePanel === "notes"
                        ? "旅者笔记"
                        : "证据与线索"}
              </strong>
              <button title="关闭面板" onClick={() => setActivePanel(null)}>
                <X size={18} />
              </button>
            </div>
            {activePanel === "music" ? (
              <div className="material-list">
                {(media.musicGallery || [])
                  .filter((track) =>
                    isMusicAvailable(
                      track,
                      engineStoreRef.current?.runtime.save,
                    ),
                  )
                  .map((track) => (
                    <article key={track.id || track.src}>
                      <h3>{track.title}</h3>
                      <GalleryAudio
                        src={track.src}
                        audio={currentAudio}
                        volume={
                          project.audio?.find((a) => a.src === track.src)
                            ?.volume
                        }
                      />
                    </article>
                  ))}
                {!(media.musicGallery || []).some((track) =>
                  isMusicAvailable(track, engineStoreRef.current?.runtime.save),
                ) && <p>尚未解锁曲目。</p>}
              </div>
            ) : activePanel === "notes" ? (
              <div className="notes-modal">
                {materialsByCategory.notes.map((m) => (
                  <article key={m.id}>
                    <h3>{m.title}</h3>
                    <p>{m.body}</p>
                  </article>
                ))}
                {(engineStoreRef.current?.runtime.save.notes || []).map(
                  (note, index) => (
                    <p key={index}>{note}</p>
                  ),
                )}
                <textarea
                  aria-label="旅者笔记"
                  value={view.notes}
                  onChange={(f) => setPlayerNotes(f.target.value)}
                  placeholder="写下你的推理……"
                />
              </div>
            ) : (
              <div className="material-list">
                {materialsByCategory[activePanel].map((f, g) => (
                  <article key={`${f.title}-${g}`}>
                    <h3>{f.title.replace(/^【|】$/g, "")}</h3>
                    <p>{f.body}</p>
                  </article>
                ))}
                {materialsByCategory[activePanel].length === 0 && (
                  <p className="empty-material">{"尚未解锁内容。"}</p>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
      {settingsOpen && (
        <label className="music-setting-float">
          <input
            type="checkbox"
            checked={showMusicLabel}
            onChange={(f) => {
              (setShowMusicLabel(f.target.checked),
                localStorage.setItem(
                  "magickisa:music-label",
                  f.target.checked ? "on" : "off",
                ));
            }}
          />
          {" 显示当前音乐名"}
        </label>
      )}
    </div>
  );
}
