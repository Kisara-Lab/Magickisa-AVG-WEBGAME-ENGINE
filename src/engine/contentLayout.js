// Optional save metadata: exact ordered stable IDs detect positional content changes.
export function contentLayout(project) {
  return JSON.stringify(
    project.nodes.map((n) => [n.id, n.lines.map((l) => l.id)]),
  );
}
