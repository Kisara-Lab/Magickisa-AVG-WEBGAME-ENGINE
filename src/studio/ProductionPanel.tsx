import { useState } from "react";
import type { StoryProject } from "../engine/types";
import { storyTestSuiteSchema, runStorySuite } from "../engine/storyTest";
import type { StudioDataController } from "./useStudioData";
import { Card } from "./fields";
import { Fold } from "./components";
export const defaultTheme: NonNullable<StoryProject["theme"]> = {
  mode: "adv",
  fontFamily: "system-ui, sans-serif",
  fontSize: 21,
  textColor: "#f5f1e8",
  accentColor: "#e0bd77",
  panelColor: "#121318",
  panelOpacity: 0.9,
  dialogueWidth: 92,
};
export function ProductionPanel({
  project,
  onChange,
  authoring,
  onLocate,
}: {
  project: StoryProject;
  onChange: (p: StoryProject) => void;
  authoring: StudioDataController;
  onLocate: (node: string, line?: string | null) => void;
}) {
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReturnType<typeof runStorySuite>>();
  const [tested, setTested] = useState<StoryProject>();
  const [testedDefinitions, setTestedDefinitions] = useState<unknown>();
  const [variables, setVariables] = useState("");
  const [testInput, setTestInput] = useState("");
  const theme = project.theme ?? defaultTheme;
  const setTheme = (next: typeof theme) =>
    onChange({ ...project, theme: next });
  return (
    <>
      <Card title="作品概览">
        <p>
          {project.nodes.length} 场景 ·{" "}
          {project.nodes.reduce((n, s) => n + s.lines.length, 0)} 台词 ·{" "}
          {project.characters.length} 人物 · {project.materials.length} 资料
        </p>
        <Fold title="创作清单与下一步" summary="可按自己的顺序制作">
          <ol>
            <li>设置作品标题、起始场景与阅读布局。</li>
            <li>在剧本页写台词，添加人物与素材。</li>
            <li>在流程图连接分支，在变量与线索页配置门槛。</li>
            <li>手动更新真实预览，检查声音、画面与选择。</li>
            <li>保存路线测试，检查工程后构建发行包。</li>
          </ol>
        </Fold>
      </Card>
      <Card title="作品阅读与主题">
        <div className="st-fields">
          <label>
            阅读布局
            <select
              value={theme.mode}
              onChange={(e) =>
                setTheme({ ...theme, mode: e.target.value as "adv" | "nvl" })
              }
            >
              <option value="adv">ADV · 底部对话</option>
              <option value="nvl">NVL · 全屏文字</option>
            </select>
          </label>
          <label>
            字体
            <input
              value={theme.fontFamily}
              onChange={(e) =>
                setTheme({ ...theme, fontFamily: e.target.value })
              }
            />
          </label>
          {(
            [
              ["textColor", "正文颜色"],
              ["accentColor", "强调颜色"],
              ["panelColor", "窗口颜色"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="color"
                value={theme[key]}
                onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
              />
            </label>
          ))}
          {(
            [
              ["fontSize", "默认字号", 16, 40, 1],
              ["panelOpacity", "窗口不透明度", 0.75, 1, 0.05],
              ["dialogueWidth", "窗口宽度百分比", 50, 100, 1],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label key={key}>
              {label}
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={theme[key]}
                onChange={(e) =>
                  setTheme({ ...theme, [key]: Number(e.target.value) })
                }
              />
              {theme[key]}
            </label>
          ))}
        </div>
        <p>
          玩家字号与阅读偏好优先于作者默认值。更新真实预览后检查桌面和手机效果。
        </p>
      </Card>
      <Card title="变量声明与初始值">
        <p>
          初始值只在新周目设置；读档、跳转和回退不会重新初始化。好感度与调查进度使用普通变量。
        </p>
        <button
          onClick={() =>
            setVariables(JSON.stringify(project.variables ?? {}, null, 2))
          }
        >
          读取当前变量声明
        </button>
        <textarea
          aria-label="变量声明 JSON"
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
        />
        <button
          disabled={!variables}
          onClick={async () => {
            try {
              const { projectSchema } = await import("../engine/schema");
              const value = projectSchema.shape.variables.parse(
                JSON.parse(variables),
              );
              onChange({ ...project, variables: value });
              setError("");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          应用变量声明
        </button>
      </Card>
      <Card title="可重复剧情测试">
        <p>
          使用真实剧情运行时，不写玩家存档。测试保存在创作资料中，需单独保存。
        </p>
        <label>
          导入测试 JSON
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                try {
                  setTestInput(await file.text());
                } catch (e) {
                  setError(String(e));
                }
            }}
          />
        </label>
        <button
          onClick={() =>
            setTestInput(
              JSON.stringify(
                { formatVersion: 1, tests: authoring.data.tests },
                null,
                2,
              ),
            )
          }
        >
          编辑测试定义
        </button>
        {testInput && (
          <>
            <textarea
              aria-label="剧情测试 JSON"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
            />
            <button
              onClick={() => {
                try {
                  const suite = storyTestSuiteSchema.parse(
                    JSON.parse(testInput),
                  );
                  authoring.change({ ...authoring.data, tests: suite.tests });
                  setTestInput("");
                  setError("");
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              应用测试定义
            </button>
          </>
        )}
        <p>
          {authoring.data.tests.length} 个测试 ·{" "}
          {authoring.dirty ? "创作资料未保存" : "创作资料已保存"}
        </p>
        <button
          disabled={!authoring.ready || authoring.busy || !authoring.dirty}
          onClick={() => void authoring.save()}
        >
          保存创作资料
        </button>
        <button
          disabled={!authoring.data.tests.length}
          onClick={() => {
            try {
              setReport(
                runStorySuite(project, {
                  formatVersion: 1,
                  tests: authoring.data.tests,
                }),
              );
              setTested(project);
              setTestedDefinitions(authoring.data.tests);
              setError("");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          运行全部剧情测试
        </button>
        {report && (
          <>
            <p role="status">
              {tested !== project || testedDefinitions !== authoring.data.tests
                ? "工程或测试定义已修改，测试结果待更新。"
                : report.passed
                  ? "全部测试通过"
                  : "存在失败测试"}
            </p>
            {report.results.map((result) => (
              <article key={result.id}>
                <h4>
                  {result.name} · {result.passed ? "通过" : "失败"}
                </h4>
                {result.failure && (
                  <button
                    onClick={() =>
                      onLocate(result.failure!.node, result.failure!.line)
                    }
                  >
                    步骤 {result.failure.step}：{result.failure.message} · 定位
                  </button>
                )}
                <p>
                  访问 {result.coverage.nodes.length} 场景，执行{" "}
                  {result.coverage.choices.length} 分支，到达{" "}
                  {result.coverage.endings.length} 结局。
                </p>
                <details>
                  <summary>执行轨迹与变量变化</summary>
                  <pre>{JSON.stringify(result.trace, null, 2)}</pre>
                </details>
              </article>
            ))}
            <p>{report.note}</p>
          </>
        )}
      </Card>
      {(error || authoring.error) && (
        <p role="alert">{error || authoring.error}</p>
      )}
    </>
  );
}
