import { z } from "zod";
import { fontSizeLimits } from "./readingLimits";
import { validPublicLink } from "./links";
import { sequenceSchema, sequenceIssues } from "./sequence";
import type { Condition, Effect, StoryProject, Value } from "./types";
export const valueSchema: z.ZodType<Value> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(valueSchema),
    z.record(z.string(), valueSchema),
  ]),
);
const id = z.string().min(1);
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("material"),
      id,
      state: z.enum(["unlocked", "read"]),
      value: z.boolean().optional(),
    }),
    z.object({ type: z.literal("contains"), key: id, value: valueSchema }),
    z.object({
      type: z.literal("flag"),
      key: id,
      equals: valueSchema.optional(),
    }),
    z.object({ type: z.literal("not"), condition: conditionSchema }),
    z.object({
      type: z.enum(["all", "any"]),
      conditions: z.array(conditionSchema),
    }),
    z.object({
      type: z.literal("visited"),
      nodeId: id,
      value: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("count"),
      key: id,
      operator: z.enum(["eq", "gt", "gte", "lt", "lte"]),
      value: z.number().finite(),
    }),
  ]),
);
export const effectSchema: z.ZodType<Effect> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set"), key: id, value: valueSchema }),
  z.object({ type: z.literal("toggle"), key: id }),
  z.object({
    type: z.literal("increment"),
    key: id,
    amount: z.number().finite(),
  }),
  z.object({
    type: z.enum(["addToList", "removeFromList"]),
    key: id,
    value: valueSchema,
  }),
  z.object({ type: z.enum(["unlockMaterial", "markRead"]), id }),
  z.object({ type: z.literal("appendNote"), text: z.string() }),
  z.object({ type: z.literal("setAudio"), trackId: id }),
]);
const layer = z
  .object({
    characterId: id,
    position: z.string().optional(),
    expression: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    scale: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    zIndex: z.number().optional(),
    enter: z.string().optional(),
  })
  .strict();
const line = z
  .object({
    id,
    text: z.string(),
    voice: id.optional(),
    sequence: id.optional(),
    pageBreak: z.boolean().optional(),
    speaker: z.string().optional(),
    characterId: id.optional(),
    expression: z.string().optional(),
    characterLayers: z.array(layer).optional(),
    condition: conditionSchema.optional(),
    input: z
      .object({ key: id, label: id, maxLength: z.number().int().positive() })
      .optional(),
  })
  .strict();
const choice = z
  .object({
    id,
    label: id,
    target: id,
    once: z.boolean().optional(),
    condition: conditionSchema.optional(),
    effects: z.array(effectSchema).optional(),
  })
  .strict();
const node = z
  .object({
    id,
    title: z.string(),
    chapter: z.string().optional(),
    sourceLevel: z.number().int().optional(),
    sourceBody: z.string().optional(),
    speaker: z.string().optional(),
    lines: z.array(line),
    next: id.optional(),
    choices: z.array(choice).optional(),
    onEnter: z.array(effectSchema).optional(),
    onComplete: z.array(effectSchema).optional(),
    condition: conditionSchema.optional(),
    tags: z.array(z.string()).optional(),
    playable: z.boolean().optional(),
    presentation: z.enum(["dedication", "ending"]).optional(),
    sequenceId: z.string().optional(),
    ending: z.string().optional(),
    background: z.string().optional(),
    readingMode: z.enum(["adv", "nvl"]).optional(),
    enterSequence: id.optional(),
    exitSequence: id.optional(),
  })
  .strict();
