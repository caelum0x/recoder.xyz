// Owned by Recoder. Outbound delivery for the LINE ConnectorPort adapter using
// the REAL `@line/bot-sdk` MessagingApiClient. Target normalization (stripping
// `line:group:` / `line:room:` / `line:user:` / `line:` prefixes) and the
// reply-token-first / push-fallback batching are ported verbatim from the real
// ../send.ts + ../reply-chunks.ts. LINE's 5000-char text limit and 5-message
// reply-token batch limit are preserved.

import { createLineMessagingClient } from "./line-runtime.js";
import type { LineMessagingApiClient, LineTextMessage } from "./line-sdk-types.js";

/** LINE hard limit on a single text message body. */
export const LINE_TEXT_LIMIT = 5000;
/** LINE allows at most 5 messages per reply-token batch. */
export const LINE_REPLY_BATCH = 5;

/** Strip Recoder/LINE internal address prefixes down to the native chat id. */
export function normalizeLineTarget(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) {
    throw new Error("Recipient is required for LINE sends");
  }
  const normalized = trimmed
    .replace(/^line:group:/i, "")
    .replace(/^line:room:/i, "")
    .replace(/^line:user:/i, "")
    .replace(/^line:/i, "");
  if (!normalized) {
    throw new Error("Recipient is required for LINE sends");
  }
  return normalized;
}

/** Split a body into <=LINE_TEXT_LIMIT chunks on UTF-16 boundaries. */
export function chunkLineText(text: string, limit = LINE_TEXT_LIMIT): string[] {
  const trimmed = text ?? "";
  if (trimmed.length <= limit) {
    return trimmed.trim() ? [trimmed] : [];
  }
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += limit) {
    chunks.push(trimmed.slice(i, i + limit));
  }
  return chunks;
}

function textMessage(text: string): LineTextMessage {
  return { type: "text", text };
}

export interface LineDeliveryParams {
  channelAccessToken: string;
  /** Native chat id (already prefix-stripped) for push delivery. */
  to: string;
  /** Pre-chunked text segments to deliver (each <= LINE_TEXT_LIMIT). */
  chunks: string[];
  /** One-time reply token from the inbound event, if replying. */
  replyToken?: string;
  client?: LineMessagingApiClient;
}

/** Result of a delivery: native message ids of the messages LINE accepted. */
export interface LineDeliveryResult {
  delivered: boolean;
  messageIds: string[];
}

function collectIds(response: { sentMessages?: Array<{ id: string }> }): string[] {
  return (response.sentMessages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
}

/**
 * Deliver `chunks` to LINE. Uses the one-time reply token for the first
 * {@link LINE_REPLY_BATCH} segments when present (cheaper, no push quota), then
 * pushes the remainder. Falls back to push entirely if the reply call fails.
 */
export async function deliverLineMessage(params: LineDeliveryParams): Promise<LineDeliveryResult> {
  const { channelAccessToken, replyToken } = params;
  const chunks = params.chunks.filter((c) => c.trim().length > 0);
  if (chunks.length === 0) {
    throw new Error("Message must be non-empty for LINE sends");
  }

  const to = normalizeLineTarget(params.to);
  const client = params.client ?? createLineMessagingClient({ channelAccessToken });
  const messageIds: string[] = [];

  let pushFrom = 0;

  if (replyToken) {
    const replyBatch = chunks.slice(0, LINE_REPLY_BATCH);
    try {
      const response = await client.replyMessage({
        replyToken,
        messages: replyBatch.map(textMessage),
      });
      messageIds.push(...collectIds(response));
      pushFrom = replyBatch.length;
    } catch {
      // Reply token expired/used — fall back to pushing every chunk.
      pushFrom = 0;
    }
  }

  for (let i = pushFrom; i < chunks.length; i += 1) {
    const response = await client.pushMessage({
      to,
      messages: [textMessage(chunks[i])],
    });
    messageIds.push(...collectIds(response));
  }

  return { delivered: true, messageIds };
}
