import { useState } from "react";
import type { StoryProject } from "../engine/types";
import { randomId } from "../engine/id";
import { Card, Field, ConditionEditor } from "./fields";
import { PickAsset } from "./AssetPicker";
export function GalleryEditor({
  project,
  onChange,
}: {
  project: StoryProject;
  onChange: (project: StoryProject) => void;
}) {
  const [id, setId] = useState("");
  const items = project.gallery ?? [],
    entry = items.find((g) => g.id === id) ?? items[0];
  const change = (value: NonNullable<typeof entry>) =>
    onChange({
      ...project,
      gallery: items.map((g) => (g.id === value.id ? value : g)),
    });
  return (
    <Card title="画廊与跨周目收藏">
      <p>
        设置画面及解锁条件。未解锁条目不展示标题或图像；收藏跨周目保留，Studio
        预览只使用内存。
      </p>
      <PickAsset
        label="选择图片新增画廊条目"
        kind="image"
        onPick={(asset) => {
          const id = randomId();
          onChange({
            ...project,
            gallery: [...items, { id, title: "新画廊画面", asset }],
          });
          setId(id);
        }}
      />
      <label>
        选择画廊条目
        <select value={entry?.id ?? ""} onChange={(e) => setId(e.target.value)}>
          <option value="">选择条目</option>
          {items.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} · {g.id}
            </option>
          ))}
        </select>
      </label>
      {entry && (
        <>
          <Field
            label="画廊标题"
            value={entry.title}
            onChange={(title) => change({ ...entry, title })}
          />
          <Field
            label="画廊图片资源"
            value={entry.asset}
            onChange={(asset) => change({ ...entry, asset })}
          />
          <PickAsset
            label="更换画廊图片"
            kind="image"
            onPick={(asset) => change({ ...entry, asset })}
          />
          <ConditionEditor
            nodes={project.nodes}
            materials={project.materials}
            value={entry.unlock}
            label="画廊解锁条件"
            onChange={(unlock) => change({ ...entry, unlock })}
          />
          <p>无条件表示始终开放。删除工程中的条目不会删除玩家既有收藏记录。</p>
          <button
            onClick={() =>
              onChange({
                ...project,
                gallery: items.filter((g) => g.id !== entry.id),
              })
            }
          >
            移除此画廊条目
          </button>
        </>
      )}
    </Card>
  );
}
