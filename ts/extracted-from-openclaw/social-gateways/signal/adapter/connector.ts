// Owned by Recoder. The Signal ConnectorPort — a real, working adapter that
// wraps the signal-cli JSON-RPC daemon behind the uniform foundation contract
// (src/connector/connector-port.ts). It composes the real, extracted Signal
// logic: transport (JSON-RPC + SSE), identity, multi-account auth profiles,
// envelope normalization, outbound send/react, and the resilient ingress loop.
// Identity surfaced to users is rebranded to Recoder; the channel SDK semantics
// (signal-cli wire contract) are unchanged.

import type {
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
} from "../../../src/connector/connector-port.js";
import type { ConnectorKind } from "../../../src/connector/connector-kind.js";
import type { NormalizedInboundMessage } from "../../../src/connector/inbound-message.js";
import type {
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "../../../src/connector/outbound-message.js";

import {
  resolveSignalAccount,
  type ResolvedSignalAccount,
} from "./accounts.js";
import { normalizeSignalEvent } from "./normalize.js";
import {
  chunkSignalText,
  parseSignalTarget,
  reactSignal,
  sendSignalSegment,
  SIGNAL_TEXT_CHUNK_LIMIT,
  type SignalReactionContext,
  type SignalSendContext,
} from "./outbound.js";
import { runSignalSseLoop } from "./monitor-loop.js";
import { signalCheck, signalRpcRequest, type SignalSseEvent } from "./transport.js";

/** signal-cli `version` RPC response shape (string or { version }). */
function parseSignalVersion(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "object" && value !== null) {
    const version = (value as { version?: unknown }).version;
    if (typeof version === "string" && version.trim()) {
      return version.trim();
    }
  }
  return undefined;
}

/** Identity label surfaced to callers/users — Recoder-branded. */
function brandIdentity(account: ResolvedSignalAccount, version?: string): string {
  const who = account.account ? account.account : account.baseUrl;
  const base = `Recoder Signal connector (${who})`;
  return version ? `${base} — signal-cli ${version}` : base;
}

/**
 * Determine the signal-cli `send` recipient token for an outbound conversation.
 * Group conversations route via `group:<id>`; everything else is a direct
 * recipient (E.164 or uuid), de-prefixed from the normalized `uuid:`/peer form.
 */
function outboundRecipientToken(conversationId: string): string {
  const trimmed = conversationId.trim();
  if (trimmed.toLowerCase().startsWith("group:")) {
    return trimmed;
  }
  return trimmed;
}

export class SignalConnector implements ConnectorPort {
  public readonly kind: ConnectorKind = "signal";

  /** Resolve per-account daemon connection context from auth profiles. */
  private resolveSendContext(accountId: string): SignalSendContext & {
    account: ResolvedSignalAccount;
  } {
    const account = resolveSignalAccount(accountId);
    return {
      baseUrl: account.baseUrl,
      account: account,
      timeoutMs: undefined,
    } as SignalSendContext & { account: ResolvedSignalAccount };
  }

