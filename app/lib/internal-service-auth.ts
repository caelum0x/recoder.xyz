import crypto from 'crypto';
import { NextRequest } from 'next/server';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = MAX_CLOCK_SKEW_MS;
const MAX_TRACKED_NONCES = 10_000;
const MIN_NONCE_LENGTH = 8;
const NONCE_PATTERN = /^[A-Za-z0-9_-]+$/;
const usedNonceExpirations = new Map<string, number>();

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function createInternalSignature(input: {
  timestamp: string;
  nonce: string;
  method: string;
  pathname: string;
  body: string;
  serviceKey: string;
}): string {
  const payload = [
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.pathname,
    sha256(input.body),
  ].join('.');

  return crypto.createHmac('sha256', input.serviceKey).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function verifyInternalServiceRequest(
  request: NextRequest,
  options: { rawBody: string },
): { ok: true } | { ok: false; reason: string } {
  const expectedKey = process.env.INTERNAL_SERVICE_KEY || '';
  if (!expectedKey) {
    return { ok: false, reason: 'internal_key_not_configured' };
  }
  if (expectedKey.length < 16) {
    return { ok: false, reason: 'internal_key_too_short' };
  }

  const serviceKeyHeader = (request.headers.get('x-internal-service-key') || '').trim();
  const timestamp = (request.headers.get('x-internal-timestamp') || '').trim();
  const nonce = (request.headers.get('x-internal-nonce') || '').trim();
  const signature = (request.headers.get('x-internal-signature') || '').trim();
  const hasSignedHeaders = Boolean(timestamp && nonce && signature);

  if (hasSignedHeaders) {
    // Opportunistic cleanup to keep in-memory nonce tracker bounded.
    if (usedNonceExpirations.size > 0) {
      const now = Date.now();
      for (const [trackedNonce, expiresAt] of usedNonceExpirations.entries()) {
        if (expiresAt <= now) {
          usedNonceExpirations.delete(trackedNonce);
        }
      }
    }

    const timestampMs = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampMs)) {
      return { ok: false, reason: 'invalid_timestamp' };
    }
    if (nonce.length < MIN_NONCE_LENGTH || !NONCE_PATTERN.test(nonce)) {
      return { ok: false, reason: 'invalid_nonce' };
    }
    if (Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
      return { ok: false, reason: 'timestamp_out_of_range' };
    }
    if (!serviceKeyHeader || !safeEqual(serviceKeyHeader, expectedKey)) {
      return { ok: false, reason: 'invalid_service_key_header' };
    }

    const pathname = new URL(request.url).pathname;
    const expectedSignature = createInternalSignature({
      timestamp,
      nonce,
      method: request.method,
      pathname,
      body: options.rawBody,
      serviceKey: expectedKey,
    });

    if (!safeEqual(signature, expectedSignature)) {
      return { ok: false, reason: 'invalid_signature' };
    }

    const existingNonceExpiry = usedNonceExpirations.get(nonce);
    if (existingNonceExpiry && existingNonceExpiry > Date.now()) {
      return { ok: false, reason: 'replayed_nonce' };
    }
    usedNonceExpirations.set(nonce, Date.now() + NONCE_TTL_MS);

    if (usedNonceExpirations.size > MAX_TRACKED_NONCES) {
      const oldest = usedNonceExpirations.entries().next().value as [string, number] | undefined;
      if (oldest?.[0]) {
        usedNonceExpirations.delete(oldest[0]);
      }
    }
    return { ok: true };
  }

  return { ok: false, reason: 'missing_internal_auth' };
}
