# MAGICKISA CLI（2.0.0-dev.1）

面向终端开发者与 AI Agent。只编辑现代版磁盘工作区，无须打开浏览器或启动 Studio 服务。安装 Node.js 22+，在引擎目录执行 `npm ci` 后使用：

```sh
node scripts/magickisa.mjs help
npm run magickisa -- help
```

从其他目录执行时使用入口的绝对路径。引擎目录由入口位置解析，`--file`、`@文件`、`--out` 和 `--text-file` 相对于调用者当前目录。AI 应直接运行 Node 入口，避免 npm 自身的提示混入 stdout。

## 输出、输入与工作区

- 工程操作必须显式指定 `--workspace ID`，默认工程为 `builtin-modern`。工作区 ID 与游戏内部 `project.id` 不同。
- `--json`：stdout 仅一份 JSON，格式为 `{ "protocolVersion": 1, "ok": true, "data": ... }`；失败为 `{ "protocolVersion": 1, "ok": false, "error": { "code", "message", ... } }`。
- 默认输出为可读摘要或格式化详情。日志、构建输出和服务地址写 stderr，不污染 JSON。
- `--data` 接受内联 JSON、`@文件路径` 或 `-`（stdin）。`--file 路径` 是事务、剧本或工程包的文件入口；与 `--data` 不可同时使用。
- `--text-file` 读取完整 UTF-8 正文；`line add/update` 设置台词正文，`scene add/update` 按空行分成台词，生成新台词 ID。已有场景整段替换会改变台词身份，更新已发行游戏前应提升内容版本。
- 所有输出文件拒绝覆盖；指定新的路径，避免覆盖已有剧本或工程包。
- CLI 只操作磁盘工程，不访问浏览器草稿、未应用 JSON 或撤销栈。

退出码：`0` 成功、`1` 内容校验失败、`2` 参数错误、`3` revision 冲突、`4` 锁冲突、`5` 文件或执行失败。Agent 应以退出码与 `error.code` 判断，不解析中文消息。

## 工程与发现

```sh
node scripts/magickisa.mjs project list --json
node scripts/magickisa.mjs project create --name "星海旅途" --json
node scripts/magickisa.mjs project show --workspace WORKSPACE_ID --json
node scripts/magickisa.mjs help --json
node scripts/magickisa.mjs schema project --json
node scripts/magickisa.mjs schema transaction --json
node scripts/magickisa.mjs doctor --workspace WORKSPACE_ID --json
```

`project create` 返回 `workspaceId`、工程快照和 revision；使用后续命令前把 WORKSPACE_ID 替换为实际值。`project update --data @metadata.json` 可设置 title、version、startNodeId、resources、titleScreen、ui；不用于替换场景数组。项目列表名称是工作区登记名称，工程 title 是游戏标题。

## 命令速查

| 命令 | 目标和数据 |
| --- | --- |
| `scene list/show` | show 使用 `--id 场景ID` |
| `scene add/update/remove/move` | `--id`（add 可省略）、`--data`；add/move 可指定 before/after/index |
| `scene link` | `--id 场景ID --data '"目标ID"'`；`--data null` 清除 next |
| `line list/show/add/update/remove/move` | `--scene 场景ID`，现有台词用 `--id`；add/update 提供 JSON 或 text-file |
| `choice list/show/add/update/remove/move` | `--scene 场景ID --id 分支ID`；新增 JSON 含 label、target |
| `condition set/unset` | `--target scene/line/choice/material`，场景相关指定 `--scene`，台词/分支/资料用 `--id` |
| `effect add/update/remove/clear` | `--phase enter/complete/choice --scene 场景ID`；choice 另用 `--id 分支ID`；update/remove 使用 index |
| `entity list/show/add/update/remove` | `--collection characters/materials/backdrops/audio`，现有条目使用 id |
| `media show/set/unset` | `--kind opening/ending/dedication`，set 接收整个演出配置对象 |
| `asset list/import` | import 使用 `--file`，可用 `--name` 改导入文件名 |
| `edit` | `--file 事务.json` 或 `--data @文件/-` |
| `script export/import` | 完整工程 JSON；导出可指定 out，导入使用 file/data |
| `script export-markdown/import-markdown` | 带稳定 ID 的台词正文往返，不创造场景或分支 |
| `validate` | 结构、引用和本地素材检查，返回错误与警告 |
| `graph` | next/choice 连接、从起点静态可达性和不可达场景 |
| `refs` | 全部引用；可按 `--id`、`--kind assets/characters/materials/script/audio` 过滤 |
| `package export/import` | export 使用 out；import 使用 file，可指定 name，建立独立工作区 |
| `build` | 构建所选磁盘工作区，返回输出目录 |
| `studio` | 启动本地服务并打开指定工程；Ctrl+C 停止 |

素材导入与 Studio 一致：png/jpg/jpeg/webp/svg/mp3/ogg/wav/lrc，单文件不为空且不超过 8 MB，同名自动加序号。大素材自行放入该项目 public，再用 entity/media/场景字段登记路径。

