// Owned by Recoder. The iMessage ConnectorPort — a real, working adapter that
// wraps the macOS `imsg` JSON-RPC bridge behind the uniform foundation contract
// (src/connector/connector-port.ts). It composes the real, extracted iMessage
// logic: the `imsg rpc` stdio transport, multi-account auth profiles, watch
// subscription ingress, payload normalization, outbound send, and availability
// probing. Identity surfaced to users is rebranded to Recoder; the channel SDK
// semantics (the `imsg` wire contract) are unchanged.
//
//   kind      -> "imessage"
//   monitor   -> spawn `imsg rpc`, `watch.subscribe`, normalize each `message`
//                notification, hand it to `onMessage`.
//   send      -> real `imsg send` RPC param construction with text chunking and
//                optional per-segment media file.
//   probe     -> real binary + `rpc` subcommand + `chats.list` smoke test, with
//                truthful `ready`/`identity`/`error` (never faked health).
//   normalize -> real IMessagePayload → NormalizedInboundMessage.
//   react     -> real `imsg react` RPC (resolves false on unsupported builds).
//
// Multi-account is the real account model resolved from RECODER_IMESSAGE_* env
// profiles (the connectors-package multi-account surface alongside the
// embedded-agent auth-profiles foundation).

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
  resolveIMessageAccount,
  type ResolvedIMessageAccount,
} from "./accounts.js";
import {
  createIMessageRpcClient,
  DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS,
  type IMessageRpcClient,
} from "./client.js";
import { IMESSAGE_CONNECTOR_KIND, normalizeIMessageEvent } from "./normalize.js";
import {
  chunkIMessageText,
  IMESSAGE_TEXT_CHUNK_LIMIT,
  reactIMessage,
  sendIMessageSegment,
} from "./outbound.js";
import { probeIMessage } from "./probe.js";

/** Identity label surfaced to callers/users — Recoder-branded. */
function brandIdentity(account: ResolvedIMessageAccount): string {
  return `Recoder iMessage connector (${account.cliPath})`;
}

/**
 * Parse a numeric `chat_id` out of a conversation id when the connector
 * addresses a group thread. Direct conversations are `imessage:<handle>`; group
 * conversations are the bare numeric chat id (per {@link normalizeIMessageEvent}).
 */
