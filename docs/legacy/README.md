# MAGICKISA v1.0legacy 专用手册

**这套文档专门用于 `v1.0legacy`：包含引擎、MAGICKISA Studio，以及现代档和发行兼容档两种运行模式。** 文档中的命令、字段与行为以该冻结标签为准；npm 内部版本为 `1.0.0`。

**[下载 Legacy 源码与启动包](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/releases/tag/v1.0legacy) · [在线体验实际作品](https://ilmarin.kisara.info/)**

## 从这里开始

| 你的目标 | 专用文档 |
| --- | --- |
| 下载正确版本、校验附件、首次安装、选择运行模式 | [安装与启动](GETTING-STARTED.md) |
| 从空白工程写出可玩的分支故事，使用高级 JSON | [Studio 创作与剧情逻辑](STUDIO.md) |
| 配置素材、人物、音频、献词、OP、ED | [素材与演出](MEDIA.md) |
| 换电脑、备份恢复、构建网页、处理报错 | [工程迁移、发行与故障处理](PROJECTS-AND-RELEASE.md) |

建议第一次使用按表格顺序阅读；已有项目可直接进入对应章节。各篇开头均可返回本目录。

## Legacy 能做什么

- 制作网页 AVG、视觉小说、分支文字冒险：连续台词、人物表情与立绘图层、背景、变量、条件与效果。
- 使用熔金色 Studio 编辑剧本、人物、资料与素材；保留完整 JSON 和精确参数。
- 通过流程图查看跳转，再到剧本表单修改目标；提供搜索、引用定位、撤销与重做。
- 编排启动标识、献词、OP 镜头与字幕、双语 ED 和鸣谢。
- 在真实运行时中手动预览，检查桌面／手机尺寸与运行变量。
- 创建独立工程，导出含全部素材的工程包，在另一台兼容 Studio 中导入后继续开发。
- 构建静态网页，玩家通过浏览器游玩；提供存读档、历史、笔记、自动播放与已读快进等功能。

这份冻结版本不再持续维护。使用它制作独立作品时，请归档引擎安装包、校验文件与自己的完整工程包。

## 三种文件，分别用于什么

| 文件或目录 | 内容 | 使用者 |
| --- | --- | --- |
| Release 源码／Studio 启动包 | 引擎、编辑器、锁文件、启动脚本和许可证 | 开发者安装开发工具 |
| `.magickisa.zip` 整体工程包 | 一个工程的已应用数据、配套内容和全部项目素材 | 创作者交接、归档、换电脑 |
| 工程 `dist/` | 构建后的游戏网页与资源 | 部署到网站，交给玩家体验 |

启动包不附 Node.js、依赖、游戏内容或用户工程；首次运行需要联网安装依赖。工程包不附引擎，因此换电脑时仍需先准备开发工具。

## 示例与源码依据

本手册提供一个“三场景分支故事”，可在新建空白工程中操作；所有示例不依赖演示游戏的剧情或素材。

核对技术细节时，请查看冻结源码：

- [完整 Legacy 源码](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/tree/v1.0legacy)
- [现代工程类型](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/blob/v1.0legacy/src/engine/types.ts)
- [Studio 共享编辑模型](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/blob/v1.0legacy/src/studio/model.ts)
- [发行兼容运行时](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/blob/v1.0legacy/src/compat/release/engine/runtime.js)

## 许可

引擎、Studio 与仓库自有品牌资产按 [MIT 许可证](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/blob/v1.0legacy/LICENSE)提供；[第三方组件](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/blob/v1.0legacy/THIRD_PARTY_NOTICES.md)保留各自许可。在线作品《伊尔玛林的黄昏》的剧情、图片、音乐等不随仓库公开，也不因引擎使用 MIT 而获得 MIT 授权。