条件和效果使用引擎现有 JSON：flag、not、all、any、visited、count；set、toggle、increment、addToList、removeFromList、unlockMaterial、markRead、appendNote、setAudio。完整结构从 `schema project` 获取，不新增表达式语言。

## 批量事务

保存为 `story.json`，此例可应用于新建空白工程：

```json
{
  "operations": [
    { "op": "line.update", "scene": "scene-001", "id": "line-001", "value": { "text": "星门在你面前开启。" } },
    { "op": "scene.link", "id": "scene-001", "value": "crossroad" },
    { "op": "scene.add", "id": "crossroad", "value": { "title": "岔路", "lines": [{ "id": "crossroad-1", "text": "是否穿过星门？" }] } },
    { "op": "choice.add", "scene": "crossroad", "id": "enter", "value": { "label": "穿过星门", "target": "arrival", "effects": [{ "type": "set", "key": "entered", "value": true }] } },
    { "op": "scene.add", "id": "arrival", "value": { "title": "抵达", "lines": [{ "id": "arrival-1", "text": "欢迎来到另一片天空。" }] } },
    { "op": "condition.set", "target": "scene", "scene": "arrival", "value": { "type": "flag", "key": "entered", "equals": true } },
    { "op": "effect.add", "phase": "complete", "scene": "arrival", "value": { "type": "appendNote", "text": "完成星门旅途" } }
  ]
}
```

```sh
node scripts/magickisa.mjs edit --workspace WORKSPACE_ID --file story.json --dry-run --json
node scripts/magickisa.mjs edit --workspace WORKSPACE_ID --file story.json --json
node scripts/magickisa.mjs validate --workspace WORKSPACE_ID --json
node scripts/magickisa.mjs graph --workspace WORKSPACE_ID --json
node scripts/magickisa.mjs refs --workspace WORKSPACE_ID --id arrival --json
node scripts/magickisa.mjs build --workspace WORKSPACE_ID --json
```

事务在副本上顺序执行，允许引用同批稍后新增的目标，最终统一校验。任一步或最终校验失败，不写磁盘。成功只保存一次、备份一次；无变化不备份。dry-run 返回拟修改摘要和校验结果，不保存、不备份。返回的 operations 列出新增生成的 ID。

普通更新禁止改写条目 id。删除存在引用时最终校验失败；可在同一事务内移除或调整引用再删除。不会自动改写关联内容。

常用操作为表中命令对应的 `group.action`，参数使用 scene/id/collection/target/phase/kind/index/before/after/value。index 从 0 开始；before、after、index 只能选一个。effects 没有稳定 ID，精确更新使用列表索引并配合 revision。

高级操作：`json.set`、`json.remove`、`json.test`，使用非空 RFC 6901 `path`；`~1` 表示 `/`，`~0` 表示 `~`。set 可设置字段或用 `/-` 追加数组，remove 删除已有项，test 检查当前值。父项必须存在，拒绝原型路径。数组索引操作易受重排影响，必须结合 revision/test。完整 JSON 和 Pointer 能显式改变结构或身份，使用前应检查存档及引用影响。

## 冲突、锁与失败恢复

`project show` 返回 revision。编辑、导入正文、导出包和构建可用 `--if-revision REVISION`；事务也可带 `expectedRevision`，与命令行同时提供时必须相同。默认保存仍会比较本次读取时的 revision，禁止覆盖期间发生的外部修改。

发生冲突后重新读取工程、比较修改，再生成新的事务；不要自动丢掉 revision 重试写入。CLI 保存后 Studio 中的旧草稿会通过原有 409 保护提示冲突，作者需手工处理。

CLI 与 Studio 共用工程写锁；发行构建使用全局串行锁，构建期间禁止写入。正常退出释放锁；构建锁同时记录子进程，父进程异常退出但构建子进程仍活着时禁止恢复。

```sh
node scripts/magickisa.mjs doctor --workspace WORKSPACE_ID --json
node scripts/magickisa.mjs doctor --workspace WORKSPACE_ID --recover --lock "检查结果中的锁目录" --token "检查结果中的token" --json
```

只允许恢复所选工程或已知服务锁，且 token 相同、持有进程均已退出。未知归属或活进程锁拒绝自动恢复；不按“时间久”猜测锁失效。手工改工程文件的外部程序不遵守锁，revision 可发现已观察到的修改，但不能提供文件系统级跨应用事务保证。

保存备份仍在工作区 backups；构建输出仍在工作区 dist。工程包使用现有格式 1、SHA256 与路径安全检查，不包含浏览器草稿、历史备份或引擎；导入不覆盖旧项目。

## 验证边界

静态图只计算配置连接；条件是否成立取决于实际变量、效果和运行历史。本轮不提供剧情模拟或自动通关工具。使用 `studio --workspace ID`，在真实预览检查分支、输入、OP/ED 与音频。

只支持现有工作区与现代 schemaVersion: 2。兼容档使用冻结的 [v1.0legacy](https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/releases/tag/v1.0legacy)。没有 MCP、专用剧本语法、外部工程目录或自动模型调用。


`studio --workspace ID --no-open` starts the full service without opening a browser (useful for automation). Stop with Ctrl+C.
