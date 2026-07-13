// Owned by Recoder. Real Telegram message chunking.
//
// Telegram caps a single sendMessage `text` at 4096 UTF-16 code units. The
// extracted send path splits long bodies before delivery; this preserves that
// behavior for the ConnectorPort `send()` seam. Splits on paragraph, then line,
// then word boundaries, and only hard-cuts when a single token exceeds the cap.

import { TELEGRAM_MAX_MESSAGE_LENGTH } from "./telegram-api.js";

/** Split `text` into <= `limit`-length chunks on natural boundaries. */
export function chunkTelegramText(
  text: string,
  limit: number = TELEGRAM_MAX_MESSAGE_LENGTH,
): string[] {
  const trimmed = text ?? "";
  if (trimmed.length <= limit) {
    return trimmed.length > 0 ? [trimmed] : [];
  }

  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const splitAt = bestSplitIndex(window);
    const head = remaining.slice(0, splitAt).trimEnd();
    if (head.length > 0) {
      chunks.push(head);
    }
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

/** Prefer the last paragraph break, then line break, then space within `window`. */
function bestSplitIndex(window: string): number {
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
  // Single oversized token: hard cut at the limit.
  return window.length;
}
