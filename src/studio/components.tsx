import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { preference, WorkspaceContext } from "./workspace";
import type { ReactNode } from "react";
import { Search, X, Sparkles } from "lucide-react";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(document.activeElement as HTMLElement);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const box = ref.current!;
    const focusables = () =>
      Array.from(
        box.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]',
        ),
      ).filter((e) => e.getClientRects().length);
    (
      Array.from(
        box.querySelectorAll<HTMLElement>("input,textarea,select"),
      ).find((e) => e.getClientRects().length) ||
      focusables()[0] ||
      box
    ).focus();
    const key = (e: KeyboardEvent) => {
      if (
        e.isComposing ||
        Array.from(document.querySelectorAll(".st-modal")).at(-1) !== box
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      const original = previous.current;
      if (original?.isConnected && original.getClientRects().length)
        original.focus();
      else original?.closest("details")?.querySelector("summary")?.focus();
    };
  }, []);
  return (
    <div
      className="st-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="st-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="关闭对话框" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export interface Command {
  id: string;
  label: string;
  hint?: string;
  searchText?: string;
  category?: string;
  recent?: boolean;
  run: () => void;
}
export function CommandPalette({
  commands,
  onClose,
  onClearRecent,
}: {
  commands: Command[];
  onClose: () => void;
  onClearRecent?: () => void;
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const results = useRef<HTMLDivElement>(null);
  useEffect(() => {
    results.current
      ?.querySelector(`[data-command-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const needle = query.trim().toLowerCase();
  const rank = (c: Command) =>
    c.label.toLowerCase() === needle ||
    c.id.toLowerCase() === needle ||
    c.id.toLowerCase().endsWith(`:${needle}`)
      ? 0
      : c.label.toLowerCase().startsWith(needle)
        ? 1
        : 2;
  const visible = (
    needle
      ? commands
          .filter(
            (c) =>
              !c.recent &&
              `${c.label} ${c.hint || ""} ${c.searchText || ""} ${c.category || ""}`
                .toLowerCase()
                .includes(needle),
          )
          .sort((a, b) => rank(a) - rank(b))
      : commands.filter((c) => c.recent || c.category === "操作")
  ).slice(0, 50);
  return (
    <Modal title="快速前往" onClose={onClose}>
      <label className="st-command-search">
        <Search size={20} />
        <input
          autoFocus
          aria-label="搜索场景与操作"
          value={query}
          placeholder="场景、台词、人物、资料、素材或操作…"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
            if (results.current) results.current.scrollTop = 0;
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex(Math.max(0, Math.min(index + 1, visible.length - 1)));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex(Math.max(0, index - 1));
            }
            if (e.key === "Enter" && visible[index]) {
              onClose();
              visible[index].run();
            }
          }}
        />
      </label>
      <div className="st-command-results" ref={results}>
        {visible.length ? (
          visible.map((c, i) => (
            <button
              data-command-index={i}
              key={c.id}
              className={i === index ? "selected" : ""}
              onMouseEnter={() => setIndex(i)}
              onClick={() => {
                onClose();
                c.run();
              }}
            >
              <Sparkles size={15} />
              <span>
                {c.label}
                <small>
                  {c.recent ? "最近使用 · " : ""}
                  {c.category} · {c.hint}
                </small>
              </span>
            </button>
          ))
        ) : (
          <p>没有找到结果，试试场景标题或“保存”。</p>
        )}
      </div>
      {!needle && onClearRecent && (
        <button onClick={onClearRecent}>清空最近使用</button>
      )}
      <p>↑ ↓ 选择 · Enter 前往 · Esc 关闭</p>
    </Modal>
  );
}
export function ResizeHandle({
  label,
  value,
  onChange,
  min,
  max,
  reverse = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  reverse?: boolean;
}) {
  return (
    <div
      className="st-resizer"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(
            Math.max(
              min,
              Math.min(
                max,
                value +
                  (e.key === "ArrowRight" ? 1 : -1) * (reverse ? -1 : 1) * 16,
              ),
            ),
          );
        }
      }}
      onPointerDown={(e) => {
        const x = e.clientX,
          element = e.currentTarget;
        element.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) =>
          onChange(
            Math.max(
              min,
              Math.min(max, value + (ev.clientX - x) * (reverse ? -1 : 1)),
            ),
          );
        const end = () => {
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerup", end);
          element.removeEventListener("pointercancel", end);
        };
        element.addEventListener("pointermove", move);
        element.addEventListener("pointerup", end);
        element.addEventListener("pointercancel", end);
      }}
    />
  );
}
export function Fold({
  title,
  summary,
  children,
  className = "",
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(WorkspaceContext);
  const ref = useRef<HTMLDetailsElement>(null);
  const key = `magickisa:fold:${context?.scope}:${context?.section}:${title}`;
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.open = preference<boolean>(key, false) === true;
      delete ref.current.dataset.temporaryOpen;
    }
  }, [key]);
  return (
    <details ref={ref} className={`st-fold ${className}`}>
      <summary
        onClick={(e) => {
          e.preventDefault();
          const open = !ref.current!.open;
          ref.current!.open = open;
          delete ref.current!.dataset.temporaryOpen;
          try {
            localStorage.setItem(key, JSON.stringify(open));
          } catch {
            context?.warning(
              "偏好未保存：浏览器存储不可用，本次展开状态仍有效。",
            );
          }
        }}
      >
        {title}
        <small>{summary} · 展开 / 收起</small>
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function MoreActions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <details
      ref={ref}
      className="st-more-actions"
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>更多操作</summary>
      <div
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button") && ref.current)
            ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
export function StatusBar({
  source,
  draftState,
  events,
}: {
  source: string;
  draftState: string;
  events: string[];
}) {
  return (
    <footer className="st-statusbar">
      <span>
        <span className="st-dot" /> MAGICKISA ENGINE
      </span>
      <span>{source}</span>
      <span
        className={
          draftState.includes("失败") || draftState.includes("不可用")
            ? "st-error-text"
            : ""
        }
      >
        {draftState} · Ctrl+S 保存
      </span>
      <details className="st-event-history">
        <summary>操作记录</summary>
        <div>
          {events.length ? (
            events.map((event, i) => <p key={i}>{event}</p>)
          ) : (
            <p>暂无操作记录</p>
          )}
        </div>
      </details>
    </footer>
  );
}
