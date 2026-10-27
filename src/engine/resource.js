export const isExternalResource = (value) => /^(?:https?:)?\/\//i.test(value);
export const resourcePath = (value) =>
  /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(value)
    ? value
    : "/" + value.replace(/^\.\//, "");
export function resolveImage(project, value) {
  if (!value) return "";
  if (
    isExternalResource(value) ||
    value.startsWith("/") ||
    /^(data|blob):/i.test(value)
  )
    return value;
  const registered = project.backdrops?.find((b) => b.id === value);
  if (registered) return registered.src;
  // File paths are literal; only bare asset IDs use the generated-image convention.
  if (value.includes("/") || /\.[a-z0-9]+(?:[?#]|$)/i.test(value))
    return "/" + value.replace(/^\.\//, "");
  return `${project.resources?.assetsBase || "/assets/generated"}/${value}.png`;
}
export const keywordMatches = (title, keywords) =>
  keywords.some((k) => k.trim().length > 0 && title.includes(k));
export const materialCategory = (category) =>
  ({ notes: "note", evidence: "clue", items: "clue" })[category] || category;
