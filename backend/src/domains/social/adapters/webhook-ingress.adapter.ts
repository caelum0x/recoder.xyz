/**
 * `webhook-ingress.adapter` — the HTTP webhook trust boundary for push-only
 * channels (LINE, Slack HTTP Events). Ported behind the domain seam from
 * `backend/src/connectors/webhook-ingress.ts`, kept PURE (no gateway coupling):
 * it verifies the channel signature over the RAW body, enforces the Slack replay
 * window, answers the Slack `url_verification` handshake AFTER verification, and
 * returns a structured outcome the route layer acts on.
 *
 * Hostile-by-default + truthful:
 *   - invalid / missing signature ⇒ 401 (never trust a byte);
 *   - missing signing secret ⇒ 401 (cannot verify ⇒ refuse, never a faked 200);
 *   - unverifiable channel ⇒ 404;
 *   - malformed JSON (post-verify) ⇒ 400.
 * Verification uses Node's built-in `crypto` only; NO channel SDK is touched here.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Channels that require HTTP webhook ingress (push-only). */
export const WEBHOOK_CHANNELS = ['line', 'slack'] as const;
export type WebhookChannel = (typeof WEBHOOK_CHANNELS)[number];

/** Slack replay window: reject events whose timestamp is older than this. */
export const SLACK_MAX_TIMESTAMP_SKEW_SEC = 60 * 5;

/** Narrow an untrusted string to a `WebhookChannel`. */
export function isWebhookChannel(value: unknown): value is WebhookChannel {
  return typeof value === 'string' && (WEBHOOK_CHANNELS as readonly string[]).includes(value);
}

/** Constant-time string compare (length mismatch ⇒ false, never throws). */
function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a LINE webhook signature: `base64(HMAC-SHA256(rawBody, channelSecret))`
 * delivered in `x-line-signature`. Returns false (never throws) on any mismatch.
 */
export function verifyLineSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeEqualStr(expected, signature);
}

/**
 * Verify a Slack `v0` request: signature base `v0:<timestamp>:<rawBody>`, header
 * `v0=<hex(HMAC-SHA256(base, signingSecret))>` in `x-slack-signature`, timestamp
 * in `x-slack-request-timestamp`. Rejects stale timestamps (replay) + mismatch.
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
  if (Math.abs(nowSec - ts) > SLACK_MAX_TIMESTAMP_SKEW_SEC) return false;
  const base = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
  return safeEqualStr(expected, signature);
}

/** The signature headers a delivery may carry. */
export interface WebhookHeaders {
  readonly lineSignature?: string;
  readonly slackSignature?: string;
  readonly slackTimestamp?: string;
}

/** The verified outcome of processing a webhook delivery. */
export interface WebhookOutcome {
  /** HTTP status the route should reply with. */
  readonly status: number;
  /** Whether the signature verified (true only on 200 event deliveries). */
  readonly verified: boolean;
  /** Optional JSON body (e.g. Slack `url_verification` challenge echo). */
  readonly body?: Record<string, unknown>;
  /** The verified + JSON-parsed payload (present only when `verified`). */
  readonly parsed?: unknown;
  /** Stable reason code for audit. */
  readonly code: string;
}

function refuse(status: number, code: string, error: string): WebhookOutcome {
  return { status, verified: false, body: { success: false, error }, code };
}

/**
 * Verify + prepare one raw webhook delivery. PURE: it does not dispatch — the
 * route layer normalizes + gates the returned `parsed` payload. `nowSec` is
 * injectable for deterministic replay tests.
 */
export function processWebhookDelivery(params: {
  channel: WebhookChannel;
  rawBody: Buffer;
  headers: WebhookHeaders;
  /** The channel signing secret; `null`/empty ⇒ 401 (cannot verify). */
  secret: string | null | undefined;
  nowSec?: number;
}): WebhookOutcome {
  const { channel, rawBody, headers, secret } = params;

  if (!secret) {
    // Cannot verify without the secret ⇒ refuse (never a faked 200).
    return refuse(401, 'webhook_secret_missing', `${channel} webhook secret not configured`);
  }

  // --- Verify the signature over the RAW body (hostile-by-default). ----------
  if (channel === 'line') {
    if (!verifyLineSignature(rawBody, headers.lineSignature, secret)) {
      return refuse(401, 'webhook_bad_signature', 'invalid signature');
    }
  } else {
    if (!verifySlackSignature(rawBody, headers.slackSignature, headers.slackTimestamp, secret, params.nowSec)) {
      return refuse(401, 'webhook_bad_signature', 'invalid signature');
    }
  }

  // --- Parse the (now verified) JSON body. -----------------------------------
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return refuse(400, 'webhook_bad_json', 'invalid JSON');
  }

  // --- Slack url_verification handshake (signed; answered after verify). ------
  if (channel === 'slack') {
    const obj = parsed as { type?: string; challenge?: string };
    if (obj?.type === 'url_verification') {
      return {
        status: 200,
        verified: true,
        body: { challenge: typeof obj.challenge === 'string' ? obj.challenge : '' },
        code: 'webhook_challenge',
        parsed,
      };
    }
  }

  return { status: 200, verified: true, body: { success: true }, parsed, code: 'webhook_verified' };
}
