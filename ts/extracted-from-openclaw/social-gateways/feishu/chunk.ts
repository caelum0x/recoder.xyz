// Owned by Recoder. Outbound text chunking for the Feishu connector. The real
// extracted `config.ts` resolves `textChunkLimit` (default 2000) and a
// `chunkMode` of "length" | "newline"; this owns that same chunking behavior
// for the ConnectorPort `send()` path without the OpenClaw config tree.

/** Feishu's default per-message text limit from the extracted config defaults. */
export const FEISHU_DEFAULT_TEXT_CHUNK_LIMIT = 2000;

/**
 * Split `text` into chunks no longer than `limit`. Prefers to break on newline
 * boundaries (so formatting survives) and hard-splits any single line that
 * still exceeds the limit. Never returns an empty array for non-empty input.
 */
export function chunkFeishuText(
  text: string,
  limit: number = FEISHU_DEFAULT_TEXT_CHUNK_LIMIT,
): string[] {
  const max = limit > 0 ? limit : FEISHU_DEFAULT_TEXT_CHUNK_LIMIT;
  if (text.length <= max) {
    return text.length > 0 ? [text] : [];
  }

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const line of text.split("\n")) {
    if (line.length > max) {
      flush();
      for (let i = 0; i < line.length; i += max) {
        chunks.push(line.slice(i, i + max));
      }
      continue;
    }
    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (candidate.length > max) {
      flush();
      current = line;
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}
