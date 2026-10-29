import { useCallback, useEffect, useState } from "react";
export type NoticeTarget = { panel: string; id?: string };
type Notice = { serial: number; text: string; target?: NoticeTarget };
/** Modal and presentation time never consumes a queued notification's lifetime. */
export function usePlayerNotices(paused: boolean) {
  const [queue, setQueue] = useState<Notice[]>([]);
  const notify = useCallback((text: string, target?: NoticeTarget) => {
    setQueue((q) =>
      text
        ? [...q, { serial: (q.at(-1)?.serial ?? 0) + 1, text, target }]
        : q.slice(1),
    );
  }, []);
  const current = queue[0];
  useEffect(() => {
    if (!current || paused) return;
    const timer = setTimeout(() => notify(""), 4200);
    return () => clearTimeout(timer);
  }, [current, paused, notify]);
  return { notice: current?.text ?? "", target: current?.target, notify };
}
