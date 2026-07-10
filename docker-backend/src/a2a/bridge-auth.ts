import { timingSafeEqual } from 'node:crypto';

export type BridgeAuthResult = { ok: true } | { ok: false; status: number; error: string };

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authHeader: string): string {
  const header = String(authHeader || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

/**
 * Verify a bridge bearer token against the configured expected token.
 * Fail-closed: if no expected token is configured, deny (503). Comparison is
 * constant-time and length-safe.
 */
export function verifyBridgeBearer(
  bearerToken: string,
  expectedToken: string | undefined,
): BridgeAuthResult {
  if (!expectedToken) return { ok: false, status: 503, error: 'Bridge auth not configured' };
  if (!bearerToken) return { ok: false, status: 401, error: 'Unauthorized bridge token' };
  const provided = Buffer.from(bearerToken);
  const expected = Buffer.from(expectedToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized bridge token' };
  }
  return { ok: true };
}
