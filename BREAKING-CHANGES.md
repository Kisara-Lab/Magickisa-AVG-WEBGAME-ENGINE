# v2.0.0 开发版破坏性变更

当前版本为 2.0.0-dev.0，尚未发布 v2 正式 Release。

- 删除兼容运行时、旧内容生成器、专用构建和测试；现代版唯一，移除运行模式选择与 `dev:release` / `build:release`。
- 预览直接使用现代运行时与样式；完整 JSON、高级条件效果、图层、调试、献词、OP/ED、引擎标识和熔金色 UI 保留。
- 工程必须为 `schemaVersion: 2`。省略 profile 默认现代，显式 `profile=modern` 有效；`profile=release` 明确拒绝，不静默回退。
- 兼容工作区从列表隐藏，显示数量与原文件保留说明。兼容 JSON、工程包和旧入口拒绝，并提供 [v1.0legacy](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/releases/tag/v1.0legacy) 链接。没有转换、覆盖或自动删除。
- 工程包仍为格式 1，工作区与包保留 `profile: modern`；允许导入 Legacy 导出的现代包。导出写实际 Studio 版本，不承诺被 Legacy Studio 读取。
- 现代稳定 ID、玩家存档、预览消息协议不变；现有现代工作区、草稿与偏好键继续可读。兼容浏览器记录保留但不加载。

升级前导出工程包并保留原目录；使用新版本时不要让两个 Studio 服务同时写同一目录。兼容作品继续使用冻结 Release，Legacy 不建立维护分支。演示站点部署不变；#6 与 #63 保留为后续专项。
