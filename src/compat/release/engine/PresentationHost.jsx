// MAGICKISA release-compatible runtime.
export function PresentationHost({
  project: project,
  mode: mode,
  time: time,
  pageIndex = 0,
  onSkip: onSkip,
  audioRef: audioRef,
  resolveAsset = (o) => o,
  children: children,
}) {
  var m, E;
  const media = project.media || {};
  if (mode === "dedication") {
    const w = media.dedication || {},
      x = w.pages || [],
      L = x[Math.min(pageIndex, Math.max(0, x.length - 1))] || [];
    return (
      <div
        className="dedication-screen"
        role="dialog"
        aria-label={w.title || project.title}
      >
        <div className="dedication-kicker">{w.title || project.title}</div>
        <div className="dedication-group">
          {L.map((h) => (
            <div className="dedication-line" key={h}>
              {h}
            </div>
          ))}
        </div>
        <div className="dedication-index">
          {String(Math.min(pageIndex + 1, Math.max(1, x.length))).padStart(
            2,
            "0",
          )}
          {" / "}
          {String(Math.max(1, x.length)).padStart(2, "0")}
        </div>
        <div className="dedication-hint">{w.hint || "点击继续"}</div>
        {children}
      </div>
    );
  }
  if (mode === "opening") {
    const w = media.opening || {},
      x = w.pages || [
        {
          at: 0,
          text: "",
        },
      ],
      L = w.images || [],
      h = x.reduce((k, C) => (time >= C.at ? C : k), x[0]),
      d = L.length ? Math.floor(time / 14) % L.length : -1,
      p = w.credits;
    return (
      <div
        className="op-screen"
        role="dialog"
        aria-label={w.title || "Opening"}
      >
        <audio ref={audioRef} src={w.audio} preload="auto" />
        <div className="op-image-stack">
          {L.map((k, C) => (
            <img
              className={d === C ? "op-image active" : "op-image"}
              src={resolveAsset(k)}
              alt=""
              key={k}
            />
          ))}
        </div>
        <div className="op-wash" />
        {d === 1 && (p == null ? void 0 : p.artist) && (
          <div className="op-credit artist-credit">
            <strong>{p.artist}</strong>
            {p.website && <small>{p.website}</small>}
          </div>
        )}
        {d === 4 && (p == null ? void 0 : p.production) && (
          <div className="op-credit production-credit">
            {p.production.map((k) => (
              <strong key={k}>{k}</strong>
            ))}
            {p.studio && <small>{p.studio}</small>}
            {p.studioUrl && (
              <a href={p.studioUrl} target="_blank" rel="noreferrer">
                {p.studioUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        )}
        {children}
        <div className="op-title">{w.title || "OPENING"}</div>
        <div className="op-lyrics">
          {h.text
            .split(
              `
`,
            )
            .map((k) => (
              <div key={k}>{k}</div>
            ))}
        </div>
        <div className="op-progress">
          <span>{"OPENING"}</span>
          <i
            style={{
              width: `${Math.min(100, (time / (w.duration || 1)) * 100)}%`,
            }}
          />
        </div>
        <button className="op-skip" onClick={onSkip}>
          {"跳过 OP"}
        </button>
      </div>
    );
  }
  const c = media.ending || {},
    v = c.lines || [],
    y = v.length ? v.reduce((w, x) => (time >= x.at ? x : w), v[0]) : void 0;
  return (
    <div
      className={`ed-screen${c.creditsMode === "crawl" ? " ed-crawl-active" : ""}`}
      role="dialog"
      aria-label={c.title || "Ending"}
    >
      <audio ref={audioRef} src={c.audio} preload="auto" />
      {c.image && (
        <img
          className="ed-image"
          src={resolveAsset(c.image)}
          alt="Ending backdrop"
        />
      )}
      <div className="ed-wash" />
      <div className="ed-header">{c.title || "ENDING"}</div>
      {y && (
        <div className="ed-subtitle">
          {y.en
            .split(
              `
`,
            )
            .map((w) => (
              <div key={w}>{w}</div>
            ))}
          <small>
            {y.zh
              .split(
                `
`,
              )
              .map((w) => (
                <div key={w}>{w}</div>
              ))}
          </small>
        </div>
      )}
      {(m = c.credits) != null && m.length && c.creditsMode === "crawl" ? (
        <div
          className="ed-credits ed-credits-crawl"
          style={{
            "--ed-crawl-duration": `${Math.max(18, c.creditsDuration || 42)}s`,
          }}
        >
          <div className="ed-credits-track">
            {c.credits.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        </div>
      ) : (
        <div className="ed-credits">
          {(E = c.credits) != null && E.length
            ? c.credits[Math.floor(time / 7) % c.credits.length]
            : ""}
        </div>
      )}
      <div className="ed-progress">
        <i
          style={{
            width: `${Math.min(100, (time / (c.duration || 1)) * 100)}%`,
          }}
        />
      </div>
      <button className="ed-skip" onClick={onSkip}>
        {"跳过 ED"}
      </button>
    </div>
  );
}
