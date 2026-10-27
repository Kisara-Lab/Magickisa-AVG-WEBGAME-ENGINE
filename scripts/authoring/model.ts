import { z } from "zod";
import { projectSchema } from "../../src/engine/schema";
import { operationSchema } from "../cli/operations";

const ref = z.string().min(1);
// Canonical module names prevent metadata/source collisions on Windows too.
const modulePath = z
  .string()
  .regex(/^modules\/(?:[^/\\:.]+\/)*[^/\\:.]+\.json$/)
  .refine((s) =>
    s.split("/").every((part) => part.trim() === part && !part.endsWith(" ")),
  );
export const sourceSchema = z
  .object({ id: ref, path: ref, sha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const originSchema = z
  .object({
    target: ref,
    sourceId: ref,
    line: z.number().int().positive().optional(),
  })
  .strict();
export const manifestSchema = z
  .object({
    formatVersion: z.literal(1),
    sources: z.array(sourceSchema).default([]),
    modules: z
      .array(modulePath)
      .refine(
        (items) =>
          new Set(items.map((s) => s.toLowerCase())).size === items.length,
        "Duplicate module paths",
      ),
    origins: z.array(originSchema).default([]),
    operations: z.array(operationSchema).default([]),
    questions: z.array(ref).default([]),
  })
  .strict();
const shape = projectSchema.shape;
const node = shape.nodes.element;
export const moduleSchema = z
  .object({
    formatVersion: z.literal(1),
    project: projectSchema
      .pick({
        title: true,
        version: true,
        startNodeId: true,
        resources: true,
        titleScreen: true,
        ui: true,
      })
      .partial()
      .strict()
      .optional(),
    nodes: z
      .array(
        node
          .partial()
          .extend({
            id: ref,
            lines: z
              .array(
                node.shape.lines.element.partial().extend({ id: ref }).strict(),
              )
              .optional(),
            choices: z
              .array(
                node.shape.choices
                  .unwrap()
                  .element.partial()
                  .extend({ id: ref })
                  .strict(),
              )
              .optional(),
          })
          .strict(),
      )
      .optional(),
    characters: z
      .array(shape.characters.element.partial().extend({ id: ref }).strict())
      .optional(),
    materials: z
      .array(shape.materials.element.partial().extend({ id: ref }).strict())
      .optional(),
    backdrops: z
      .array(shape.backdrops.element.partial().extend({ id: ref }).strict())
      .optional(),
    audio: z
      .array(shape.audio.element.partial().extend({ id: ref }).strict())
      .optional(),
    media: shape.media.partial().strict().optional(),
  })
  .strict();
export const resolutionsSchema = z
  .object({
    formatVersion: z.literal(1),
    resolutions: z.array(
      z.object({ path: ref, take: z.enum(["current", "incoming"]) }).strict(),
    ),
  })
  .strict();
export type Cell = { present: false } | { present: true; value: unknown };
export type Origin = {
  module: string;
  field: string;
  sourceId?: string;
  line?: number;
};
export type Entry = {
  path: string;
  mode: "record" | "value" | "remove" | "order";
  cell: Cell;
  origin: Origin;
};
export interface SyncState {
  formatVersion: 1;
  entries: Record<string, Cell>;
  project?: unknown;
  operationResults?: Record<string, { path: string; cell: Cell }>;
  sourceHashes?: Record<string, string>;
}
export const cellSchema = z.discriminatedUnion("present", [
  z.object({ present: z.literal(false) }).strict(),
  z.object({ present: z.literal(true), value: z.unknown() }).strict(),
]);
export const stateSchema = z
  .object({
    formatVersion: z.literal(1),
    entries: z.record(z.string(), cellSchema),
    project: projectSchema.optional(),
    sourceHashes: z
      .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/))
      .optional(),
    operationResults: z
      .record(z.string(), z.object({ path: ref, cell: cellSchema }).strict())
      .optional(),
  })
  .strict();
export const planSchema = z
  .object({
    formatVersion: z.literal(1),
    workspaceId: ref,
    projectRevision: ref,
    stateRevision: ref,
    manifest: ref,
    inputs: z.array(z.object({ path: ref, sha256: ref }).strict()),
    resolutions: resolutionsSchema,
    changes: z.array(z.unknown()),
    conflicts: z.array(z.unknown()),
    issues: z.array(z.unknown()),
    operations: z.array(operationSchema),
    nextState: stateSchema,
    digest: ref,
  })
  .strict();
export const authoringSchemas = {
  manifest: manifestSchema,
  module: moduleSchema,
  plan: planSchema,
  resolutions: resolutionsSchema,
};
