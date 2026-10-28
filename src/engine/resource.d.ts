export function isExternalResource(value: string): boolean;
export function resourcePath(value: string): string;
export function resolveImage(
  project: {
    backdrops?: { id: string; src: string }[];
    assets?: { id: string; src: string }[];
    audio?: { id: string; src: string }[];
    resources?: { assetsBase?: string };
  },
  value: string,
): string;
export function keywordMatches(title: string, keywords: string[]): boolean;
export function materialCategory(category: string): string;
