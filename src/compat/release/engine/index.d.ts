import type {
  StoryProject,
  StoryNode,
  StoryLine,
  StoryChoice,
  EngineSave,
  SessionOptions,
  Variables,
  Condition,
  Effect,
} from "./types";
export type * from "./types";
export class StoryRuntime {
  constructor(project: StoryProject, save: EngineSave);
  project: StoryProject;
  save: EngineSave;
  readonly node: StoryNode | undefined;
  readonly line: StoryLine | undefined;
  readonly done: boolean;
  readonly choices: StoryChoice[];
  checkpoint(metadata?: Record<string, unknown>): EngineSave;
  advance(): EngineSave;
  choose(choiceId: string): EngineSave;
  jump(nodeId: string, lineIndex?: number): EngineSave;
}
export class AvgEngine {
  constructor(project: StoryProject, save: EngineSave);
  project: StoryProject;
  runtime: StoryRuntime;
  start(): EngineSave;
  pause(): EngineSave;
  resume(): EngineSave;
  advance(): EngineSave;
  choose(choiceId: string): EngineSave;
  jump(nodeId: string, lineIndex?: number): EngineSave;
  rollback(historyIndex: number): EngineSave;
  destroy(): EngineSave;
}
export class EngineSession {
  constructor(project: StoryProject, options?: SessionOptions);
  project: StoryProject;
  engine: AvgEngine;
  readonly save: EngineSave;
  commit(): EngineSave;
  advance(): EngineSave;
  choose(choiceId: string): EngineSave;
  jump(nodeId: string, lineIndex?: number): EngineSave;
  rollback(historyIndex: number): EngineSave;
  reset(): EngineSave;
  destroy(): void;
}
export class EngineStore {
  constructor(project: StoryProject, options?: SessionOptions);
  session: EngineSession;
  readonly runtime: StoryRuntime;
  getSnapshot(): EngineSave;
  subscribe(listener: (save: EngineSave) => void): () => boolean;
  emit(save: EngineSave): EngineSave;
  advance(): EngineSave;
  choose(choiceId: string): EngineSave;
  jump(nodeId: string, lineIndex?: number): EngineSave;
  rollback(historyIndex: number): EngineSave;
  reset(): EngineSave;
  destroy(): void;
}
export function createEngineHost(
  project: StoryProject,
  options?: SessionOptions,
): { session: EngineSession; start(): EngineSession; dispose(): void };
export function createSave(nodeId: string, slotId?: string): EngineSave;
export function readSave(slotId: string): EngineSave | null;
export function writeSave(save: EngineSave): void;
export function migrateLegacySave(
  input: unknown,
  nodeMap: Record<number, string>,
): EngineSave | null;
export function evaluateCondition(
  condition: Condition | undefined,
  variables: Variables,
  visitedNodes?: string[],
): boolean | undefined;
export function applyEffects(save: EngineSave, effects?: Effect[]): EngineSave;
export const conditionHandlers: Map<
  string,
  (
    condition: Condition,
    variables: Variables,
    visitedNodes: string[],
  ) => boolean
>;
export const effectHandlers: Map<
  string,
  (save: EngineSave, effect: Effect) => EngineSave
>;
export function validateProject(
  project: StoryProject,
): Array<{ path: string; message: string }>;
export function assertProject(project: StoryProject): StoryProject;
export function resolveAsset(project: StoryProject, asset: string): string;
export function resolveScene(project: StoryProject, title: string): string;
export class ResourceManager {
  preload(urls: string[]): Promise<void>;
  isFailed(url: string): boolean;
}
export class AudioManager {
  play(
    id: string,
    src: string,
    options?: { volume?: number; loop?: boolean },
  ): HTMLAudioElement;
  pause(id: string): void;
  stop(id: string): void;
  stopAll(): void;
}
export class PresentationRegistry {
  register(
    id: string,
    handler: (request: { id: string; [key: string]: unknown }) => void,
  ): () => boolean;
  play(request?: { id: string; [key: string]: unknown }): void;
  has(id: string): boolean;
}
export const rendererRegistry: {
  registerLive2D(adapter: unknown): () => void;
  getLive2D(): unknown;
};
