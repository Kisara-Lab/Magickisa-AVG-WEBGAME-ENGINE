import { featureEnabled, uiLabel } from "./uiConfig";
import { validPublicLink } from "./links";
import type { ReactNode } from "react";
import type { StoryProject } from "./types";
import { resolveAsset, resolveScene } from "./media";
export function TitleScreenHost({
  project,
  audioBlocked,
  onStart,
  onContinue,
  onEnableAudio,
  children,
  canContinue = true,
  continueSummary,
  onLoad,
  onSettings,
}: {
  project: StoryProject;
  audioBlocked: boolean;
  onStart: () => void;
  onContinue: () => void;
  onEnableAudio: () => void;
  children?: ReactNode;
  canContinue?: boolean;
  continueSummary?: string;
  onLoad?: () => void;
  onSettings?: () => void;
}) {
  const t = project.titleScreen,
    labels = project.ui?.labels || {};
  return (
    <div className="title-screen">
      <img
        src={
          t.backdrop
            ? resolveAsset(project, t.backdrop)
            : resolveScene(project, "")
        }
        alt={`${project.title} title backdrop`}
      />
      <div className="title-shade" />
      <div className="title-content">
        <div className="title-overline">{t.overline || project.title}</div>
        <h1>{project.title}</h1>
        <p>{t.subtitle}</p>
        <div className="title-menu">
          <button data-action="new-game" onClick={onStart}>
            {labels.newGame || "开始游戏"}
          </button>
          <button disabled={!canContinue} onClick={onContinue}>
            {labels.continue || "继续游戏"}
          </button>
          {onLoad && (
            <button onClick={onLoad}>{uiLabel(project, "load")}</button>
          )}
          {onSettings && (
            <button onClick={onSettings}>
              {uiLabel(project, "settings", "设置")}
            </button>
          )}
          {t.galleryUrl &&
            validPublicLink(t.galleryUrl) &&
            featureEnabled(project, "gallery") && (
              <a href={t.galleryUrl}>{labels.gallery || "素材画廊"}</a>
            )}
          {t.aboutUrl && validPublicLink(t.aboutUrl) && (
            <a href={t.aboutUrl}>{labels.about || "作品介绍"}</a>
          )}
          {children}
        </div>
        {continueSummary && (
          <p className="continue-summary">{continueSummary}</p>
        )}
        <button
          className="audio-enable"
          disabled={!t.music}
          onClick={onEnableAudio}
        >
          {audioBlocked ? "开启首页音乐" : `♫ ${t.musicLabel || "首页音乐"}`}
        </button>
        <small className="title-note">
          {t.music ? "点击进入 · 音乐循环播放" : "准备好后，开始你的故事。"}
        </small>
      </div>
      <footer className="title-footer">
        <nav aria-label="相关作品">
          {t.footerLinks
            ?.filter((link) => validPublicLink(link.url))
            .map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
              </a>
            ))}
        </nav>
        <div className="title-studio">
          {t.studio}
          {t.studioUrl && validPublicLink(t.studioUrl) && (
            <>
              {" "}
              ·{" "}
              <a href={t.studioUrl} target="_blank" rel="noreferrer">
                {t.studioUrl.replace(/^https?:\/\//, "")}
              </a>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
