// Owned by Recoder. The owned, structural replacement for the OpenClaw
// `../infra/errors.js#formatErrorMessage` helper that the extracted Feishu code
// depended on (that infra module was not part of the extraction). Same
// behavior: turn any thrown value into a truthful, non-empty message string,
// never swallowing the underlying cause.

/**
 * Convert any thrown value into a human-readable, truthful error string.
 * Unwraps `Error.cause` chains and falls back to JSON / String for non-Errors.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && cause !== err) {
      const causeMsg = formatErrorMessage(cause);
      if (causeMsg && !err.message.includes(causeMsg)) {
        return `${err.message}: ${causeMsg}`;
      }
    }
    return err.message || err.name || "Error";
  }
  if (typeof err === "string") {
    return err;
  }
  if (err == null) {
    return "Unknown error";
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
