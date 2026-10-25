// MAGICKISA release-compatible runtime.
export function validateProject(project) {
  const issues = [];
  (project.id ||
    issues.push({
      path: "id",
      message: "project id is required",
    }),
    project.startNodeId ||
      issues.push({
        path: "startNodeId",
        message: "startNodeId is required",
      }));
  const nodeIds = new Set();
  for (const r of project.nodes || [])
    (nodeIds.has(r.id) &&
      issues.push({
        path: `nodes.${r.id}`,
        message: "duplicate node id",
      }),
      nodeIds.add(r.id));
  nodeIds.has(project.startNodeId) ||
    issues.push({
      path: "startNodeId",
      message: "start node does not exist",
    });
  for (const r of project.nodes || []) {
    r.next &&
      !nodeIds.has(r.next) &&
      issues.push({
        path: `nodes.${r.id}.next`,
        message: `target ${r.next} does not exist`,
      });
    for (const l of r.choices || [])
      nodeIds.has(l.target) ||
        issues.push({
          path: `nodes.${r.id}.choices.${l.id}`,
          message: `target ${l.target} does not exist`,
        });
  }
  return issues;
}
export function assertProject(project) {
  const issues = validateProject(project);
  if (issues.length)
    throw new Error(issues.map((n) => `${n.path}: ${n.message}`).join("; "));
  return project;
}
