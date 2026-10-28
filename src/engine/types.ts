export type Value =
  string | number | boolean | null | Value[] | { [key: string]: Value };
export type Variables = Record<string, Value>;
export type Condition =
  | {
      type: "material";
      id: string;
      state: "unlocked" | "read";
      value?: boolean;
    }
  | { type: "contains"; key: string; value: Value }
  | { type: "flag"; key: string; equals?: Value }
  | { type: "not"; condition: Condition }
  | { type: "all" | "any"; conditions: Condition[] }
  | { type: "visited"; nodeId: string; value?: boolean }
  | {
      type: "count";
      key: string;
      operator: "eq" | "gt" | "gte" | "lt" | "lte";
      value: number;
    };
export type Effect =
  | { type: "set"; key: string; value: Value }
  | { type: "toggle"; key: string }
  | { type: "increment"; key: string; amount: number }
  | { type: "addToList" | "removeFromList"; key: string; value: Value }
  | { type: "unlockMaterial" | "markRead"; id: string }
  | { type: "appendNote"; text: string }
  | { type: "setAudio"; trackId: string };
export interface CharacterLayer {
  characterId: string;
  position?: string;
  expression?: string;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  zIndex?: number;
  enter?: string;
}
export interface StoryLine {
  id: string;
  text: string;
  voice?: string;
  sequence?: string;
  pageBreak?: boolean;
  speaker?: string;
  characterId?: string;
  expression?: string;
  characterLayers?: CharacterLayer[];
  condition?: Condition;
  input?: { key: string; label: string; maxLength: number };
}
export interface StoryChoice {
  id: string;
  label: string;
  target: string;
  once?: boolean;
  condition?: Condition;
  effects?: Effect[];
}
export interface StoryNode {
  id: string;
  title: string;
  chapter?: string;
  sourceLevel?: number;
  sourceBody?: string;
  speaker?: string;
  lines: StoryLine[];
  next?: string;
  choices?: StoryChoice[];
  onEnter?: Effect[];
  onComplete?: Effect[];
  condition?: Condition;
  tags?: string[];
  playable?: boolean;
  presentation?: "dedication" | "ending";
  sequenceId?: string;
  ending?: string;
  background?: string;
  readingMode?: "adv" | "nvl";
  enterSequence?: string;
  exitSequence?: string;
}
export interface MaterialEntry {
  id: string;
  title: string;
  body: string;
  category: string;
  unlockNode?: string;
  unlock?: Condition;
}
export interface Character {
  id: string;
  name: string;
  portrait?: string;
  expressions?: Record<string, string>;
  renderer?: "portrait" | "live2d";
  live2d?: { model: string };
}
export interface OpeningMedia {
  audio?: string;
  duration?: number;
  images?: string[];
  lyrics?: string;
  title?: string;
  pages?: { at: number; text: string }[];
  credits?: {
    artist?: string;
    website?: string;
    production?: string[];
    studio?: string;
    studioUrl?: string;
  };
}
export interface EndingMedia {
  audio?: string;
  duration?: number;
  lyrics?: string;
  image?: string;
  title?: string;
  creditsMode?: string;
  creditsDuration?: number;
  credits?: string[];
  lines?: { at: number; en: string; zh: string }[];
}
export interface MediaManifest {
  opening?: OpeningMedia;
  ending?: EndingMedia;
  dedication?: { title?: string; pages?: string[][]; hint?: string };
  chapterMusic?: Record<string, string>;
  chapterMusicRules?: { keywords: string[]; track: string }[];
  musicGallery?: {
    id: string;
    title: string;
    artist?: string;
    src: string;
    mood?: string;
    unlockNode?: string;
  }[];
}
export interface StoryProject {
  schemaVersion: 3;
  id: string;
  title: string;
  version: string;
  variables?: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "list" | "object";
      initial: Value;
      description?: string;
    }
  >;
  assets?: {
    id: string;
    kind: "image" | "audio" | "video";
    src: string;
    name?: string;
  }[];
  sequences?: import("./sequence").Sequence[];
  theme?: {
    mode: "adv" | "nvl";
    fontFamily: string;
    fontSize: number;
    textColor: string;
    accentColor: string;
    panelColor: string;
    panelOpacity: number;
    dialogueWidth: number;
  };
  gallery?: { id: string; title: string; asset: string; unlock?: Condition }[];
  startNodeId: string;
  nodes: StoryNode[];
  materials: MaterialEntry[];
  characters: Character[];
  backdrops: { id: string; src: string }[];
  audio: { id: string; src: string; group?: string; volume?: number }[];
  resources: {
    assetsBase?: string;
    sceneRules?: { keywords: string[]; asset: string }[];
  };
  media: MediaManifest;
  titleScreen: {
    backdrop?: string;
    music?: string;
    overline?: string;
    subtitle?: string;
    studio?: string;
    studioUrl?: string;
    galleryUrl?: string;
    aboutUrl?: string;
    footerLinks?: { label: string; url: string }[];
    musicLabel?: string;
  };
  ui?: {
    labels?: Record<string, string>;
    enabled?: Record<string, boolean>;
    notifications?: Record<string, string>;
  };
}
export interface PresentationState {
  id: "opening" | "ending";
  nodeId: string;
  position?: number;
}
export interface SaveState {
  nodeId: string;
  lineId: string | null;
  phase: "line" | "exits";
  sequence?: {
    id: string;
    trigger: string;
    time: number;
    waiting: number | null;
    finished: boolean;
  } | null;
  sequenceTokens?: string[];
  terminalSequence?: string | null;
  lineIndex: number;
  variables: Variables;
  visitedNodes: string[];
  unlockedMaterials: string[];
  readMaterials: string[];
  notes: string[];
  playerNotes: string;
  usedChoices: string[];
  entered: boolean;
  completed: boolean;
  completedEndings: string[];
  seenPresentations: string[];
  presentation: PresentationState | null;
  audio: { volume: number; muted: boolean; currentTrackId?: string };
}
export interface Checkpoint extends SaveState {
  id: string;
  createdAt: string;
  speaker?: string;
  text?: string;
  section?: string;
}
export interface EngineSave extends SaveState {
  contentLayout?: string;
  readLineIds: string[];
  schemaVersion: 3;
  projectId: string;
  contentVersion: string;
  slotId: string;
  savedAt: string;
  history: Checkpoint[];
}
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface SessionOptions {
  persist?: boolean;
  slotId?: string;
  initialSave?: unknown;
  storage?: StorageAdapter;
}
export interface EngineRendererContext {
  project: StoryProject;
  save: EngineSave;
  node?: StoryNode;
  line?: StoryLine;
  lineIndex: number;
  canAdvance: boolean;
  choices: StoryChoice[];
  presentation: PresentationState | null;
}
export interface EngineRenderer {
  render(context: EngineRendererContext): unknown;
  dispose?(): void;
}
