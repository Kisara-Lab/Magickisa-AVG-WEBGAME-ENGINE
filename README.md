# MAGICKISA AVG WEBGAME ENGINE

[![CI](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)

**用网页技术制作、编辑和发行 AVG / 视觉小说。**

MAGICKISA 由 **Kisara-Lab** 维护，包含 React / TypeScript 运行时和可视化创作工作台 **MAGICKISA Studio**。剧本、资源、演出、预览与发行在同一工作台完成。

## 当前版本与 Legacy

`main` 当前为 **2.0.0-dev.2**，目标正式版本为 v2.0.0，尚未发布 v2 正式 Release。现代版成为唯一开发模式。

## CLI 与 Agent 开发

无须浏览器即可通过命令编辑剧本、跳转、条件效果、人物和演出，支持 JSON 批量事务、dry-run、revision 保护、引用检查、工程包与构建。CLI 与 Studio 共用保存、备份和跨进程锁，操作同一套现代工作区。

```sh
node scripts/magickisa.mjs help
node scripts/magickisa.mjs project create --name "我的作品" --json
# 把 ID 替换成返回的 workspaceId
node scripts/magickisa.mjs edit --workspace ID --file story.json --dry-run --json
node scripts/magickisa.mjs edit --workspace ID --file story.json --json
node scripts/magickisa.mjs build --workspace ID --json
```

完整事务示例与命令见 [CLI 手册](docs/CLI.md)，Agent 工作循环见 [Agent 开发指南](docs/AGENT-GUIDE.md)。本轮为静态检查，不提供剧情模拟、MCP 或专用剧本语法；实际剧情仍在 Studio 预览验收。

### 让 Agent 接入用户剧本并持续改稿

新增 `agent init/context`、`source add/list/status` 与 `sync plan/apply/status`。用户提供 UTF-8 TXT、Markdown 或 JSON，Agent 先读取工程上下文，再整理为按稳定 ID 组织的多文件结构稿。CLI 生成可检查的差异与事务，三方比较保护 Studio 人工修改；首次接管和同字段冲突须显式选择。CLI 不理解自然语言，不执行用户脚本，也不调用模型。

```sh
node scripts/magickisa.mjs agent init --workspace ID --json
node scripts/magickisa.mjs agent context --workspace ID --limit 20 --json
node scripts/magickisa.mjs source add --workspace ID --id chapter-1 --file "我的剧本.txt" --json
# Agent 整理 authoring/manifest.json 与 modules/*.json 后：
node scripts/magickisa.mjs sync plan --workspace ID --out plan.json --json
node scripts/magickisa.mjs sync apply --workspace ID --file plan.json --dry-run --json
node scripts/magickisa.mjs sync apply --workspace ID --file plan.json --json
```

详见 [多文件接入与增量同步手册](docs/AUTHORING.md)。工程包默认保留结构稿、映射与同步基线；原始附件仅通过 CLI `package export --include-sources` 或导出 API 的 `includeSources: true` 加入。创作资料不进入游戏发行产物。

**需要兼容档，请下载 [v1.0legacy — 双模式最终版](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/releases/tag/v1.0legacy)。** 这是首次 GitHub Release，包含最新双模式修复、源码 ZIP、跨平台联网启动包和 SHA256；其 npm 内部版本保持 1.0.0。更早的 `v1.0.0` 标签保留原样。

兼容档已停止支持，不建立持续维护的 Legacy 分支，不提供自动转换。v2 拒绝兼容档工作区、JSON、工程包及 `profile=release` 链接，并指向冻结 Release；原文件与浏览器记录不会删除。详见 [破坏性变更](BREAKING-CHANGES.md) 和 [版本记录](CHANGELOG.md)。

## 成果演示

### 《伊尔玛林的黄昏》

**在线体验：[https://ilmarin.kisara.info/](https://ilmarin.kisara.info/)**

这是使用 MAGICKISA 制作的实际游戏成果。演示站点独立维护，本次版本切换不改变站点部署。游戏剧情、图片、音乐及其他内容不包含在本仓库中，也不会因引擎采用 MIT 许可而自动获得 MIT 授权。当前不附带游戏工程包或 Demo。

## 功能概览

| 模块 | 能力 |
| --- | --- |
| 剧情 | 场景、连续台词、分支、进入条件、变量、进入与完成效果、历史回退 |
| 人物与画面 | 背景、人物、表情、立绘图层与布局、资源预加载 |
| 演出 | 引擎标识动画、献词、OP 镜头、定时字幕、双语 ED 与鸣谢 |
| 音频与资料 | 工程音轨、章节音乐规则、音乐鉴赏、资料解锁与阅读 |
| 玩家 | 存档与读档、存档导入导出、笔记、历史、自动播放与已读快进 |
| 工作台 | 熔金色 UI、章节导航、流程图、撤销重做、可调整面板 |
| 编辑便利 | 命令搜索、返回前进、帮助抽屉、引用追踪、素材选择器 |
| 工程 | 独立项目、素材上传、整体工程包、校验、备份与构建日志 |
| 高级编辑 | 完整 JSON、条件效果、图层、精确时间、运行变量调试 |

Live2D 提供适配器、生命周期接入与回退渲染；仓库不附 Cubism SDK 或模型，需自行接入并处理许可。

## 快速开始

需要 **Node.js 22+（含 npm）**、可写目录和现代浏览器。支持 Windows、macOS 与 Linux。首次安装需联网。

```sh
git clone https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE.git
cd Magickisa-AVG-WEBGAME-ENGINE
npm ci
npm run dev
```

浏览器打开终端实际地址下的 `/engine.html`，通常为 `http://127.0.0.1:5173/engine.html`。端口占用时以终端为准；服务只监听 `127.0.0.1`。

也可运行 `Start-Studio.cmd`（Windows）、`Start-Studio.command`（macOS）或 `sh Start-Studio.sh`（Linux）。共用启动器会检查环境、首次安装依赖并打开工程管理页。详见 [启动说明](START-HERE.md)。静态 `dist-studio/` 不能替代完整本地服务。

首次打开工程管理，输入名称并“创建并打开”，或导入 `.magickisa.zip`。空白工程仅包含格式要求的最小场景，不附剧情或媒体。默认工程位于 `workspace-projects/default-modern/`，独立工程位于 `workspace-projects/<workspaceId>/`。

## 从空白工程到发行

1. 创建工程，编辑起始场景和台词，再增加场景、下一场景或分支。
2. 上传背景、人物和音频，使用素材选择器回填字段。
3. 按需展开条件、效果与图层；保留稳定 ID，修改标题不会替换 ID。
4. 在演出页编排献词、OP 和 ED；没有需要时可以不配置。
5. 点击预览或按 `Ctrl+Enter`，在真实运行时检查。
6. 检查内容、保存工程，再构建发行包。
7. 导出整体工程包，用于迁移与长期归档。

### 工作台与高级编辑

导航按创作、资源、工程分组。左侧章节、中间编辑、右侧预览可折叠和调宽；返回/前进记录当前标签页最近 30 个位置。命令面板搜索操作、场景、台词、人物、资料和素材；引用面板基于已应用草稿计算，未应用 JSON 不参与引用索引。

连续台词输入以失焦、切换字段或停止输入 800ms 归组撤销，结构操作单独入栈。保留最近 40 步工程撤销；输入框的 `Ctrl+Z` 保留正常文字编辑行为。高级属性就地展开，完整 JSON 页面保留原始未应用输入。

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+K` | 命令面板 |
| `Ctrl+S` | 保存工程 |
| `Ctrl+Enter` | 更新预览 |
| `Esc` | 关闭浮层 |

### 草稿、保存与预览

停止输入 500ms 后保留 IndexedDB 草稿；刷新或重新启动可恢复或丢弃。草稿按项目及标签页隔离，现代工程原有存储键继续可读，兼容档记录保留但不加载。

“草稿已保留”表示浏览器副本，不等于磁盘已保存；“预览已同步”表示已应用内容已送入预览。输入时不自动重启剧情。存在未应用 JSON 时，先应用或处理输入，再保存、导出或构建。磁盘被外部修改会返回 409，恢复草稿不绕过版本检查。存储失败会明确提示。

### 素材、献词与 OP/ED

单素材上传上限 **8 MB**；更大音频可直接放入当前项目 `public/`。例如 `public/audio/theme.mp3` 对应字段 `/audio/theme.mp3`，不要填本机磁盘绝对路径。所有素材请求按工作区解析。

献词按页面编辑；OP/ED 支持时间轴、定位、字幕拖动和精确数字调整。OP 镜头可排序，节奏遵循现代运行时，不增加独立镜头时长。ED 保留双语字幕与鸣谢。无音频时使用计时后备，默认 OP 89 秒、ED 198 秒；署名依赖镜头位置，检查会提示镜头不足。现代献词由场景的 `presentation` 控制，单独添加标签不会触发。

## 整体工程导入导出

在“工程”页打开“项目管理与整体导入导出”，按 **检查 → 查看摘要 → 导出** 操作。默认包含已应用但未保存的表单修改，以及全部素材（含未使用素材和大音频）；不会先覆盖磁盘项目。

```text
manifest.json   格式版本、Studio 版本、profile、逐文件大小与 SHA256
project.json    当前已应用工程快照
content/        配套创作数据
public/         全部项目静态素材
README.txt      导入说明、联网依赖与警告
```

工程包格式继续为 **版本 1**，`profile: modern` 保留。可导入 v1.0legacy 导出的现代工程包；导出记录实际 Studio 版本，不硬编码 1.0.0。**新版导出不保证能由冻结 Legacy Studio 打开。**

在另一台兼容 Studio 上选择或拖入包，经检查、确认名称后建立独立工程。重复导入不会覆盖原项目，工作区随机 ID 与游戏内部 ID 分开，稳定 ID 保留。同名工程自动加序号。

| 限制 | 数值 |
| --- | --- |
| 工程 ZIP | 2 GiB |
| 解压总量 | 8 GiB |
| 文件数 | 50,000 |

导入检查清单、校验值、工程结构和本地引用，拒绝越界、符号链接、重复路径、大小写及 Unicode 冲突、清单外文件和损坏包。兼容档包明确拒绝，不转换。外链保留原链接，不自动下载。

包不含引擎、依赖、浏览器草稿、偏好、玩家存档、备份或构建输出。高级 JSON 导入导出**不含素材**。尚不支持项目合并、覆盖恢复或识别任意 ZIP 目录。

### 磁盘备份与存档

每次保存前备份旧 `project.json`，项目管理可打开备份目录。恢复前关闭 Studio，先复制整个项目目录，再把选中的备份 `project.json` 放回项目根目录，重启检查后保存。备份不包含全部素材，完整归档请导出工程包。

备份不自动清理、没有一键回退；管理功能追踪 [#6](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/issues/6)。异常写入会尝试回滚，但不承诺断电事务恢复。

现代玩家存档格式保持 v2。工程 ID 与内容版本必须匹配；新存档包含节点/台词顺序签名，重排会拒绝错位加载。旧存档缺少签名时仍按原规则读取，因此内容变化应提升工程版本并自行设计迁移。Studio 预览使用内存，不写真实玩家存档。

同包副本保留内部 ID，在同一域名部署会共享玩家存档标识；独立作品应有不同工程 ID 或独立来源。玩家存档尚无跨标签页协调，请避免并发游玩同项目与槽位，追踪 [#63](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/issues/63)。读取损坏或存储失败会保留原记录并提示，可导出进度后重试。

## 构建与部署

推荐在 Studio 按 **检查内容 → 保存工程 → 构建发行包** 执行。独立项目输出 `workspace-projects/<workspaceId>/dist/`；默认项目输出 `workspace-projects/default-modern/dist/`。

```sh
npm run build
# macOS / Linux 指定工程
MAGICKISA_WORKSPACE="工作区ID" npm run build
```

PowerShell：

```powershell
$env:MAGICKISA_WORKSPACE = "工作区ID"
npm run build
Remove-Item Env:MAGICKISA_WORKSPACE
```

命令行读取磁盘工程，不包含浏览器未保存修改。把 `dist/` 内容部署到静态网站根目录，通过 HTTP(S) 打开；子路径部署需要额外路径配置。外部素材仍依赖外部服务。

## 源码与验证

```text
src/engine/         TypeScript 运行时、渲染、存档与校验
src/game/           通用游戏界面
src/studio/         Studio、共享编辑控件与品牌资产
scripts/            内容生成、本地服务、工程包与验收
tests/              程序生成最小数据的通用测试
workspace-projects/ 本地工程与输出（Git 忽略）
```

运行时入口为 [src/engine/index.ts](src/engine/index.ts)，公开引擎、Store、Session、Runtime、校验与渲染能力；条件和效果可注册扩展处理器。现代 schemaVersion、稳定 ID、存档格式及预览消息协议保持原契约。

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:studio
npm run notices:check
npm run build:studio
# 打包当前已提交源码，用于本地验收，不会创建 GitHub Release
npm run package:release
npm run test:launcher
```

浏览器可用 `MAGICKISA_BROWSER` 指向 Chromium/Edge；Linux 可用 `npx playwright install --with-deps chromium`。涉及工程写入的测试顺序执行。CI 在 Windows/macOS/Linux 验证启动包，Ubuntu 验证类型、运行时、浏览器和 Studio 构建。

浏览器验收覆盖创建、未保存快照导出、SHA256、Legacy 现代包导入、中文空格路径、大素材、保存、预览、OP/ED/献词、启动标识、实际构建、390px 布局，以及兼容输入拒绝与原文件保留。

## 常见问题与边界

- **连接被拒绝**：保持本地服务运行，使用终端实际端口；旧书签端口可能不同。
- **修改后预览没变**：先应用 JSON，再按 `Ctrl+Enter`。
- **条件没有出口**：选项全隐藏或 once 用尽后尝试 next；目标条件不满足时停留，校验会警告。空 all 恒真，空 any 恒假。
- **数字或子 JSON 尚未应用**：保留上次有效值，处理输入后再保存。可选数字清空恢复默认值。
- **演出元数据**：presentation 与 media 决定播放；sequenceId 是保留元数据，不是独立序列注册表。
- **音频**：setAudio 引用 audio 中注册的 ID；指定音轨优先于章节规则，曲目音量乘全局音量。音乐鉴赏暂停章节 BGM。
- **商业使用**：MIT 允许商业使用；需保留版权与许可声明，第三方资源、SDK 与游戏内容分别授权。

尚未发布 npm 包、托管编辑服务或 Demo。没有原游戏专用存档迁移、历史发行 bundle 或对照基准。

## 许可与贡献

引擎、Studio 与本仓库自有品牌 SVG 使用 **[MIT License](LICENSE)**。第三方依赖见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，开发与 PR 约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

提交问题请附系统、Node.js 版本、复现步骤及日志，移除凭据与私人项目内容。维护组织：[Kisara-Lab](https://github.com/Kisara-Lab)。
