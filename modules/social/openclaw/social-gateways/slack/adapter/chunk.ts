// Owned by Recoder. Outbound text chunking for the Slack connector adapter. The
// real extracted `slack/send.ts` capped each message at SLACK_TEXT_LIMIT (4000)
// and chunked via the OpenClaw `../auto-reply/chunk.js` + `../markdown/*`
// pipeline, neither of which was part of the extraction. This owns the same
// hard cap and a self-contained boundary-aware splitter so the adapter never
// exceeds Slack's per-message limit. No markdown IR dependency.

/** Slack's hard per-message text limit. Real value from `slack/send.ts`. */
export const SLACK_TEXT_LIMIT = 4000;

/**
 * Split `text` into chunks no longer than `limit`, preferring to break on
 * paragraph, then line, then word boundaries before falling back to a hard cut.
 * An empty body yields a single empty chunk so the connector still emits one
 * message when callers expect a post.
 */
export function chunkSlackText(text: string, limit = SLACK_TEXT_LIMIT): string[] {
  const cap = Math.max(1, Math.min(limit, SLACK_TEXT_LIMIT));
  const body = text ?? "";
  if (body.length <= cap) {
    return [body];
  }

  const chunks: string[] = [];
  let remaining = body;

  while (remaining.length > cap) {
    const window = remaining.slice(0, cap);
    const breakAt = preferredBreak(window);
    const cut = breakAt > 0 ? breakAt : cap;
    chunks.push(remaining.slice(0, cut).replace(/\s+$/, ""));
    remaining = remaining.slice(cut).replace(/^\s+/, "");
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks.length > 0 ? chunks : [""];
}

function preferredBreak(window: string): number {
  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph > 0) {
    return paragraph + 2;
  }
  const line = window.lastIndexOf("\n");
  if (line > 0) {
    return line + 1;
  }
  const space = window.lastIndexOf(" ");
  if (space > 0) {
    return space + 1;
  }
  return 0;
}
