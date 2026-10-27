# Agent 剧本接入与增量同步（2.0.0-dev.2）

用户提供文件 → Agent 读取上下文并整理结构稿 → CLI 检查差异与冲突 → 显式应用 → 校验、构建与 Studio 预览。

CLI 不调用模型、不理解自然语言、不执行用户 JS/TS。逻辑文件是描述跳转、条件和效果的资料。支持 UTF-8 TXT、Markdown、JSON。仅操作引擎现有现代工作区，游戏 schema、稳定 ID、存档和预览协议不变。

## 1. 创建与读取上下文

安装 Node.js 22+ 并在引擎根目录运行 `npm ci`。下面命令中的 `ID` 替换为创建返回的 workspaceId；`node scripts/magickisa.mjs` 可替换为该入口绝对路径，从任意当前目录运行。

```sh
node scripts/magickisa.mjs project create --name "星门旅途" --json
node scripts/magickisa.mjs agent init --workspace ID --json
node scripts/magickisa.mjs agent context --workspace ID --limit 20 --json
node scripts/magickisa.mjs agent context --workspace ID --scene scene-001 --json
node scripts/magickisa.mjs agent context --workspace ID --query "星门" --offset 0 --limit 20 --json
```

init 在工作区目录 `workspace-projects/ID/authoring/` 生成通用 AGENTS.md、README、manifest.json 和 modules/story.json，已有文件保留。`builtin-modern` 的实际目录以命令返回为准。不要将游戏内部 project.id 当工作区 ID。

context 返回 revision、工程摘要、变量、场景连接、人物、资源、引用、来源及已管理字段路径。无筛选时场景返回概要；scene/query 返回命中场景正文。场景使用 pagination；其他集合独立返回 items/total/nextOffset，共用 limit/offset（默认 50，上限 200）。资料正文通过 entity show 获取。分页无法保证外部写入时的快照一致，应用始终检查 revision。

## 2. 登记用户文件

准备 `剧本.txt`、`跳转逻辑.md`、`变量规则.json`，内容由作者提供，例如“星门前询问是否进入”“进入分支设置 entered=true”“抵达场景要求 entered=true”。原文件相对于当前命令目录解析。

```sh
node scripts/magickisa.mjs source add --workspace ID --id story --file "剧本.txt" --json
node scripts/magickisa.mjs source add --workspace ID --id logic --file "跳转逻辑.md" --json
node scripts/magickisa.mjs source add --workspace ID --id rules --file "变量规则.json" --json
node scripts/magickisa.mjs source list --workspace ID --json
node scripts/magickisa.mjs source status --workspace ID --json
```

未指定 id 时生成来源 ID；后续用相同 id 和新 file 重新关联。清单记录相对于 authoring 的路径及登记时 SHA256；文件可位于工作区外，但 Windows 必须位于同一驱动器。其他盘的文件请先放到同盘资料目录。最终文件不能是符号链接。

registered 表示与登记时相同，changed 表示原稿变化，missing 表示待重新关联。changed 不会自动更新结构稿，Agent 应阅读改稿并重新整理；plan 捕获当前原文件哈希。缺失来源阻止同步，但不删除游戏内容。不确定的资源或逻辑写入 questions，不能编造路径或静默省略。

## 3. 多文件结构稿示例

以下可用于新建空白工程。Agent 阅读现有 schema、人物和资源后再组织内容。修改 init 创建的 `authoring/modules/story.json`：

```json
{
  "formatVersion": 1,
  "nodes": [
    {
      "id": "scene-001",
      "title": "星门",
      "lines": [{ "id": "line-001", "text": "要穿过星门吗？" }],
      "choices": [
        {
          "id": "enter-gate",
          "label": "进入",
          "target": "arrival",
          "effects": [{ "type": "set", "key": "entered", "value": true }]
        }
      ]
    }
  ]
}
```

新增 `authoring/modules/arrival.json`，演示跨文件前向引用：

```json
{
  "formatVersion": 1,
  "nodes": [
    {
      "id": "arrival",
      "title": "抵达",
      "condition": { "type": "flag", "key": "entered", "equals": true },
      "lines": [{ "id": "arrival-line", "text": "欢迎来到另一片天空。" }],
      "onComplete": [{ "type": "appendNote", "text": "穿过星门" }]
    }
  ]
}
```

