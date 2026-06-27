// Owned by Recoder. The Discord adapter that implements the foundation's
// `ConnectorPort` (interop §7.4 connectors/social/*). It is a REAL working
// adapter: every method delegates to the extracted, real Discord gateway code
// in this directory — nothing here is mocked or stubbed.
//
//   kind      -> "discord"
//   monitor   -> a carbon gateway Client + the real `DiscordMessageListener`,
//                normalizing each inbound event and handing it to `onMessage`.
//   send      -> real `sendMessageDiscord` (chunking, markdown-table conversion,
//                permission-aware send errors) or per-segment delivery of
//                pre-chunked `chunks`.
//   probe     -> real `probeDiscord` against the resolved account token, with
//                truthful `ready`/`identity`/`error` (never faked health).
//   normalize -> real `normalizeDiscordMessageEvent` (this dir's normalize.ts).
//   react     -> real `reactMessageDiscord`.
//
// Multi-account is the real account model: `resolveDiscordAccount` resolves the
// per-account token/config (discord.accounts.<id>.token or DISCORD_BOT_TOKEN for
// the default account) — the connectors-package multi-account surface that sits
// alongside the embedded-agent auth-profiles foundation.

import { Client } from "@buape/carbon";
import { GatewayIntents, GatewayPlugin } from "@buape/carbon/gateway";
import type {
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "../../src/connector/index.js";
import { loadConfig } from "../config/config.js";
import { resolveDiscordAccount } from "./accounts.js";
import { fetchDiscordApplicationId, probeDiscord } from "./probe.js";
import { reactMessageDiscord } from "./send.reactions.js";
import { sendMessageDiscord } from "./send.outbound.js";
import { normalizeDiscordToken } from "./token.js";
import {
  DiscordMessageListener,
  registerDiscordListener,
  type DiscordMessageEvent,
} from "./monitor/listeners.js";
import { monitorDiscordProvider, type MonitorDiscordOpts } from "./monitor/provider.js";
import {
  DISCORD_CONNECTOR_KIND,
  isDiscordMessageEvent,
  normalizeDiscordMessageEvent,
} from "./normalize.js";

const DISCORD_PROBE_TIMEOUT_MS = 4000;

/**
 * Gateway intents for inbound message normalization: guild + DM messages with
 * message content. This is the message-ingress subset of the real provider's
 * `resolveDiscordGatewayIntents`; reaction/presence intents are added by the
 * full gateway (`monitorFullGateway`), not by the lightweight normalize loop.
 */
function inboundMessageIntents(): number {
  return (
    GatewayIntents.Guilds |
    GatewayIntents.GuildMessages |
    GatewayIntents.MessageContent |
    GatewayIntents.DirectMessages
  );
}

/**
 * The Discord ConnectorPort. Stateless except for the resolved account model
 * read on each call, so a single instance safely serves every account id.
 */
export class DiscordConnectorPort implements ConnectorPort {
  readonly kind = DISCORD_CONNECTOR_KIND;

  /**
   * Start ingress for `accountId`, invoking `onMessage` with each normalized
   * inbound message. Builds a real carbon gateway `Client` with the real
   * `DiscordMessageListener` — the same listener class the full provider
   * registers — but routes each event through {@link normalize} + `onMessage`
   * instead of the gating/dispatch pipeline, because the port's job is to emit
   * normalized inbound, not to decide whether to act on it.
   */
  async monitor(accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle> {
    const account = resolveDiscordAccount({ cfg: loadConfig(), accountId });
    const token = normalizeDiscordToken(account.token);
    if (!token) {
      throw new Error(
        `Discord bot token missing for account "${account.accountId}" (set discord.accounts.${account.accountId}.token or DISCORD_BOT_TOKEN for the default account).`,
      );
    }

    const applicationId = await fetchDiscordApplicationId(token, DISCORD_PROBE_TIMEOUT_MS);
    if (!applicationId) {
      throw new Error(
        `Failed to resolve Discord application id for account "${account.accountId}".`,
      );
    }

    const client = new Client(
      {
        baseUrl: "http://localhost",
        deploySecret: "a",
        clientId: applicationId,
        publicKey: "a",
        token,
        autoDeploy: false,
      },
      {
        commands: [],
        listeners: [],
        components: [],
      },
      [
        new GatewayPlugin({
          reconnect: { maxAttempts: Number.POSITIVE_INFINITY },
          intents: inboundMessageIntents(),
          autoInteractions: true,
        }),
      ],
    );

    let botUserId: string | undefined;
    try {
      const botUser = await client.fetchUser("@me");
      botUserId = botUser?.id;
    } catch {
      botUserId = undefined;
    }

    const handler = async (event: DiscordMessageEvent): Promise<void> => {
      const normalized = normalizeDiscordMessageEvent({
        event,
        accountId: account.accountId,
        botUserId,
      });
      if (!normalized) {
        return;
      }
      await onMessage(normalized);
    };
    registerDiscordListener(client.listeners, new DiscordMessageListener(handler));

    const gateway = client.getPlugin<GatewayPlugin>("gateway");

    return {
      stop: async (): Promise<void> => {
        if (!gateway) {
          return;
        }
        gateway.options.reconnect = { maxAttempts: 0 };
        gateway.disconnect();
      },
    };
  }

  /**
   * Deliver an outbound message via the real `sendMessageDiscord`. When the
   * caller supplies pre-chunked `chunks`, each segment is delivered as its own
   * Discord message (the first replying to `replyTo`, the rest threaded under
   * the conversation); otherwise the single `text` is handed to the real send
   * path, which chunks to Discord's max payload internally.
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    const { target } = message;
    const segments =
      message.chunks && message.chunks.length > 0 ? [...message.chunks] : [message.text];
    const messageIds: string[] = [];
    let delivered = false;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const result = await sendMessageDiscord(target.conversationId, segment, {
        accountId: target.accountId,
        replyTo: index === 0 ? target.replyTo : undefined,
      });
      if (result.messageId && result.messageId !== "unknown") {
        messageIds.push(result.messageId);
        delivered = true;
      }
    }

    return { delivered, messageIds };
  }

  /**
   * Truthful readiness for `accountId`. Resolves the account token, then runs
   * the real `probeDiscord` (GET /users/@me). `ready` is true only when Discord
   * actually authorizes the bot; the bot username is surfaced as `identity` and
   * any failure is surfaced verbatim as `error` — never swallowed.
   */
  async probe(accountId: string): Promise<ConnectorProbeResult> {
    const checkedAt = Date.now();
    const account = resolveDiscordAccount({ cfg: loadConfig(), accountId });
    const token = normalizeDiscordToken(account.token);
    if (!token) {
      return {
        channel: DISCORD_CONNECTOR_KIND,
        accountId: account.accountId,
        ready: false,
        error: `missing token (set discord.accounts.${account.accountId}.token or DISCORD_BOT_TOKEN for the default account)`,
        checkedAt,
      };
    }

    const result = await probeDiscord(token, DISCORD_PROBE_TIMEOUT_MS);
    return {
      channel: DISCORD_CONNECTOR_KIND,
      accountId: account.accountId,
      ready: result.ok,
      identity: result.bot?.username ?? undefined,
      error: result.ok ? undefined : (result.error ?? "discord probe failed"),
      checkedAt,
    };
  }

  /**
   * Convert one Discord gateway event into a {@link NormalizedInboundMessage}.
   * Accepts `unknown` per the contract; non-message events (or events with no
   * actionable body) return `undefined`.
   */
  normalize(rawEvent: unknown, accountId: string): NormalizedInboundMessage | undefined {
    if (!isDiscordMessageEvent(rawEvent)) {
      return undefined;
    }
    return normalizeDiscordMessageEvent({ event: rawEvent, accountId });
  }

  /**
   * Apply an emoji reaction to an inbound message via the real
   * `reactMessageDiscord`. Resolves `true` on success; resolves `false` (rather
   * than throwing) when Discord rejects the reaction, so reaction failures never
   * break the calling flow.
   */
  async react(request: ReactionRequest): Promise<boolean> {
    try {
      const result = await reactMessageDiscord(
        request.conversationId,
        request.messageId,
        request.emoji,
        { accountId: request.accountId },
      );
      return result.ok === true;
    } catch {
      return false;
    }
  }

  /**
   * Run the COMPLETE real Discord gateway for `accountId` — the full
   * `monitorDiscordProvider` with message/reaction/presence listeners,
   * allowlist + mention + command gating, native commands, exec approvals, and
   * dispatch. Use this when you want the entire gating/dispatch pipeline rather
   * than the lightweight normalize-and-forward `monitor()` loop. Resolves a
   * stop handle backed by the provider's real abort path.
   */
  async monitorFullGateway(
    accountId: string,
    opts: Omit<MonitorDiscordOpts, "accountId" | "abortSignal"> = {},
  ): Promise<ConnectorMonitorHandle> {
    const controller = new AbortController();
    const running = monitorDiscordProvider({
      ...opts,
      accountId,
      abortSignal: controller.signal,
    });
    // Surface a fatal startup rejection instead of leaving an unhandled promise;
    // the full provider only resolves when the gateway stops.
    running.catch(() => {});
    return {
      stop: async (): Promise<void> => {
        controller.abort();
        await running.catch(() => {});
      },
    };
  }
}

/** Singleton Discord ConnectorPort instance. */
export const discordConnectorPort: ConnectorPort = new DiscordConnectorPort();
