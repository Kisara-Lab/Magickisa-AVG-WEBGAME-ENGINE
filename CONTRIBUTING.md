# 贡献说明

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

使用 Node.js 22+，执行 `npm ci`，再执行 `npx playwright install chromium` 安装浏览器验收需要的 Chromium。Linux 如需同时安装系统依赖，使用 `npx playwright install --with-deps chromium`；也可以设置 `MAGICKISA_BROWSER` 指向已安装的 Chromium / Edge 可执行文件。修改后运行 `npm run typecheck`、`npm test`、`npm run test:studio` 和 `npm run build:studio`。工程写入与浏览器验收应串行执行。

新增测试使用生成的最小数据，不引入原游戏剧情、素材或发行包。请保持稳定 ID、工程格式、两种模式的运行语义和 Studio 预览消息协议兼容；格式变化需要单独说明兼容方案。

提交贡献表示你有权以本仓库 MIT 许可证提供相应代码。引入第三方依赖时同时更新锁文件和许可声明。
