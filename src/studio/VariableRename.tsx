import { useState } from "react";
import { Fold, Modal } from "./components";
import { studioRequest } from "./ProjectManager";
interface Plan {
  workspaceId: string;
  from: string;
  to: string;
  revision: string;
  studioRevision: string;
  changes: { path: string; before: string; after: string }[];
}
export function VariableRename({
  dirty,
  onApplied,
}: {
  dirty: boolean;
  onApplied: () => void;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [plan, setPlan] = useState<Plan>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Fold title="协调重命名变量" summary="先检查明确引用 · 一次保存并备份">
      <p>
        同时更新已保存工程、变量注释、测试预设和路线断言。只替换逻辑变量字段与台词中的双花括号插值，普通正文、原始剧本、Agent
        结构稿和同步基线保持原值；下次同步须检查差异。
      </p>
      <p>
        现有玩家存档不会改写。已发行作品重命名变量可能影响旧存档，请先评估内容版本。
      </p>
      {dirty && <p role="status">请先保存或放弃工程、JSON 和创作资料修改。</p>}
      <label>
        原变量名
        <input
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPlan(undefined);
          }}
        />
      </label>
      <label>
        新变量名
        <input
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPlan(undefined);
          }}
        />
      </label>
      <button
        disabled={dirty || busy || !from || !to}
        onClick={() =>
          void run(async () =>
            setPlan(
              await studioRequest(
                "modern",
                `variables/rename-plan?${new URLSearchParams({ from, to })}`,
              ),
            ),
          )
        }
      >
        检查变量重命名
      </button>
      {error && <p role="alert">{error}</p>}
      {plan && (
        <Modal
          title="检查变量重命名影响"
          onClose={() => {
            if (!busy) setPlan(undefined);
          }}
        >
          <p>
            {plan.from} → {plan.to} · {plan.changes.length}{" "}
            处修改。确认后协调保存并生成备份，重新加载工程。
          </p>
          <ul style={{ maxHeight: 360, overflow: "auto" }}>
            {plan.changes.map((c, i) => (
              <li key={i} style={{ overflowWrap: "anywhere" }}>
                {c.path}
              </li>
            ))}
          </ul>
          <button
            disabled={busy || dirty}
            onClick={() =>
              void run(async () => {
                await studioRequest("modern", "variables/rename", plan);
                onApplied();
              })
            }
          >
            备份并重命名变量
          </button>
          <button disabled={busy} onClick={() => setPlan(undefined)}>
            取消重命名
          </button>
        </Modal>
      )}
    </Fold>
  );
}
