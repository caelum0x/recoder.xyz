// Owned by Recoder. The Feishu ConnectorPort adapter — the single uniform
// surface (foundation src/connector/connector-port.ts) over the REAL Feishu /
// Lark Open Platform protocol:
//   - probe   -> tenant_access_token + bot/v3/info (the extracted probe logic)
//   - send    -> im/v1/messages (mirrors the extracted send.ts SDK call)
//   - react   -> im/v1/messages/:id/reactions (real reaction endpoint)
//   - normalize -> im.message.receive_v1 event -> NormalizedInboundMessage
//   - monitor -> Lark WSClient long-connection (the extracted monitor.ts flow)
// Multi-account aware via the auth-profiles-backed FeishuAccountRegistry.
// User-facing identity rebranded to Recoder.

import type {
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
} from "../../src/connector/connector-port.js";
import type { ConnectorKind } from "../../src/connector/connector-kind.js";
import type { NormalizedInboundMessage } from "../../src/connector/inbound-message.js";
import type {
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "../../src/connector/outbound-message.js";
import { RECODER_CONNECTORS } from "../../src/identity.js";
import {
  DEFAULT_FEISHU_ACCOUNT_ID,
  FeishuAccountRegistry,
  normalizeAccountId,
  registryFromEnv,
  type FeishuAccount,
} from "./auth-store.js";
import { chunkFeishuText, FEISHU_DEFAULT_TEXT_CHUNK_LIMIT } from "./chunk.js";
import { describeError, FeishuRestClient } from "./rest-client.js";
import { normalizeFeishuEvent } from "./normalize.js";
import { loadLarkSdk, type LarkWsClient } from "./lark-ws-port.js";

/** Options to construct the connector (defaults to env-seeded accounts). */
export interface FeishuConnectorOptions {
  /** Pre-built account registry; defaults to one seeded from the environment. */
  readonly registry?: FeishuAccountRegistry;
  /** Per-message text chunk limit (Feishu default: 2000). */
  readonly textChunkLimit?: number;
}

/** A live Feishu long-connection monitor handle. */
class FeishuMonitorHandle implements ConnectorMonitorHandle {
  readonly #abort: AbortController;
  readonly #wsClientRef: { current: LarkWsClient | undefined };

  constructor(abort: AbortController, wsClientRef: { current: LarkWsClient | undefined }) {
    this.#abort = abort;
    this.#wsClientRef = wsClientRef;
  }

  async stop(): Promise<void> {
    this.#abort.abort();
    // The Lark WSClient does not expose an explicit stop; aborting the keep-alive
    // promise releases the monitor loop and lets the socket be GC'd. We null the
    // ref so a stopped handle cannot accidentally be reused.
    this.#wsClientRef.current = undefined;
  }
}

/**
 * Feishu connector. Implements exactly the ConnectorPort contract; holds no
 * task/approval/memory state (interop: adapter, never owner).
 */
export class FeishuConnector implements ConnectorPort {
  readonly kind: ConnectorKind = "feishu";

  readonly #registry: FeishuAccountRegistry;
  readonly #textChunkLimit: number;

  constructor(options: FeishuConnectorOptions = {}) {
    this.#registry = options.registry ?? registryFromEnv();
    this.#textChunkLimit = options.textChunkLimit ?? FEISHU_DEFAULT_TEXT_CHUNK_LIMIT;
  }

  /** Register or replace an account at runtime (multi-account support). */
  registerAccount(account: FeishuAccount): void {
    this.#registry.register(account);
  }

  /** Resolve an account or throw a truthful "not configured" error. */
  #requireAccount(accountId: string): FeishuAccount {
    const account = this.#registry.get(accountId);
    if (!account) {
      throw new Error(
        `Feishu account "${accountId}" is not configured. Register it or set ` +
          `FEISHU_APP_ID/FEISHU_APP_SECRET for the "${DEFAULT_FEISHU_ACCOUNT_ID}" account.`,
      );
    }
    if (!account.enabled) {
      throw new Error(`Feishu account "${accountId}" is disabled.`);
    }
    return account;
  }

  #clientFor(account: FeishuAccount): FeishuRestClient {
    return new FeishuRestClient(account.credentials);
  }

  /** Pure event -> domain conversion (no I/O). */
  normalize(rawEvent: unknown, accountId: string): NormalizedInboundMessage | undefined {
    return normalizeFeishuEvent(rawEvent, normalizeAccountId(accountId));
  }

  /**
   * Truthful readiness: exchange a tenant token and read bot info. Reports
   * `ready:false` with the real error string on any failure — never faked.
   */
  async probe(accountId: string): Promise<ConnectorProbeResult> {
    const id = normalizeAccountId(accountId);
    const checkedAt = Date.now();
    const account = this.#registry.get(id);
    if (!account) {
      return {
        channel: this.kind,
        accountId: id,
        ready: false,
        error: `account "${id}" not configured`,
        checkedAt,
      };
    }
    if (!account.enabled) {
      return {
        channel: this.kind,
        accountId: id,
        ready: false,
        error: `account "${id}" disabled`,
        checkedAt,
      };
    }
    try {
      const bot = await this.#clientFor(account).botInfo();
      return {
        channel: this.kind,
        accountId: id,
        ready: true,
        identity: bot.appName ?? account.name ?? bot.appId,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        channel: this.kind,
        accountId: id,
        ready: false,
        error: describeError(err),
        checkedAt: Date.now(),
      };
    }
  }

  /**
   * Deliver an outbound message. Chunks `text` to the channel limit unless
   * explicit `chunks` are provided, and sends each chunk via the real
   * im/v1/messages endpoint. Replies/threads target the conversation id.
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    const account = this.#requireAccount(normalizeAccountId(message.target.accountId));
    const client = this.#clientFor(account);
    const { conversationId } = message.target;

    const segments =
      message.chunks && message.chunks.length > 0
        ? message.chunks.filter((c) => c.length > 0)
        : chunkFeishuText(message.text, this.#textChunkLimit);

    if (segments.length === 0) {
      return { delivered: false, messageIds: [] };
    }

    const messageIds: string[] = [];
    for (const segment of segments) {
      const messageId = await client.sendText(conversationId, segment, "chat_id");
      messageIds.push(messageId);
    }
    return { delivered: messageIds.length > 0, messageIds };
  }

  /**
   * Apply an emoji reaction to an inbound message. Maps a unicode emoji or a
   * channel-native name to Feishu's `emoji_type`. Returns false (never throws
   * for an unsupported emoji) when the channel rejects the reaction.
   */
  async react(request: ReactionRequest): Promise<boolean> {
    const account = this.#requireAccount(normalizeAccountId(request.accountId));
    const client = this.#clientFor(account);
    const emojiType = toFeishuEmojiType(request.emoji);
    try {
      await client.addReaction(request.messageId, emojiType);
      return true;
    } catch {
      // Feishu rejects unknown emoji_type values; surface as "not reacted".
      return false;
    }
  }

  /**
   * Start inbound monitoring for `accountId` over the real Lark long-connection.
   * Mirrors the extracted `monitor.ts`: build a Lark client, register
   * `im.message.receive_v1`, normalize each event, and invoke `onMessage`.
   * Resolves once the socket is established; the returned handle stops it.
   */
  async monitor(accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    const id = normalizeAccountId(accountId);
    const account = this.#requireAccount(id);
    const { appId, appSecret, domain } = account.credentials;

    const sdk = await loadLarkSdk();
    const abort = new AbortController();

    const eventDispatcher = new sdk.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: unknown) => {
        const normalized = this.normalize(data, id);
        if (normalized) {
          await onMessage(normalized);
        }
      },
    });

    const wsClient = new sdk.WSClient({
      appId,
      appSecret,
      ...(domain ? { domain } : {}),
      loggerLevel: sdk.LoggerLevel.info,
    });

    const wsClientRef: { current: LarkWsClient | undefined } = { current: wsClient };
    await wsClient.start({ eventDispatcher });

    // Keep the monitor alive until stopped; the keep-alive promise resolves on
    // abort so `stop()` releases the loop without leaking a hanging promise.
    void new Promise<void>((resolve) => {
      if (abort.signal.aborted) {
        resolve();
        return;
      }
      abort.signal.addEventListener("abort", () => resolve(), { once: true });
    });

    return new FeishuMonitorHandle(abort, wsClientRef);
  }
}

/**
 * Map an incoming emoji request to Feishu's `emoji_type`. Accepts an already
 * channel-native name (e.g. "SMILE", "THUMBSUP") as-is, and translates the
 * handful of common unicode emoji the gating layer is likely to ack with.
 */
function toFeishuEmojiType(emoji: string): string {
  const trimmed = emoji.trim();
  // A channel-native name is uppercase ASCII (Feishu emoji_type convention).
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) {
    return trimmed;
  }
  const unicodeMap: Record<string, string> = {
    "👍": "THUMBSUP",
    "👎": "THUMBSDOWN",
    "😀": "SMILE",
    "😄": "SMILE",
    "🙂": "SMILE",
    "❤️": "HEART",
    "✅": "DONE",
    "👌": "OK",
    "🎉": "PARTY",
    "👀": "EYES",
    "🔥": "FIRE",
  };
  return unicodeMap[trimmed] ?? "THUMBSUP";
}

/** Product identity for this connector, rebranded to Recoder (user-facing). */
export const FEISHU_CONNECTOR_IDENTITY = {
  product: RECODER_CONNECTORS.product,
  channel: "feishu" as ConnectorKind,
  displayName: "Recoder for Feishu / Lark",
} as const;
