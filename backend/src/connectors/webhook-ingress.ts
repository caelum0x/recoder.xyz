/**
 * HTTP webhook ingress for push-only connector channels.
 *
 * LINE and Slack (HTTP Events mode) are PUSH-ONLY: they have no long-poll and no
 * app-token socket, so live inbound requires an HTTP endpoint the platform POSTs
 * each event to. This module is that endpoint. It is hostile-by-default:
 *
 *   1. VERIFY the channel signature over the RAW request body before trusting a
 *      single byte. LINE: `x-line-signature` = base64(HMAC-SHA256(rawBody,
 *      channelSecret)). Slack: the `v0` scheme over
 *      `v0:<x-slack-request-timestamp>:<rawBody>` with the signing secret, plus a
 *      replay window on the timestamp. An invalid (or missing) signature is a
 *      401 with NO control-plane action — the wire is never trusted.
 *   2. Slack's `url_verification` handshake is answered with the echoed
 *      `challenge` AFTER signature verification (Slack signs the handshake too).
 *   3. On a verified event, run the channel adapter's REAL `normalize()` to get a
 *      `NormalizedInboundMessage`, then push it through the gateway's
 *      `ingestInbound()` so the EXACT same gate -> dispatch -> createWorkspace
 *      path runs as for a long-poll message. The webhook is a transport, never a
 *      second control path.
 *
 * Degrade-safe + truthful: when the gateway is inert, the channel is not
 * configured, or its verification secret is absent, the route returns a truthful
 * non-2xx (503/404) instead of faking success. No new dependencies — signature
 * verification uses Node's built-in `crypto`; the channel SDKs stay optional and
 * are only touched through the already-built `ConnectorPort.normalize()`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import express from 'express';
import { type NormalizedInboundMessage } from '@recoder/connectors';
import { createLogger } from '../logger';
import type { ConnectorsGateway } from './gateway.js';
import { getConnectorsGateway, markWebhookIngressMounted } from './index.js';
import {
  WEBHOOK_CHANNELS,
  type WebhookChannel,
  isWebhookChannel,
  webhookSecretFor,
  webhookAccountIdFor,
} from './webhook-channels.js';

const logger = createLogger('connectors:webhook');

export { WEBHOOK_CHANNELS, type WebhookChannel } from './webhook-channels.js';

/** Slack replay window: reject events whose timestamp is older than this. */
const SLACK_MAX_TIMESTAMP_SKEW_SEC = 60 * 5; // 5 minutes (Slack's own guidance)

/**
 * Constant-time compare of two ASCII/hex/base64 signature strings. Length
 * mismatch is an immediate false (timingSafeEqual throws on unequal lengths).
 */
function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a LINE webhook signature. LINE signs the raw request body with the
 * channel secret: `base64(HMAC-SHA256(rawBody, channelSecret))`, delivered in
 * the `x-line-signature` header. Returns false (never throws) on any mismatch or
 * missing header — hostile-by-default.
 */
export function verifyLineSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeEqualStr(expected, signature);
}

/**
 * Verify a Slack request using the `v0` signing scheme. The signature base is
 * `v0:<timestamp>:<rawBody>`; the expected header value is
 * `v0=<hex(HMAC-SHA256(base, signingSecret))>` in `x-slack-signature`, with the
 * `x-slack-request-timestamp` header carrying the timestamp. Rejects stale
 * timestamps (replay protection) and any mismatch. Returns false, never throws.
 */
export function verifySlackSignature(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Replay window: reject timestamps too far from now (past or future).
  if (Math.abs(nowSec - ts) > SLACK_MAX_TIMESTAMP_SKEW_SEC) return false;
  const base = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
  return safeEqualStr(expected, signature);
}

/** Result of verifying + normalizing a delivery, before dispatch. */
interface IngressOutcome {
  /** HTTP status the route should reply with. */
  readonly status: number;
  /** Optional JSON body (e.g. the Slack url_verification challenge echo). */
  readonly body?: Record<string, unknown>;
  /** Normalized messages to push through the gateway (verified + actionable). */
  readonly messages: readonly NormalizedInboundMessage[];
}

/**
 * Extract the actionable events from a verified channel payload and normalize
 * each through the channel's REAL `ConnectorPort.normalize()`. Pure with respect
 * to the control plane: it does not dispatch — the caller pushes the returned
 * messages through the gateway.
 */
function normalizeVerifiedDelivery(
  channel: WebhookChannel,
  gateway: ConnectorsGateway,
  accountId: string,
  parsed: unknown,
): NormalizedInboundMessage[] {
  const port = gateway.getChannelPort(channel);
  if (!port) return [];
  const out: NormalizedInboundMessage[] = [];
  if (channel === 'line') {
    // LINE delivers `{ destination, events: [...] }`. Normalize each event; the
    // adapter returns undefined for non-actionable events (follow/unfollow/...).
    const events = (parsed as { events?: unknown[] })?.events;
    if (Array.isArray(events)) {
      for (const event of events) {
        const msg = port.normalize(event, accountId);
        if (msg) out.push(msg);
      }
    }
    return out;
  }
  // Slack Events API delivers `{ type: 'event_callback', event: {...} }`. The
  // adapter's normalize() consumes the inner event payload.
  const slackEvent = (parsed as { event?: unknown })?.event ?? parsed;
  const msg = port.normalize(slackEvent, accountId);
  if (msg) out.push(msg);
  return out;
}