在现有 manifest.json **保留 source add 写入的 sources**，将其他字段设为：

```json
{
  "formatVersion": 1,
  "modules": ["modules/story.json", "modules/arrival.json"],
  "origins": [
    { "target": "/nodes/@scene-001", "sourceId": "story", "line": 1 },
    { "target": "/nodes/@scene-001/choices/@enter-gate", "sourceId": "logic", "line": 1 },
    { "target": "/nodes/@arrival/condition", "sourceId": "rules", "line": 1 }
  ],
  "operations": [],
  "questions": []
}
```

上面是应合并的字段，不是覆盖整个登记清单的文件。target 是稳定指针：数组成员用 `@ID`，ID 中 `/` 写 `~1`、`~` 写 `~0`。line 只用于原文定位，不是游戏身份；更具体的来源定位优先。

模块名使用规范 `modules/*.json` 或其子目录，不使用点目录、反斜杠、冒号或大小写别名。可拆分同一场景的不同字段；同字段重复定义报错。ID 数组按场景、台词、分支、人物、资料、背景、音轨 ID 合并；无 ID 数组（字幕、条件组、图层等）作为整个字段比较。新条目必须显式提供 ID。

模块可包含 project 元数据、nodes、characters、materials、backdrops、audio、media；字段复用现有 schema。高级属性、献词、OP/ED 和图层可完整保留。媒体对象使用现有配置字段；执行 `schema module --json` 查看精确结构，不能自行发明运行时能力。

## 4. 首次接管、检查和应用

```sh
node scripts/magickisa.mjs schema manifest --json
node scripts/magickisa.mjs schema module --json
node scripts/magickisa.mjs schema plan --json
node scripts/magickisa.mjs schema resolutions --json
node scripts/magickisa.mjs sync plan --workspace ID --out first-plan.json --json
```

新工程已有 scene-001，首次接管退出码 1，并仍写出方案，列出 adoption 冲突和接管范围。检查后创建 `adoption.json`：

```json
{
  "formatVersion": 1,
  "resolutions": [{ "path": "/nodes/@scene-001", "take": "incoming" }]
}
```

```sh
node scripts/magickisa.mjs sync plan --workspace ID --resolutions adoption.json --out accepted-plan.json --json
node scripts/magickisa.mjs sync apply --workspace ID --file accepted-plan.json --dry-run --json
node scripts/magickisa.mjs sync apply --workspace ID --file accepted-plan.json --json
node scripts/magickisa.mjs validate --workspace ID --json
node scripts/magickisa.mjs graph --workspace ID --json
node scripts/magickisa.mjs refs --workspace ID --id arrival --json
node scripts/magickisa.mjs build --workspace ID --json
node scripts/magickisa.mjs studio --workspace ID
```

方案包含工程/状态版本、文件哈希、稳定目标、字段前后值、来源、冲突、诊断和事务。未知引用、缺失资源、缺失来源或 questions 均阻止应用。错误可定位至模块/字段、来源或操作序号。不要手改方案；apply 重新生成并比较完整方案。输入、工程、状态变化时退出码 3，必须重新规划；活写锁冲突为 4。

输出文件不覆盖，重试时用新的 out 名称。plan 与 dry-run 不改工程、不备份。成功 apply 一次保存、一次工程备份；仅更新同步基线时不制造工程备份，完全无变化不写入。返回 revision 可用于后续 `--if-revision`；它必须与方案版本一致。

## 5. 改稿与人工修改保护

修改原稿后，让 Agent 同步调整模块，重新 plan，不是再次导入完整 project.json。比较上次接入的原稿字段值、当前工程值、新稿字段值：

| 情况 | 行为 |
| --- | --- |
| 只原稿改变 | 更新该字段 |
| 只 Studio/磁盘改变 | 保留人工值 |
| 双方改成相同值 | 接受 |
| 同字段改成不同值 | 阻止并报告冲突 |
| 人工删除条目、原稿未改 | 保留删除 |
| 人工删除条目、原稿又改 | 冲突，选择后才恢复 |

例如冲突解决文件 `resolve.json`：

