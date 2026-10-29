export function validPublicLink(value: string): boolean {
  if (!value || value.trim() !== value || /[\u0000-\u0020\\]/.test(value))
    return false;
  try {
    const url = new URL(value, "https://magickisa.invalid/");
    return ["https:", "http:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}
