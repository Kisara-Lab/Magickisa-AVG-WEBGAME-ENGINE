import { useEffect, useState } from "react";
import { version } from "../../package.json";
import type { StoryProject } from "./types";
import { ResourceManager } from "./resourceManager";
import { resolveAsset, resolveScene } from "./media";
export function EngineSplash({
  project,
  onReady,
}: {
  project: StoryProject;
  onReady: () => void;
}) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let active = true;
    const manager = new ResourceManager();
    const minimum = new Promise((resolve) => setTimeout(resolve, 1400));
    const images = [
      resolveScene(
        project,
        project.nodes.find((n) => n.id === project.startNodeId)?.title || "",
      ),
      ...(project.media.opening?.images || []).map((s) =>
        resolveAsset(project, s),
      ),
      ...project.characters.flatMap((c) =>
        [c.portrait, ...Object.values(c.expressions || {})]
          .filter((s): s is string => !!s)
          .map((s) => resolveAsset(project, s)),
      ),
    ];
    void Promise.all([
      minimum,
      manager.preload(images, (done, total) => {
        if (active) setProgress(done / total);
      }),
    ]).then(() => {
      if (active) onReady();
    });
    return () => {
      active = false;
    };
  }, [project, onReady]);
  return (
    <div
      className="engine-splash"
      role="status"
      aria-label="Magickisa AVG 引擎加载中"
    >
      <div className="engine-splash-mark">
        <span>M</span>
      </div>
      <div className="engine-splash-name">MAGICKISA</div>
      <div className="engine-splash-subtitle">AVG · WEBGAME ENGINE</div>
      <div className="engine-splash-rule" />
      <div className="engine-splash-status">正在载入叙事场景</div>
      <div className="engine-splash-progress">
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="engine-splash-version">
        Magickisa-AVG-webgame-Engine · v{version}
      </div>
    </div>
  );
}
