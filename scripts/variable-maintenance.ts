import { renameVariable } from "../src/authoring/renameVariable";
import { readSnapshot, saveProject, assertRevision } from "./project-service";
import { readStudioData } from "./studio-data";
import { acquireProjectWrite } from "./project-locks";
import type { ProjectContext } from "./workspaces";

export function planVariableRename(
  ctx: ProjectContext,
  from: string,
  to: string,
) {
  const snapshot = readSnapshot(ctx),
    studio = readStudioData(ctx);
  const { changes } = renameVariable(snapshot.project, studio.data, from, to);
  return {
    workspaceId: ctx.id,
    from,
    to,
    revision: snapshot.revision,
    studioRevision: studio.revision,
    changes,
  };
}
export function applyVariableRename(
  ctx: ProjectContext,
  plan: ReturnType<typeof planVariableRename>,
  alreadyLocked = false,
) {
  const release = alreadyLocked ? () => {} : acquireProjectWrite(ctx);
  try {
    if (plan.workspaceId !== ctx.id)
      throw new Error("变量重命名方案属于其他工作区");
    assertRevision(ctx, plan.revision);
    const snapshot = readSnapshot(ctx),
      studio = readStudioData(ctx);
    if (studio.revision !== plan.studioRevision)
      throw Object.assign(new Error("创作资料已变化，请重新检查重命名方案"), {
        status: 409,
        code: "REVISION_CONFLICT",
        exitCode: 3,
      });
    const result = renameVariable(
      snapshot.project,
      studio.data,
      plan.from,
      plan.to,
    );
    return saveProject(ctx, result.project, plan.revision, true, undefined, {
      data: result.authoring,
      revision: plan.studioRevision,
    });
  } finally {
    release();
  }
}
