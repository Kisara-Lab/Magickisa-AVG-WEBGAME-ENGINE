import type { AuthorProject, Section } from "./model";
import type { Condition, Effect } from "../engine/types";
import { resolveAsset, resolveScene, resolveTrack } from "../engine/media";
import type { EditorPosition } from "./workspace";
export interface Destination {
  id: string;
  label: string;
  category: string;
  hint: string;
  position: EditorPosition;
}
export interface Usage {
  kind: "assets" | "characters" | "materials" | "script" | "audio";
  target: string;
  label: string;
  field: string;
  derived?: boolean;
  position: EditorPosition;
}
export function sceneDeletionReferences(
  p: AuthorProject,
  nodeId: string,
): Usage[] {
  return usages(p).filter(
    (r) =>
      r.kind === "script" &&
      r.target === nodeId &&
      r.position.nodeId !== nodeId,
  );
}
export function expressionReferences(
  p: AuthorProject,
  characterId: string,
  expression: string,
): Usage[] {
  return p.nodes.flatMap((n) =>
    n.lines.flatMap((l) => {
      const fields: string[] = [];
      if (l.characterId === characterId && l.expression === expression)
        fields.push("本句人物表情");
      l.characterLayers?.forEach((layer, i) => {
        if (
          layer.characterId === characterId &&
          layer.expression === expression
        )
          fields.push(`立绘图层 ${i + 1} 表情`);
      });
      return fields.map((field) => ({
        kind: "characters" as const,
        target: characterId,
        label: `${n.title} · ${l.id}`,
        field,
        position: {
          section: "script" as const,
          nodeId: n.id,
          lineId: l.id,
          items: {},
          field: "人物图层与位置",
        },
      }));
    }),
  );
}
export const sectionNames: Record<Section, string> = {
  script: "剧本",
  graph: "流程图",
  presentations: "演出",
  assets: "资源",
  characters: "人物",
  materials: "资料",
  project: "工程",
  json: "JSON",
  publish: "发行",
};
export function destinations(
  p: AuthorProject,
  files: {
    url: string;
  }[],
): Destination[] {
  const result: Destination[] = [];
  const add = (
    id: string,
    label: string,
    category: string,
    hint: string,
    position: EditorPosition,
  ) =>
    result.push({
      id,
      label,
      category,
      hint,
      position,
    });
  for (const n of p.nodes) {
    const position: EditorPosition = {
      section: "script",
      nodeId: n.id,
      items: {},
    };
    add(`scene:${n.id}`, n.title, "场景", n.id, position);
    for (const l of n.lines)
      add(
        `line:${n.id}:${l.id}`,
        l.text || "空台词",
        "台词",
        `${n.title} · ${l.id}`,
        {
          ...position,
          lineId: l.id,
          field: "台词正文",
        },
      );
  }
  for (const c of p.characters)
    add(`character:${c.id}`, c.name, "人物", c.id, {
      section: "characters",
      items: {
        characters: c.id,
      },
      field: "人物名称",
    });
  for (const m of p.materials)
    add(`material:${m.id}`, m.title, "资料", `${m.category} · ${m.id}`, {
      section: "materials",
      items: {
        materials: m.id,
      },
      field: "资料标题",
    });
  for (const f of files)
    add(`asset:${f.url}`, f.url.split("/").pop() || f.url, "素材", f.url, {
      section: "assets",
      items: {
        assets: f.url,
      },
    });
  return result;
}
// Only typed reference fields are indexed; dialogue/body text is never treated as a reference.
export function usages(p: AuthorProject): Usage[] {
  const result: Usage[] = [];
  const modern = {
    ...p,
    schemaVersion: 2 as const,
  };
  const add = (
    kind: Usage["kind"],
    target: string | undefined,
    label: string,
    field: string,
    position: EditorPosition,
    derived = false,
  ) => {
    if (target)
      result.push({
        kind,
        target,
        label,
        field,
        position,
        derived,
      });
  };
  const asset = (
    target: string | undefined,
    label: string,
    field: string,
    position: EditorPosition,
    derived = false,
  ) => {
    if (target)
      add(
        "assets",
        resolveAsset(modern, target),
        label,
        field,
        position,
        derived,
      );
  };
  const condition = (
    c: Condition | undefined,
    label: string,
    field: string,
    position: EditorPosition,
  ): void => {
    if (!c) return;
    if (c.type === "visited") add("script", c.nodeId, label, field, position);
    if (c.type === "not") condition(c.condition, label, field, position);
    if (c.type === "all" || c.type === "any")
      c.conditions.forEach((v) => condition(v, label, field, position));
  };
  const effects = (
    values: Effect[] | undefined,
    label: string,
    field: string,
    position: EditorPosition,
  ) => {
    values?.forEach((e) => {
      if (e.type === "unlockMaterial" || e.type === "markRead")
        add("materials", e.id, label, field, position);
      if (e.type === "setAudio") {
        const track = p.audio.find((a) => a.id === e.trackId);
        add(
          "audio",
          e.trackId,
          label,
          `${field} · 音轨 ${e.trackId}${track ? "" : "（已失效）"}`,
          position,
        );
        asset(track?.src, label, field, position);
      }
    });
  };
  add("script", p.startNodeId, "工程起始场景", "起始场景", {
    section: "project",
    items: {},
    field: "起始场景",
  });
  for (const n of p.nodes) {
    const pos: EditorPosition = {
      section: "script",
      nodeId: n.id,
      items: {},
    };
    add("script", n.next, n.title, "下一场景", {
      ...pos,
      field: "下一场景",
    });
    asset(n.background, n.title, "场景背景", {
      ...pos,
      field: "场景背景",
    });
    if (!n.background || false)
      asset(
        resolveScene(modern, n.title),
        n.title,
        "背景规则",
        {
          ...pos,
          field: "场景背景",
        },
        true,
      );
    asset(
      resolveTrack(modern, n.title),
      n.title,
      "章节音乐规则",
      {
        section: "project",
        items: {},
        field: "章节音乐",
      },
      true,
    );
    condition(n.condition, n.title, "场景条件", {
      ...pos,
      field: "进入条件",
    });
    effects(n.onEnter, n.title, "进入效果", {
      ...pos,
      field: "进入时效果",
    });
    effects(n.onComplete, n.title, "完成效果", {
      ...pos,
      field: "完成时效果",
    });

    for (const l of n.lines) {
      const line = {
        ...pos,
        lineId: l.id,
        field: "台词正文",
      };
      add("characters", l.characterId, `${n.title} · ${l.id}`, "台词人物", {
        ...line,
        field: "本句人物",
      });
      l.characterLayers?.forEach((layer) =>
        add(
          "characters",
          layer.characterId,
          `${n.title} · ${l.id}`,
          "立绘图层",
          {
            ...line,
            field: "人物图层与位置",
          },
        ),
      );
      condition(l.condition, `${n.title} · ${l.id}`, "显示条件", {
        ...line,
        field: "本句条件与玩家输入",
      });
    }
    n.choices?.forEach((c) => {
      const choice = {
        ...pos,
        field: `分支:${c.id}`,
      };
      add("script", c.target, `${n.title} · ${c.label}`, "分支目标", choice);
      condition(c.condition, n.title, "分支条件", {
        ...choice,
        field: `分支:${c.id}:condition`,
      });
      effects(c.effects, n.title, "分支效果", {
        ...choice,
        field: `分支:${c.id}:effects`,
      });
    });
  }
  p.characters.forEach((c) => {
    const pos: EditorPosition = {
      section: "characters",
      items: {
        characters: c.id,
      },
    };
    asset(c.portrait, c.name, "默认立绘", {
      ...pos,
      field: "人物立绘路径",
    });
    asset(c.live2d?.model, c.name, "Live2D 模型", {
      ...pos,
      field: "Live2D 模型路径",
    });
    Object.entries(c.expressions || {}).forEach(([key, value]) =>
      asset(value, `${c.name} · ${key}`, "表情资源", {
        ...pos,
        items: {
          ...pos.items,
          expression: key,
        },
        field: `表情 ${key} 路径`,
      }),
    );
  });
  p.materials.forEach((m) => {
    const pos: EditorPosition = {
      section: "materials",
      items: {
        materials: m.id,
      },
      field: "资料解锁条件",
    };
    add("script", m.unlockNode, m.title, "解锁场景", {
      ...pos,
      field: "解锁场景",
    });
    condition(m.unlock, m.title, "解锁条件", pos);
  });
  p.backdrops.forEach((b) =>
    asset(b.src, b.id, "背景资源注册", {
      section: "assets",
      items: {},
      field: `背景 ${b.id} 路径`,
    }),
  );
  p.resources.sceneRules?.forEach((rule, i) =>
    asset(rule.asset, `背景规则 ${i + 1}`, "规则资源定义", {
      section: "assets",
      items: {},
      field: `规则 ${i + 1} 背景`,
    }),
  );
  p.audio.forEach((a) =>
    asset(a.src, a.id, "音频资源注册", {
      section: "project",
      items: {},
      field: `音轨 ${a.id} 路径`,
    }),
  );
  const project: EditorPosition = {
    section: "project",
    items: {},
  };
  asset(p.titleScreen.backdrop, "标题画面", "标题背景", {
    ...project,
    field: "首页背景",
  });
  asset(p.titleScreen.music, "标题画面", "标题音乐", {
    ...project,
    field: "首页音乐",
  });
  Object.entries(p.media.chapterMusic || {}).forEach(([key, value]) =>
    asset(value, key, "章节音乐", {
      ...project,
      field: `章节音乐 ${key} 路径`,
    }),
  );
  p.media.musicGallery?.forEach((m, i) => {
    asset(m.src, m.title, "音乐鉴赏", {
      ...project,
      field: `鉴赏 ${i + 1} 路径`,
    });
    add("script", m.unlockNode, m.title, "音乐解锁场景", {
      ...project,
      field: `鉴赏 ${i + 1} 解锁场景`,
    });
  });
  for (const mode of ["opening", "ending"] as const) {
    const media = p.media[mode];
    const pos: EditorPosition = {
      section: "presentations",
      mode,
      items: {},
    };
    asset(media?.audio, "ED", "演出音频", {
      ...pos,
      field: "演出音乐路径",
    });
    asset(media?.lyrics, "外置歌词", "歌词路径", {
      ...pos,
      field: "LRC 歌词路径",
    });
    asset(p.media.ending?.image, "ED", "片尾背景", {
      ...pos,
      field: "ED 背景图片",
    });
  }
  return result;
}
export const helpContent: Record<
  Section,
  {
    purpose: string;
    steps: string[];
    advanced: string;
  }
