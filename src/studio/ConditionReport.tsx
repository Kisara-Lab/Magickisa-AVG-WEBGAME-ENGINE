import type { ConditionDiagnostics } from "../engine/logicDiagnostics";
import type { StoryProject } from "../engine/types";
import type { EditorPosition } from "./workspace";
import { issuePosition } from "./issuePosition";
export function ConditionReport({
  data,
  project,
  stale,
  visit,
}: {
  data?: ConditionDiagnostics;
  project: StoryProject;
  stale: boolean;
  visit: (p: EditorPosition) => void;
}) {
  return (
    <details className="st-fold">
      <summary>条件求值与跳过台词</summary>
      <p>
        {stale
          ? "工程已修改，诊断待更新；请重新应用到预览。"
          : "基于当前预览的实际求值；仅保留最近 500 个位置，false 不代表永久不可达。分支门槛可包含模拟完成效果后的状态。"}
      </p>
      {!data ? (
        <p>等待预览诊断。</p>
      ) : (
        <>
          <p>
            已观察 {data.observations.length} 个条件位置；曾因条件跳过{" "}
            {data.skipped.length} 条台词（本次预览去重）。
          </p>
          {data.observations.map((row) => (
            <button
              key={JSON.stringify(row.path)}
              onClick={() => visit(issuePosition(project, row.path))}
              disabled={stale}
            >
              {row.result ? "成立" : "不成立"} · {row.nodeId ?? "资源"}{" "}
              {row.lineId ?? ""} · {row.path.join(".")}
            </button>
          ))}
          {data.skipped.map((row) => (
            <button
              key={JSON.stringify([row.nodeId, row.lineId])}
              disabled={stale}
              onClick={() =>
                visit({
                  section: "script",
                  nodeId: row.nodeId,
                  lineId: row.lineId,
                  items: {},
                  field: "本句条件与玩家输入",
                })
              }
            >
              跳过台词 · {row.nodeId} / {row.lineId}
            </button>
          ))}
        </>
      )}
    </details>
  );
}
