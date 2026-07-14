// Owned by Recoder. The Discord ConnectorPort adapter.
//
// Wraps the real Discord REST API (the same v10 wire surface the extracted
// gateway's `@buape/carbon` RequestClient speaks) behind the single
// `ConnectorPort` contract:
//   - monitor() -> subscribe an injected gateway event source, normalize each
//                  MessageCreate event, invoke onMessage (the real gateway WS is
//                  the carbon GatewayPlugin, which the host wires as the source)
//   - send()    -> open a DM channel for user recipients + POST channelMessages
//                  per chunk with reply threading (mirrors sendMessageDiscord)
//   - probe()   -> GET /users/@me, truthful readiness + bot identity
//                  (mirrors probeDiscord)
//   - normalize()-> Discord MessageCreate event -> NormalizedInboundMessage (pure)
//   - react()   -> PUT the bot's own reaction (mirrors reactMessageDiscord)
//
// Multi-account: each accountId resolves its own bot token via the owned
// env/config foundation (resolveDiscordAccount). One DiscordApiClient is built
// per account on demand and cached. Identity is Recoder, not OpenClaw.
//
// This adapter imports NOTHING from the un-extracted OpenClaw bot core: its
// normalize / send / chunk / accounts are the self-contained connector slices in
// this directory, and the HTTP/SDK seam is the real Discord REST API over fetch.

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
import { subsystemTag } from "../../../src/identity.js";
import {
  type DiscordConnectorConfig,
  normalizeAccountId,
  resolveDiscordAccount,
} from "./accounts.js";
import { DiscordApiClient, DiscordApiClientError } from "./discord-api.js";
import {
  type DiscordGatewayEvent,
  isDiscordGatewayEvent,
  normalizeDiscordMessageEvent,
} from "./normalize.js";
import { deliverDiscordMessage, normalizeReactionEmoji } from "./send.js";

const KIND: ConnectorKind = "discord";

type Logger = (message: string) => void;

/** A handler the connector subscribes to a gateway event source. */
export type DiscordGatewayHandler = (event: DiscordGatewayEvent) => void | Promise<void>;

/**
 * The real Discord ingress seam. Discord delivers inbound messages over the
 * gateway WebSocket; the carbon `GatewayPlugin` (or any host-owned socket) emits
 * `MessageCreate` events. A host wires one of these so `monitor()` can subscribe
 * without the adapter pulling the bot-core gateway client. `subscribe` resolves
 * once the socket is live and returns an unsubscribe.
 */
export interface DiscordEventSource {
  subscribe(
    accountId: string,
    onEvent: DiscordGatewayHandler,
  ): Promise<{ unsubscribe(): void | Promise<void> }> | { unsubscribe(): void | Promise<void> };
}

export interface DiscordConnectorOptions {
  /** Optional channel config (base account token + named sub-accounts). */
  readonly config?: DiscordConnectorConfig;
  /** Optional fetch override (the real HTTP/SDK seam). Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /**
   * Gateway ingress source for `monitor()`. Discord has no REST polling ingress;
   * the host supplies the gateway WS bridge here. When absent, `monitor()`
   * throws a truthful "ingress not configured" error rather than faking a loop.
   */
  readonly eventSource?: DiscordEventSource;
  /** Optional probe/request timeout override (ms). */
  readonly timeoutMs?: number;
  /** Optional logger for transient ingress / reaction errors. */
  readonly log?: Logger;
}

interface BoundAccount {
  readonly accountId: string;
  readonly client: DiscordApiClient;
  /** Resolved bot user id once getCurrentUser has been observed. */
  botUserId?: string;
}

/**
 * The Discord connector. One instance serves many accounts; each account is
 * lazily bound to a real REST client keyed by its resolved token.
 */
export class DiscordConnector implements ConnectorPort {
  readonly kind: ConnectorKind = KIND;

  readonly #config?: DiscordConnectorConfig;
  readonly #fetchImpl?: typeof fetch;
  readonly #eventSource?: DiscordEventSource;
  readonly #timeoutMs: number;
  readonly #log: Logger;
  readonly #accounts = new Map<string, BoundAccount>();

  constructor(options: DiscordConnectorOptions = {}) {
    this.#config = options.config;
    this.#fetchImpl = options.fetchImpl;
    this.#eventSource = options.eventSource;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#log =
      options.log ?? ((message) => console.error(`[${subsystemTag("discord")}] ${message}`));
  }

