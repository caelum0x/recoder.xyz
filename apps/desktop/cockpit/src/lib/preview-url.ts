/**
 * extractPreviewUrl — pull the local dev-server URL out of a run session's
 * console output (Vite's "Local: http://localhost:5173/", Next/Flask/etc.), so
 * the Run tab can offer an "Open preview" link. Pure + tested.
 *
 * Returns the LAST local URL printed (the currently-active server after any
 * restart), with 0.0.0.0/127.0.0.1 normalized to localhost so the link is
 * clickable. Returns null when no local URL has appeared yet.
 */
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/[^\s"'<>]*)?/gi;

export function extractPreviewUrl(output: string | null | undefined): string | null {
  if (!output) return null;
  const matches = output.match(LOCAL_URL);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return last.replace(/\/\/(?:0\.0\.0\.0|127\.0\.0\.1)(?=[:/]|$)/, '//localhost');
}