```json
{
  "formatVersion": 1,
  "resolutions": [
    { "path": "/nodes/@scene-001/lines/@line-001/text", "take": "current" }
  ]
}
```

```sh
node scripts/magickisa.mjs sync plan --workspace ID --resolutions resolve.json --out revision-2.json --json
node scripts/magickisa.mjs sync apply --workspace ID --file revision-2.json --json
node scripts/magickisa.mjs sync status --workspace ID --json
```

current 保留当前人工值，incoming 采用新稿。可按父目标选择，最具体路径优先。current 也记录已处理的新稿值，重复同稿不再冲突；未来新稿再变化仍重新比较。不要长期复用宽泛 incoming 选择，否则可能明确覆盖未来人工编辑。同步不按标题/正文相似度绑定。

CLI 不读取浏览器未应用 JSON、草稿或撤销历史。Studio 保存后才能参与当前工程比较；旧草稿在 CLI 写入后保存仍触发 revision 冲突。

### 删除、清除与排序

省略条目/字段不删除。先从模块移除要清除的定义，再在 manifest.operations 显式登记现有事务操作，例如：

```json
[
  { "op": "scene.remove", "id": "unused-scene" },
  { "op": "line.move", "scene": "arrival", "id": "arrival-line", "index": 0 },
  { "op": "condition.unset", "target": "scene", "scene": "arrival" },
  { "op": "media.unset", "kind": "opening" }
]
```

以上操作仅在相应目标存在且应删除时使用，不是直接附加到前面示例的步骤。支持 scene/line/choice/entity.remove、scene/line/choice.move、condition.unset、effect.clear、media.unset、json.remove；普通修改由模块表达。与模块定义相交会报错。删除后引用无效则整批拒绝；需一并修改引用。

无 ID 数组内的 json.remove 汇总为整个数组差异，首次成功后的相同操作记录结果，不会重复删下一个元素。完成后可从清单移除操作；将来要再次执行相同位置删除时，先提交不含该操作的方案。排序作为独立 `$order` 差异展示，人工重新排序也会触发冲突保护。

## 6. 数据安全和中断恢复

同步状态保存在 `authoring/.sync-state.json`，不进入游戏 schema；备份旁的 authoring-state.json 可与对应 project.json 一起恢复。不要只还原基线或随意手改它。

工程和基线通过 `.magickisa-sync-commit.json` 协调提交。异常发生时先恢复原始两文件并重建运行内容；失败仍保留日志。下次写入在锁内先恢复，普通读取会要求恢复：

```sh
node scripts/magickisa.mjs doctor --workspace ID --json
node scripts/magickisa.mjs sync recover --workspace ID --json
```

遗留写锁须先通过 doctor 的 token 机制恢复，活进程持锁不能清除。日志出现额外外部修改时停止恢复，保留文件供人工检查，不自动覆盖。恢复后旧方案可能过期，应重新读取并生成方案。JSON 创作文件/状态上限 32 MiB，超过时拆分模块；方案同时含差异和基线，大工程应留出磁盘空间。

## 7. 工程包迁移

```sh
node scripts/magickisa.mjs package export --workspace ID --out project.magickisa.zip --json
node scripts/magickisa.mjs package export --workspace ID --out with-sources.magickisa.zip --include-sources --json
node scripts/magickisa.mjs package import --file project.magickisa.zip --json
```

格式继续为 1。默认包含模块、manifest、来源映射和已接入基线，不包含原始附件。包中来源路径改成相对 sources 路径，无机器绝对路径；导入后显示“待重新关联”，以相同来源 ID 执行 source add 指向原稿。显式 include-sources 才复制全部登记附件，缺失时导出失败。

导入创建独立项目，保留游戏稳定 ID 和基线，重新关联后可继续同步。生成的 AGENTS/说明未打包，导入后可重新 agent init 获取正确工作区命令。Studio 导出已应用未保存表单时仍保留原同步基线，后续能识别人工改动。创作资料保存在工作区 authoring，工程包临时映射到 content/authoring；不会进入发行游戏。旧工程和不带资料的旧包照常使用。

## 验收边界

CLI 只能证明结构、引用、资源和构建通过。静态可达不等于实际条件可通行，必须在 Studio 真实预览检查剧情、献词、OP/ED、音画节奏及作者意图。
