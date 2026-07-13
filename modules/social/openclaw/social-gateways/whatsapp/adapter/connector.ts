// Owned by Recoder. The WhatsApp ConnectorPort — a real, working adapter that
// wraps the WhatsApp Web (Baileys) bridge daemon behind the uniform foundation
// contract (src/connector/connector-port.ts). It composes the real, extracted
// WhatsApp logic: JID/target normalization (the verbatim normalize.ts contract),
// multi-account auth profiles, WAMessage normalization, outbound send/react over
// the bridge HTTP API, and the resilient SSE ingress loop. Identity surfaced to
// users is rebranded to Recoder; the channel SDK semantics (WhatsApp Web wire
// contract via the bridge daemon) are unchanged.

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
  resolveWhatsAppAccount,
  type ResolvedWhatsAppAccount,
} from "./accounts.js";
import { normalizeWhatsAppEvent } from "./normalize.js";
import {
  chunkWhatsAppText,
  reactWhatsApp,
  sendWhatsAppMedia,
  sendWhatsAppSegment,
  WHATSAPP_TEXT_CHUNK_LIMIT,
  type WhatsAppOutboundMedia,
  type WhatsAppSendContext,
} from "./outbound.js";
import { runWhatsAppSseLoop } from "./monitor-loop.js";
import { whatsappCheck, type WhatsAppSseEvent } from "./transport.js";

/** Identity label surfaced to callers/users — Recoder-branded. */
function brandIdentity(account: ResolvedWhatsAppAccount, who?: string): string {
  const account_label = who?.trim() || account.baseUrl;
  return `Recoder WhatsApp connector (${account_label})`;
}

export class WhatsAppConnector implements ConnectorPort {
  public readonly kind: ConnectorKind = "whatsapp";

  /** Resolve per-account bridge connection context from auth profiles. */
  private resolveSendContext(accountId: string): WhatsAppSendContext & {
    account: ResolvedWhatsAppAccount;
  } {
    const account = resolveWhatsAppAccount(accountId);
    return {
      baseUrl: account.baseUrl,
      token: account.token,
      accountId: account.accountId,
      account,
    };
  }

  public async monitor(
    accountId: string,
    onMessage: InboundHandler,
  ): Promise<ConnectorMonitorHandle> {
    const account = resolveWhatsAppAccount(accountId);
    if (!account.enabled) {
      throw new Error(`WhatsApp account "${account.accountId}" is disabled`);
    }
    const controller = new AbortController();

    const handleSseEvent = (event: WhatsAppSseEvent): void => {
      // Only `message` frames carry inbound messages; status/qr/typing frames
      // are surfaced by the bridge but carry no actionable message here.
      if (event.event && event.event !== "message") {
        return;
      }
      if (!event.data) {
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

    const loop = runWhatsAppSseLoop({
      baseUrl: account.baseUrl,
      token: account.token,
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
    const recipient = target.conversationId;

    const messageIds: string[] = [];

    const segments =
      message.chunks && message.chunks.length > 0
        ? [...message.chunks]
        : chunkWhatsAppText(message.text, WHATSAPP_TEXT_CHUNK_LIMIT);

    // Deliver the text body (chunked) first.
    for (const segment of segments) {
      if (!segment.trim()) {
        continue;
      }
      const result = await sendWhatsAppSegment(recipient, segment, ctx);
      messageIds.push(result.messageId);
    }

    // Deliver any attachments. The first attachment carries the text as its
    // caption only when there was no standalone text body (mirrors the gateway's
    // single-caption media send); otherwise text is already delivered above.
    const attachments = message.attachments ?? [];
    for (let i = 0; i < attachments.length; i += 1) {
      const attachment = attachments[i];
      const media: WhatsAppOutboundMedia = {
        source: attachment.source,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
      };
      const caption = i === 0 && segments.length === 0 ? message.text : "";
      const result = await sendWhatsAppMedia(recipient, media, caption, ctx);
      messageIds.push(result.messageId);
    }

    if (messageIds.length === 0) {
      throw new Error("WhatsApp send requires non-empty text or at least one attachment");
    }

    return {
      delivered: messageIds.length > 0,
      messageIds,
    };
  }

  public async probe(accountId: string): Promise<ConnectorProbeResult> {
    const account = resolveWhatsAppAccount(accountId);
    const checkedAt = Date.now();
    if (!account.enabled) {
      return {
        channel: "whatsapp",
        accountId: account.accountId,
        ready: false,
        error: "account disabled",
        checkedAt,
      };
    }

    const check = await whatsappCheck({ baseUrl: account.baseUrl, token: account.token }, 10_000);
    if (!check.ok) {
      return {
        channel: "whatsapp",
        accountId: account.accountId,
        ready: false,
        error: check.error ?? "unreachable",
        checkedAt: Date.now(),
      };
    }

    // The bridge is reachable, but WhatsApp Web is only usable once the session
    // is linked AND connected. Report truthful readiness — never fake health.
    if (check.linked !== true) {
      return {
        channel: "whatsapp",
        accountId: account.accountId,
        ready: false,
        identity: brandIdentity(account, check.identity),
        error: "not linked (no WhatsApp Web session — scan the QR on the bridge host)",
        checkedAt: Date.now(),
      };
    }
    if (check.connected !== true) {
      return {
        channel: "whatsapp",
        accountId: account.accountId,
        ready: false,
        identity: brandIdentity(account, check.identity),
        error: "linked but disconnected from WhatsApp",
        checkedAt: Date.now(),
      };
    }

    return {
      channel: "whatsapp",
      accountId: account.accountId,
      ready: true,
      identity: brandIdentity(account, check.identity),
      checkedAt: Date.now(),
    };
  }

  public normalize(
    rawEvent: unknown,
    accountId: string,
  ): NormalizedInboundMessage | undefined {
    return normalizeWhatsAppEvent(rawEvent, accountId);
  }

  public async react(request: ReactionRequest): Promise<boolean> {
    const ctx = this.resolveSendContext(request.accountId);
    const emoji = request.emoji?.trim();
    if (!emoji) {
      throw new Error("WhatsApp reaction requires an emoji");
    }
    return reactWhatsApp(request.conversationId, request.messageId, emoji, ctx);
  }
}

/** Construct the WhatsApp ConnectorPort (one instance speaks all accounts). */
export function createWhatsAppConnector(): ConnectorPort {
  return new WhatsAppConnector();
}