/**
 * Verify a raw delivery for `channel`, handle the Slack handshake, and normalize
 * actionable events. Never dispatches; returns the HTTP status + the verified
 * messages so the route can push them and respond truthfully.
 */
export function processWebhookDelivery(params: {
  channel: WebhookChannel;
  gateway: ConnectorsGateway;
  rawBody: Buffer;
  headers: {
    lineSignature?: string;
    slackSignature?: string;
    slackTimestamp?: string;
  };
}): IngressOutcome {
  const { channel, gateway, rawBody, headers } = params;

  // The channel must be live (configured + port built) to ingest inbound.
  if (!gateway.getChannelPort(channel)) {
    return { status: 503, body: { success: false, error: `${channel} not configured` }, messages: [] };
  }

  const secret = webhookSecretFor(channel);
  if (!secret) {
    // Truthful: cannot verify without the secret -> we refuse rather than trust.
    return { status: 503, body: { success: false, error: `${channel} webhook secret not configured` }, messages: [] };
  }

  // --- Verify the signature over the RAW body (hostile-by-default). ----------
  if (channel === 'line') {
    if (!verifyLineSignature(rawBody, headers.lineSignature, secret)) {
      return { status: 401, body: { success: false, error: 'invalid signature' }, messages: [] };
    }
  } else {
    if (!verifySlackSignature(rawBody, headers.slackSignature, headers.slackTimestamp, secret)) {
      return { status: 401, body: { success: false, error: 'invalid signature' }, messages: [] };
    }
  }

  // --- Parse the (now verified) JSON body. ----------------------------------
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { success: false, error: 'invalid JSON' }, messages: [] };
  }

  // --- Slack url_verification handshake (signed; answered after verify). -----
  if (channel === 'slack') {
    const obj = parsed as { type?: string; challenge?: string };
    if (obj?.type === 'url_verification') {
      return { status: 200, body: { challenge: typeof obj.challenge === 'string' ? obj.challenge : '' }, messages: [] };
    }
  }

  const accountId = webhookAccountIdFor(channel);
  const messages = normalizeVerifiedDelivery(channel, gateway, accountId, parsed);
  return { status: 200, body: { success: true }, messages };
}

/**
 * Build the webhook ingress router: `POST /:channel`. It is mounted with a RAW
 * body parser (so signatures verify over the exact bytes the platform signed),
 * NOT the global JSON parser. The router itself parses JSON only after the
 * signature check passes.
 *
 * The `register()` call also flips the gateway's webhook-ingress flag so health
 * reports push-only channels as live-inbound-capable when their secret is set.
 */
export function createConnectorsWebhookRouter(): Router {
  const router = Router();

  // Raw body so HMAC verification sees the exact bytes the platform signed.
  router.use(express.raw({ type: () => true, limit: '2mb' }));

  router.post('/:channel', async (req: Request, res: Response) => {
    const channel = String(req.params.channel || '').toLowerCase();
    if (!isWebhookChannel(channel)) {
      res.status(404).json({ success: false, error: `no webhook ingress for channel ${channel}` });
      return;
    }

    const gateway = getConnectorsGateway();
    if (!gateway || !gateway.active) {
      res.status(503).json({ success: false, error: 'connectors gateway is inert' });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''));

    let outcome: IngressOutcome;
    try {
      outcome = processWebhookDelivery({
        channel,
        gateway,
        rawBody,
        headers: {
          lineSignature: req.header('x-line-signature') ?? undefined,
          slackSignature: req.header('x-slack-signature') ?? undefined,
          slackTimestamp: req.header('x-slack-request-timestamp') ?? undefined,
        },
      });
    } catch (err) {
      logger.error({ channel, err }, 'connectors webhook processing failed');
      res.status(500).json({ success: false, error: 'webhook processing failed' });
      return;
    }

    if (outcome.status !== 200) {
      if (outcome.status === 401) {
        logger.warn({ channel }, 'connectors webhook rejected (invalid signature)');
      }
      res.status(outcome.status).json(outcome.body ?? { success: false });
      return;
    }

    // ACK the platform FIRST (Slack/LINE require a fast 2xx), then dispatch the
    // verified messages through the gateway's real gate -> dispatch path. A
    // dispatch failure is logged but never turns a verified delivery into a
    // non-2xx (which would trigger platform retries / disable the webhook).
    res.status(200).json(outcome.body ?? { success: true });

    for (const message of outcome.messages) {
      try {
        const ingested = await gateway.ingestInbound(channel, message);
        if (!ingested) {
          logger.warn({ channel }, 'connectors webhook: channel runtime gone, message dropped');
        }
      } catch (err) {
        logger.error({ channel, err }, 'connectors webhook dispatch failed');
      }
    }
  });

  // Flag the in-process webhook ingress as mounted so health reports push-only
  // channels as live-inbound-capable (when their secret is configured). Tracked
  // at module scope so it applies to the gateway whenever boot constructs it.
  markWebhookIngressMounted();

  return router;
}
