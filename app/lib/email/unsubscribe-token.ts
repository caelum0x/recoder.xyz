/**
 * Signed one-click unsubscribe tokens (List-Unsubscribe style).
 *
 * Marketing emails (e.g. the dormant-user winback) may go to plain user
 * accounts that have NO newsletter_subscribers row, so the footer link cannot
 * rely on a stored per-subscriber token. Instead the link carries an HMAC of
 * the recipient email, signed with a server-side secret:
 *
 *   /api/newsletter/unsubscribe?email=<addr>&sig=<hmac>
 *
 * The signature proves the link came from an email we sent — mail scanners or
 * third parties cannot forge unsubscribe links for arbitrary addresses. The
 * GET route additionally never mutates (it renders a confirm page whose POST
 * does the actual unsubscribe), so link prefetching is always safe.
 */

import crypto from 'crypto';

const TOKEN_VERSION = 'v1';

function getSecret(): string | null {
  return (
    process.env.UNSUBSCRIBE_TOKEN_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    null
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * HMAC-SHA256 signature over the normalized recipient email.
 * Returns null when no signing secret is configured (the caller should fall
 * back to a plain link rather than fail the send).
 */
export function generateUnsubscribeSignature(email: string): string | null {
  const secret = getSecret();
  if (!secret) return null;

  return crypto
    .createHmac('sha256', secret)
    .update(`unsubscribe:${TOKEN_VERSION}:${normalizeEmail(email)}`)
    .digest('hex');
}

/**
 * Constant-time verification of an unsubscribe signature.
 * Returns false (never throws) for missing/malformed signatures or when no
 * secret is configured.
 */
export function verifyUnsubscribeSignature(
  email: string,
  signature: string | null | undefined,
): boolean {
  if (!signature || typeof signature !== 'string') return false;

  const expected = generateUnsubscribeSignature(email);
  if (!expected) return false;

  const provided = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted);
}

/**
 * Build the tokenized unsubscribe URL for an email footer.
 * Falls back to an email-only link if no signing secret is available
 * (that link still works for addresses with a newsletter_subscribers row).
 */
export function buildUnsubscribeUrl(baseUrl: string, email: string): string {
  const normalized = normalizeEmail(email);
  const params = new URLSearchParams({ email: normalized });

  const signature = generateUnsubscribeSignature(normalized);
  if (signature) {
    params.set('sig', signature);
  }

  return `${baseUrl}/api/newsletter/unsubscribe?${params.toString()}`;
}
