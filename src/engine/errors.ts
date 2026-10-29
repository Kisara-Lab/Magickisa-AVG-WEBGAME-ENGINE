/** Keep actionable details without JavaScript exception type prefixes. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return String(error);
}

export function errorSentence(error: unknown): string {
  return describeError(error).replace(/[。.!！\s]+$/u, "") + "。";
}
