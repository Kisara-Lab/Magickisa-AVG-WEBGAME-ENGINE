import type { StoryProject } from "./types";
export const menuLabels: Record<string, string> = {
  menu: "游戏菜单",
  saves: "存读档",
  settings: "阅读与演出设置",
  history: "历史回看",
  chapters: "章节目录",
  notes: "旅者笔记",
  music: "音乐鉴赏",
  gallery: "画廊与结局",
  clue: "证据",
  encyclopedia: "百科全书",
  newspaper: "报刊",
};
export const interfaceLabels: Record<string, string> = {
  ...menuLabels,
  newGame: "开始游戏",
  continue: "继续游戏",
  load: "读取存档",
  about: "作品介绍",
};
export const interfaceFeatures: Record<string, string> = {
  musicGallery: "音乐鉴赏",
  gallery: "画廊与结局",
  history: "历史回看",
  chapters: "章节目录",
  notes: "旅者笔记",
  clue: "证据",
  encyclopedia: "百科全书",
  newspaper: "报刊",
};
export const notificationKeys = ["clue", "encyclopedia", "newspaper", "notes"];
export function notificationKey(category: string) {
  return category === "note" ? "notes" : category;
}
export function projectNotificationKeys(p: StoryProject) {
  return [
    ...new Set([
      ...notificationKeys,
      ...p.materials.map((m) => notificationKey(m.category)),
    ]),
  ];
}
export function uiLabel(
  p: StoryProject,
  key: string,
  fallback = interfaceLabels[key] ?? key,
) {
  return p.ui?.labels?.[key] || fallback;
}
export function featureEnabled(p: StoryProject, key: string) {
  if (key === "music" || key === "musicGallery")
    return (
      p.ui?.enabled?.musicGallery !== false && p.ui?.enabled?.music !== false
    );
  return (
    !Object.hasOwn(interfaceFeatures, key) || p.ui?.enabled?.[key] !== false
  );
}
