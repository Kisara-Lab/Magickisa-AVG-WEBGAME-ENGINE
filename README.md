# MAGICKISA AVG WEBGAME ENGINE

基于 React、TypeScript 和 Vite 的网页 AVG 引擎与可视化开发工作台 **MAGICKISA Studio**。

本仓库提供引擎和编辑器源码，不包含商业游戏剧情、图片、音乐或 Demo。代码与仓库自有品牌 SVG 采用 MIT 许可；第三方组件保留各自许可。

## 开始使用

需要 **Node.js 22 或更新版本**和 npm。支持 Windows、macOS 与 Linux；推荐使用最新版 Chromium、Edge 或 Chrome。

```sh
git clone https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE.git
cd Magickisa-AVG-WEBGAME-ENGINE
npm ci
npm run dev
```

打开终端显示的本机地址下的 `/engine.html`。首次进入项目管理，输入名称、选择现代版或发行兼容版，然后创建工程；也可导入 `.magickisa.zip` 工程包。

默认空白工作区在第一次启动时生成，不是示例游戏。关闭项目管理也可以直接编辑默认空白工程。所有本地工程、素材、备份与发行输出位于被 Git 忽略的 `workspace-projects/`，不要依赖 Git 为这些内容做备份。

## 创作工作台

- **剧本与流程图**：章节导航、连续台词编辑、分支、条件、效果、立绘图层、撤销与重做。
- **资源、人物与资料**：素材选择器、图片预览、音频试听、上传与只读引用追踪。
- **演出**：献词、OP/ED、字幕时间轴、镜头排序、精确时间输入及双语字幕。
- **工程与高级 JSON**：工程配置、完整 JSON 编辑、运行变量调试、内容校验与发行日志。
- **便利操作**：编辑位置返回/前进、命令搜索、就地高级属性、帮助抽屉、可调布局与熔金色主题。

`Ctrl+K` 搜索，`Ctrl+S` 保存工程，`Ctrl+Enter` 更新预览，`Esc` 关闭浮层。预览使用真实运行时，输入时不会自动重启剧情。游戏启动保留 MAGICKISA 标识动画。

浏览器草稿自动保存在 IndexedDB；“草稿已保留”不等于工程已写入磁盘。未应用 JSON 会阻止导出与构建；磁盘版本冲突会返回 409，需重新加载后处理，不能强制覆盖。

## 工程迁移与发行

在“工程 → 项目管理与整体导入导出”导出当前已应用工程及全部素材，包括未保存的表单修改和未使用素材。外部链接原样保留，不自动下载。高级 JSON 导出不包含素材。

导入工程包会校验 ZIP 清单与 SHA256，并建立独立项目；不会覆盖原项目。重复导入也会分配新工作区 ID。包限 2 GiB，解压总量限 8 GiB、50,000 个文件；单素材上传限 8 MB。

发行请使用工作台中的“检查内容 → 保存工程 → 构建发行包”，输出位于对应工程目录的 `dist/`，将其中内容部署到网站根目录。现代版和兼容版不自动互转，导入包携带自身运行模式。

命令行 `npm run build` / `npm run build:release` 分别构建默认现代版 / 兼容版空白工作区；设置 `MAGICKISA_WORKSPACE` 为工程的工作区 ID 可构建对应工程（运行模式需匹配）。`npm run build:studio` 检查编辑器前端构建，实际编辑仍需本地 Node 服务，不能只上传静态编辑器文件替代服务。

## 开发与测试

```sh
npm run typecheck
npm test
npm run test:studio
npm run build:studio
```

浏览器验收使用 Playwright；测试环境先执行 `npx playwright install chromium`，或用 `MAGICKISA_BROWSER` 指定本机 Chromium/Edge 路径。涉及工程写入的验收串行运行。

`src/engine` 是现代运行时，`src/compat/release` 是兼容运行时，`src/studio` 是共享工作台。两种模式共用工程管理和迁移功能。兼容模式保留历史效果执行时机；本仓库不附带原游戏的存档迁移和发行画面对照文件。

Live2D 提供适配器接口和回退渲染；不附带 Cubism SDK、模型或商业 SDK 授权。项目素材、外部资源与第三方 SDK 的授权由工程作者自行管理。当前不提供云协作、在线托管服务或 Demo。

## 许可与贡献

见 [MIT LICENSE](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md) 和 [贡献说明](CONTRIBUTING.md)。
