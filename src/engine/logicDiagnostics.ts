import type { Condition, Effect, StoryProject } from "./types";
export type LogicPath = (string | number)[];
export interface LogicSite {
  path: LogicPath;
  nodeId?: string;
  lineId?: string;
}
/** Explicit reference sites only; arbitrary story text is never treated as logic. */
export function logicSites(p: StoryProject) {
  const conditions: { condition: Condition; site: LogicSite }[] = [];
  const variables: {
    key: string;
    mode: "read" | "write" | "input";
    site: LogicSite;
  }[] = [];
  const condition = (c: Condition | undefined, site: LogicSite) => {
    if (!c) return;
    conditions.push({ condition: c, site });
    if (c.type === "flag" || c.type === "count" || c.type === "contains")
      variables.push({
        key: c.key,
        mode: "read",
        site: { ...site, path: [...site.path, "key"] },
      });
    if (c.type === "not")
      condition(c.condition, { ...site, path: [...site.path, "condition"] });
    if (c.type === "all" || c.type === "any")
      c.conditions.forEach((c, i) =>
        condition(c, { ...site, path: [...site.path, "conditions", i] }),
      );
  };
  const effects = (es: Effect[] | undefined, site: LogicSite) =>
    es?.forEach((e, i) => {
      if ("key" in e)
        variables.push({
          key: e.key,
          mode: "write",
          site: { ...site, path: [...site.path, i, "key"] },
        });
    });
  p.nodes.forEach((n, i) => {
    const site = (tail: LogicPath): LogicSite => ({
      nodeId: n.id,
      path: ["nodes", i, ...tail],
    });
    condition(n.condition, site(["condition"]));
    effects(n.onEnter, site(["onEnter"]));
    effects(n.onComplete, site(["onComplete"]));
    n.lines.forEach((l, j) => {
      condition(l.condition, {
        ...site(["lines", j, "condition"]),
        lineId: l.id,
      });
      if (l.input)
        variables.push({
          key: l.input.key,
          mode: "input",
          site: { ...site(["lines", j, "input", "key"]), lineId: l.id },
        });
    });
    n.choices?.forEach((c, j) => {
      condition(c.condition, site(["choices", j, "condition"]));
      effects(c.effects, site(["choices", j, "effects"]));
    });
  });
  p.materials.forEach((m, i) =>
    condition(m.unlock, { path: ["materials", i, "unlock"] }),
  );
  p.gallery?.forEach((g, i) =>
    condition(g.unlock, { path: ["gallery", i, "unlock"] }),
  );
  return { conditions, variables };
}
export function variableDiagnostics(p: StoryProject) {
  const { variables } = logicSites(p);
  const declared = new Set(Object.keys(p.variables ?? {}));
  const written = new Set(
    variables.filter((v) => v.mode !== "read").map((v) => v.key),
  );
  return variables
    .filter(
      (v) =>
        !declared.has(v.key) &&
        (p.variables !== undefined ||
          (v.mode === "read" && !written.has(v.key))),
    )
    .map((v) => ({
      code: "undeclared-variable",
      severity: "warning" as const,
      message: `变量 ${v.key} ${p.variables !== undefined ? "未在工程变量表声明" : "只发现读取，未发现初始化、输入或效果赋值"}；请核对拼写。动态或外部赋值仍允许。`,
      ...v.site,
    }));
}
export function createConditionDiagnostics(p: StoryProject) {
  const sites = new WeakMap<Condition, LogicSite[]>();
  for (const { condition, site } of logicSites(p).conditions)
    sites.set(condition, [...(sites.get(condition) ?? []), site]);
  const observations = new Map<string, LogicSite & { result: boolean }>();
  const skipped = new Map<string, { nodeId: string; lineId: string }>();
  return {
    observeCondition(condition: Condition, result: boolean) {
      for (const site of sites.get(condition) ?? []) {
        observations.set(JSON.stringify(site.path), { ...site, result });
        if (observations.size > 500)
          observations.delete(observations.keys().next().value!);
      }
    },
    onSkipLine(nodeId: string, lineId: string) {
      skipped.set(JSON.stringify([nodeId, lineId]), { nodeId, lineId });
      if (skipped.size > 500) skipped.delete(skipped.keys().next().value!);
    },
    snapshot() {
      return {
        observations: [...observations.values()],
        skipped: [...skipped.values()],
      };
    },
  };
}
export type ConditionDiagnostics = ReturnType<
  ReturnType<typeof createConditionDiagnostics>["snapshot"]
>;
