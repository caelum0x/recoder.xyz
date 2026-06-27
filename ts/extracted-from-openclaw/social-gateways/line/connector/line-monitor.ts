// Owned by Recoder. Inbound ingress for the LINE ConnectorPort adapter.
//
// LINE is a webhook channel (no long-poll): the platform POSTs signed event
// batches to a registered URL. `monitor()` therefore wires a webhook receiver
// into a shared HTTP ingress: for each delivered batch it verifies the LINE
// signature (real HMAC-SHA256 constant-time check, ported verbatim from
// ../signature.ts), normalizes each event, and invokes the foundation's
// InboundHandler. The returned handle deregisters the receiver.
//
// The HTTP transport is injected (`LineIngress`) so the connector does not bind
// to a specific server framework — the same adapter works behind Express, the
// raw node http server the real ../monitor.ts used, or a serverless handler.

import crypto from "node:crypto";
import type {
  ConnectorMonitorHandle,
  InboundHandler,
} from "../../../src/connector/index.js";
import { normalizeLineEvent } from "./line-normalize.js";
import type { LineWebhookEvent, LineWebhookRequestBody } from "./line-sdk-types.js";

/** Validate a LINE webhook body against the channel secret (verbatim port). */
export function validateLineSignature(
  body: string,
  signature: string,
  channelSecret: string,
): boolean {
  const hash = crypto.createHmac("SHA256", channelSecret).update(body).digest("base64");
  const hashBuffer = Buffer.from(hash);
  const signatureBuffer = Buffer.from(signature);
  if (hashBuffer.length !== signatureBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuffer, signatureBuffer);
}

/** A registered webhook receiver the HTTP ingress hands raw deliveries to. */
export interface LineWebhookReceiver {
  /** Connector account this receiver belongs to. */
  readonly accountId: string;
  /** Path the host should expose (default `/line/webhook/<accountId>`). */
  readonly path: string;
  /**
   * Process one raw webhook delivery. Returns the HTTP status the host should
   * reply with (200 ok, 400 bad request, 401 bad signature). Never throws.
   */
  handle(rawBody: string, signature: string | undefined): Promise<number>;
}

/** The HTTP transport the connector registers its webhook receiver into. */
export interface LineIngress {
  register(receiver: LineWebhookReceiver): { unregister(): void };
}

export interface LineMonitorParams {
  accountId: string;
  channelSecret: string;
  webhookPath?: string;
  ingress: LineIngress;
  onMessage: InboundHandler;
  /** Optional verbose logger; defaults to no-op. */
  log?: (message: string) => void;
}

function parseBody(rawBody: string): LineWebhookRequestBody | undefined {
  try {
    const parsed = JSON.parse(rawBody) as LineWebhookRequestBody;
    if (Array.isArray(parsed?.events)) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build a webhook receiver for one account and register it with the ingress.
 * Returns a ConnectorMonitorHandle whose `stop()` deregisters the receiver.
 */
export function startLineMonitor(params: LineMonitorParams): ConnectorMonitorHandle {
  const { accountId, channelSecret, ingress, onMessage } = params;
  const log = params.log ?? (() => {});
  const path = params.webhookPath ?? `/line/webhook/${accountId}`;

  const receiver: LineWebhookReceiver = {
    accountId,
    path,
    handle: async (rawBody, signature): Promise<number> => {
      if (!signature) {
        log(`line[${accountId}]: webhook missing X-Line-Signature header`);
        return 400;
      }
      if (!channelSecret) {
        log(`line[${accountId}]: channel secret not configured; rejecting webhook`);
        return 401;
      }
      if (!validateLineSignature(rawBody, signature, channelSecret)) {
        log(`line[${accountId}]: webhook signature validation failed`);
        return 401;
      }
      const body = parseBody(rawBody);
      if (!body) {
        log(`line[${accountId}]: invalid webhook payload`);
        return 400;
      }
      // Process events out-of-band; the host should already have replied 200.
      for (const event of body.events as LineWebhookEvent[]) {
        const normalized = normalizeLineEvent(event, accountId);
        if (!normalized) {
          continue;
        }
        try {
          await onMessage(normalized);
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : String(err);
          log(`line[${accountId}]: inbound handler failed: ${reason}`);
        }
      }
      return 200;
    },
  };

  const registration = ingress.register(receiver);
  log(`line[${accountId}]: registered webhook receiver at ${path}`);

  let stopped = false;
  return {
    stop: async (): Promise<void> => {
      if (stopped) {
        return;
      }
      stopped = true;
      registration.unregister();
      log(`line[${accountId}]: webhook receiver deregistered`);
    },
  };
}