> = {
  script: {
    purpose: "编写连续台词并配置场景与分支。",
    steps: [
      "从章节树选择场景，点击台词直接输入。",
      "选中台词后展开立绘与高级属性；预览按钮才会更新画面。",
      "条件控制是否显示，例如 visited 判断已访问场景；效果改变变量或解锁资料。",
      "所有选项被条件隐藏或已用尽时，会尝试进入下一场景；未设置下一场景或其条件不满足时停留当前节点。",
    ],
    advanced:
      "展开场景属性、条件、效果和图层；完整结构可在 JSON 编辑。",
  },
  graph: {
    purpose: "查看场景之间的跳转关系。",
    steps: [
      "适应视图查看全局，定位当前节点查看邻接关系。",
      "选择节点后前往剧本修改分支目标。",
    ],
    advanced:
      "连线关系由剧本中的 next 和 choices 决定；条件与效果在剧本中编辑。",
  },
  presentations: {
    purpose: "编辑献词、OP 和 ED。",
    steps: [
      "选择演出类型及当前页面或字幕。",
      "拖动字幕标记粗调，数字时间输入精调，例如 12.50 秒。",
      "OP 镜头可排序；原播放节奏为每 14 秒轮换。",
    ],
    advanced:
      "保留精确时间、双语字幕与鸣谢参数。外置歌词缺失时可继续使用已有内嵌字幕。",
  },
  assets: {
    purpose: "导入、查找、试听和分配素材。",
    steps: [
      "选择文件或拖入，每个文件最多 8 MB。",
      "选择图片或音频后分配到场景或演出。",
      "在哪里使用列出明确引用及由规则匹配的使用位置。",
    ],
    advanced:
      "资源可使用背景 ID 或路径，例如 /assets/imported/scene.png；导入采用唯一文件名，不覆盖已有素材。",
  },
  characters: {
    purpose: "维护人物、默认立绘与表情。",
    steps: [
      "从人物列表选择要编辑的角色。",
      "为默认立绘和表情选择素材，在台词中指定人物。",
    ],
    advanced:
      "保留图层与渲染参数。Live2D 真实模型和 SDK 需外部提供，不能视为已恢复。",
  },
  materials: {
    purpose: "维护百科、报纸和笔记。",
    steps: [
      "选择资料后编辑正文及分类。",
      "用解锁场景或条件控制可见性，并查看资料的解锁效果引用。",
    ],
    advanced:
      "条件可以组合 all、any、not；例如 visited 指定一个场景。高级结构可在 JSON 编辑。",
  },
  project: {
    purpose: "设置工程信息、起始场景、标题和资源规则。",
    steps: [
      "确认正在编辑的工程版本。",
      "设置资源注册和关键词规则，使用引用追踪检查影响。",
    ],
    advanced: "保留全部项目参数及 JSON 编辑；两套工程分别保存。",
  },
  json: {
    purpose: "完整编辑工程结构及高级配置。",
    steps: [
      "先修改并应用 JSON，再保存工程。",
      "未应用 JSON 不参与表单引用索引，也不能导出或构建。",
    ],
    advanced:
      "JSON 应用不绕过校验和 revision 冲突检查；跳转其他页面不会丢弃未应用文本。",
  },
  publish: {
    purpose: "检查内容、保存工程并构建发行包。",
    steps: [
      "先处理未应用 JSON 和阻塞问题。",
      "保存工程后构建，查看输出目录与日志。",
    ],
    advanced:
      "草稿已保留表示浏览器 IndexedDB 保存成功；工程已保存才表示文件落盘。外部修改会返回 409，不能直接覆盖。",
  },
};
