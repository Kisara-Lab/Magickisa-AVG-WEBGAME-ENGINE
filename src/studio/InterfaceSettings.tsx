import type { StoryProject } from "../engine/types";
import {
  interfaceFeatures,
  interfaceLabels,
  projectNotificationKeys,
} from "../engine/uiConfig";
import { Card, Check, Field } from "./fields";
export function InterfaceSettings({
  project,
  onChange,
}: {
  project: StoryProject;
  onChange: (p: StoryProject) => void;
}) {
  return (
    <>
      <Card title="界面功能开关">
        <p>默认全部开放。关闭入口不删除玩家进度；存读档与设置始终保留。</p>
        {Object.entries(interfaceFeatures).map(([key, label]) => (
          <Check
            key={key}
            label={label}
            value={
              project.ui?.enabled?.[key] !== false &&
              (key !== "musicGallery" || project.ui?.enabled?.music !== false)
            }
            onChange={(value) =>
              onChange({
                ...project,
                ui: {
                  ...project.ui,
                  enabled: {
                    ...project.ui?.enabled,
                    [key]: value,
                    ...(key === "musicGallery" ? { music: value } : {}),
                  },
                },
              })
            }
          />
        ))}
      </Card>
      <Card title="分支可见性">
        <p>
          默认隐藏不可用选项，避免剧透。启用后显示选项文案和通用锁定原因，不公开条件变量或目标场景。一次性选项仍仅能选择一次；重新开始会重置本周目记录。
        </p>
        <Check
          label="向玩家显示锁定分支"
          value={project.ui?.enabled?.choiceHints === true}
          onChange={(value) =>
            onChange({
              ...project,
              ui: {
                ...project.ui,
                enabled: { ...project.ui?.enabled, choiceHints: value },
              },
            })
          }
        />
      </Card>
      {(["labels", "notifications"] as const).map((group) => (
        <Card
          key={group}
          title={group === "labels" ? "界面文案" : "解锁通知文案"}
        >
          <p>留空使用默认文案。未识别的旧键会保留，内容检查会列出提示。</p>
          <div className="st-fields">
            {(group === "labels"
              ? Object.keys(interfaceLabels)
              : projectNotificationKeys(project)
            ).map((key) => (
              <Field
                key={key}
                label={`${group === "labels" ? interfaceLabels[key] : key} · ${key}`}
                value={project.ui?.[group]?.[key] ?? ""}
                onChange={(value) =>
                  onChange({
                    ...project,
                    ui: {
                      ...project.ui,
                      [group]: { ...project.ui?.[group], [key]: value },
                    },
                  })
                }
              />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
