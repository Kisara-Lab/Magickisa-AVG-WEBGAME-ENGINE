import type { Variables } from "./types";
export function interpolationKeys(text: string) {
  return [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map((match) =>
    match[1].trim(),
  );
}
export function interpolate(text: string, variables: Variables) {
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, key: string) =>
    String(variables[key.trim()] ?? ""),
  );
}
