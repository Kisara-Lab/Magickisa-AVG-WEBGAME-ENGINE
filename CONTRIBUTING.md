# 贡献说明

玩家端改动需顺序运行 `npm run test:player` 与 Studio 验收，覆盖自动／手动槽、校验失败和配额失败不覆盖、多标签页写权限与接管、临时／预览隔离、逐字阅读和资料逐条已读。浏览器测试使用生成作品，不引入私有剧情或媒体。当前版本为 `2.0.0`。

调查流程改动需覆盖资料／列表条件及组合上下文、效果顺序、连接身份、创作资料独立 revision、恢复日志和包往返。`npm test` 包含生成的 1,000 节点／5,000 连接索引与布局测试；`npm run test:studio` 包含实际拖线、状态预览、409 和响应式验收。CLI、Agent、Studio 写入测试顺序运行，测试只使用生成内容。

欢迎通过 Issue 报告问题，通过 Pull Request 提交改进。请附运行环境、复现步骤和相关日志，提交前移除工程隐私与凭据。

## 分支与 Pull Request 工作流

`main` 为受保护主分支，所有修改（包括维护者和管理员的修改）通过 PR 合并，不直接推送。禁止强制推送或删除主分支。

1. 从最新 `main` 创建功能、修复或文档分支，例如 `feat/scene-editor`、`fix/import-validation`、`docs/usage`。
2. 在分支中修改并提交，推送后向 `main` 发起 PR；外部贡献者可以从 Fork 发起 PR。
3. 在 PR 中说明改动、原因、验证方法及兼容性影响；界面改动建议附截图。
4. 合并前必须通过 GitHub Actions 的 `verify` 检查，与最新 `main` 保持同步，并解决全部 review 讨论。更新分支后需重新等待检查通过。
5. 通过检查后由维护者合并；建议使用 Squash merge 保持提交历史清晰，合并后可以删除已完成的工作分支。

当前不要求固定数量的批准审查，以支持单人维护；PR、CI 与讨论解决要求仍然生效。管理员也不跳过主分支保护。后续自动化或代理修改同样使用分支与 PR，不自行关闭保护规则。

```sh
git switch main
git pull --ff-only origin main
git switch -c feat/my-change
# 修改并完成相应验证后
git add <修改的文件>
git commit -m "Describe the change"
git push -u origin feat/my-change
# 在 GitHub 发起 Pull Request，目标分支选择 main
```

上述命令适用于 `origin` 直接指向本仓库的维护者。Fork 贡献者的 `origin` 指向自己的仓库，应先添加并同步官方上游，再创建工作分支：

```sh
# 仅首次添加；已配置 upstream 时检查其地址即可
git remote add upstream https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE.git
git fetch upstream
git switch -c feat/my-change upstream/main
# 修改、提交后推送到自己的 Fork
git push -u origin feat/my-change
```

已有工作分支需要同步时，先 `git fetch upstream`，再在工作分支执行 `git merge upstream/main`，解决冲突后推送并等待 CI。

## 开发与验证

CLI 和 Studio 共用工程服务；新增写入入口必须遵守跨进程工程锁、revision 和构建串行保护，不直接覆盖 project.json。运行 `npm run test:cli` 验证命令、事务、包往返和实际构建；再顺序执行 Studio 验收验证跨进程互锁与旧草稿冲突。CLI stdout 的协议版本、退出码和错误代码是 Agent 接口，变更需说明兼容性。用法见 [CLI](docs/CLI.md) 与 [Agent 指南](docs/AGENT-GUIDE.md)。

使用 Node.js 22+，执行 `npm ci`，再执行 `npx playwright install chromium` 安装浏览器验收需要的 Chromium。Linux 如需同时安装系统依赖，使用 `npx playwright install --with-deps chromium`；也可以设置 `MAGICKISA_BROWSER` 指向已安装的 Chromium / Edge 可执行文件。修改后运行 `npm run typecheck`、`npm test`、`npm run test:studio` 和 `npm run build:studio`。工程写入与浏览器验收应串行执行。

新增测试使用生成的最小数据，不引入原游戏剧情、素材或发行包。当前为 2.0.0，仅开发现代版；兼容档在 v1.0legacy 冻结，不建立维护分支或转换工具。请保持现代稳定 ID、schemaVersion: 3、玩家存档与 Studio 预览消息协议；兼容输入应明确拒绝并提供 Legacy 链接，原文件与浏览器记录不得删除。详见 [破坏性变更](BREAKING-CHANGES.md)。

Agent 创作模块需保持 manifest 格式 1、稳定目标的三方比较和默认不打包原始附件。顺序运行 `npm run test:cli`、`npm run test:authoring`、`npm run test:studio`，再运行许可检查与 Studio 构建。新增同步写入必须经过恢复日志，不直接修改基线；查看来源与生成方案不得改写工程。详见 [创作手册](docs/AUTHORING.md)。

提交贡献表示你有权以本仓库 MIT 许可证提供相应代码。引入第三方依赖时同时更新锁文件和许可声明。

修改依赖后运行 `npm run notices:update`，检查并提交 `THIRD_PARTY_NOTICES.md` 中的依赖清单和许可证全文。`npm run notices:check` 会核对清单是否与锁文件一致以及表格结构是否完整，CI 同样执行这一检查。不同平台安装的可选依赖不同，因此 CI 不要求逐字比较本机收集的许可证全文。
