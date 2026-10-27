import type { AuthorProject } from "./model";
import type { EditorPosition } from "./workspace";

// Validation paths are retained so callers never have to infer a location from prose.
export function issuePosition(
  p: AuthorProject,
  path: (string | number)[],
): EditorPosition {
  if (!p || typeof p !== "object")
    return {
      section: "json",
      items: {},
    };
  const [root, index, part, item, leaf] = path;
  const at = <
    T extends {
      id: string;
    },
  >(
    values: T[] | undefined,
    key: string | number,
  ) =>
    !Array.isArray(values)
      ? undefined
      : typeof key === "number" || /^\d+$/.test(String(key))
        ? values[Number(key)]
        : values.find((v) => v?.id === key);
  const direct: Record<string, string> = {
    title: "场景标题",
    next: "下一场景",
    speaker: "默认说话人",
    background: "场景背景",
    startNodeId: "起始场景",
    sequenceId: "演出序列 ID",
    ending: "结局标识",
  };
  const conditionSelector = (label: string, tail: (string | number)[]) => {
    let selector = `[data-rule-label=${JSON.stringify(label)}]`;
    for (let i = 0; i < tail.length - 1; i++) {
      if (tail[i] === "conditions" && typeof tail[i + 1] === "number") {
        label = `子条件 ${Number(tail[++i]) + 1}`;
        selector += ` > .st-subrules > [data-rule-label=${JSON.stringify(label)}]`;
      } else if (tail[i] === "condition") {
        label = "取反对象";
        selector += ` > [data-rule-label=${JSON.stringify(label)}]`;
      }
    }
    const field = (
      {
        key: "变量名",
        value: "比较数值",
        operator: "比较方式",
        nodeId: "条件节点",
        equals: "期望值",
        type: `${label}类型`,
      } as Record<string, string>
    )[String(tail.at(-1))];
    return field
      ? `${selector} > .st-field [aria-label=${JSON.stringify(field)}], ${selector} > .st-fields [aria-label=${JSON.stringify(field)}], ${selector} > .st-value [aria-label=${JSON.stringify(field)}]`
      : undefined;
  };
  if (root === "nodes") {
    const n = at(p.nodes, index);
    if (
      !n ||
      typeof n !== "object" ||
      !Array.isArray(n.lines) ||
      (n.choices !== undefined && !Array.isArray(n.choices))
    )
      return {
        section: "json",
        items: {},
      };
    const pos: EditorPosition = {
      section: "script",
      nodeId: n?.id,
      items: {},
      field: direct[String(part)] || "场景属性",
    };
    if (part === "lines" && n) {
      const l = at(n.lines, item);
      pos.lineId = l?.id;
      pos.field =
        (
          {
            text: "台词正文",
            speaker: "本句说话人",
            characterId: "本句人物",
            expression: "本句表情",
            input: "本句条件与玩家输入",
            condition: "本句条件与玩家输入",
            characterLayers: "人物图层与位置",
          } as Record<string, string>
        )[String(leaf)] || "台词正文";
      if (leaf === "input")
        pos.field =
          (
            {
              key: "输入变量",
              label: "输入提示",
              maxLength: "输入长度上限",
            } as Record<string, string>
          )[String(path[5])] || pos.field;
      if (leaf === "characterLayers") {
        const field = (
          {
            characterId: `图层 ${Number(path[5]) + 1} 人物`,
            expression: "图层表情",
            position: "图层位置",
            x: "横坐标 %",
            y: "纵坐标 %",
            scale: "缩放",
            opacity: "透明度",
            zIndex: "层级",
          } as Record<string, string>
        )[String(path[6])];
        if (field) {
          pos.field = field;
          pos.selector = `[data-layer-index="${Number(path[5])}"] [aria-label=${JSON.stringify(field)}]`;
        }
      }
    }
    if (part === "choices" && n) {
      const c = at(n.choices || [], item);
      pos.field = `分支:${c?.id}${leaf === "condition" || leaf === "effects" ? `:${leaf}` : ""}`;
    }
    const rule =
      part === "condition"
        ? "进入条件"
        : part === "onEnter"
          ? "进入时效果"
          : part === "onComplete"
            ? "完成时效果"
            : undefined;
    if (rule) pos.field = rule;
    if (part === "condition")
      pos.selector = conditionSelector("进入条件", path.slice(3));
    if (part === "lines" && leaf === "condition")
      pos.selector = conditionSelector("条件", path.slice(5));
    if (part === "choices" && leaf === "condition") {
      const prefix = `[data-branch-id=${JSON.stringify(at(n?.choices, item)?.id)}] `;
      pos.selector = conditionSelector("可选条件", path.slice(5))
        ?.split(", ")
        .map((s) => prefix + s)
        .join(", ");
    }
    if (part === "choices" && leaf !== "condition" && leaf !== "effects") {
      const ci =
        n?.choices?.findIndex((c) => c?.id === at(n.choices, item)?.id) ?? -1;
      const field =
        leaf === "target"
          ? `分支 ${ci + 1} 目标`
          : leaf === "label"
            ? `分支 ${ci + 1} 文案`
            : undefined;
      if (field)
        pos.selector = `[data-branch-id=${JSON.stringify(at(n?.choices, item)?.id)}] [aria-label=${JSON.stringify(field)}]`;
    }
    // Locate an individual effect field inside its group, rather than the first repeated label.
    const effectAt =
      path.indexOf("effects") >= 0
        ? path.indexOf("effects")
        : path.indexOf("onEnter") >= 0
          ? path.indexOf("onEnter")
          : path.indexOf("onComplete");
    if (effectAt >= 0 && path[effectAt + 1] !== undefined) {
      const group = part === "choices" ? "选择后效果" : rule;
      const field = (
        {
          key: "效果变量",
          trackId: "音轨 ID",
          id: "资料 ID",
          amount: "增减量",
          text: "笔记内容",
          value: "写入值",
        } as Record<string, string>
      )[String(path[effectAt + 2])];
      if (group && field)
        pos.selector = `${part === "choices" ? `[data-branch-id=${JSON.stringify(at(n?.choices || [], item)?.id)}] ` : ""}[data-rule-label=${JSON.stringify(group)}] [data-effect-index="${Number(path[effectAt + 1])}"] [aria-label=${JSON.stringify(field)}]`;
    }
    return pos;
  }
  if (root === "characters") {
    const c = at(p.characters, index);
    return {
      section: "characters",
      items: {
        characters: c?.id || "",
        ...(part === "expressions"
          ? {
              expression: String(item),
            }
          : {}),
      },
      field:
        (
          {
            name: "人物名称",
            portrait: "人物立绘路径",
            renderer: "渲染方式",
          } as Record<string, string>
        )[String(part)] ||
        (part === "expressions" ? `表情 ${item} 路径` : "人物名称"),
    };
  }
  if (root === "materials")
    return {
      section: "materials",
      items: {
        materials: at(p.materials, index)?.id || "",
      },
      field:
        (
          {
            title: "资料标题",
            body: "资料正文",
            unlockNode: "解锁场景",
            unlock: "资料解锁条件",
          } as Record<string, string>
        )[String(part)] || "资料标题",
    };
  if (root === "backdrops")
    return {
      section: "assets",
      items: {},
      field: `背景 ${at(p.backdrops, index)?.id} 路径`,
    };
  if (root === "audio")
    return {
      section: "project",
      items: {},
      field: `音轨 ${at(p.audio, index)?.id} 路径`,
    };
  if (root === "resources")
    return {
      section: "assets",
      items: {},
      field:
        index === "sceneRules" && item === "asset"
          ? `规则 ${Number(part) + 1} 背景`
          : "场景背景匹配规则",
    };
  if (
    root === "media" &&
    (index === "opening" || index === "ending" || index === "dedication")
  )
    return {
      section: "presentations",
      mode: index,
      items: {},
      field:
        part === "duration"
          ? "总时长（秒）"
          : part === "audio"
            ? "演出音乐路径"
            : "",
    };
  const projectField = (
    {
      title: "游戏标题",
      version: "内容版本",
      startNodeId: "起始场景",
    } as Record<string, string>
  )[String(root)];
  return projectField
    ? {
        section: "project",
        items: {},
        field: projectField,
      }
    : {
        section: "json",
        items: {},
      };
}
