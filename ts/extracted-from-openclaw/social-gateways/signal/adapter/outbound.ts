// Owned by Recoder. Outbound delivery + reactions for the Signal ConnectorPort.
// The target parsing (`parseTarget` / `buildTargetParams`), the signal-cli
// `send` RPC param construction, and the `sendReaction` RPC param construction
// are extracted verbatim from the real social-gateways/signal/send.ts and
// social-gateways/signal/send-reactions.ts. Config/media/markdown helpers that
// the originals pulled from un-extracted monorepo modules are replaced with
// dependency-free equivalents; the signal-cli wire contract is unchanged.

import { signalRpcRequest } from "./transport.js";

/** signal-cli default per-message text chunk limit (gateway-core default). */
export const SIGNAL_TEXT_CHUNK_LIMIT = 2000;

type SignalTarget =
  | { type: "recipient"; recipient: string }
  | { type: "group"; groupId: string }
  | { type: "username"; username: string };

interface SignalTargetParams {
  recipient?: string[];
  groupId?: string;
  username?: string[];
}

/** Parse a Signal target token (recipient / group:<id> / username:<u>). */
export function parseSignalTarget(raw: string): SignalTarget {
  let value = raw.trim();
  if (!value) {
    throw new Error("Signal recipient is required");
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("signal:")) {
    value = value.slice("signal:".length).trim();
  }
  const normalized = value.toLowerCase();
  if (normalized.startsWith("group:")) {
    return { type: "group", groupId: value.slice("group:".length).trim() };
  }
  if (normalized.startsWith("username:")) {
    return { type: "username", username: value.slice("username:".length).trim() };
  }
  if (normalized.startsWith("u:")) {
    return { type: "username", username: value.trim() };
  }
  return { type: "recipient", recipient: value };
}

function buildTargetParams(target: SignalTarget): SignalTargetParams {
  if (target.type === "recipient") {
    return { recipient: [target.recipient] };
  }
  if (target.type === "group") {
    return { groupId: target.groupId };
  }
  return { username: [target.username] };
}

/**
 * Split `text` into chunks no longer than `limit`, preferring newline then
 * whitespace boundaries, and hard-splitting only when a single token exceeds
 * the limit. Mirrors the gateway's length-mode chunking contract.
 */
export function chunkSignalText(text: string, limit = SIGNAL_TEXT_CHUNK_LIMIT): string[] {
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

export interface SignalSendContext {
  readonly baseUrl: string;
  /** signal-cli registered account number, if multi-account. */
  readonly account?: string;
  readonly timeoutMs?: number;
}

export interface SignalSendResult {
  readonly messageId: string;
  readonly timestamp?: number;
}

/**
 * Deliver one text segment to a Signal target via the signal-cli `send` RPC.
 * Real RPC param construction extracted from send.ts (`sendMessageSignal`).
 */
export async function sendSignalSegment(
  to: string,
  text: string,
  ctx: SignalSendContext,
): Promise<SignalSendResult> {
  const message = text ?? "";
  if (!message.trim()) {
    throw new Error("Signal send requires non-empty text");
  }
  const target = parseSignalTarget(to);
  const params: Record<string, unknown> = { message, ...buildTargetParams(target) };
  if (ctx.account) {
    params.account = ctx.account;
  }
  const result = await signalRpcRequest<{ timestamp?: number }>("send", params, {
    baseUrl: ctx.baseUrl,
    timeoutMs: ctx.timeoutMs,
  });
  const timestamp = result?.timestamp;
  return {
    messageId: timestamp ? String(timestamp) : "unknown",
    timestamp,
  };
}

function normalizeSignalUuid(raw: string): string {
  const trimmed = raw.trim().replace(/^signal:/i, "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.toLowerCase().startsWith("uuid:")) {
    return trimmed.slice("uuid:".length).trim();
  }
  return trimmed;
}

export interface SignalReactionContext extends SignalSendContext {
  /** Group id when reacting to a group message; recipient is used otherwise. */
  readonly groupId?: string;
}

/**
 * Apply (or remove) an emoji reaction via the signal-cli `sendReaction` RPC.
 * Real RPC param construction extracted from send-reactions.ts.
 *
 * @param recipient       message author (E.164 or uuid / "uuid:<raw>")
 * @param targetTimestamp the message id (signal-cli timestamp) being reacted to
 * @param emoji           the reaction emoji
 * @param remove          true to retract a previously-sent reaction
 */
export async function reactSignal(
  recipient: string,
  targetTimestamp: number,
  emoji: string,
  ctx: SignalReactionContext,
  remove = false,
): Promise<boolean> {
  const normalizedRecipient = normalizeSignalUuid(recipient);
  const groupId = ctx.groupId?.trim();
  if (!normalizedRecipient && !groupId) {
    throw new Error("Recipient or groupId is required for Signal reaction");
  }
  if (!Number.isFinite(targetTimestamp) || targetTimestamp <= 0) {
    throw new Error("Valid targetTimestamp is required for Signal reaction");
  }
  if (!emoji?.trim()) {
    throw new Error("Emoji is required for Signal reaction");
  }

  const targetAuthor = normalizedRecipient || undefined;
  if (groupId && !targetAuthor) {
    throw new Error("targetAuthor is required for group reactions");
  }

  const params: Record<string, unknown> = {
    emoji: emoji.trim(),
    targetTimestamp,
  };
  if (remove) {
    params.remove = true;
  }
  if (targetAuthor) {
    params.targetAuthor = targetAuthor;
  }
  if (normalizedRecipient) {
    params.recipients = [normalizedRecipient];
  }
  if (groupId) {
    params.groupIds = [groupId];
  }
  if (ctx.account) {
    params.account = ctx.account;
  }

  await signalRpcRequest<{ timestamp?: number }>("sendReaction", params, {
    baseUrl: ctx.baseUrl,
    timeoutMs: ctx.timeoutMs,
  });
  return true;
}
