import { describeError } from "../engine/errors";
import { InterfaceSettings } from "./InterfaceSettings";
import { requireModernProject } from "../engine/support";
import {
  changeRecord,
  applyPatches,
  appendHistory,
  type EditRecord,
} from "../authoring/history";
import { jsonEqual } from "../engine/condition";
import {
  ProjectManager,
  studioRequest,
  studioUrl,
  workspaceId,
  type WorkspaceItem,
} from "./ProjectManager";
import {
  WorkspaceContext,
  preference,
  reveal,
  resolvePosition,
  useEditorNavigation,
  useSequenceKeys,
} from "./workspace";
import type { EditorPosition } from "./workspace";
import {
  destinations,
  usages,
  sectionNames,
  sceneDeletionReferences,
} from "./discovery";
import { DiscoveryPanels } from "./DiscoveryPanels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import brand from "./brand.svg";
import wordmark from "./wordmark.svg";
import {
  CommandPalette,
  Fold,
  Modal,
  MoreActions,
  ResizeHandle,
  StatusBar,
} from "./components";
import { AssetPickerProvider } from "./AssetPicker";
import {
  defaultLayout,
  readLayout,
  listDrafts,
  putDraft,
  removeDraft,
  tabId,
  activeTabs,
  initializePreferences,
  preferenceNamespace,
  preferenceScope,
} from "./storage";
import type { Draft, Layout } from "./storage";
import { SceneTree } from "./SceneTree";
import {
  BookOpen,
  GitBranch,
  Clapperboard,
  Images,
  Users,
  Library,
  Settings,
  Code2,
  Package,
  Save,
  Undo2,
  Redo2,
  Play,
  Plus,
  Search,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  RefreshCw,
} from "lucide-react";
import type { AuthorProject, Profile, Section } from "./model";
import { newNode, copy, uniqueId } from "./model";
import { Card, Field, Check, JsonField } from "./fields";
import { ScriptEditor } from "./ScriptEditor";
import { GraphEditor } from "./GraphCanvas";
import { useStudioData } from "./useStudioData";
import { InvestigationPanel } from "./InvestigationPanel";
import { TargetPicker } from "./TargetPicker";
import { presetSave, type TestPreset } from "./investigationModel";
import type { EngineSave } from "../engine/types";
import { PresentationEditor } from "./PresentationEditor";
import { ProjectDetails } from "./ProjectDetails";
import { ProductionPanel } from "./ProductionPanel";
import { SequenceEditor } from "./SequenceEditor";
import { BackupPanel } from "./BackupPanel";
import { VariableRename } from "./VariableRename";
import { PreviewRecorder } from "./PreviewRecorder";
import type { PresentationMode } from "./PresentationEditor";
import { AssetEditor, CharacterEditor, MaterialEditor } from "./LibraryEditors";
import type { AssetFile } from "./LibraryEditors";
import "./studio.css";
import "./brand.css";
import "./usability.css";
const tabs = [
  ["investigation", "变量与线索", Search],
  ["script", "剧本", BookOpen],
  ["graph", "流程图", GitBranch],
  ["presentations", "演出", Clapperboard],
  ["assets", "资源", Images],
  ["characters", "人物", Users],
  ["materials", "资料", Library],
  ["project", "工程", Settings],
  ["json", "JSON", Code2],
  ["publish", "发行", Package],
] as const;
interface PreviewData {
  testState?: EngineSave;
  sectionLevels?: Record<string, number>;
  project: AuthorProject;
  profile: Profile;
  nodeId: string;
  line: number;
  mode: "scene" | PresentationMode;
  pageIndex: number;
  time: number;
}
interface BuildJob {
  id?: string;
  status: string;
  log: string;
  output?: string;
  profile?: Profile;
}
const request = studioRequest;
export function Studio() {
  const leavingWorkspace = useRef(false);
  const [managerOpen, setManagerOpen] = useState(() => !workspaceId());
  const [pendingWorkspace, setPendingWorkspace] =
    useState<WorkspaceItem | null>(null);
  const profile: Profile = "modern";
  const [project, setProject] = useState<AuthorProject | null>(null),
    [saved, setSaved] = useState(""),
    [sectionLevels, setSectionLevels] = useState<Record<string, number>>({}),
    [revision, setRevision] = useState(""),
    [section, setSection] = useState<Section>("script"),
    [selected, setSelected] = useState(""),
    [lineIndex, setLine] = useState(0),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [past, setPast] = useState<EditRecord[]>([]),
    [future, setFuture] = useState<EditRecord[]>([]),
    [files, setFiles] = useState<AssetFile[]>([]),
    [raw, setRaw] = useState(""),
    [rawBase, setRawBase] = useState(""),
    [preview, setPreview] = useState<PreviewData | null>(null),
    [previewVisible, setPreviewVisible] = useState(
      () => window.innerWidth > 1050,
    ),
    [mode, setMode] = useState<PresentationMode>("opening"),
    [time, setTimeState] = useState(0),
    [previewSize, setPreviewSize] = useState("desktop"),
    [previewLarge, setPreviewLarge] = useState(false),
    [playing, setPlaying] = useState(false),
    [runtime, setRuntime] = useState<unknown>(null),
    [buildBase, setBuildBase] = useState("/"),
    [job, setJob] = useState<BuildJob>({
      status: "idle",
      log: "",
    });
  const [layout, setLayout] = useState<Layout>(() => readLayout(profile));
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [recovery, setRecovery] = useState<Draft[]>([]);
  const [draftState, setDraftState] = useState("草稿无需保留");
  const [issues, setIssues] = useState<
    {
      severity: string;
      message: string;
      nodeId?: string;
      lineId?: string;
      field?: string;
      position?: EditorPosition;
      path?: (string | number)[];
    }[]
  >([]);
  const [events, setEvents] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [validated, setValidated] = useState("");
  const loadedProfile = useRef<Profile | null>(null);
  const draftKey = useRef("");
  const sourceId = useRef("");
  const editGroup = useRef<{
    field: Element | null;
    at: number;
  }>({
    field: null,
    at: 0,
  });
  const previewAction = useRef<() => void>(() => {});
  const saving = useRef(false);
  const activeUpload = useRef<XMLHttpRequest>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const frameBox = useRef<HTMLDivElement>(null),
    iframe = useRef<HTMLIFrameElement>(null),
    ready = useRef(false),
    previewRef = useRef(preview),
    projectRef = useRef(project),
    saveRef = useRef<() => Promise<string | undefined>>(async () => undefined);
  previewRef.current = preview;
  projectRef.current = project;
  const rawDirty = raw !== rawBase;
  const savedProject = useMemo(
    () => (saved ? (JSON.parse(saved) as AuthorProject) : null),
    [saved],
  );
  const dirty = !!project && (!jsonEqual(project, savedProject) || rawDirty);
  const node =
    project?.nodes.find((n) => n.id === selected) || project?.nodes[0];
  const scope =
    project && loadedProfile.current === profile
      ? preferenceScope(profile, sourceId.current || project.id)
      : "";
  const sequences = useSequenceKeys(scope, project);
  const authoring = useStudioData(scope);
  const [items, setItems] = useState<Record<string, string>>({});
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const discovery = useMemo(
    () => (project ? destinations(project, files) : []),
    [project, files],
  );
  const references = useMemo(() => (project ? usages(project) : []), [project]);
  useEffect(() => {
    setItems({});
    setHelpOpen(false);
    setUsageOpen(false);
    const ids = preference<unknown>(`magickisa:recent:${scope}`, []);
    setRecentIds(
      Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string").slice(0, 10)
        : [],
    );
  }, [scope]);
  const effectiveItems = {
    characters: project?.characters[0]?.id || "",
    materials: project?.materials[0]?.id || "",
    ...items,
  };
  const position: EditorPosition = {
    section,
    nodeId: node?.id,
    lineId: node?.lines[lineIndex]?.id,
    mode,
    items: effectiveItems,
  };
  function applyPosition(requested: EditorPosition) {
    if (!project) return;
    setNavigationVersion((value) => value + 1);
    const { position: target, missing } = resolvePosition(
      project,
      requested,
      files,
      sequences,
    );
    if (missing) setNotice("目标已删除，已返回所属列表或可用场景。");
    if (target.section === "json" && !rawDirty) {
      const text = JSON.stringify(project, null, 2);
      setRaw(text);
      setRawBase(text);
    }
    setSection(target.section);
    if (target.nodeId) {
      setSelected(target.nodeId);
      const targetNode = project.nodes.find((n) => n.id === target.nodeId);
      setLine(
        Math.max(
          0,
          targetNode?.lines.findIndex((l) => l.id === target.lineId) ?? 0,
        ),
      );
    }
    setItems(target.items);
    if (target.mode) setMode(target.mode);
    setSearch("");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(".st-content [aria-label]"),
        );
        let input = target.selector
          ? document
              .querySelector(".st-content")
              ?.querySelector<HTMLElement>(target.selector) || undefined
          : target.field
            ? candidates.find(
                (e) => e.getAttribute("aria-label") === target.field,
              )
            : undefined;
        if (!input && target.field) {
          const heading = Array.from(
            document.querySelectorAll<HTMLElement>(
              ".st-content summary,.st-content h3,.st-content h2,.st-content strong",
            ),
          ).find((e) => e.textContent?.includes(target.field!));
          if (heading) {
            heading.tabIndex = -1;
            input = heading;
          }
        }
        if (!input && target.field?.startsWith("分支:")) {
          const [, id, part] = target.field.split(":");
          const branch = Array.from(
            document.querySelectorAll<HTMLElement>("[data-branch-id]"),
          ).find((e) => e.dataset.branchId === id);
          input = part
            ? branch?.querySelector<HTMLElement>("details summary") || input
            : branch?.querySelector<HTMLElement>("select") || input;
        }
        if (!input && target.lineId && target.section === "script")
          input =
            Array.from(document.querySelectorAll<HTMLElement>("[data-line-id]"))
              .find((e) => e.dataset.lineId === target.lineId)
              ?.querySelector<HTMLElement>("textarea") || undefined;
        const item = target.items[target.section];
        if (!input && item)
          input = Array.from(
            document.querySelectorAll<HTMLElement>("[data-entity-id]"),
          ).find((e) => e.dataset.entityId === item);
        if (!input)
          input =
            document.querySelector<HTMLElement>(
              ".st-content input,.st-content textarea,.st-content button",
            ) || undefined;
        if (input) reveal(input);
      }),
    );
  }
  const navigation = useEditorNavigation(scope, position, applyPosition);
  function remember(id: string) {
    const ids = [id, ...recentIds.filter((x) => x !== id)].slice(0, 10);
    setRecentIds(ids);
    try {
      localStorage.setItem(`magickisa:recent:${scope}`, JSON.stringify(ids));
    } catch {
      setNotice("偏好未保存：浏览器存储不可用，最近使用仅在本次会话有效。");
    }
  }
  function visit(target: EditorPosition, id?: string) {
    applyPosition({
      ...position,
      ...target,
      lineId: target.nodeId ? target.lineId : position.lineId,
      items: {
        ...effectiveItems,
        ...target.items,
      },
    });
    if (id) remember(id);
  }
  const visitedId =
    section === "script"
      ? node?.lines[lineIndex]?.id
        ? `line:${node.id}:${node.lines[lineIndex].id}`
        : `scene:${node?.id}`
      : section === "characters"
        ? `character:${effectiveItems.characters}`
        : section === "materials"
          ? `material:${effectiveItems.materials}`
          : section === "assets"
            ? `asset:${items.assets}`
            : "";
  useEffect(() => {
    if (scope && discovery.some((d) => d.id === visitedId)) remember(visitedId);
  }, [scope, visitedId]);
  async function restoreDraft(d: Draft) {
    try {
      await putDraft({
        ...d,
        key: draftKey.current,
        sourceId: sourceId.current,
        tab: tabId,
        updatedAt: Date.now(),
      });
      if (d.key !== draftKey.current) await removeDraft(d.key);
      if (!workspaceId())
        sessionStorage.removeItem(`magickisa-studio-draft:${profile}`);
    } catch (e) {
      setDraftState(`草稿保留失败：${describeError(e)}；原草稿仍保留。`);
    }
    setProject(d.project);
    setPast([]);
    setFuture([]);
    editGroup.current = {
      field: null,
      at: 0,
    };
    setSaved(d.saved);
    setRevision(d.revision);
    setRaw(d.raw);
    setRawBase(d.rawBase);
    setRecovery([]);
    setNotice("草稿已恢复；保存时会检查文件冲突。");
  }
  async function discardDraft(d: Draft) {
    try {
      await removeDraft(d.key);
      if (!workspaceId())
        sessionStorage.removeItem(`magickisa-studio-draft:${profile}`);
      setRecovery((list) => list.filter((x) => x.key !== d.key));
    } catch (e) {
      setError(`无法丢弃草稿：${describeError(e)}`);
    }
  }
  const refreshAssets = useCallback(async () => {
    try {
      setFiles((await request(profile, "assets")).files);
    } catch (e) {
      setError(describeError(e));
    }
  }, [profile]);
  const load = useCallback(
    async (restoreDraft = true) => {
      setBusy(true);
      setError("");
      try {
        const data = await request(profile, "project");
        setValidated("");
        loadedProfile.current = null;
        let cached: string | null = null;
        try {
          if (restoreDraft && !workspaceId())
            cached = sessionStorage.getItem(
              `magickisa-studio-draft:${profile}`,
            );
          else if (!workspaceId())
            sessionStorage.removeItem(`magickisa-studio-draft:${profile}`);
        } catch (e) {
          setDraftState(`旧草稿存储不可用：${describeError(e)}`);
        }
        await initializePreferences();
        const preferences = readLayout(profile);
        setLayout(preferences);
        setSection(preferences.section);
        setPreviewVisible(preferences.preview && window.innerWidth > 1050);
        const sourceKey = workspaceId() || data.project.id;
        draftKey.current = `${profile}:${sourceKey}:${tabId}`;
        sourceId.current = sourceKey;
        try {
          const active = await activeTabs();
          const candidates = (await listDrafts())
            .filter(
              (d) =>
                d.profile === profile &&
                (d.sourceId
                  ? d.sourceId === sourceKey
                  : !workspaceId() && d.project.id === data.project.id) &&
                !active.has(d.tab),
            )
            .sort((a, b) => b.updatedAt - a.updatedAt);
          if (cached)
            candidates.unshift({
              ...JSON.parse(cached),
              profile,
              tab: tabId,
              key: `legacy:${profile}`,
              updatedAt: Date.now(),
            });
          if (restoreDraft) setRecovery(candidates);
          else {
            await removeDraft(draftKey.current);
            setRecovery([]);
          }
        } catch (e) {
          setDraftState(`草稿存储不可用：${describeError(e)}`);
        }
        const p = data.project as AuthorProject;
        setSectionLevels(data.sectionLevels || {});
        setProject(p);
        setSaved(JSON.stringify(p));
        setRevision(data.revision);
        setRaw(JSON.stringify(p, null, 2));
        setRawBase(JSON.stringify(p, null, 2));
        setPast([]);
        setFuture([]);
        const id = new URLSearchParams(location.search).get("node");
        if (id) setSection("script");
        const start =
          id && p.nodes.some((n) => n.id === id)
            ? id
            : p.nodes.some((n) => n.id === preferences.node)
              ? preferences.node
              : p.startNodeId;
        setSelected(start);
        setLine(0);
        setPreview({
          sectionLevels: data.sectionLevels,
          project: copy(p),
          profile,
          nodeId: start,
          line: 0,
          mode: "scene",
          pageIndex: 0,
          time: 0,
        });
        setNotice("工程已加载。");
        void refreshAssets();
        loadedProfile.current = profile;
      } catch (e) {
        setError(describeError(e));
      } finally {
        setBusy(false);
      }
    },
    [profile, refreshAssets],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const query = matchMedia("(max-width:1050px)");
    const change = () => {
      if (query.matches) {
        setPreviewVisible(false);
        setPreviewLarge(false);
      }
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!project || loadedProfile.current !== profile || recovery.length)
      return;
    if (dirty) setDraftState("草稿保留中…");
    const key = draftKey.current;
    const timer = setTimeout(() => {
      const op = dirty
        ? putDraft({
            key,
            sourceId: sourceId.current,
            profile,
            project,
            saved,
            revision,
            raw,
            rawBase,
            updatedAt: Date.now(),
            tab: tabId,
          })
        : removeDraft(key);
      void op
        .then(() => setDraftState(dirty ? "✓ 草稿已保留" : "草稿无需保留"))
        .catch((e) => setDraftState(`草稿保留失败：${describeError(e)}`));
    }, 500);
    return () => clearTimeout(timer);
  }, [project, saved, revision, raw, rawBase, profile, dirty, recovery]);
  useEffect(() => {
    if (loadedProfile.current !== profile) return;
    try {
      localStorage.setItem(
        `magickisa:layout:${preferenceNamespace(profile)}`,
        JSON.stringify({
          ...layout,
          section,
          node: selected,
          preview: previewVisible,
        }),
      );
    } catch {
      setDraftState("布局偏好未保存：浏览器存储不可用");
    }
  }, [layout, section, selected, previewVisible, profile]);
  useEffect(() => {
    if (!notice) return;
    setEvents((list) => [notice, ...list].slice(0, 20));
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if ((dirty || authoring.dirty) && !leavingWorkspace.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty, authoring.dirty]);
  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        e.source !== iframe.current?.contentWindow
      )
        return;
      const data = e.data;
      if (data.type === "studio:ready") {
        ready.current = true;
        const p = previewRef.current;
        if (p)
          iframe.current?.contentWindow?.postMessage(
            {
              type: "studio:load",
              ...p,
            },
            location.origin,
          );
      }
      if (data.type === "studio:state") setRuntime(data.save);
      if (data.type === "studio:error") setError(`预览：${data.error}`);
      if (data.type === "studio:notice") setNotice(data.error);
      if (data.type === "studio:time") setTimeState(data.time);
      if (data.type === "studio:skip") {
        setPlaying(false);
        setNotice("演出预览已结束。");
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
  useEffect(() => {
    if (preview && ready.current)
      iframe.current?.contentWindow?.postMessage(
        {
          type: "studio:load",
          ...preview,
        },
        location.origin,
      );
  }, [preview]);
  useEffect(() => {
    ready.current = false;
  }, [profile]);
  useEffect(() => {
    const box = frameBox.current;
    if (!box) return;
    const resize = () => {
      const width = previewSize === "mobile" ? 390 : 1440,
        height = previewSize === "mobile" ? 844 : 900;
      const scale = box.clientWidth / width;
      box.style.height = `${height * scale}px`;
      const frame = iframe.current;
      if (frame) {
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
        frame.style.transform = `scale(${scale})`;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    resize();
    return () => observer.disconnect();
  }, [previewSize, previewVisible, profile]);
  useEffect(() => {
    if (job.status !== "running") return;
    const timer = setInterval(() => {
      void request(profile, "build")
        .then(setJob)
        .catch((e) => setError(describeError(e)));
    }, 1000);
    return () => clearInterval(timer);
  }, [job.status, profile]);
  function edit(next: AuthorProject) {
    if (!project) return;
    const field = document.activeElement;
    const typing =
      field instanceof HTMLTextAreaElement ||
      (field instanceof HTMLInputElement &&
        !["checkbox", "file", "range"].includes(field.type));
    const now = Date.now();
    const record = changeRecord(project, next);
    if (!record.forward.length) return;
    const merge =
      typing &&
      editGroup.current.field === field &&
      now - editGroup.current.at <= 800;
    const history = appendHistory(past, record, merge);
    setPast(history.history);
    if (history.dropped)
      setNotice("撤销记录达到 200 步或 64 MiB 上限，最早记录已释放。");
    editGroup.current = {
      field: typing ? field : null,
      at: now,
    };
    setFuture([]);
    setProject(next);
    setError("");
  }
  function mutate(fn: (p: AuthorProject) => void) {
    if (!project) return;
    const p = copy(project);
    fn(p);
    edit(p);
  }
  function undo() {
    editGroup.current = {
      field: null,
      at: 0,
    };
    if (!past.length || !project) return;
    const record = past[past.length - 1];
    setFuture([record, ...future]);
    restoreEdit(applyPatches(project, record.backward));
    setPast(past.slice(0, -1));
  }
  function redo() {
    editGroup.current = {
      field: null,
      at: 0,
    };
    if (!future.length || !project) return;
    setPast(appendHistory(past, future[0]).history);
    restoreEdit(applyPatches(project, future[0].forward));
    setFuture(future.slice(1));
  }
  function restoreEdit(next: AuthorProject) {
    const target =
      next.nodes.find((n) => n.id === selected) ||
      next.nodes.find((n) => n.id === next.startNodeId) ||
      next.nodes[0];
    const lineId = node?.lines[lineIndex]?.id;
    const found = target?.lines.findIndex((l) => l.id === lineId) ?? -1;
    setSelected(target?.id || "");
    setLine(
      found >= 0
        ? found
        : Math.max(0, Math.min(lineIndex, (target?.lines.length || 1) - 1)),
    );
    setProject(next);
  }
  async function validate(p = project) {
    if (!p) return false;
    try {
      const validation = await request(profile, "validate", {
        project: p,
      });
      setValidated(JSON.stringify(p));
      setIssues(
        (validation.issues || []).filter(
          (i: { severity: string }) => i.severity === "error",
        ),
      );
      setWarnings(validation.warnings || []);
      setError("");
      setNotice("校验通过：剧本、跳转引用和资源均可用。");
      return true;
    } catch (e) {
      setIssues(
        (
          e as {
            issues?: typeof issues;
          }
        ).issues || [],
      );
      setValidated("");
      setError(describeError(e));
      return false;
    }
  }
  async function save(withAuthoring = false) {
    if (!project || saving.current || busy || job?.status === "running") return;
    if (rawDirty) {
      setError("请先在 JSON 工作区应用修改，再保存工程。");
      return;
    }
    if (withAuthoring && (!authoring.ready || authoring.busy)) {
      setError("创作资料尚未读取或正在保存，请稍后重试。");
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const data = await request(profile, "project", {
        project,
        revision,
        ...(withAuthoring
          ? {
              studioUpdate: {
                data: authoring.data,
                revision: authoring.revision,
              },
            }
          : {}),
      });
      if (data.studio)
        authoring.acceptSaved(data.studio.data, data.studio.revision);
      setSaved(JSON.stringify(project));
      setRevision(data.revision);
      setValidated(JSON.stringify(project));
      setNotice(`已保存到工程。备份：${data.backup}`);
      setError("");
      return data.revision as string;
    } catch (e) {
      setError(describeError(e));
      return undefined;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  saveRef.current = save;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandsOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        previewAction.current();
        return;
      }
      if (e.key === "Escape") {
        setCommandsOpen(false);
        setPreviewLarge(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function runPreset(preset: TestPreset) {
    if (!project || !(await validate())) return;
    try {
      const testState = presetSave(project, preset);
      select(preset.nodeId);
      setPreviewVisible(true);
      setPlaying(false);
      setRuntime(null);
      setPreview({
        project: copy(project),
        profile,
        nodeId: preset.nodeId,
        line: 0,
        mode: "scene",
        pageIndex: 0,
        time: 0,
        testState,
      });
    } catch (e) {
      setError(describeError(e));
    }
  }
  async function runPreview(
    previewMode: PreviewData["mode"] = "scene",
    pageIndex = 0,
  ) {
    if (!project || !node || !(await validate())) return;
    setPreviewVisible(true);
    setPlaying(false);
    setRuntime(null);
    setPreview({
      sectionLevels,
      project: copy(project),
      profile,
      nodeId: node.id,
      line: lineIndex,
      mode: previewMode,
      pageIndex,
      time,
    });
  }
  previewAction.current = () =>
    void runPreview(section === "presentations" ? mode : "scene");
  function select(id: string) {
    setSelected(id);
    setLine(0);
  }
  function showJson() {
    if (project && !rawDirty) {
      const text = JSON.stringify(project, null, 2);
      setRaw(text);
      setRawBase(text);
    }
    setSection("json");
  }
  function exportProject() {
    if (!project) return;
    if (rawDirty) {
      setError("JSON 有未应用修改，请先应用再导出。");
      setSection("json");
      return;
    }
    const link = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(project, null, 2) + "\n"], {
          type: "application/json",
        }),
      );
    link.href = url;
    link.download = `${project.id}-${profile}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("已导出当前草稿。");
  }
  async function importProject(file: File) {
    try {
      const p = JSON.parse(await file.text());
      requireModernProject(p);
      if (await validate(p)) {
        edit(p);
        setSelected(p.startNodeId);
        setLine(0);
        setRaw(JSON.stringify(p, null, 2));
        setRawBase(JSON.stringify(p, null, 2));
        setNotice("已导入草稿，保存后写入当前工程。");
      }
    } catch (e) {
      setError(describeError(e));
    }
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      if (file.size > 512 * 1024 * 1024)
        throw new Error("单个资源导入上限为 512 MiB。");
      const data = await new Promise<{ url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeUpload.current = xhr;
        setUploadProgress(0);
        xhr.open(
          "POST",
          studioUrl(profile, "assets/upload") +
            "&name=" +
            encodeURIComponent(file.name),
        );
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onerror = () => reject(new Error("素材上传网络失败"));
        xhr.onabort = () => reject(new Error("素材上传已取消"));
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 400) reject(new Error(data.error || "上传失败"));
            else resolve(data);
          } catch (e) {
            reject(e);
          }
        };
        xhr.send(file);
      });
      setNotice(`资源已导入：${data.url}`);
      await refreshAssets();
      return data.url as string;
    } catch (e) {
      setError(describeError(e));
      throw e;
    } finally {
      activeUpload.current = undefined;
      setUploadProgress(null);
      setBusy(false);
    }
  }
  async function openWorkspace(item: WorkspaceItem) {
    leavingWorkspace.current = true;
    await removeDraft(draftKey.current).catch(() => {});
    const url = new URL(location.href);
    url.searchParams.set("profile", item.profile);
    url.searchParams.delete("node");
    if (item.id.startsWith("builtin-")) url.searchParams.delete("workspaceId");
    else url.searchParams.set("workspaceId", item.id);
    location.assign(url.href);
  }
  function requestWorkspace(item: WorkspaceItem) {
    if (busy || job.status === "running") return;
    if (dirty || authoring.dirty) setPendingWorkspace(item);
    else openWorkspace(item);
  }
  function setTime(value: number) {
    setTimeState(value);
    iframe.current?.contentWindow?.postMessage(
      {
        type: "studio:time",
        time: value,
      },
      location.origin,
    );
  }
  async function build() {
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(buildBase)) {
      setError(
        "发行路径应为 / 或 /games/my-game/，仅使用字母、数字、下划线和短横线。",
      );
      return;
    }
    if (rawDirty) {
      setError("请先应用 JSON 修改，再构建。");
      setSection("json");
      return;
    }
    if (!(await validate())) return;
    const rev = dirty ? await save() : revision;
    if (!rev) return;
    try {
      setJob(
        await request(profile, "build", {
          revision: rev,
          base: buildBase,
        }),
      );
      setError("");
    } catch (e) {
      setError(describeError(e));
    }
  }
  function deleteNode() {
    if (!node || !project) return;
    if (project.startNodeId === node.id) {
      setError("请先在工程设置中更换起始场景。");
      return;
    }
    const incoming = sceneDeletionReferences(project, node.id);
    if (incoming.length) {
      setError(
        `请先解除这些引用：${incoming.map((r) => `${r.label}（${r.field}）`).join("、")}。可通过“在哪里使用”定位。`,
      );
      setUsageOpen(true);
      return;
    }
    mutate((p) => {
      p.nodes = p.nodes.filter((n) => n.id !== node.id);
    });
    setSelected(project.startNodeId);
    setLine(0);
  }
  function cloneNode() {
    if (!node || !project) return;
    const clone = copy(node),
      id = newNode(project).id;
    clone.id = id;
    clone.title += " · 副本";
    clone.lines = clone.lines.map((l, i) => ({
      ...l,
      id: `${id}-line-${i}`,
    }));
    clone.choices = clone.choices?.map((c, i) => ({
      ...c,
      id: `${id}-choice-${i}`,
    }));
    const remap = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      const obj = value as Record<string, unknown>;
      if (obj.type === "visited" && obj.nodeId === node.id) obj.nodeId = id;
      Object.values(obj).forEach(remap);
    };
    if (clone.next === node.id) clone.next = id;
    clone.choices?.forEach((c) => {
      if (c.target === node.id) c.target = id;
    });
    remap(clone.condition);
    clone.lines.forEach((l) => remap(l.condition));
    clone.choices?.forEach((c) => remap(c.condition));
    mutate((p) => p.nodes.push(clone));
    select(id);
  }
  const updateLayout = (patch: Partial<Layout>) =>
    setLayout((l) => ({
      ...l,
      ...patch,
    }));
  const resetLayout = () => {
    const l = defaultLayout();
    setLayout(l);
    setPreviewVisible(l.preview);
  };
  const locate = () => {
    setSearch("");
    updateLayout({
      collapsed: [],
      sidebar: true,
    });
    requestAnimationFrame(() =>
      document.querySelector(`[data-scene-id="${node?.id}"]`)?.scrollIntoView({
        block: "nearest",
      }),
    );
  };
  const commandItems = [
    ...(past.length
      ? [
          {
            id: "undo",
            label: "撤销工程修改",
            hint: "输入框外 Ctrl+Z；输入框内保留原生文字撤销",
            run: undo,
          },
        ]
      : []),
    ...(future.length
      ? [
          {
            id: "redo",
            label: "重做工程修改",
            hint: "输入框外 Ctrl+Y",
            run: redo,
          },
        ]
      : []),
    ...tabs.map(([id, label]) => ({
      id,
      label: `打开${label}`,
      run: () => {
        if (id === "json" && project && !rawDirty) {
          setRaw(JSON.stringify(project, null, 2));
          setRawBase(JSON.stringify(project, null, 2));
        }
        setSection(id);
      },
    })),
    {
      id: "save",
      label: "保存到工程",
      hint: "Ctrl+S",
      run: () => void save(),
    },
    {
      id: "preview",
      label: "应用到预览",
      hint: "Ctrl+Enter",
      run: () => previewAction.current(),
    },
    {
      id: "layout",
      label: "恢复默认布局",
      run: resetLayout,
    },
    ...discovery.map((d) => ({
      id: d.id,
      label: d.label,
      hint: d.hint,
      category: d.category,
      run: () => visit(d.position, d.id),
    })),
  ];
  const searchCommands = commandItems.map((c) => ({
    ...c,
    category: "category" in c ? String(c.category) : "操作",
  }));
  const recentCommands = recentIds
    .map((id) => searchCommands.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({
      ...c,
      id: `recent:${c.id}`,
      recent: true,
    }));
  const currentTab = tabs.find((t) => t[0] === section)!;
  const ActiveIcon = currentTab[2];
  const sourcePath = workspaceId()
    ? `workspace-projects/${workspaceId()}/project.json`
    : "workspace-projects/default-modern/project.json";
  return (
    <WorkspaceContext.Provider
      value={{
        scope,
        section,
        items: effectiveItems,
        setItem: (key, value) =>
          setItems((old) =>
            old[key] === value
              ? old
              : {
                  ...old,
                  [key]: value,
                },
          ),
        warning: setNotice,
        visitNode: (id) => {
          select(id);
          setItems((items) => ({ ...items, "graph-edge": "" }));
          if (section !== "graph") setSection("script");
        },
        sequences,
        navigationVersion,
      }}
    >
      <AssetPickerProvider files={files} profile={profile}>
        <div
          className={`studio-root ${previewVisible ? "" : "preview-closed"} ${layout.sidebar ? "" : "sidebar-closed"}`}
          data-section={section}
          style={
            {
              "--st-left": `${layout.left}px`,
              "--st-right": `${layout.right}px`,
            } as CSSProperties
          }
          onBlurCapture={() => {
            editGroup.current = {
              field: null,
              at: 0,
            };
          }}
        >
          <nav className="st-rail" aria-label="工作区">
            <a
              className="st-logo"
              href={`/engine.html?profile=${profile}${workspaceId() ? "&workspaceId=" + encodeURIComponent(workspaceId()) : ""}`}
              title="MAGICKISA"
            >
              <img src={brand} alt="MAGICKISA 星芒工坊" />
            </a>
            {tabs.map(([id, label, Icon]) => (
              <div key={id} className="st-nav-item">
                {["investigation", "assets", "project"].includes(id) && (
                  <small className="st-nav-group">
                    {id === "investigation"
                      ? "创作"
                      : id === "assets"
                        ? "资源"
                        : "工程"}
                  </small>
                )}
                <button
                  key={id}
                  disabled={!project || loadedProfile.current !== profile}
                  className={section === id ? "active" : ""}
                  onClick={() => {
                    if (id === "json" && project && !rawDirty) {
                      setRaw(JSON.stringify(project, null, 2));
                      setRawBase(JSON.stringify(project, null, 2));
                    }
                    setSection(id);
                  }}
                  title={label}
                  aria-label={label}
                >
                  <Icon size={21} />
                  <span>{label}</span>
                </button>
              </div>
            ))}
            <span className="st-rail-version">
              MK
              <br />
              2.0
            </span>
          </nav>
          <header className="st-topbar">
            <div className="st-brand">
              <span>
                <img
                  className="st-wordmark"
                  src={wordmark}
                  alt="MAGICKISA STUDIO"
                />
              </span>
              <div>
                <span className="st-muted">工作台</span>
                <ChevronRight size={13} />
                <strong>{project?.title || "载入工程…"}</strong>
              </div>
            </div>
            <div className="st-top-actions">
              <button
                aria-label="命令面板"
                title="快速前往 Ctrl+K"
                onClick={() => setCommandsOpen(true)}
              >
                <Search size={16} />
                <span className="st-command-label">快速前往</span>
                <kbd>⌃K</kbd>
              </button>
              <button
                className="st-project-manager-trigger"
                disabled={busy || job.status === "running"}
                onClick={() => setManagerOpen(true)}
              >
                项目与迁移
              </button>

              <span
                role="status"
                className={`st-save-state ${dirty ? "dirty" : ""}`}
              >
                {dirty ? "● 工程未保存" : "✓ 工程已保存"}
              </span>
              <button
                className="st-icon"
                title="撤销"
                aria-label="撤销"
                disabled={!past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="st-icon"
                title="重做"
                aria-label="重做"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </button>
              <button
                onClick={() => void validate()}
                disabled={!project || busy}
              >
                <CheckCircle2 size={16} />
                校验
              </button>
              <button
                className="primary"
                onClick={() => void save()}
                disabled={
                  !project || rawDirty || busy || job.status === "running"
                }
              >
                <Save size={16} />
                保存到工程
              </button>
            </div>
          </header>
          <aside className="st-sidebar">
            <ResizeHandle
              label="调整章节栏宽度"
              value={layout.left}
              onChange={(left) =>
                updateLayout({
                  left,
                })
              }
              min={200}
              max={380}
            />
            <div className="st-sidebar-heading">
              <span>故事资源管理器</span>
              <button
                title="添加场景"
                aria-label="添加场景"
                disabled={!project}
                onClick={() => {
                  if (!project) return;
                  const n = newNode(project);
                  mutate((p) => p.nodes.push(n));
                  select(n.id);
                  setSection("script");
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="st-search-wrap">
              <Search size={15} />
              <input
                aria-label="搜索场景"
                placeholder="搜索场景、台词…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="st-tree-meta">
              场景 <span>{project?.nodes.length || 0}</span>
              <small>
                {project?.nodes.reduce((n, s) => n + s.lines.length, 0) || 0}{" "}
                句台词
              </small>
            </div>
            <div className="st-node-tree">
              {project && (
                <SceneTree
                  nodes={project.nodes}
                  selected={node?.id || ""}
                  start={project.startNodeId}
                  levels={sectionLevels}
                  search={search}
                  collapsed={layout.collapsed}
                  onCollapse={(collapsed) =>
                    updateLayout({
                      collapsed,
                    })
                  }
                  onSelect={select}
                />
              )}
            </div>
            <div className="st-sidebar-footer">
              <span className="st-dot" /> 本机工程 <small>{"现代引擎"}</small>
            </div>
          </aside>
          <div className="st-workspace">
            <div className="st-contextbar">
              <span>
                <ActiveIcon size={16} />
                {currentTab[1]}
              </span>
              <div>
                <button
                  aria-label="切换章节栏"
                  onClick={() =>
                    updateLayout({
                      sidebar: !layout.sidebar,
                    })
                  }
                >
                  <BookOpen size={16} />
                </button>
                <button title="定位当前场景" onClick={locate}>
                  定位
                </button>
                <button
                  title="恢复默认布局"
                  aria-label="恢复默认布局"
                  onClick={resetLayout}
                >
                  <RefreshCw size={15} />
                </button>
                <details className="st-more">
                  <summary>高级操作（JSON，不含素材）</summary>
                  <div>
                    <button
                      onClick={exportProject}
                      disabled={!project || rawDirty}
                      title={
                        rawDirty ? "请先应用 JSON 修改" : "导出当前工程草稿"
                      }
                    >
                      <Download size={14} />
                      导出剧本
                    </button>
                    <label className="st-upload">
                      <Upload size={14} />
                      导入剧本
                      <input
                        aria-label="导入剧本"
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const input = e.currentTarget,
                            file = input.files?.[0];
                          if (file)
                            void importProject(file).finally(
                              () => (input.value = ""),
                            );
                        }}
                      />
                    </label>
                  </div>
                </details>
                <button
                  aria-label={previewVisible ? "收起预览" : "展开预览"}
                  onClick={() => setPreviewVisible(!previewVisible)}
                >
                  {previewVisible ? (
                    <PanelRightClose size={17} />
                  ) : (
                    <PanelRightOpen size={17} />
                  )}
                </button>
              </div>
            </div>
            <div className="st-feedback">
              {uploadProgress !== null && (
                <p role="status">
                  素材上传 {uploadProgress}%
                  <button onClick={() => activeUpload.current?.abort()}>
                    取消素材上传
                  </button>
                </p>
              )}
              {error && (
                <div className="st-error" role="alert">
                  <AlertCircle size={17} />
                  <pre>{error}</pre>
                  <button aria-label="关闭错误" onClick={() => setError("")}>
                    ×
                  </button>
                </div>
              )}
              <p role="status">
                <CheckCircle2 size={14} />
                {notice || "准备就绪"}
              </p>
            </div>
            <main className="st-content">
              {project && node && (
                <div className="st-scene-navigation">
                  <span>
                    {node.chapter || "当前场景"} / <strong>{node.title}</strong>
                  </span>
                  <div>
                    <button
                      aria-label="上一场景"
                      disabled={project.nodes.indexOf(node) === 0}
                      onClick={() =>
                        select(
                          project.nodes[project.nodes.indexOf(node) - 1].id,
                        )
                      }
                    >
                      ←
                    </button>
                    <button
                      aria-label="下一场景"
                      disabled={
                        project.nodes.indexOf(node) === project.nodes.length - 1
                      }
                      onClick={() =>
                        select(
                          project.nodes[project.nodes.indexOf(node) + 1].id,
                        )
                      }
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
              {!!warnings.length && (
                <details className="st-warning">
                  <summary>{warnings.length} 项提示 · 不阻止保存</summary>
                  {warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </details>
              )}
              {!!issues.length && (
                <div className="st-issues">
                  {issues.map((issue, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (rawDirty) {
                          setSection("json");
                          requestAnimationFrame(() => {
                            const input =
                              document.querySelector<HTMLTextAreaElement>(
                                '[aria-label="剧本 JSON"]',
                              );
                            if (input) {
                              input.focus();
                              const at = issue.nodeId
                                ? raw.indexOf(`"${issue.nodeId}"`)
                                : 0;
                              input.setSelectionRange(
                                Math.max(0, at),
                                Math.max(0, at) +
                                  (issue.nodeId?.length || 0) +
                                  2,
                              );
                            }
                          });
                          return;
                        }
                        if (issue.position) {
                          visit(issue.position);
                          return;
                        }
                        if (issue.field === "startNodeId") {
                          visit({
                            section: "project",
                            items: {},
                            field: "起始场景",
                          });
                          return;
                        }
                        if (issue.nodeId) {
                          const labels: Record<string, string> = {
                            next: "下一场景",
                            title: "场景标题",
                            text: "台词正文",
                            speaker: "默认说话人",
                            background: "场景背景",
                            condition: issue.lineId
                              ? "本句条件与玩家输入"
                              : "进入条件",
                            input: "本句条件与玩家输入",
                            characterLayers: "人物图层与位置",
                            onEnter: "进入时效果",
                            onComplete: "完成时效果",
                          };
                          visit({
                            section: "script",
                            nodeId: issue.nodeId,
                            lineId: issue.lineId,
                            items: {},
                            field: labels[issue.field || ""] || "场景属性",
                          });
                        } else showJson();
                      }}
                    >
                      {issue.severity === "warning" ? "提示" : "错误"} ·{" "}
                      {issue.message} →
                    </button>
                  ))}
                </div>
              )}
              {rawDirty && section !== "json" && (
                <p className="st-warning">
                  JSON 存在未应用修改。
                  <button onClick={() => setSection("json")}>前往处理</button>
                </p>
              )}
              {project && (
                <label className="st-mobile-node">
                  当前场景
                  <select
                    aria-label="跳转节点"
                    value={node?.id || ""}
                    onChange={(e) => {
                      select(e.target.value);
                      setSection("script");
                    }}
                  >
                    {project.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id} · {n.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!project || !node ? (
                <div className="st-loading">
                  {error ? "无法加载工程，请检查开发服务。" : "正在打开工程…"}
                </div>
              ) : (
                <>
                  <div
                    className="st-discovery-toolbar"
                    aria-label="编辑导航与帮助"
                  >
                    <button
                      aria-label="返回上个编辑位置"
                      disabled={!navigation.canBack}
                      onClick={navigation.back}
                    >
                      ← 返回
                    </button>
                    <button
                      aria-label="前进到下个编辑位置"
                      disabled={!navigation.canForward}
                      onClick={navigation.forward}
                    >
                      前进 →
                    </button>
                    <span>{sectionNames[section]}</span>
                    <button onClick={() => setHelpOpen(true)}>帮助</button>
                    {[
                      "script",
                      "graph",
                      "assets",
                      "characters",
                      "materials",
                      "project",
                    ].includes(section) && (
                      <button onClick={() => setUsageOpen(true)}>
                        在哪里使用
                      </button>
                    )}
                    <MoreActions>
                      <button onClick={showJson}>前往高级 JSON</button>
                      <button onClick={resetLayout}>恢复默认布局</button>
                      <button onClick={() => setCommandsOpen(true)}>
                        快速前往 Ctrl+K
                      </button>
                    </MoreActions>
                  </div>
                  {(rawDirty || busy || job.status === "running") && (
                    <div className="st-operation-reason" role="status">
                      {rawDirty ? (
                        <>
                          保存、导出和构建需要先应用
                          JSON。预览与引用仅使用已应用草稿。
                          <button onClick={showJson}>前往处理 JSON</button>
                        </>
                      ) : job.status === "running" ? (
                        "发行包正在构建，请等待完成后再保存或构建。"
                      ) : (
                        "正在处理工程，请稍候再操作。"
                      )}
                    </div>
                  )}
                  {section === "script" && (
                    <ScriptEditor
                      onProjectChange={edit}
                      sourceLevel={sectionLevels[node.id]}
                      project={project}
                      node={node}
                      lineIndex={lineIndex}
                      setLine={setLine}
                      onChange={(next) =>
                        edit({
                          ...project,
                          nodes: project.nodes.map((n) =>
                            n.id === node.id ? next : n,
                          ),
                        })
                      }
                      onPreview={() => void runPreview()}
                      onClone={cloneNode}
                      onDelete={deleteNode}
                    />
                  )}
                  {section === "graph" && (
                    <GraphEditor
                      project={project}
                      selected={node.id}
                      onSelect={select}
                      onEdit={() => setSection("script")}
                      onChange={edit}
                      onDelete={deleteNode}
                      authoring={authoring}
                      scope={scope}
                      runtime={runtime as EngineSave | null}
                      runtimeStale={
                        !preview ||
                        JSON.stringify(preview.project) !==
                          JSON.stringify(project)
                      }
                    />
                  )}
                  {section === "investigation" && (
                    <InvestigationPanel
                      project={project}
                      controller={authoring}
                      onSelect={(id) => {
                        select(id);
                        setSection("graph");
                      }}
                      onPreview={(p) => void runPreset(p)}
                    />
                  )}
                  {section === "presentations" && (
                    <>
                      <SequenceEditor
                        project={project}
                        onChange={edit}
                        profile={profile}
                      />
                      <PresentationEditor
                        project={project}
                        onChange={edit}
                        mode={mode}
                        setMode={(m) => {
                          setMode(m);
                          setTime(0);
                        }}
                        time={time}
                        setTime={setTime}
                        onPreview={(page) => void runPreview(mode, page || 0)}
                      />
                    </>
                  )}
                  {section === "assets" && (
                    <AssetEditor
                      project={project}
                      profile={profile}
                      files={files}
                      onChange={edit}
                      onUpload={upload}
                      nodeId={node.id}
                      notice={setNotice}
                      dirty={dirty || rawDirty}
                      onReload={async () => {
                        setFiles((await request(profile, "assets")).files);
                        setPreview(null);
                      }}
                    />
                  )}
                  {section === "characters" && (
                    <CharacterEditor project={project} onChange={edit} />
                  )}
                  {section === "materials" && (
                    <MaterialEditor project={project} onChange={edit} />
                  )}
                  {section === "project" && (
                    <>
                      <BackupPanel
                        dirty={dirty || authoring.dirty}
                        onRestored={() => location.reload()}
                      />
                      <VariableRename
                        dirty={dirty || authoring.dirty}
                        onApplied={() => location.reload()}
                      />
                      <ProductionPanel
                        project={project}
                        onChange={edit}
                        authoring={authoring}
                        onLocate={(nodeId, lineId) => {
                          select(nodeId);
                          setSection("script");
                          setLine(
                            Math.max(
                              0,
                              project.nodes
                                .find((n) => n.id === nodeId)
                                ?.lines.findIndex((l) => l.id === lineId) ?? 0,
                            ),
                          );
                        }}
                      />
                      <div className="st-section-title">
                        <div>
                          <span className="st-kicker">PROJECT SETTINGS</span>
                          <h2>工程设置</h2>
                        </div>
                        <button onClick={() => void validate()}>
                          校验工程
                        </button>
                      </div>
                      <Card title="游戏信息">
                        <div className="st-fields">
                          <Field
                            label="游戏标题"
                            value={project.title}
                            onChange={(title) =>
                              mutate((p) => {
                                p.title = title;
                              })
                            }
                          />
                          <Field
                            label="内容版本"
                            value={project.version}
                            onChange={(version) =>
                              mutate((p) => {
                                p.version = version;
                              })
                            }
                          />
                          <TargetPicker
                            label="起始场景"
                            nodes={project.nodes}
                            value={project.startNodeId}
                            onChange={(startNodeId) =>
                              mutate((p) => {
                                p.startNodeId = startNodeId;
                              })
                            }
                          />
                          <Field
                            label="素材基础目录"
                            value={project.resources.assetsBase}
                            onChange={(assetsBase) =>
                              mutate((p) => {
                                p.resources.assetsBase = assetsBase;
                              })
                            }
                          />
                        </div>
                        <p className="st-muted">
                          工程 ID：<code>{project.id}</code>
                        </p>
                      </Card>
                      <Card title="标题画面">
                        <div className="st-fields">
                          {Object.entries({
                            overline: "首页眉题",
                            subtitle: "首页副标题",
                            backdrop: "首页背景",
                            music: "首页音乐",
                            musicLabel: "首页音乐标签",
                            studio: "工作室名称",
                            studioUrl: "工作室网址",
                            galleryUrl: "画廊链接",
                            aboutUrl: "关于页面",
                          }).map(([key, label]) => (
                            <Field
                              key={key}
                              label={label}
                              value={
                                (project.titleScreen[
                                  key as keyof typeof project.titleScreen
                                ] as string) || ""
                              }
                              onChange={(v) =>
                                mutate((p) => {
                                  Object.assign(p.titleScreen, {
                                    [key]: v,
                                  });
                                })
                              }
                            />
                          ))}
                        </div>
                      </Card>
                      <InterfaceSettings project={project} onChange={edit} />
                      <Fold
                        title="高级工程配置"
                        summary="链接、章节音乐、音轨、鉴赏与界面文案"
                      >
                        <ProjectDetails project={project} onChange={edit} />
                      </Fold>
                      <Card title="整体工程导入与导出">
                        <p>
                          携带全部素材迁移工程，或导入为独立新项目继续开发。
                        </p>
                        <button
                          className="primary"
                          onClick={() => setManagerOpen(true)}
                        >
                          管理项目与工程包
                        </button>
                      </Card>
                      <Card title="工程文件">
                        <code>{sourcePath}</code>
                        <p>保存时校验引用和素材，并保留旧文件备份。</p>
                        <button onClick={() => void load(false)}>
                          <RefreshCw size={15} />
                          重新加载工程（丢弃未保存修改）
                        </button>
                      </Card>
                    </>
                  )}
                  {section === "json" && (
                    <>
                      <div className="st-section-title">
                        <div>
                          <span className="st-kicker">SOURCE EDITOR</span>
                          <h2>剧本 JSON</h2>
                          <p>
                            用于批量编辑和高级配置。应用后同步到可视化工作区。
                          </p>
                        </div>
                        <button
                          className="primary"
                          onClick={async () => {
                            try {
                              const p = JSON.parse(raw);
                              requireModernProject(p);
                              if (await validate(p)) {
                                edit(p);
                                setRaw(JSON.stringify(p, null, 2));
                                setRawBase(JSON.stringify(p, null, 2));
                                setLine(0);
                                setSelected(
                                  p.nodes.some(
                                    (n: { id: string }) => n.id === selected,
                                  )
                                    ? selected
                                    : p.startNodeId,
                                );
                                setPreview({
                                  sectionLevels,
                                  project: copy(p),
                                  profile,
                                  nodeId: p.startNodeId,
                                  line: 0,
                                  mode: "scene",
                                  pageIndex: 0,
                                  time: 0,
                                });
                              }
                            } catch (e) {
                              setError(describeError(e));
                            }
                          }}
                        >
                          应用 JSON 并重新开始
                        </button>
                      </div>
                      <textarea
                        className="st-raw-json"
                        aria-label="剧本 JSON"
                        spellCheck={false}
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                      />
                      <p className="st-muted">
                        JSON 中未应用的输入不会写入工程。先应用，再保存。
                      </p>
                    </>
                  )}
                  {section === "publish" && (
                    <>
                      <div className="st-section-title">
                        <div>
                          <span className="st-kicker">BUILD & EXPORT</span>
                          <h2>发行构建</h2>
                          <p>从当前工程生成可部署的游戏目录。</p>
                        </div>
                        <Package size={34} />
                      </div>
                      <Card title={"现代开发版"}>
                        <label>
                          网站部署路径
                          <input
                            value={buildBase}
                            placeholder="/games/my-game/"
                            onChange={(e) => setBuildBase(e.target.value)}
                          />
                        </label>
                        <p>
                          站点根目录填写 /；子目录填写完整路径并以 /
                          结束。构建后将 dist 内容部署到该路径。
                        </p>
                        <div className="st-release-steps">
                          <span
                            className={
                              validated === JSON.stringify(project)
                                ? "done"
                                : ""
                            }
                          >
                            1 · 检查内容
                          </span>
                          <span className={!dirty ? "done" : ""}>
                            2 · 保存工程
                          </span>
                          <span
                            className={job.status === "complete" ? "done" : ""}
                          >
                            3 · 构建发行包
                          </span>
                        </div>
                        <p>
                          目标工程：
                          {"现代开发版"} · 输出目录：
                          <code>
                            {workspaceId()
                              ? `workspace-projects/${workspaceId()}/dist/`
                              : "workspace-projects/default-modern/dist/"}
                          </code>
                        </p>
                        <p>
                          {workspaceId()
                            ? "使用当前独立项目的内容与素材构建，输出至该项目目录的 dist/。"
                            : "使用现代运行时，输出至默认现代工程目录的 dist/。"}
                        </p>
                        <div className="st-build-summary">
                          <span>
                            <b>{project.nodes.length}</b>场景
                          </span>
                          <span>
                            <b>{project.characters.length}</b>人物
                          </span>
                          <span>
                            <b>{project.materials.length}</b>资料
                          </span>
                          <span>
                            <b>
                              {project.media.opening?.pages?.length || 0} /{" "}
                              {project.media.ending?.lines?.length || 0}
                            </b>
                            OP / ED 字幕
                          </span>
                        </div>
                        <button
                          className="primary"
                          disabled={
                            busy || rawDirty || job.status === "running"
                          }
                          onClick={() => void build()}
                        >
                          <Package size={17} />
                          {job.status === "running"
                            ? "正在构建…"
                            : dirty
                              ? "保存并构建发行版"
                              : "构建发行版"}
                        </button>
                        <button onClick={() => void validate()}>
                          检查发行内容
                        </button>
                        <p className="st-muted">
                          构建产物不包含工作台和本机写入接口。
                        </p>
                      </Card>
                      <Card
                        title={`构建状态 · ${
                          {
                            idle: "尚未开始",
                            running: "正在构建",
                            complete: "成功",
                            failed: "失败",
                          }[job.status] || job.status
                        }`}
                      >
                        <pre className="st-build-log" data-testid="build-log">
                          {job.log || "构建日志会显示在这里。"}
                        </pre>
                        {job.status === "complete" && (
                          <p className="st-success">✓ 已生成 {job.output}</p>
                        )}
                      </Card>
                    </>
                  )}
                </>
              )}
            </main>
          </div>
          <aside
            className={`st-preview-dock ${previewLarge ? "large" : ""}`}
            hidden={!previewVisible}
          >
            <PreviewRecorder
              key={scope}
              iframe={iframe}
              authoring={authoring}
              loaded={!!preview && preview.mode === "scene"}
            />
            <ResizeHandle
              label="调整预览栏宽度"
              value={layout.right}
              onChange={(right) =>
                updateLayout({
                  right,
                })
              }
              min={300}
              max={620}
              reverse
            />
            <div className="st-preview-heading">
              <button
                aria-label="关闭预览"
                onClick={() => setPreviewVisible(false)}
              >
                ×
              </button>
              <span>
                <span className="st-dot" /> 实际画面预览
              </span>
              <small>
                {preview?.mode === "scene"
                  ? "SCENE"
                  : preview?.mode.toUpperCase()}
              </small>
            </div>
            <p className="st-preview-sync">
              {preview &&
              JSON.stringify(preview.project) === JSON.stringify(project) &&
              preview.nodeId === node?.id &&
              preview.line === lineIndex &&
              !rawDirty
                ? "✓ 预览已同步"
                : "● 预览待更新"}
            </p>
            <div className="st-preview-toolbar">
              <button
                className="primary"
                disabled={!project}
                onClick={() =>
                  void runPreview(section === "presentations" ? mode : "scene")
                }
              >
                <Play size={14} />
                应用到预览
              </button>
              <button onClick={() => setPreviewLarge(!previewLarge)}>
                {previewLarge ? "缩小预览" : "放大预览"}
              </button>
              <select
                aria-label="预览尺寸"
                value={previewSize}
                onChange={(e) => setPreviewSize(e.target.value)}
              >
                <option value="desktop">桌面</option>
                <option value="mobile">手机</option>
              </select>
            </div>
            <div
              ref={frameBox}
              className={`st-preview-frame ${previewSize === "mobile" ? "mobile" : ""}`}
            >
              <iframe
                ref={iframe}
                key={profile}
                title="完整游戏预览"
                src={`/studio-preview.html${workspaceId() ? "?workspaceId=" + encodeURIComponent(workspaceId()) : ""}`}
              />
            </div>
            {preview?.mode !== "scene" && (
              <div className="st-director-controls">
                <button
                  aria-label={playing ? "暂停演出预览" : "播放演出预览"}
                  onClick={() => {
                    setPlaying(!playing);
                    iframe.current?.contentWindow?.postMessage(
                      {
                        type: "studio:play",
                        play: !playing,
                      },
                      location.origin,
                    );
                  }}
                >
                  {playing ? "暂停" : "播放"}
                </button>
                <input
                  aria-label="演出预览进度"
                  type="range"
                  min={0}
                  max={
                    (preview?.mode === "ending"
                      ? project?.media.ending?.duration
                      : project?.media.opening?.duration) || 89
                  }
                  step={0.01}
                  value={time}
                  onChange={(e) => setTime(Number(e.target.value))}
                />
                <span>{time.toFixed(2)}s</span>
              </div>
            )}
            <div className="st-preview-meta">
              <b>{node?.id}</b>
              <span>
                {preview?.mode === "scene"
                  ? `第 ${lineIndex + 1} 句 · 独立预览存档`
                  : "时间轴驱动 · 独立演出预览"}
              </span>
            </div>
            <Fold
              title="变量与运行状态"
              summary="调试工具"
              className="st-debug"
            >
              <VariableDebug
                send={(data) =>
                  iframe.current?.contentWindow?.postMessage(
                    data,
                    location.origin,
                  )
                }
                onError={setError}
              />
              <pre data-testid="preview-state">
                {runtime === null
                  ? "等待预览启动…"
                  : JSON.stringify(runtime, null, 2)}
              </pre>
            </Fold>
            <p className="st-preview-hint">
              编辑后点击“应用到预览”。预览不修改玩家存档。
            </p>
          </aside>
          <StatusBar
            source={sourcePath}
            draftState={draftState}
            events={events}
          />
          <DiscoveryPanels
            helpOpen={helpOpen}
            usageOpen={usageOpen}
            onCloseHelp={() => setHelpOpen(false)}
            onCloseUsage={() => setUsageOpen(false)}
            section={section}
            project={project}
            position={position}
            references={references}
            rawDirty={rawDirty}
            onVisit={(target) => {
              setUsageOpen(false);
              visit(target);
            }}
            profile={profile}
          />
          <ProjectManager
            key={`${profile}:${workspaceId()}`}
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            profile={profile}
            project={project}
            revision={revision}
            rawDirty={rawDirty}
            dirty={dirty}
            onOpen={requestWorkspace}
            onJson={showJson}
          />
          {pendingWorkspace && (
            <Modal
              title="切换独立项目"
              onClose={() => setPendingWorkspace(null)}
            >
              <h2>当前工程有未保存修改</h2>
              <p>请选择保存后切换，或放弃修改。未应用 JSON 需要先处理。</p>
              <button
                className="primary"
                onClick={async () => {
                  if (dirty) {
                    if (!(await save(authoring.dirty))) return;
                  } else if (authoring.dirty && !(await authoring.save()))
                    return;
                  openWorkspace(pendingWorkspace);
                }}
              >
                保存并打开项目
              </button>
              <button
                className="danger"
                onClick={() => openWorkspace(pendingWorkspace)}
              >
                放弃修改并打开项目
              </button>
              <button onClick={() => setPendingWorkspace(null)}>取消</button>
            </Modal>
          )}

          {commandsOpen && (
            <CommandPalette
              commands={[
                {
                  id: "project-packages",
                  label: "项目管理与整体导入导出",
                  category: "工程",
                  run: () => {
                    setCommandsOpen(false);
                    setManagerOpen(true);
                  },
                },
                ...recentCommands,
                ...searchCommands,
              ]}
              onClearRecent={() => {
                setRecentIds([]);
                try {
                  localStorage.setItem(`magickisa:recent:${scope}`, "[]");
                } catch {
                  setNotice("偏好未保存：无法清空持久记录。");
                }
              }}
              onClose={() => setCommandsOpen(false)}
            />
          )}
          {!!recovery.length && (
            <Modal title="发现未保存草稿" onClose={() => setRecovery([])}>
              <p>草稿不会自动覆盖工程。恢复后保存仍会检查原始文件版本。</p>
              {recovery.map((d) => (
                <div className="st-recovery" key={d.key}>
                  <span>
                    {d.project.title}
                    <small>{new Date(d.updatedAt).toLocaleString()}</small>
                  </span>
                  <button onClick={() => void restoreDraft(d)}>恢复草稿</button>
                  <button onClick={() => void discardDraft(d)}>丢弃</button>
                </div>
              ))}
            </Modal>
          )}
        </div>
      </AssetPickerProvider>
    </WorkspaceContext.Provider>
  );
}
function VariableDebug({
  send,
  onError,
}: {
  send: (data: unknown) => void;
  onError: (s: string) => void;
}) {
  const [key, setKey] = useState(""),
    [value, setValue] = useState("true");
  return (
    <div className="st-debug-fields">
      <Field label="调试变量名" value={key} onChange={setKey} />
      <Field label="调试变量值 JSON" value={value} onChange={setValue} />
      <button
        onClick={() => {
          try {
            if (!key) throw new Error("请输入变量名。");
            send({
              type: "studio:variable",
              key,
              value: JSON.parse(value),
            });
          } catch (e) {
            onError(describeError(e));
          }
        }}
      >
        设置变量
      </button>
    </div>
  );
}
