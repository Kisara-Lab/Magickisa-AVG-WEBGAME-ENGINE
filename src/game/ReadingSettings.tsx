import type { PlayerPreferences } from "./preferences";
export function ReadingSettings({
  value,
  onChange,
}: {
  value: PlayerPreferences;
  onChange: (p: PlayerPreferences) => void;
}) {
  const slider = (
    key: keyof PlayerPreferences,
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <label>
      {label}：{String(value[key])}
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(value[key])}
        onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <section className="reading-settings">
      {slider("fontSize", "正文字号", 16, 32, 1)}
      {slider("lineHeight", "正文行距", 1.4, 2.4, 0.1)}
      {slider("opacity", "对话框不透明度", 0.75, 1, 0.05)}
      {slider("characterDelay", "每字间隔（毫秒，0 为整句）", 0, 120, 10)}
      {slider("autoDelay", "自动阅读等待（秒）", 1, 10, 0.1)}
      {slider("bgmVolume", "背景音乐音量", 0, 1, 0.05)}
      {slider("voiceVolume", "配音音量", 0, 1, 0.05)}
      {slider("soundVolume", "音效音量", 0, 1, 0.05)}
      <label>
        <input
          type="checkbox"
          checked={value.wheel}
          onChange={(e) => onChange({ ...value, wheel: e.target.checked })}
        />
        启用滚轮推进／上滚查看历史
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.musicLabel}
          onChange={(e) => onChange({ ...value, musicLabel: e.target.checked })}
        />
        显示当前音乐名
      </label>
      <p>
        Space／右方向键继续，左方向键回退。逐字显示时首次继续补全文字。自动与快进会在离开页面或打开面板时停止。
      </p>
    </section>
  );
}
