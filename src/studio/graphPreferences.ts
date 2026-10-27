export interface GraphPreferences {
  query: string;
  mode: "all" | "chapter" | "neighbors";
  chapter: string;
  depth: number;
  direction: "both" | "in" | "out";
  conditional: boolean;
  problems: boolean;
  viewport?: { x: number; y: number; zoom: number };
}
export function readPreference(
  scope: string,
  defaultMode: GraphPreferences["mode"] = "all",
): GraphPreferences {
  const defaults: GraphPreferences = {
    query: "",
    mode: defaultMode,
    chapter: "",
    depth: 1,
    direction: "both",
    conditional: false,
    problems: false,
  };
  try {
    const raw = JSON.parse(
      localStorage.getItem("magickisa:graph:" + scope) ?? "{}",
    );
    if (!raw || typeof raw !== "object") return defaults;
    return {
      ...defaults,
      query: typeof raw.query === "string" ? raw.query : "",
      chapter: typeof raw.chapter === "string" ? raw.chapter : "",
      mode: ["all", "chapter", "neighbors"].includes(raw.mode)
        ? raw.mode
        : defaultMode,
      direction: ["both", "in", "out"].includes(raw.direction)
        ? raw.direction
        : "both",
      depth: raw.depth === 2 ? 2 : 1,
      conditional: raw.conditional === true,
      problems: raw.problems === true,
      ...(raw.viewport &&
      ["x", "y", "zoom"].every(
        (k) =>
          typeof raw.viewport[k] === "number" &&
          Number.isFinite(raw.viewport[k]),
      ) &&
      raw.viewport.zoom >= 0.08 &&
      raw.viewport.zoom <= 2
        ? { viewport: raw.viewport }
        : {}),
    };
  } catch {
    return defaults;
  }
}
export function writePreference(scope: string, value: GraphPreferences) {
  try {
    localStorage.setItem("magickisa:graph:" + scope, JSON.stringify(value));
    return true;
  } catch {
    window.dispatchEvent(new CustomEvent("magickisa:preference-error"));
    return false;
  }
}
