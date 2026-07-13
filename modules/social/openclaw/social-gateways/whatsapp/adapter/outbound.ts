// Owned by Recoder. Outbound delivery + reactions for the WhatsApp ConnectorPort.
// The text chunk limit (4000), target resolution, and media/poll send shapes are
// taken from the real extracted WhatsApp outbound adapter
// (gateway-core/channels/plugins/outbound/whatsapp.ts: `textChunkLimit: 4000`,
// `normalizeWhatsAppTarget`, `sendMessageWhatsApp`/`sendMediaWhatsApp`). Those
// originals call the un-extracted `web/outbound.js`; here the call is issued over
// the WhatsApp Web bridge daemon's HTTP API (`POST /api/v1/send`, `/api/v1/react`)
// — the same daemon-over-HTTP model the Signal adapter uses — keeping the wire
// semantics (recipient JID + text/media) unchanged.

import { resolveWhatsAppSendJid } from "./target.js";
import { whatsappPost, type WhatsAppHttpOptions } from "./transport.js";

/** WhatsApp Web outbound text chunk limit (real `whatsappOutbound.textChunkLimit`). */
export const WHATSAPP_TEXT_CHUNK_LIMIT = 4000;

export interface WhatsAppSendContext extends WhatsAppHttpOptions {
  /** Connector account id, forwarded to the bridge for multi-session routing. */
  readonly accountId?: string;
}

export interface WhatsAppSendResult {
  readonly messageId: string;
  readonly timestamp?: number;
}

/** A media attachment to deliver alongside (or instead of) text. */
export interface WhatsAppOutboundMedia {
  /** Local path or URL the bridge resolves to bytes. */
  readonly source: string;
  readonly mimeType?: string;
  readonly filename?: string;
}

/**
 * Split `text` into chunks no longer than `limit`, preferring newline then
 * whitespace boundaries, hard-splitting only when a single token exceeds the
 * limit. Mirrors the gateway's text-mode chunking contract (`chunkerMode:"text"`).
 */
export function chunkWhatsAppText(text: string, limit = WHATSAPP_TEXT_CHUNK_LIMIT): string[] {
  const trimmed = text ?? "";
  if (trimmed.length <= limit) {
    return trimmed.trim() ? [trimmed] : [];
  }
  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut <= 0) {
      cut = remaining.lastIndexOf(" ", limit);
    }
    if (cut <= 0) {
      cut = limit;
    }
    const piece = remaining.slice(0, cut);
    chunks.push(piece);
    remaining = remaining.slice(cut).replace(/^[\s]+/, "");
  }
  if (remaining.trim()) {
    chunks.push(remaining);
  }
  return chunks;
}

interface WhatsAppSendResponse {
  readonly id?: unknown;
  readonly messageId?: unknown;
  readonly key?: { id?: unknown } | null;
  readonly timestamp?: unknown;
}

function readSendResult(response: WhatsAppSendResponse | undefined): WhatsAppSendResult {
  const idCandidate =
    (typeof response?.id === "string" && response.id) ||
    (typeof response?.messageId === "string" && response.messageId) ||
    (typeof response?.key?.id === "string" && response.key.id) ||
    "";
  const timestamp =
    typeof response?.timestamp === "number" && Number.isFinite(response.timestamp)
      ? response.timestamp
      : undefined;
  return {
    messageId: idCandidate || "unknown",
    timestamp,
  };
}

/**
 * Deliver one text segment to a WhatsApp recipient via the bridge `send` API.
 * `to` is any acceptable target (E.164 / user JID / group JID); it is resolved
 * to the canonical send JID before delivery.
 */
export async function sendWhatsAppSegment(
  to: string,
  text: string,
  ctx: WhatsAppSendContext,
): Promise<WhatsAppSendResult> {
  const message = text ?? "";
  if (!message.trim()) {
    throw new Error("WhatsApp send requires non-empty text");
  }
  const jid = resolveWhatsAppSendJid(to);
  const params: Record<string, unknown> = { to: jid, text: message };
  if (ctx.accountId) {
    params.accountId = ctx.accountId;
  }
  const response = await whatsappPost<WhatsAppSendResponse>("/api/v1/send", params, ctx);
  return readSendResult(response);
}

/**
 * Deliver a media message (with optional caption) to a WhatsApp recipient via
 * the bridge `send` API. Mirrors the real `sendMediaWhatsApp` shape (recipient +
 * mediaUrl + optional text caption).
 */
export async function sendWhatsAppMedia(
  to: string,
  media: WhatsAppOutboundMedia,
  caption: string,
  ctx: WhatsAppSendContext,
): Promise<WhatsAppSendResult> {
  const jid = resolveWhatsAppSendJid(to);
  const params: Record<string, unknown> = {
    to: jid,
    mediaUrl: media.source,
  };
  if (caption.trim()) {
    params.text = caption;
  }
  if (media.mimeType) {
    params.mimeType = media.mimeType;
  }
  if (media.filename) {
    params.filename = media.filename;
  }
  if (ctx.accountId) {
    params.accountId = ctx.accountId;
  }
  const response = await whatsappPost<WhatsAppSendResponse>("/api/v1/send", params, ctx);
  return readSendResult(response);
}

/**
 * Apply an emoji reaction to an inbound WhatsApp message via the bridge `react`
 * API. WhatsApp reactions are addressed by the conversation JID + the target
 * message id; an empty emoji retracts a previous reaction. Returns true on
 * success.
 */
export async function reactWhatsApp(
  conversationId: string,
  messageId: string,
  emoji: string,
  ctx: WhatsAppSendContext,
): Promise<boolean> {
  const jid = resolveWhatsAppSendJid(conversationId);
  const trimmedId = messageId.trim();
  if (!trimmedId) {
    throw new Error("WhatsApp reaction requires a message id");
  }
  const params: Record<string, unknown> = {
    to: jid,
    messageId: trimmedId,
    emoji: emoji.trim(),
  };
  if (ctx.accountId) {
    params.accountId = ctx.accountId;
  }
  await whatsappPost<unknown>("/api/v1/react", params, ctx);
  return true;
}
