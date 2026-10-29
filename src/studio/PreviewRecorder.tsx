import { useEffect, useState, type RefObject } from "react";
import { storyTestSchema, type StoryTest } from "../engine/storyTest";
import type { StudioDataController } from "./useStudioData";
export function PreviewRecorder({
  iframe,
  authoring,
  loaded,
}: {
  iframe: RefObject<HTMLIFrameElement>;
  authoring: StudioDataController;
  loaded: boolean;
}) {
  const [active, setActive] = useState(false),
    [name, setName] = useState("预览录制路线"),
    [recorded, setRecorded] = useState<StoryTest>(),
    [error, setError] = useState("");
  useEffect(() => {
    if (!loaded) setActive(false);
  }, [loaded]);
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        e.origin !== location.origin ||
        e.source !== iframe.current?.contentWindow
      )
        return;
      if (e.data?.type === "studio:recording")
        setActive(e.data.active === true);
      if (e.data?.type === "studio:recorded") {
        try {
          setRecorded(storyTestSchema.parse(e.data.test));
          setError("");
        } catch (error) {
          setError(String(error));
        }
      }
      if (e.data?.type === "studio:error") {
        setError(String(e.data.error));
        setActive(false);
      }
      if (e.data?.type === "studio:ready") setActive(false);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [iframe]);
  return (
    <details className="st-fold">
      <summary>录制路线测试</summary>
      <p>
        先更新场景预览，再录制实际阅读、选择和查阅资料。包含当前变量快照；不会写玩家存档。调试跳转、回退或读档使本次录制无效。
      </p>
      <label>
        测试名称
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        disabled={!loaded}
        onClick={() => {
          if (!active) {
            setRecorded(undefined);
            setError("");
          }
          iframe.current?.contentWindow?.postMessage(
            { type: "studio:record", start: !active, name },
            location.origin,
          );
        }}
      >
        {active ? "停止录制并检查" : "开始录制路线"}
      </button>
      {active && <p role="status">正在录制；请在真实预览中操作。</p>}
      {recorded && (
        <>
          <p>
            {recorded.steps.length}{" "}
            步，包含终态断言。保存前可检查起始快照与操作。
          </p>
          <details>
            <summary>查看录制内容</summary>
            <pre>{JSON.stringify(recorded, null, 2)}</pre>
          </details>
          <button
            disabled={!authoring.ready || authoring.busy}
            onClick={() => {
              authoring.change({
                ...authoring.data,
                tests: [...authoring.data.tests, recorded],
              });
              setRecorded(undefined);
            }}
          >
            加入创作测试（待保存）
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
