import type { StoryProject } from "./types";
import { resolveAsset } from "./media";
export class ResourceManager {
  readonly failed = new Set<string>();
  async preload(
    urls: string[],
    onProgress?: (done: number, total: number) => void,
  ) {
    const unique = [...new Set(urls)];
    let done = 0;
    await Promise.all(
      unique.map(
        (src) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            let settled = false;
            const finish = (failed: boolean) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              image.onload = image.onerror = null;
              if (failed) this.failed.add(src);
              onProgress?.(++done, unique.length);
              resolve();
            };
            const timer = setTimeout(() => finish(true), 8000);
            image.onload = () => finish(false);
            image.onerror = () => finish(true);
            image.src = src;
          }),
      ),
    );
  }
  isFailed(src: string) {
    return this.failed.has(src);
  }
}
export async function preloadCharacters(
  project: StoryProject,
  resolve = (asset: string) => resolveAsset(project, asset),
) {
  const manager = new ResourceManager();
  await manager.preload(
    project.characters.flatMap((c) =>
      [c.portrait, ...Object.values(c.expressions || {})]
        .filter((s): s is string => !!s)
        .map(resolve),
    ),
  );
  return manager;
}