export const projectSchema = z
  .object({
    schemaVersion: z.literal(3),
    id,
    title: id,
    version: id,
    variables: z
      .record(
        id,
        z
          .object({
            type: z.enum(["string", "number", "boolean", "list", "object"]),
            initial: valueSchema,
            description: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    assets: z
      .array(
        z
          .object({
            id,
            kind: z.enum(["image", "audio", "video"]),
            src: id,
            name: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    sequences: z.array(sequenceSchema).optional(),
    theme: z
      .object({
        mode: z.enum(["adv", "nvl"]),
        fontFamily: z.string().min(1).max(200),
        fontSize: z.number().min(fontSizeLimits.min).max(fontSizeLimits.max),
        textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        panelColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        panelOpacity: z.number().min(0.75).max(1),
        dialogueWidth: z.number().min(50).max(100),
      })
      .strict()
      .optional(),
    gallery: z
      .array(
        z
          .object({
            id,
            title: id,
            asset: id,
            unlock: conditionSchema.optional(),
          })
          .strict(),
      )
      .optional(),
    startNodeId: id,
    nodes: z.array(node).min(1),
    materials: z.array(
      z
        .object({
          id,
          title: z.string(),
          body: z.string(),
          category: id,
          unlockNode: id.optional(),
          unlock: conditionSchema.optional(),
        })
        .strict(),
    ),
    characters: z.array(
      z
        .object({
          id,
          name: id,
          portrait: z.string().optional(),
          expressions: z.record(z.string(), z.string()).optional(),
          renderer: z.enum(["portrait", "live2d"]).optional(),
          live2d: z.object({ model: id }).optional(),
        })
        .strict(),
    ),
    backdrops: z.array(z.object({ id, src: id })),
    audio: z.array(
      z.object({
        id,
        src: id,
        group: z.string().optional(),
        volume: z.number().min(0).max(1).optional(),
      }),
    ),
    resources: z
      .object({
        assetsBase: z.string().optional(),
        sceneRules: z
          .array(z.object({ keywords: z.array(z.string()), asset: id }))
          .optional(),
      })
      .strict(),
    media: z
      .object({
        opening: z
          .object({
            audio: id.optional(),
            duration: z.number().positive().optional(),
            images: z.array(id).optional(),
            lyrics: id.optional(),
            title: z.string().optional(),
            pages: z
              .array(
                z.object({ at: z.number().nonnegative(), text: z.string() }),
              )
              .optional(),
            credits: z
              .object({
                artist: z.string().optional(),
                website: z.string().optional(),
                production: z.array(z.string()).optional(),
                studio: z.string().optional(),
                studioUrl: z.string().optional(),
              })
              .optional(),
          })
          .strict()
          .optional(),
        ending: z
          .object({
            audio: id.optional(),
            duration: z.number().positive().optional(),
            lyrics: id.optional(),
            image: id.optional(),
            title: z.string().optional(),
            creditsMode: z.string().optional(),
            creditsDuration: z.number().positive().optional(),
            credits: z.array(z.string()).optional(),
            lines: z
              .array(
                z.object({
                  at: z.number().nonnegative(),
                  en: z.string(),
                  zh: z.string(),
                }),
              )
              .optional(),
          })
          .strict()
          .optional(),
        dedication: z
          .object({
            title: z.string().optional(),
            pages: z.array(z.array(z.string())).optional(),
            hint: z.string().optional(),
          })
          .strict()
          .optional(),
        chapterMusic: z.record(z.string(), z.string()).optional(),
        chapterMusicRules: z
          .array(z.object({ keywords: z.array(z.string()), track: id }))
          .optional(),
        musicGallery: z
          .array(
            z
              .object({
                id,
                title: id,
                artist: z.string().optional(),
                src: id,
                mood: z.string().optional(),
                unlockNode: id.optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    titleScreen: z
      .object({
        backdrop: z.string().optional(),
        music: z.string().optional(),
        overline: z.string().optional(),
        subtitle: z.string().optional(),
        studio: z.string().optional(),
        studioUrl: z.string().optional(),
        galleryUrl: z.string().optional(),
        aboutUrl: z.string().optional(),
        footerLinks: z.array(z.object({ label: id, url: id })).optional(),
        musicLabel: z.string().optional(),
      })
      .strict(),
    ui: z
      .object({
        labels: z.record(z.string(), z.string()).optional(),
        enabled: z.record(z.string(), z.boolean()).optional(),
        notifications: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
  })
  .strict();
export interface ValidationIssue {
  path: string;
  message: string;
}
export function validateProject(input: unknown): ValidationIssue[] {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
  const p = parsed.data,
    issues: ValidationIssue[] = [],
    nodes = new Set(p.nodes.map((n) => n.id));
  const duplicate = (ids: string[], path: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push({ path, message: `duplicate id: ${id}` });
      seen.add(id);
    }
  };
  duplicate(
    p.nodes.map((n) => n.id),
    "nodes",
  );
  duplicate(
    p.nodes.flatMap((n) => n.lines.map((l) => l.id)),
    "lines",
  );
  duplicate(
    p.nodes.flatMap((n) => (n.choices || []).map((c) => c.id)),
    "choices",
  );
  for (const k of ["materials", "characters", "backdrops", "audio"] as const)
    duplicate(
      p[k].map((x) => x.id),
      k,
    );
  const ref = (id: string | undefined, path: string) => {
    if (id && !nodes.has(id))
      issues.push({ path, message: `node does not exist: ${id}` });
  };
  ref(p.startNodeId, "startNodeId");
  function condition(c: Condition | undefined, path: string) {
    if (!c) return;
    if (c.type === "visited") ref(c.nodeId, path);
    if (c.type === "material" && !materials.has(c.id))
      issues.push({ path, message: `material does not exist: ${c.id}` });
    if (c.type === "not") condition(c.condition, path);
    if (c.type === "all" || c.type === "any")
      c.conditions.forEach((x) => condition(x, path));
  }
  const chars = new Set(p.characters.map((c) => c.id)),
    materials = new Set(p.materials.map((m) => m.id)),
    tracks = new Set(p.audio.map((a) => a.id));
  function effects(es: Effect[] | undefined, path: string) {
    for (const e of es || []) {
      if (
        (e.type === "unlockMaterial" || e.type === "markRead") &&
        !materials.has(e.id)
      )
        issues.push({ path, message: `material does not exist: ${e.id}` });
      if (e.type === "setAudio" && !tracks.has(e.trackId))
        issues.push({ path, message: `audio does not exist: ${e.trackId}` });
    }
  }
  for (const n of p.nodes) {
    ref(n.next, `nodes.${n.id}.next`);
    condition(n.condition, n.id);
    effects(n.onEnter, n.id);
    effects(n.onComplete, n.id);
    for (const c of n.choices || []) {
      ref(c.target, `choices.${c.id}`);
      condition(c.condition, c.id);
      effects(c.effects, c.id);
    }
    for (const l of n.lines) {
      if (
        l.input &&
        p.variables?.[l.input.key] &&
        p.variables[l.input.key].type !== "string"
      )
        issues.push({
          path: `nodes.${n.id}.lines.${l.id}.input.key`,
          message: "玩家文字输入只能绑定字符串变量；请使用独立的字符串变量。",
        });
      condition(l.condition, l.id);
      for (const c of [
        l.characterId,
        ...(l.characterLayers || []).map((x) => x.characterId),
      ])
        if (c && !chars.has(c))
          issues.push({
            path: l.id,
            message: `character does not exist: ${c}`,
          });
    }
  }
  for (const m of p.materials) {
    ref(m.unlockNode, m.id);
    condition(m.unlock, m.id);
  }
  duplicate(
    (p.media.musicGallery ?? []).map((m) => m.id),
    "media.musicGallery",
  );
  for (const m of p.media.musicGallery || []) ref(m.unlockNode, m.id);
  duplicate(
    (p.assets ?? []).map((a) => a.id),
    "assets",
  );
  duplicate(
    (p.sequences ?? []).map((s) => s.id),
    "sequences",
  );
  duplicate(
    (p.gallery ?? []).map((g) => g.id),
    "gallery",
  );
  for (const [key, variable] of Object.entries(p.variables ?? {})) {
    const type = Array.isArray(variable.initial)
      ? "list"
      : variable.initial === null
        ? "null"
        : typeof variable.initial;
    if (type !== variable.type)
      issues.push({
        path: `variables.${key}.initial`,
        message: "变量初始值与声明类型不符",
      });
    if (["__proto__", "prototype", "constructor"].includes(key))
      issues.push({ path: `variables.${key}`, message: "禁止原型变量名" });
  }
  const sequenceIds = new Set((p.sequences ?? []).map((s) => s.id));
  const sequenceRef = (id: string | undefined, path: string) => {
    if (id && !sequenceIds.has(id))
      issues.push({ path, message: `演出不存在：${id}` });
  };
  for (const [i, s] of (p.sequences ?? []).entries())
    for (const issue of sequenceIssues(s))
      issues.push({
        path: `sequences.${i}.${issue.path}`,
        message: issue.message,
      });
  for (const sequence of p.sequences ?? [])
    for (const track of sequence.tracks) {
      if (track.characterId) {
        const character = p.characters.find((c) => c.id === track.characterId);
        if (track.kind !== "character" || !character)
          issues.push({
            path: `sequences.${sequence.id}.${track.id}.characterId`,
            message: "人物轨道引用不存在的人物或类型不符",
          });
        else if (
          track.expression &&
          !Object.hasOwn(character.expressions ?? {}, track.expression)
        )
          issues.push({
            path: `sequences.${sequence.id}.${track.id}.expression`,
            message: "人物轨道表情不存在",
          });
      }
    }
  for (const n of p.nodes) {
    sequenceRef(n.enterSequence, `${n.id}.enterSequence`);
    sequenceRef(n.exitSequence, `${n.id}.exitSequence`);
    for (const l of n.lines) {
      sequenceRef(l.sequence, `${l.id}.sequence`);
      if (
        l.voice &&
        p.sequences
          ?.find((s) => s.id === l.sequence)
          ?.tracks.some((t) => t.kind === "voice" && !t.muted)
      )
        issues.push({
          path: `${l.id}.voice`,
          message: "台词配音与演出语音轨道不能同时占用",
        });
    }
  }
  for (const g of p.gallery ?? [])
    condition(g.unlock, `gallery.${g.id}.unlock`);
  for (const key of ["studioUrl", "galleryUrl", "aboutUrl"] as const)
    if (p.titleScreen[key] && !validPublicLink(p.titleScreen[key]))
      issues.push({
        path: `titleScreen.${key}`,
        message: "请输入有效的 HTTP(S)、mailto 或相对链接。",
      });
  for (const [i, link] of (p.titleScreen.footerLinks ?? []).entries())
    if (!validPublicLink(link.url))
      issues.push({
        path: `titleScreen.footerLinks.${i}.url`,
        message: "链接无效，请填写完整网址或相对路径。",
      });
  return issues;
}
export function assertProject(input: unknown): StoryProject {
  const issues = validateProject(input);
  if (issues.length)
    throw new Error(issues.map((e) => `${e.path}: ${e.message}`).join("\n"));
  return projectSchema.parse(input);
}
