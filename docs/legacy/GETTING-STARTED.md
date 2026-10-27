# Legacy 安装与启动

[返回专用手册](README.md) · 下一步：[Studio 创作](STUDIO.md)

## 1. 准备环境

- 安装 [Node.js 22 或更新版本](https://nodejs.org/)，包含 npm。
- 使用 Windows、macOS 或 Linux，以及现代浏览器。
- 将开发工具放在可写目录；首次安装需要联网访问 npm。
- 浏览器允许当前站点使用 IndexedDB 与 localStorage，用于草稿和偏好。玩家存档也依赖浏览器存储。

在终端确认环境：

```sh
node --version
npm --version
```

Windows PowerShell 若拦截 `npm.ps1`，可使用 `npm.cmd` 执行本手册中的 npm 命令，无须修改执行策略。

## 2. 获取准确版本

### 使用 Release 附件

打开 [v1.0legacy 下载页](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/releases/tag/v1.0legacy)，下载：

- `MAGICKISA-v1.0legacy-Studio-start.zip`：跨平台联网启动包，适合直接使用。
- 或 `MAGICKISA-v1.0legacy-source.zip`：源码包，适合查看和修改引擎。
- `SHA256SUMS.txt`：上述两个附件的 SHA256 校验值。

GitHub 自动提供的 “Source code” 压缩包与具名发布附件不是同一个文件，不能套用具名附件的校验值。下载后先校验，再完整解压，不要在 ZIP 内直接运行脚本。

Windows PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 .\MAGICKISA-v1.0legacy-Studio-start.zip
Get-Content .\SHA256SUMS.txt
```

比较同名文件的哈希，两者必须完全一致，大小写可忽略。Linux 可在附件与校验文件所在目录执行 `sha256sum -c SHA256SUMS.txt`；macOS 使用 `shasum -a 256 -c SHA256SUMS.txt`。只下载一个 ZIP 时，另一个附件会提示缺失，请确认已下载附件本身通过；也可下载两个 ZIP 后执行完整检查。

这里使用的是 Release 原附的 `SHA256SUMS.txt`，由打包程序按 `<哈希><两个空格><文件名>` 写入。不要用 `Get-FileHash` 的表格输出覆盖它。macOS 也可执行 `shasum -a 256 MAGICKISA-v1.0legacy-Studio-start.zip`，再与原校验文件中同名项手动比较。

### 使用 Git 获取冻结源码

```sh
git clone --branch v1.0legacy --depth 1 https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE.git MAGICKISA-Legacy
cd MAGICKISA-Legacy
npm ci --include=dev
npm run dev
```

标签检出通常处于 detached HEAD，正常使用不受影响；若自行修改源码，先 `git switch -c my-legacy-work`。不要使用默认分支替代本手册指定标签。

## 3. 使用启动脚本

| 系统 | 操作 |
| --- | --- |
| Windows | 双击 `Start-Studio.cmd` |
| macOS | 双击 `Start-Studio.command`；不能双击时终端执行 `sh Start-Studio.command` |
| Linux | 终端执行 `sh Start-Studio.sh` |

启动器检查 Node.js、npm 与目录可写性。首次运行或锁文件／环境变化时安装依赖，成功后启动完整本地服务并打开工程管理页。后续启动复用依赖；安装失败时停止，不会标记安装成功，修复网络或环境后重新运行即可。

依赖损坏时，在解压目录执行：

```sh
node scripts/launch-studio.mjs --reinstall
```

同一安装目录只运行一个 Studio，不要同时用启动器和 `npm run dev` 启动两份服务。需要停止时在终端按 `Ctrl+C`。

## 4. 选择运行模式

| 工程模式 | 标识 | 默认工作区目录 | 手动启动 |
| --- | --- | --- | --- |
| 现代档 | `modern` | `workspace-projects/default-modern/` | `npm run dev` |
| 发行兼容档 | `release` | `workspace-projects/default-release/` | `npm run dev:release` |

两种模式共用 Studio。工程管理中创建项目时选择模式；导入整体工程包时读取包中模式，不需要手改文件。模式不做自动互转，修改 `schemaVersion` 或包中的 `profile` 不能完成转换。

现代档使用 `schemaVersion: 2`、`onEnter` 与 `onComplete`；发行兼容档使用自己的格式与场景 `effects`。具体时机见 [剧情逻辑](STUDIO.md#效果执行时机)。

## 5. 第一次打开

通常访问 `http://127.0.0.1:5173/engine.html`，端口被占用时以终端显示地址为准。服务只监听本机 `127.0.0.1`；关闭服务后网页无法继续保存、上传或构建。

1. 在工程管理中输入名称、选择模式，点击“创建并打开”。
2. 或选择／拖入 `.magickisa.zip`，检查摘要后确认导入。
3. 也可以关闭工程管理，编辑当前模式的默认空白工程。

新工程只有最小场景与空台词，没有示例剧情或媒体。独立工程位于 `workspace-projects/<workspaceId>/`，工作区 ID 与游戏内部 `project.id` 是两件事；不要自行互换。

## 6. 启动失败先查什么

| 现象 | 检查方法 |
| --- | --- |
| 找不到 node 或 npm | 安装 Node.js，重新打开终端，检查版本 |
| 安装依赖失败 | 看终端首个错误，检查联网、npm 配置与目录权限，再重试 |
| `ERR_CONNECTION_REFUSED` | 确认服务运行，打开终端实际地址，不沿用旧端口书签 |
| 浏览器未自动打开 | 手动打开终端地址下的 `/engine.html` |
| 提示目录锁被占用 | 找到原来的服务终端并停止，不要删除活进程持有的锁 |
| 只有静态网页，保存不可用 | 启动完整本地服务；`dist-studio/` 不能独立提供保存与构建 |

更完整处理步骤见 [故障与恢复](PROJECTS-AND-RELEASE.md#常见故障)。
