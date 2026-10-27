/** Reconstructed authoring types; original TypeScript annotations were not present in the bundle. */
export type Variables = Record<string, unknown>;
export type Condition =
  | { type: "flag"; key: string; equals?: unknown }
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
  | { type: "set"; key: string; value: unknown }
  | { type: "toggle"; key: string }
  | { type: "increment"; key: string; amount: number }
  | { type: "addToList" | "removeFromList"; key: string; value: unknown }
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
  input?: { key: string; label: string; maxLength: number };
  id?: string;
  text: string;
  speaker?: string;
  characterId?: string;
  expression?: string;
  characterLayers?: CharacterLayer[];
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
  title?: string;
  speaker?: string;
  lines: StoryLine[];
  next?: string;
  choices?: StoryChoice[];
  effects?: Effect[];
  condition?: Condition;
  tags?: string[];
  playable?: boolean;
  presentation?: string;
  sequenceId?: string;
}
export interface MaterialEntry {
  id: string;
  title: string;
  body: string;
  category?: string;
  unlockNode?: string;
  unlock?: Condition;
}
export interface StoryProject {
  id: string;
  title?: string;
  version?: string;
  startNodeId: string;
  nodes: StoryNode[];
  materials?: MaterialEntry[];
  characters?: Array<{
    id: string;
    name: string;
    portrait?: string;
    expressions?: Record<string, string>;
    renderer?: string;
    live2d?: Record<string, unknown>;
  }>;
  backdrops?: Array<{ id: string; src: string }>;
  audio?: Array<{ id: string; src: string; group?: string; volume?: number }>;
  resources?: {
    assetsBase?: string;
    sceneRules?: Array<{ keywords: string[]; asset: string }>;
  };
  media?: Record<string, unknown>;
  titleScreen?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface Checkpoint {
  id: string;
  nodeId: string;
  lineIndex: number;
  variables: Variables;
  visitedNodes: string[];
  unlockedMaterials: string[];
  readMaterials: string[];
  notes: string[];
  audio: EngineSave["audio"];
  usedChoices: string[];
  createdAt: string;
  speaker?: string;
  text?: string;
}
export interface EngineSave {
  contentLayout?: string;
  playerNotes?: string;
  projectId?: string;
  contentVersion?: string;
  schemaVersion: number;
  slotId: string;
  savedAt: string;
  nodeId: string;
  lineIndex: number;
  variables: Variables;
  visitedNodes: string[];
  history: Checkpoint[];
  unlockedMaterials: string[];
  readMaterials: string[];
  notes: string[];
  usedChoices: string[];
  audio: { volume: number; muted: boolean; currentTrackId?: string };
}
export interface SessionOptions {
  persist?: boolean;
  slotId?: string;
  initialSave?: EngineSave;
}
