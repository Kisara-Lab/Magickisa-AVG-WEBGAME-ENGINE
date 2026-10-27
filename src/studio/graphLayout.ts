import dagre from "@dagrejs/dagre";
import type { StoryNode } from "../engine/types";
import type { StoryEdge } from "../engine/graph";
export function graphLayout(nodes: StoryNode[], edges: StoryEdge[]) {
  const raw = new dagre.graphlib.Graph({ directed: true });
  for (const n of nodes) raw.setNode(n.id);
  for (const e of edges)
    if (raw.hasNode(e.from) && raw.hasNode(e.to)) raw.setEdge(e.from, e.to);
  // Collapse investigation loops before ranking. Dense cyclic stories otherwise
  // generate enormous ranks and spend seconds minimising crossings.
  const groups = dagre.graphlib.alg.tarjan(raw),
    groupOf = new Map<string, string>();
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  groups.forEach((ids) => ids.sort((a, b) => order.get(a)! - order.get(b)!));
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    nodesep: 55,
    ranksep: 150,
    marginx: 30,
    marginy: 30,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  groups.forEach((ids, i) => {
    const columns = Math.min(4, ids.length),
      rows = Math.ceil(ids.length / columns),
      height = Math.max(
        ...ids.map((id) => 180 + (byId.get(id)?.choices?.length ?? 0) * 28),
      );
    graph.setNode(String(i), {
      width: columns * 330,
      height: rows * height,
      columns,
      cellHeight: height,
    });
    ids.forEach((id) => groupOf.set(id, String(i)));
  });
  for (const e of edges) {
    const a = groupOf.get(e.from),
      b = groupOf.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) graph.setEdge(a, b);
  }
  dagre.layout(graph);
  const result: Record<string, { x: number; y: number }> = {};
  groups.forEach((ids, i) => {
    const p = graph.node(String(i));
    ids.forEach((id, j) => {
      result[id] = {
        x: p.x - p.width / 2 + (j % p.columns) * 330,
        y: p.y - p.height / 2 + Math.floor(j / p.columns) * p.cellHeight,
      };
    });
  });
  return result;
}
