import type { StoryProject } from "./types";
export interface StoryEdge {
  key: string;
  from: string;
  to: string;
  kind: "next" | "choice";
  id?: string;
  label: string;
  conditional: boolean;
  crossChapter: boolean;
}
export interface GraphIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId: string;
  edgeKey?: string;
  field?: string;
}
export function analyzeGraph(project: StoryProject) {
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const edges: StoryEdge[] = project.nodes.flatMap((n) => [
    ...(n.next
      ? [
          {
            key: JSON.stringify([n.id, "next"]),
            from: n.id,
            to: n.next,
            kind: "next" as const,
            label: "继续",
            conditional: !!byId.get(n.next)?.condition,
            crossChapter: n.chapter !== byId.get(n.next)?.chapter,
          },
        ]
      : []),
    ...(n.choices ?? []).map((c) => ({
      key: JSON.stringify([n.id, "choice", c.id]),
      from: n.id,
      to: c.target,
      kind: "choice" as const,
      id: c.id,
      label: c.label,
      conditional: !!(c.condition || c.once || byId.get(c.target)?.condition),
      crossChapter: n.chapter !== byId.get(c.target)?.chapter,
    })),
  ]);
  const incoming = new Map<string, StoryEdge[]>(),
    outgoing = new Map<string, StoryEdge[]>();
  for (const n of project.nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    incoming.get(e.to)?.push(e);
    outgoing.get(e.from)!.push(e);
  }
  const reachable = new Set<string>(),
    queue = [project.startNodeId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (reachable.has(id) || !byId.has(id)) continue;
    reachable.add(id);
    for (const e of outgoing.get(id) ?? [])
      if (!reachable.has(e.to)) queue.push(e.to);
  }
  // Iterative Kosaraju avoids recursion overflow on long novels.
  const seen = new Set<string>(),
    order: string[] = [];
  for (const n of project.nodes) {
    if (seen.has(n.id)) continue;
    const stack: [string, boolean][] = [[n.id, false]];
    while (stack.length) {
      const [id, done] = stack.pop()!;
      if (done) {
        order.push(id);
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push([id, true]);
      for (const e of outgoing.get(id) ?? [])
        if (byId.has(e.to) && !seen.has(e.to)) stack.push([e.to, false]);
    }
  }
  const assigned = new Set<string>(),
    components: string[][] = [];
  for (const start of order.reverse()) {
    if (assigned.has(start)) continue;
    const group: string[] = [],
      todo = [start];
    while (todo.length) {
      const id = todo.pop()!;
      if (assigned.has(id)) continue;
      assigned.add(id);
      group.push(id);
      for (const e of incoming.get(id) ?? [])
        if (!assigned.has(e.from)) todo.push(e.from);
    }
    components.push(group);
  }
  const cycles = components.filter(
    (group) =>
      group.length > 1 ||
      outgoing.get(group[0])?.some((e) => e.to === group[0]),
  );
  const issues: GraphIssue[] = [];
  for (const edge of edges)
    if (!byId.has(edge.to))
      issues.push({
        code: "missing-target",
        severity: "error",
        message: `跳转目标不存在：${edge.to}`,
        nodeId: edge.from,
        edgeKey: edge.key,
      });
  for (const n of project.nodes) {
    const links = outgoing.get(n.id)!;
    if (!reachable.has(n.id))
      issues.push({
        code: "unreachable",
        severity: "warning",
        message: "从起点静态不可达",
        nodeId: n.id,
      });
    if (!links.length && !n.ending && n.presentation !== "ending")
      issues.push({
        code: "unmarked-terminal",
        severity: "warning",
        message: "无出口且未标记结局；请确认是预期停留",
        nodeId: n.id,
      });
    if (links.length && links.every((e) => e.conditional))
      issues.push({
        code: "gated-exits",
        severity: "warning",
        message: "所有出口均有门槛，可能停留在本场景",
        nodeId: n.id,
      });
  }
  for (const group of cycles) {
    const ids = new Set(group);
    if (group.every((id) => outgoing.get(id)!.every((e) => ids.has(e.to))))
      issues.push({
        code: "closed-cycle",
        severity: "warning",
        message: `闭合循环（${group.length} 个场景）；可保留有意的调查循环`,
        nodeId: group[0],
      });
  }
  return { byId, edges, incoming, outgoing, reachable, cycles, issues };
}
