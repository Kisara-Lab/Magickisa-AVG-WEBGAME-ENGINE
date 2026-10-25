import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { AssetFile } from "./LibraryEditors";
import type { Profile, AuthorProject } from "./model";
import { mediaUrl } from "./model";
import { Modal } from "./components";
type Kind = "image" | "audio" | "lyrics";
interface Pick {
  kind: Kind;
  choose: (url: string) => void;
}
const PickerContext = createContext<(p: Pick) => void>(() => {});
export function PickAsset({
  kind,
  onPick,
  label = "选择素材",
}: {
  kind: Kind;
  onPick: (url: string) => void;
  label?: string;
}) {
  const open = useContext(PickerContext);
  return (
    <button
      type="button"
      className="st-pick"
      onClick={() => open({ kind, choose: onPick })}
    >
      {label}
    </button>
  );
}
export function AssetPickerProvider({
  files,
  profile,
  children,
}: {
  files: AssetFile[];
  profile: Profile;
  children: ReactNode;
}) {
  const [pick, setPick] = useState<Pick | null>(null),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState("");
  const matches = (f: AssetFile) =>
    (pick?.kind === "image"
      ? /\.(png|jpe?g|webp|svg)$/i
      : pick?.kind === "audio"
        ? /\.(mp3|ogg|wav)$/i
        : /\.lrc$/i
    ).test(f.url) && f.url.toLowerCase().includes(query.toLowerCase());
  return (
    <PickerContext.Provider
      value={(p) => {
        setQuery("");
        setSelected("");
        setPick(p);
      }}
    >
      {children}
      {pick && (
        <Modal
          title={`选择${{ image: "图片", audio: "音乐", lyrics: "歌词" }[pick.kind]}`}
          onClose={() => setPick(null)}
        >
          <input
            aria-label="筛选素材"
            placeholder="搜索文件名…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="st-picker-grid">
            {files.filter(matches).map((f) => (
              <button
                key={f.url}
                className={selected === f.url ? "selected" : ""}
                onClick={() => setSelected(f.url)}
              >
                {pick.kind === "image" ? (
                  <img src={mediaUrl(profile, f.url)} alt="" loading="lazy" />
                ) : (
                  <span>{pick.kind === "audio" ? "♫" : "LRC"}</span>
                )}
                <span>{f.url.split("/").at(-1)}</span>
              </button>
            ))}
          </div>
          {!files.some(matches) && (
            <p>没有符合条件的素材。可先前往资源库导入。</p>
          )}
          {selected && (
            <div className="st-picker-detail">
              <code>{selected}</code>
              {pick.kind === "audio" && (
                <audio
                  key={selected}
                  controls
                  src={mediaUrl(profile, selected)}
                />
              )}
            </div>
          )}
          <button
            className="primary"
            disabled={!selected}
            onClick={() => {
              pick.choose(selected);
              setPick(null);
            }}
          >
            使用选中素材
          </button>
        </Modal>
      )}
    </PickerContext.Provider>
  );
}
export function registerBackdrop(project: AuthorProject, url: string) {
  const existing = project.backdrops.find((b) => b.src === url);
  if (existing) return existing.id;
  let i = 1;
  while (project.backdrops.some((b) => b.id === `backdrop-${i}`)) i++;
  const id = `backdrop-${i}`;
  project.backdrops.push({ id, src: url });
  return id;
}
