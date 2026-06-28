import { createHmac, timingSafeEqual } from 'node:crypto';
import { DistributionError } from '../../../errors/index';
import type { Result } from '../../../result';
import { ok, err } from '../../../result';

/**
 * Polar webhooks use the Standard Webhooks spec (the svix scheme): the signed
 * content is `${id}.${timestamp}.${rawBody}`, the signature is base64
 * HMAC-SHA256 over that content keyed by the webhook secret, and the
 * `webhook-signature` header is a space-separated list of `v1,<b64sig>` tokens
 * (a payload can carry several during secret rotation). The secret is provided
 * as `whsec_<base64key>`; the base64-decoded key is the HMAC key.
 *
 * NEVER trust the wire: a missing secret, a missing header, a stale timestamp,
 * or a non-matching signature ALL deny. There is no "skip verification" path.
 */
export interface WebhookHeaders {
  readonly id?: string;
  readonly timestamp?: string;
  readonly signature?: string;
}

export interface VerifyWebhookInput {
  readonly rawBody: string;
  readonly headers: WebhookHeaders;
  readonly secret: string;
  /** Max allowed clock drift in seconds (default 5 min). Stale → deny. */
  readonly toleranceSeconds?: number;
  readonly now?: () => Date;
}

function decodeSecret(secret: string): Buffer {
  const key = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(key, 'base64');
}

function constantTimeEqualsB64(a: string, b: Buffer): boolean {
  let provided: Buffer;
  try {
    provided = Buffer.from(a, 'base64');
  } catch {
    return false;
  }
  if (provided.length !== b.length) return false;
  return timingSafeEqual(provided, b);
}

/**
 * Verify a Standard-Webhooks signature. Returns `ok(true)` only when a header
 * signature cryptographically matches; every other path is a deny `err`.
 */
export function verifyWebhookSignature(
  input: VerifyWebhookInput,
): Result<true, DistributionError> {
  if (!input.secret || input.secret.length === 0) {
    return err(
      new DistributionError('webhook_untrusted', 'webhook secret is not configured (deny — fail safe)'),
    );
  }
  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature) {
    return err(
      new DistributionError('webhook_untrusted', 'missing webhook signature headers', {
        haveId: Boolean(id),
        haveTimestamp: Boolean(timestamp),
        haveSignature: Boolean(signature),
      }),
    );
  }

  // Reject a stale/forward-dated timestamp (replay protection).
  const tolerance = input.toleranceSeconds ?? 5 * 60;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return err(new DistributionError('webhook_untrusted', 'invalid webhook timestamp'));
  }
  const nowSec = Math.floor((input.now ?? (() => new Date()))().getTime() / 1000);
  if (Math.abs(nowSec - ts) > tolerance) {
    return err(
      new DistributionError('webhook_untrusted', 'webhook timestamp outside tolerance (possible replay)', {
        skewSeconds: nowSec - ts,
      }),
    );
  }

  const signedContent = `${id}.${timestamp}.${input.rawBody}`;
  const expected = createHmac('sha256', decodeSecret(input.secret)).update(signedContent).digest();

  // The header is a space-separated list of `<version>,<b64sig>` tokens.
  for (const token of signature.split(' ')) {
    const comma = token.indexOf(',');
    const sig = comma >= 0 ? token.slice(comma + 1) : token;
    if (constantTimeEqualsB64(sig, expected)) {
      return ok(true);
    }
  }
  return err(new DistributionError('webhook_untrusted', 'no webhook signature matched (deny)'));
}
