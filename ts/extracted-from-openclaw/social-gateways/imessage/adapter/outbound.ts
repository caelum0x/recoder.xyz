// Owned by Recoder. Outbound delivery + reactions for the iMessage
// ConnectorPort. The `imsg` `send` RPC param construction (target → to /
// chat_id / chat_guid / chat_identifier, plus service/region/file) is extracted
// verbatim from the real social-gateways/imessage/send.ts. Config/media/markdown
// helpers the original pulled from un-extracted monorepo modules
// (`../config`, `../media`, `../web`, `../markdown`) are dropped: the adapter
// delivers already-rendered text segments (chunking is done here) and resolves
// media from a local file path the caller supplies. The `imsg` wire contract is
// unchanged.

import { IMessageRpcClient } from "./client.js";
import {
  formatIMessageChatTarget,
  type IMessageService,
  parseIMessageTarget,
} from "./targets.js";

/** Default per-message text chunk limit for iMessage (gateway-core default). */
export const IMESSAGE_TEXT_CHUNK_LIMIT = 2000;

export interface IMessageSendContext {
  readonly client: IMessageRpcClient;
  /** Default send service when the target carries no explicit service prefix. */
  readonly service?: IMessageService;
  /** Default dialing region for bare phone handles (e.g. "US"). */
  readonly region: string;
  readonly timeoutMs?: number;
}

export interface IMessageSegmentResult {
  readonly messageId: string;
}

function resolveMessageId(result: Record<string, unknown> | null | undefined): string | null {
  if (!result) {
    return null;
  }
  const raw =
    (typeof result.messageId === "string" && result.messageId.trim()) ||
    (typeof result.message_id === "string" && result.message_id.trim()) ||
    (typeof result.id === "string" && result.id.trim()) ||
    (typeof result.guid === "string" && result.guid.trim()) ||
    (typeof result.message_id === "number" ? String(result.message_id) : null) ||
    (typeof result.id === "number" ? String(result.id) : null);
  return raw ? String(raw).trim() : null;
}

/**
 * Split `text` into chunks no longer than `limit`, preferring newline then
 * whitespace boundaries, and hard-splitting only when a single token exceeds the
 * limit. Mirrors the gateway's length-mode chunking contract.
 */
export function chunkIMessageText(text: string, limit = IMESSAGE_TEXT_CHUNK_LIMIT): string[] {
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

/**
 * Build the `imsg send` RPC params for one outbound segment. Target resolution
 * (chat_id / chat_guid / chat_identifier / handle + service selection) is the
 * real construction extracted from send.ts.
 */
function buildSendParams(params: {
  to: string;
  text: string;
  service?: IMessageService;
  region: string;
  chatId?: number;
  filePath?: string;
}): Record<string, unknown> {
  const target = parseIMessageTarget(
    params.chatId ? formatIMessageChatTarget(params.chatId) : params.to,
  );
  const service =
    params.service ??
    (target.kind === "handle" ? target.service : undefined) ??
    undefined;

  const rpcParams: Record<string, unknown> = {
    text: params.text,
    service: service || "auto",
    region: params.region,
  };
  if (params.filePath) {
    rpcParams.file = params.filePath;
  }

  if (target.kind === "chat_id") {
    rpcParams.chat_id = target.chatId;
  } else if (target.kind === "chat_guid") {
    rpcParams.chat_guid = target.chatGuid;
  } else if (target.kind === "chat_identifier") {
    rpcParams.chat_identifier = target.chatIdentifier;
  } else {
    rpcParams.to = target.to;
  }

  return rpcParams;
}

/**
 * Deliver one text segment (optionally with one local media file) to an iMessage
 * target via the `imsg` `send` RPC. Returns the delivered message id (or "ok"/
 * "unknown" when the CLI acks without one), matching the real send.ts contract.
 */
export async function sendIMessageSegment(
  to: string,
  text: string,
  ctx: IMessageSendContext,
  opts: { chatId?: number; filePath?: string } = {},
): Promise<IMessageSegmentResult> {
  const message = text ?? "";
  if (!message.trim() && !opts.filePath) {
    throw new Error("iMessage send requires text or media");
  }
  const params = buildSendParams({
    to,
    text: message,
    service: ctx.service,
    region: ctx.region,
    chatId: opts.chatId,
    filePath: opts.filePath,
  });
  const result = await ctx.client.request<{ ok?: string }>("send", params, {
    timeoutMs: ctx.timeoutMs,
  });
  const resolvedId = resolveMessageId(result);
  return {
    messageId: resolvedId ?? (result?.ok ? "ok" : "unknown"),
  };
}

/**
 * Apply a tapback/emoji reaction to an inbound iMessage via the `imsg` `react`
 * RPC. iMessage tapbacks are a real channel capability, but the raw extraction
 * carries no reaction path (see the adapter handoff foundationGaps), so this
 * issues the `react` RPC the `imsg` CLI exposes and reports truthful success:
 * resolves `false` (never throws) when the running `imsg` build does not support
 * reactions, so reaction failures never break the calling flow.
 */
export async function reactIMessage(params: {
  client: IMessageRpcClient;
  conversationId: string;
  messageId: string;
  emoji: string;
  chatId?: number;
  timeoutMs?: number;
}): Promise<boolean> {
  const emoji = params.emoji?.trim();
  if (!emoji) {
    return false;
  }
  const target = parseIMessageTarget(
    params.chatId ? formatIMessageChatTarget(params.chatId) : params.conversationId,
  );
  const rpcParams: Record<string, unknown> = {
    message_id: params.messageId,
    emoji,
  };
  if (target.kind === "chat_id") {
    rpcParams.chat_id = target.chatId;
  } else if (target.kind === "chat_guid") {
    rpcParams.chat_guid = target.chatGuid;
  } else if (target.kind === "chat_identifier") {
    rpcParams.chat_identifier = target.chatIdentifier;
  } else {
    rpcParams.to = target.to;
  }

  try {
    await params.client.request("react", rpcParams, { timeoutMs: params.timeoutMs });
    return true;
  } catch {
    // The `imsg` build may not expose `react`; truthfully report no reaction.
    return false;
  }
}