  public async monitor(
    accountId: string,
    onMessage: InboundHandler,
  ): Promise<ConnectorMonitorHandle> {
    const account = resolveSignalAccount(accountId);
    if (!account.enabled) {
      throw new Error(`Signal account "${account.accountId}" is disabled`);
    }
    const controller = new AbortController();

    const handleSseEvent = (event: SignalSseEvent): void => {
      if (event.event !== "receive" || !event.data) {
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const normalized = this.normalize(payload, account.accountId);
      if (!normalized) {
        return;
      }
      void Promise.resolve(onMessage(normalized)).catch(() => {
        // The handler owns its own error reporting; ingress must not crash.
      });
    };

    const loop = runSignalSseLoop({
      baseUrl: account.baseUrl,
      account: account.account,
      abortSignal: controller.signal,
      onEvent: handleSseEvent,
    });
    // Surface unexpected loop termination without unhandled-rejection noise.
    void loop.catch(() => {
      /* loop only rejects after abort races; intentionally swallowed here */
    });

    return {
      stop: async (): Promise<void> => {
        controller.abort();
        await loop.catch(() => undefined);
      },
    };
  }

  public async send(message: OutboundMessage): Promise<SendResult> {
    const { target } = message;
    const ctx = this.resolveSendContext(target.accountId);
    const recipient = outboundRecipientToken(target.conversationId);
    parseSignalTarget(recipient); // validate the target up front (throws on empty)

    const segments =
      message.chunks && message.chunks.length > 0
        ? [...message.chunks]
        : chunkSignalText(message.text, SIGNAL_TEXT_CHUNK_LIMIT);

    if (segments.length === 0) {
      throw new Error("Signal send requires non-empty text");
    }

    const messageIds: string[] = [];
    for (const segment of segments) {
      if (!segment.trim()) {
        continue;
      }
      const result = await sendSignalSegment(recipient, segment, {
        baseUrl: ctx.baseUrl,
        account: ctx.account.account,
        timeoutMs: ctx.timeoutMs,
      });
      messageIds.push(result.messageId);
    }

    return {
      delivered: messageIds.length > 0,
      messageIds,
    };
  }

  public async probe(accountId: string): Promise<ConnectorProbeResult> {
    const account = resolveSignalAccount(accountId);
    const checkedAt = Date.now();
    if (!account.enabled) {
      return {
        channel: "signal",
        accountId: account.accountId,
        ready: false,
        error: "account disabled",
        checkedAt,
      };
    }

    const check = await signalCheck(account.baseUrl, 10_000);
    if (!check.ok) {
      return {
        channel: "signal",
        accountId: account.accountId,
        ready: false,
        error: check.error ?? "unreachable",
        checkedAt,
      };
    }

    let version: string | undefined;
    try {
      version = parseSignalVersion(
        await signalRpcRequest("version", undefined, {
          baseUrl: account.baseUrl,
          timeoutMs: 10_000,
        }),
      );
    } catch (err) {
      // The daemon is reachable but the version probe failed: still ready, but
      // surface the truthful sub-error rather than swallowing it.
      return {
        channel: "signal",
        accountId: account.accountId,
        ready: true,
        identity: brandIdentity(account),
        error: err instanceof Error ? err.message : String(err),
        checkedAt: Date.now(),
      };
    }

    return {
      channel: "signal",
      accountId: account.accountId,
      ready: true,
      identity: brandIdentity(account, version),
      checkedAt: Date.now(),
    };
  }

  public normalize(
    rawEvent: unknown,
    accountId: string,
  ): NormalizedInboundMessage | undefined {
    return normalizeSignalEvent(rawEvent, accountId);
  }

  public async react(request: ReactionRequest): Promise<boolean> {
    const account = resolveSignalAccount(request.accountId);
    const targetTimestamp = Number(request.messageId);
    if (!Number.isFinite(targetTimestamp) || targetTimestamp <= 0) {
      throw new Error(`Signal reaction requires a numeric messageId, got "${request.messageId}"`);
    }

    const conversationId = request.conversationId.trim();
    const lower = conversationId.toLowerCase();
    const isGroup = lower.startsWith("group:");

    const ctx: SignalReactionContext = {
      baseUrl: account.baseUrl,
      account: account.account,
    };

    if (isGroup) {
      // Group reactions are addressed by the message author (signal-cli
      // `targetAuthor`) plus the group id. The foundation ReactionRequest now
      // carries `targetAuthor`; when present we send the real group reaction,
      // otherwise we report the missing-author gap truthfully rather than
      // sending an unaddressable reaction.
      const targetAuthor = request.targetAuthor?.trim();
      if (!targetAuthor) {
        throw new Error(
          "Signal group reactions require the message author (ReactionRequest.targetAuthor); " +
            "none was provided",
        );
      }
      const groupId = conversationId.slice("group:".length).trim();
      const groupCtx: SignalReactionContext = { ...ctx, groupId };
      // recipient = the original message author; groupId routes it to the group.
      return reactSignal(targetAuthor, targetTimestamp, request.emoji, groupCtx);
    }

    // Direct conversation: the conversation id is the message author (peer).
    return reactSignal(conversationId, targetTimestamp, request.emoji, ctx);
  }
}

/** Construct the Signal ConnectorPort (one instance speaks all accounts). */
export function createSignalConnector(): ConnectorPort {
  return new SignalConnector();
}
