import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  guardedStorage,
  memoryStorage,
  type PlayerStorage,
} from "./persistence";
export function PlayerGate({
  id,
  children,
}: {
  id: string;
  children: (
    storage: PlayerStorage,
    release: () => void,
    temporary: boolean,
  ) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState("waiting"),
    [temporary, setTemporary] = useState(false);
  const allowed = useRef(false),
    release = useRef<() => void>(() => {});
  const [storage, setStorage] = useState<PlayerStorage>();
  useEffect(() => {
    if (temporary) {
      setStorage(memoryStorage());
      setStatus("ready");
      return;
    }
    let alive = true;
    if (!navigator.locks) {
      setStatus("unsupported");
      return;
    }
    setStatus("waiting");
    void navigator.locks
      .request(
        `magickisa:player:${id}`,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!alive) return;
          if (!lock) {
            setStatus("busy");
            return;
          }
          try {
            const guarded = guardedStorage(
              window.localStorage,
              () => allowed.current,
            );
            allowed.current = true;
            setStorage(guarded);
            setStatus("ready");
            await new Promise<void>((resolve) => {
              release.current = resolve;
            });
          } catch {
            if (alive) setStatus("unsupported");
          } finally {
            allowed.current = false;
          }
        },
      )
      .catch(() => {
        if (alive) setStatus("unsupported");
      });
    return () => {
      alive = false;
      allowed.current = false;
      release.current();
    };
  }, [id, attempt, temporary]);
  const giveUp = () => {
    allowed.current = false;
    release.current();
    setStorage(undefined);
    setStatus("released");
  };
  if (status === "ready" && storage)
    return <>{children(storage, giveUp, temporary)}</>;
  return (
    <main className="player-gate">
      <h1>
        {status === "unsupported"
          ? "当前环境无法安全保存"
          : "游戏尚未取得存档写权限"}
      </h1>
      <p>
        {status === "unsupported"
          ? "请使用支持 Web Locks 的现代浏览器，在 HTTPS 或本机地址游玩。也可以开启临时周目，离开前导出进度。"
          : "同一作品只允许一个页面写入进度。请关闭原游戏页面或在其菜单中释放权限，再点击接管。接管会重新读取最新存档。"}
      </p>
      <button onClick={() => setAttempt((n) => n + 1)}>重新接管</button>
      <button onClick={() => setTemporary(true)}>临时游玩（不自动保存）</button>
    </main>
  );
}