  /** Resolve (and cache) the REST client for an account; throws if no token. */
  #bind(accountId: string): BoundAccount {
    const resolved = resolveDiscordAccount(accountId, this.#config);
    const cached = this.#accounts.get(resolved.accountId);
    if (cached) {
      return cached;
    }
    if (resolved.tokenSource === "none" || !resolved.token) {
      throw new Error(
        `Discord account "${resolved.accountId}" has no bot token. Set ` +
          `RECODER_CONNECTORS_DISCORD_BOT_TOKEN (or DISCORD_BOT_TOKEN for the default account), ` +
          `or pass it via the connector config.`,
      );
    }
    const bound: BoundAccount = {
      accountId: resolved.accountId,
      client: new DiscordApiClient({
        token: resolved.token,
        fetchImpl: this.#fetchImpl,
        timeoutMs: this.#timeoutMs,
      }),
    };
    this.#accounts.set(resolved.accountId, bound);
    return bound;
  }

  async monitor(accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    const bound = this.#bind(accountId);
    if (!this.#eventSource) {
      throw new Error(
        `Discord monitor for account "${bound.accountId}" requires a gateway event source. ` +
          `Pass DiscordConnectorOptions.eventSource (the carbon GatewayPlugin bridge) — ` +
          `Discord has no REST polling ingress.`,
      );
    }

    // Learn the bot user id up front so self-message dropping + mention detection
    // in normalize() work on the very first message. A getCurrentUser failure is
    // surfaced (no fake ready).
    try {
      const me = await bound.client.getCurrentUser(this.#timeoutMs);
      bound.botUserId = me.id;
    } catch (err) {
      throw new Error(
        `Discord monitor could not start for account "${bound.accountId}": ${errMessage(err)}`,
      );
    }

    const subscription = await this.#eventSource.subscribe(bound.accountId, async (event) => {
      const normalized = normalizeDiscordMessageEvent({
        event,
        accountId: bound.accountId,
        botUserId: bound.botUserId,
      });
      if (!normalized) {
        return;
      }
      try {
        await onMessage(normalized);
      } catch (err) {
        // A handler failure must not kill ingress; surface and continue.
        this.#log(`account "${bound.accountId}" onMessage handler threw: ${errMessage(err)}`);
      }
    });

    return {
      stop: async () => {
        await subscription.unsubscribe();
      },
    };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (message.target.channel !== KIND) {
      throw new Error(
        `Discord connector received an outbound message for channel "${message.target.channel}"`,
      );
    }
    const bound = this.#bind(message.target.accountId);
    const result = await deliverDiscordMessage({
      client: bound.client,
      to: message.target.conversationId,
      text: message.text,
      chunks: message.chunks,
      replyTo: message.target.replyTo,
    });
    return {
      delivered: result.delivered,
      messageIds: result.messageIds,
    };
  }

  async probe(accountId: string): Promise<ConnectorProbeResult> {
    const checkedAt = Date.now();
    let bound: BoundAccount;
    try {
      bound = this.#bind(accountId);
    } catch (err) {
      return {
        channel: KIND,
        accountId: normalizeAccountId(accountId),
        ready: false,
        error: errMessage(err),
        checkedAt,
      };
    }

    try {
      const me = await bound.client.getCurrentUser(this.#timeoutMs);
      bound.botUserId = me.id;
      return {
        channel: KIND,
        accountId: bound.accountId,
        ready: true,
        identity: me.username ? `@${me.username}` : me.id,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        channel: KIND,
        accountId: bound.accountId,
        ready: false,
        error: errMessage(err),
        checkedAt: Date.now(),
      };
    }
  }

  normalize(rawEvent: unknown, accountId: string): NormalizedInboundMessage | undefined {
    if (!isDiscordGatewayEvent(rawEvent)) {
      return undefined;
    }
    const normalizedAccountId = normalizeAccountId(accountId);
    const botUserId = this.#accounts.get(normalizedAccountId)?.botUserId;
    return normalizeDiscordMessageEvent({
      event: rawEvent,
      accountId: normalizedAccountId,
      botUserId,
    });
  }

  async react(request: ReactionRequest): Promise<boolean> {
    if (request.channel !== KIND) {
      return false;
    }
    const emoji = request.emoji?.trim();
    if (!emoji) {
      return false;
    }
    const bound = this.#bind(request.accountId);
    try {
      await bound.client.addReaction({
        channelId: request.conversationId,
        messageId: request.messageId,
        emoji: normalizeReactionEmoji(emoji),
        timeoutMs: this.#timeoutMs,
      });
      return true;
    } catch (err) {
      // Discord rejects unsupported emoji / messages it cannot react to.
      // The contract: return false rather than throw on a reaction miss.
      if (err instanceof DiscordApiClientError) {
        this.#log(`account "${bound.accountId}" reaction failed: ${err.message}`);
        return false;
      }
      throw err;
    }
  }
}

/** Construct a Discord connector. */
export function createDiscordConnector(
  options: DiscordConnectorOptions = {},
): DiscordConnector {
  return new DiscordConnector(options);
}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
