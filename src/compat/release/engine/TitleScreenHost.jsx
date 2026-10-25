// MAGICKISA release-compatible runtime.
import React from "react";
export function TitleScreenHost({
  project: project,
  backdrop: backdrop,
  audioRef: audioRef,
  audioBlocked: audioBlocked,
  onStart: onStart,
  onContinue: onContinue,
  onEnableAudio: onEnableAudio,
}) {
  var c, v, y;
  const titleScreen = project.titleScreen || {},
    labels = ((c = project.ui) == null ? void 0 : c.labels) || {};
  return (
    <div className="title-screen">
      {backdrop && <img src={backdrop} alt={`${project.title} title backdrop`} />}
      <div className="title-shade" />
      <audio ref={audioRef} src={titleScreen.music} loop={!0} preload="auto" />
      <div className="title-content">
        <div className="title-overline">
          {titleScreen.overline || project.title}
        </div>
        <h1>{project.title}</h1>
        <p>{titleScreen.subtitle || ""}</p>
        <div className="title-menu">
          <button data-action="new-game" onClick={onStart}>
            {labels.newGame || "开始游戏"}
          </button>
          <button onClick={onContinue}>{labels.continue || "继续游戏"}</button>
          {titleScreen.galleryUrl && (
            <a href={titleScreen.galleryUrl}>{labels.gallery || "素材画廊"}</a>
          )}
          {titleScreen.aboutUrl && (
            <a href={titleScreen.aboutUrl}>{labels.about || "作品介绍"}</a>
          )}
        </div>
        <button className="audio-enable" onClick={onEnableAudio}>
          {audioBlocked
            ? "开启首页音乐"
            : `♫ ${titleScreen.musicLabel || "首页音乐"}`}
        </button>
        <small className="title-note">{"点击进入 · 音乐循环播放"}</small>
      </div>
      {(((v = titleScreen.footerLinks) == null ? void 0 : v.length) ||
        titleScreen.studio) && (
        <footer className="title-footer">
          {!!((y = titleScreen.footerLinks) != null && y.length) && (
            <nav aria-label="相关作品">
              {titleScreen.footerLinks.map((m) => (
                <a href={m.url} target="_blank" rel="noreferrer" key={m.url}>
                  {m.label}
                </a>
              ))}
            </nav>
          )}
          {titleScreen.studio && (
            <div className="title-studio">
              {titleScreen.studio}
              {titleScreen.studioUrl && (
                <React.Fragment>
                  {" · "}
                  <a
                    href={titleScreen.studioUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {titleScreen.studioUrl.replace(/^https?:\/\//, "")}
                  </a>
                </React.Fragment>
              )}
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
