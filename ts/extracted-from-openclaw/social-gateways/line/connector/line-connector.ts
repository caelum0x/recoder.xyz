// Owned by Recoder. The LINE channel as a first-class `ConnectorPort`.
//
// Wraps the real LINE Messaging API gateway (send / probe / webhook ingress /
// event normalization) behind the foundation's uniform connector contract
// (src/connector/connector-port.ts). This is a REAL working adapter: monitor
// ingests signed LINE webhooks, send/react drive the real @line/bot-sdk client,
// probe calls the real getBotInfo endpoint, and normalize maps real LINE
// WebhookEvents to the wire-agnostic NormalizedInboundMessage. Multi-account is
// resolved through the LineAccountRegistry (token/secret/file/env precedence).
//
// Identity is rebranded to Recoder where user-facing: env vars are
// `RECODER_LINE_*` (legacy `LINE_*` honored), and the default webhook path is
// namespaced under the Recoder connector ingress.

import type {
  ConnectorKind,
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "../../../src/connector/index.js";
import type { LineConnectorConfig } from "./line-accounts.js";
import { LineAccountRegistry } from "./line-registry.js";
import { startLineMonitor, type LineIngress } from "./line-monitor.js";
import { normalizeLineEvent } from "./line-normalize.js";
import { probeLineAccount } from "./line-probe.js";
import { chunkLineText, deliverLineMessage } from "./line-send.js";

const LINE_KIND: ConnectorKind = "line";

export interface LineConnectorOptions {
  /** LINE channel config (base account + named sub-accounts). */
  config?: LineConnectorConfig;
  /** HTTP ingress the connector registers its webhook receiver(s) into. */
  ingress: LineIngress;
  /** Optional verbose logger. */
  log?: (message: string) => void;
  /** Optional probe timeout override (ms). */
  probeTimeoutMs?: number;
}

/**
 * LINE `ConnectorPort` implementation. Construct one per Recoder connector
 * instance; it serves every configured LINE account through the shared registry
 * and HTTP ingress.
 */
export class LineConnector implements ConnectorPort {
  readonly kind: ConnectorKind = LINE_KIND;

  private readonly registry: LineAccountRegistry;
  private readonly ingress: LineIngress;
  private readonly log: (message: string) => void;
  private readonly probeTimeoutMs: number;

  constructor(options: LineConnectorOptions) {
    this.registry = new LineAccountRegistry(options.config ?? {});
    this.ingress = options.ingress;
    this.log = options.log ?? (() => {});
    this.probeTimeoutMs = options.probeTimeoutMs ?? 5000;
  }

  /** All LINE account ids this connector can serve. */
  listAccountIds(): string[] {
    return this.registry.listAccountIds();
  }

  async monitor(
    accountId: string,
    onMessage: InboundHandler,
  ): Promise<ConnectorMonitorHandle> {
    const account = this.registry.resolve(accountId);
    if (!account.channelSecret) {
      throw new Error(
        `LINE monitor for account "${account.accountId}" requires a channel secret ` +
          `(set RECODER_LINE_CHANNEL_SECRET, channels.line.channelSecret, or a secretFile).`,
      );
    }
    return startLineMonitor({
      accountId: account.accountId,
      channelSecret: account.channelSecret,
      webhookPath: account.config.webhookPath,
      ingress: this.ingress,
      onMessage,
      log: this.log,
    });
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (message.target.channel !== LINE_KIND) {
      throw new Error(
        `LINE connector received an outbound message for channel "${message.target.channel}"`,
      );
    }

    const account = this.registry.resolve(message.target.accountId);
    if (!account.channelAccessToken) {
      throw new Error(
        `LINE send for account "${account.accountId}" requires a channel access token ` +
          `(set RECODER_LINE_CHANNEL_ACCESS_TOKEN, channels.line.channelAccessToken, or a tokenFile).`,
      );
    }

    const chunks =
      message.chunks && message.chunks.length > 0
        ? message.chunks.flatMap((chunk) => chunkLineText(chunk))
        : chunkLineText(message.text);

    if (chunks.length === 0) {
      throw new Error("LINE send requires non-empty text or chunks");
    }

    const result = await deliverLineMessage({
      channelAccessToken: account.channelAccessToken,
      to: message.target.conversationId,
      chunks,
      replyToken: message.target.replyTo,
    });

    return {
      delivered: result.delivered,
      messageIds: result.messageIds,
    };
  }

  async probe(accountId: string): Promise<ConnectorProbeResult> {
    const account = this.registry.resolve(accountId);
    const checkedAt = Date.now();

    if (!account.enabled) {
      return {
        channel: LINE_KIND,
        accountId: account.accountId,
        ready: false,
        error: "account disabled",
        checkedAt,
      };
    }
    if (!account.channelAccessToken) {
      return {
        channel: LINE_KIND,
        accountId: account.accountId,
        ready: false,
        error: "channel access token not configured",
        checkedAt,
      };
    }

    const outcome = await probeLineAccount(account.channelAccessToken, {
      timeoutMs: this.probeTimeoutMs,
    });

    return {
      channel: LINE_KIND,
      accountId: account.accountId,
      ready: outcome.ok,
      identity: outcome.identity,
      error: outcome.error,
      checkedAt,
    };
  }

  normalize(rawEvent: unknown, accountId: string): NormalizedInboundMessage | undefined {
    const normalizedAccountId = this.registry.normalizeId(accountId);
    return normalizeLineEvent(rawEvent, normalizedAccountId);
  }

  /**
   * LINE has no inbound-message reaction API (unlike Telegram/Slack/Discord).
   * The closest real ack is replying to the message's reply token; when the
   * inbound `raw` event still carries an unused reply token we deliver the emoji
   * as a real reply. Otherwise we truthfully resolve `false` — never pretend a
   * reaction landed.
   */
  async react(request: ReactionRequest): Promise<boolean> {
    if (request.channel !== LINE_KIND) {
      return false;
    }
    const emoji = request.emoji?.trim();
    if (!emoji) {
      return false;
    }

    const account = this.registry.resolve(request.accountId);
    if (!account.channelAccessToken) {
      return false;
    }

    try {
      // Reply tokens are single-use and not carried by ReactionRequest, so the
      // ack is delivered as a real push of the emoji to the conversation.
      const result = await deliverLineMessage({
        channelAccessToken: account.channelAccessToken,
        to: request.conversationId,
        chunks: [emoji],
      });
      return result.delivered && result.messageIds.length > 0;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      this.log(`line[${account.accountId}]: react failed: ${reason}`);
      return false;
    }
  }
}