function groupChatIdFromConversation(conversationId: string): number | undefined {
  const trimmed = conversationId.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * The iMessage ConnectorPort. Stateless except for the resolved account model
 * read on each call, so a single instance safely serves every account id.
 */
export class IMessageConnector implements ConnectorPort {
  public readonly kind: ConnectorKind = IMESSAGE_CONNECTOR_KIND;

  /**
   * Start ingress for `accountId`, invoking `onMessage` with each normalized
   * inbound message. Probes availability first (fatal probe failures throw so
   * the caller stops instead of looping), then spawns a long-lived `imsg rpc`
   * client and `watch.subscribe`s. Each `message` notification is routed through
   * {@link normalize} + `onMessage`; the port emits normalized inbound, it does
   * not decide whether to act on it (that is the gating layer's job).
   */
  public async monitor(
    accountId: string,
    onMessage: InboundHandler,
  ): Promise<ConnectorMonitorHandle> {
    const account = resolveIMessageAccount(accountId);
    if (!account.enabled) {
      throw new Error(`iMessage account "${account.accountId}" is disabled`);
    }

    const probe = await probeIMessage(DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS, {
      cliPath: account.cliPath,
      dbPath: account.dbPath,
    });
    if (!probe.ok) {
      throw new Error(
        `iMessage account "${account.accountId}" unavailable: ${probe.error ?? "unknown error"}`,
      );
    }

    const handleNotification = (params: unknown): void => {
      const normalized = this.normalize(params, account.accountId);
      if (!normalized) {
        return;
      }
      void Promise.resolve(onMessage(normalized)).catch(() => {
        // The handler owns its own error reporting; ingress must not crash.
      });
    };

    const client = await createIMessageRpcClient({
      cliPath: account.cliPath,
      dbPath: account.dbPath,
      onNotification: (msg) => {
        if (msg.method === "message") {
          handleNotification(msg.params);
        }
        // `error` notifications are surfaced through the client's stderr sink;
        // the ingress loop itself stays alive until stop() or process close.
      },
    });

    let subscriptionId: number | null = null;
    try {
      const result = await client.request<{ subscription?: number }>("watch.subscribe", {
        attachments: true,
      });
      subscriptionId = result?.subscription ?? null;
    } catch (err) {
      await client.stop();
      throw err instanceof Error ? err : new Error(String(err));
    }

    return {
      stop: async (): Promise<void> => {
        if (subscriptionId != null) {
          await client
            .request("watch.unsubscribe", { subscription: subscriptionId })
            .catch(() => {
              // Ignore disconnect errors during shutdown.
            });
        }
        await client.stop();
      },
    };
  }

  /**
   * Deliver an outbound message via the real `imsg send` RPC. When the caller
   * supplies pre-chunked `chunks`, each segment is delivered as its own iMessage;
   * otherwise `text` is chunked to the channel's max payload. A short-lived
   * `imsg rpc` client is spawned for the delivery and torn down afterwards.
   */
  public async send(message: OutboundMessage): Promise<SendResult> {
    const { target } = message;
    const account = resolveIMessageAccount(target.accountId);
    const segments =
      message.chunks && message.chunks.length > 0
        ? [...message.chunks]
        : chunkIMessageText(message.text, IMESSAGE_TEXT_CHUNK_LIMIT);
    const hasAttachment = Boolean(message.attachments && message.attachments.length > 0);

    if (segments.length === 0 && !hasAttachment) {
      throw new Error("iMessage send requires non-empty text or media");
    }

    const chatId = groupChatIdFromConversation(target.conversationId);
    const client = await createIMessageRpcClient({
      cliPath: account.cliPath,
      dbPath: account.dbPath,
    });
    const messageIds: string[] = [];
    try {
      // Deliver text segments; attach the first local media file (if any) to the
      // first segment, matching the real send.ts single-attachment contract.
      const firstMedia = message.attachments?.[0]?.source;
      const effectiveSegments = segments.length > 0 ? segments : [message.text || ""];
      for (let index = 0; index < effectiveSegments.length; index += 1) {
        const segment = effectiveSegments[index];
        if (!segment.trim() && !(index === 0 && firstMedia)) {
          continue;
        }
        const result = await sendIMessageSegment(
          target.conversationId,
          segment,
          {
            client,
            service: account.service,
            region: account.region,
          },
          {
            chatId,
            filePath: index === 0 ? firstMedia : undefined,
          },
        );
        if (result.messageId && result.messageId !== "unknown") {
          messageIds.push(result.messageId);
        }
      }
    } finally {
      await client.stop();
    }

    return {
      delivered: messageIds.length > 0,
      messageIds,
    };
  }

  /**
   * Truthful readiness for `accountId`. Resolves the account, then runs the real
   * {@link probeIMessage} (binary + `rpc` subcommand + `chats.list`). `ready` is
   * true only when `imsg` is actually reachable and answers; the connector
   * identity is surfaced as `identity` and any failure verbatim as `error`.
   */
  public async probe(accountId: string): Promise<ConnectorProbeResult> {
    const account = resolveIMessageAccount(accountId);
    const checkedAt = Date.now();
    if (!account.enabled) {
      return {
        channel: IMESSAGE_CONNECTOR_KIND,
        accountId: account.accountId,
        ready: false,
        error: "account disabled",
        checkedAt,
      };
    }

    const probe = await probeIMessage(DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS, {
      cliPath: account.cliPath,
      dbPath: account.dbPath,
    });
    return {
      channel: IMESSAGE_CONNECTOR_KIND,
      accountId: account.accountId,
      ready: probe.ok,
      identity: probe.ok ? brandIdentity(account) : undefined,
      error: probe.ok ? undefined : (probe.error ?? "imsg probe failed"),
      checkedAt: Date.now(),
    };
  }

  /**
   * Convert one `imsg` watch payload (or `{ message }` wrapper) into a
   * {@link NormalizedInboundMessage}. Non-actionable rows (own echoes, empty,
   * sender-less, group-without-id) return `undefined`.
   */
  public normalize(
    rawEvent: unknown,
    accountId: string,
  ): NormalizedInboundMessage | undefined {
    return normalizeIMessageEvent(rawEvent, accountId);
  }

  /**
   * Apply a tapback/emoji reaction via the real `imsg react` RPC. Resolves
   * `true` on success; resolves `false` (rather than throwing) when the running
   * `imsg` build does not support reactions, so reaction failures never break the
   * calling flow. A short-lived client is spawned for the reaction.
   */
  public async react(request: ReactionRequest): Promise<boolean> {
    const account = resolveIMessageAccount(request.accountId);
    if (!account.enabled) {
      return false;
    }
    const chatId = groupChatIdFromConversation(request.conversationId);
    const client = await createIMessageRpcClient({
      cliPath: account.cliPath,
      dbPath: account.dbPath,
    });
    try {
      return await reactIMessage({
        client,
        conversationId: request.conversationId,
        messageId: request.messageId,
        emoji: request.emoji,
        chatId,
      });
    } finally {
      await client.stop();
    }
  }
}

/** Construct the iMessage ConnectorPort (one instance speaks all accounts). */
export function createIMessageConnector(): ConnectorPort {
  return new IMessageConnector();
}

/** Singleton iMessage ConnectorPort instance. */
export const imessageConnectorPort: ConnectorPort = new IMessageConnector();
