import { useEffect, useRef, type ReactNode } from "react";
export function PlayerDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      if (previous?.isConnected) previous.focus();
      else
        document
          .querySelector<HTMLElement>(
            ".player-actions button:last-child, [data-action=new-game]",
          )
          ?.focus();
    };
  }, []);
  return (
    <dialog
      className="player-dialog"
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close.current();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="关闭面板" title="关闭面板" onClick={onClose}>
          关闭 ×
        </button>
      </header>
      <div className="player-dialog-content">{children}</div>
    </dialog>
  );
}
