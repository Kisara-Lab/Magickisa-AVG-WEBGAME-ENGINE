import { Modal } from "./components";
import { helpContent, sectionNames } from "./discovery";
import type { Usage } from "./discovery";
import type { AuthorProject, Profile, Section } from "./model";
import type { EditorPosition } from "./workspace";
export function DiscoveryPanels({
  helpOpen,
  usageOpen,
  onCloseHelp,
  onCloseUsage,
  section,
  project,
  position,
  references,
  rawDirty,
  onVisit,
  profile,
}: {
  helpOpen: boolean;
  usageOpen: boolean;
  onCloseHelp: () => void;
  onCloseUsage: () => void;
  section: Section;
  project: AuthorProject | null;
  position: EditorPosition;
  references: Usage[];
  rawDirty: boolean;
  onVisit: (position: EditorPosition) => void;
  profile: Profile;
}) {
  const help = helpContent[section];
  const kind =
    section === "graph" ? "script" : section === "project" ? "audio" : section;
  const target =
    kind === "script"
      ? position.nodeId
      : position.items[kind] ||
        (kind === "characters"
          ? project?.characters[0]?.id
          : kind === "materials"
            ? project?.materials[0]?.id
            : "");
  const matches = references.filter(
    (r) =>
      r.kind === kind && (r.target === target || (kind === "audio" && !target)),
  );
  const label =
    kind === "script"
      ? project?.nodes.find((n) => n.id === target)?.title
      : kind === "characters"
        ? project?.characters.find((c) => c.id === target)?.name
        : kind === "materials"
          ? project?.materials.find((m) => m.id === target)?.title
          : target;
  return (
    <>
      {helpOpen && (
        <div className="st-help-drawer">
          <Modal
            title={`${sectionNames[section]} · 帮助`}
            onClose={onCloseHelp}
          >
            <p>{help.purpose}</p>
            <ol>
              {help.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <h3>高级功能仍然保留</h3>
            <p>{help.advanced}</p>
            {false}
            <h3>快捷键</h3>
            <p>
              Ctrl+K 快速前往 · Ctrl+S 保存工程 · Ctrl+Enter 更新预览 · Esc
              关闭浮层
            </p>
            <h3>保存的区别</h3>
            <p>
              草稿已保留：浏览器保存成功。工程已保存：源文件落盘。预览已同步：运行画面使用当前已应用草稿。
            </p>
          </Modal>
        </div>
      )}
      {usageOpen && (
        <Modal title="在哪里使用" onClose={onCloseUsage}>
          <h3>
            {label ||
              (kind === "audio" ? "工程音轨引用（含失效 ID）" : "请先选择条目")}
          </h3>
          <p>
            引用基于已应用草稿。
            {rawDirty
              ? "JSON 有未应用修改，应用后才会更新引用。"
              : "查看和跳转不会修改工程。"}
          </p>
          <div className="st-reference-results">
            {matches.map((r, i) => (
              <button key={i} onClick={() => onVisit(r.position)}>
                <strong>{r.label}</strong>
                <span>
                  {sectionNames[r.position.section]} · {r.field}
                  {r.derived ? " · 由规则匹配" : ""} →
                </span>
              </button>
            ))}
          </div>
          {!matches.length && (
            <p>
              {target
                ? "没有找到明确引用或当前规则匹配；此结果不包含任意文本提及。"
                : "关闭后从当前列表选择素材、人物、资料或场景。"}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
