# MAGICKISA Studio 启动包

本包包含完整引擎与 Studio，支持现代档和发行兼容档。v1.0legacy 是兼容档最终冻结版本，后续 v2 仅保留现代档，不提供旧档转换或后续维护。

1. 安装 [Node.js 22 或更新版本](https://nodejs.org/)，包含 npm。
2. 将整个 ZIP 解压到可写目录，不能直接在压缩包中启动。
3. Windows 双击 `Start-Studio.cmd`；macOS 双击 `Start-Studio.command`；Linux 执行 `sh Start-Studio.sh`。macOS 若不允许双击，可在终端执行 `sh Start-Studio.command`。
4. 首次运行需要联网，通过 npm 安装锁定版本的依赖。后续启动复用依赖；锁文件或系统环境变化时重新安装。
5. 浏览器打开工程管理页，可创建或导入工程。关闭终端或按 Ctrl+C 停止服务。

保存、导入导出和构建需要本地服务持续运行。`dist-studio/` 静态网页不能替代完整服务。项目保存在 `workspace-projects/`，升级时请先导出工程包。

安装失败时检查网络、Node.js 版本及 npm 配置，然后重新运行启动入口；未成功安装不会标记为完成。端口占用会选择其他端口，以终端地址为准。服务仅监听 `127.0.0.1`。

本包不包含 Node.js、依赖、浏览器或游戏内容。完整说明见 README.md；不要多标签页同时游玩同一项目。备份管理与跨标签页存档协调分别追踪 #6、#63。
