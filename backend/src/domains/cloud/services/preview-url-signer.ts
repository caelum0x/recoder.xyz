/**
 * `PreviewUrlSigner` — HMAC-signed, expiring preview URLs (doc §8).
 *
 * A signed preview URL is a `payload.signature` bearer token where `payload` is
 * the base64url of {@link PreviewUrlClaims} and `signature` is an HMAC-SHA256 of
 * the payload under the in-memory signing secret. The edge verifies the token
 * (constant-time) before it passes a preview request through; the token ledger
 * (`cloud_preview_tokens`) stores only `sha256(token)` for revocation + audit,
 * never the raw token.
 *
 * Fail-safe law §37: absent signing secret / base domain ⇒ `isConfigured()` is
 * false and `sign()` returns `Err(SERVICE_UNAVAILABLE)` — never a faked URL.
 *
 * Revocation: a minted/leaked token can be killed before its TTL via
 * {@link PreviewUrlSigner.revoke}. The signer keys revocation on `sha256(token)`
 * (the ledger id, never the raw token) against an injectable
 * {@link PreviewRevocationStore} — in-memory by default, swappable for the
 * durable `cloud_preview_tokens` ledger. `verify()` rejects a revoked token.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { isPreviewConfigured, type CloudConfig } from '../config.js';
import type { PreviewUrlClaims, SignedPreviewUrl } from '../types.js';

/**
 * Revocation seam: an injectable ledger of revoked preview-token ids. A token
 * id is `sha256(token)` (hex) — the same representation the durable
 * `cloud_preview_tokens` ledger persists, never the raw token. The default
 * implementation is an in-memory `Set`; a durable store can replace it without
 * touching the signer.
 */
export interface PreviewRevocationStore {
  /** True if the given token id has been revoked. */
  isRevoked(tokenId: string): boolean;
  /** Mark the given token id revoked (idempotent). */
  revoke(tokenId: string): void;
}

/** Process-local revocation store — a `Set` of revoked token ids. */
export function createInMemoryRevocationStore(): PreviewRevocationStore {
  const revoked = new Set<string>();
  return {
    isRevoked: (tokenId) => revoked.has(tokenId),
    revoke: (tokenId) => {
      revoked.add(tokenId);
    },
  };
}

/** The signed-preview surface the preview deploy service + edge consume. */
export interface PreviewUrlSigner {
  /** True when a signing secret + base domain are present (safe to log). */
  isConfigured(): boolean;
  /** Mint a signed, expiring URL for a deployment. Absent config ⇒ `Err`. */
  sign(deploymentId: string, tenantId: string): Result<SignedPreviewUrl, AppError>;
  /** Verify a token: signature, revocation, then expiry. Claims or a typed error. */
  verify(token: string): Result<PreviewUrlClaims, AppError>;
  /**
   * Revoke a minted/leaked token before its TTL. Accepts the raw issued token
   * (what a leaked preview URL carries) and keys the store by `sha256(token)`;
   * `verify()` rejects it thereafter.
   */
  revoke(token: string): void;
  /** `sha256(token)` (hex) — the only representation persisted to the ledger. */
  hashToken(token: string): string;
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromB64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/** Build the signer bound to the sliced cloud config + an injectable clock. */
export function createPreviewUrlSigner(
  config: CloudConfig,
  now: () => Date = () => new Date(),
  revocationStore: PreviewRevocationStore = createInMemoryRevocationStore(),
): PreviewUrlSigner {
  const secret = config.previewSigningSecret;
  const baseDomain = config.previewBaseDomain;
  const ttlSeconds = config.previewUrlTtlSeconds;

  function hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  function revoke(token: string): void {
    revocationStore.revoke(hashToken(token));
  }

  function signPayload(payload: string): string {
    // Only reachable when `secret` is present (guarded by `isConfigured`).
    return createHmac('sha256', secret as string).update(payload, 'utf8').digest('base64url');
  }

  function isConfigured(): boolean {
    return isPreviewConfigured(config);
  }

  function sign(deploymentId: string, tenantId: string): Result<SignedPreviewUrl, AppError> {
    if (!isConfigured()) {
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Preview URL signing is not configured (missing signing secret or base domain).',
        ),
      );
    }
    const exp = Math.floor(now().getTime() / 1000) + ttlSeconds;
    const claims: PreviewUrlClaims = { deploymentId, tenantId, exp };
    const payload = b64url(JSON.stringify(claims));
    const signature = signPayload(payload);
    const token = `${payload}.${signature}`;
    // Each deployment gets its own preview subdomain; the token rides as a query.
    const url = `https://${deploymentId}.${baseDomain as string}/?preview_token=${encodeURIComponent(token)}`;
    return ok({ url, token, claims });
  }

  function verify(token: string): Result<PreviewUrlClaims, AppError> {
    if (!isConfigured()) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Preview URL signing is not configured.'));
    }
    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) {
      return err(createError(ErrorCode.AUTH_INVALID_TOKEN, 'Malformed preview token.'));
    }
    const payload = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    const expected = signPayload(payload);
    // Constant-time compare (guard equal length first — timingSafeEqual throws otherwise).
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return err(createError(ErrorCode.AUTH_INVALID_TOKEN, 'Invalid preview token signature.'));
    }
    // Revocation kills a leaked-but-well-signed token before its TTL. Keyed on
    // `sha256(token)` so we never compare against a stored raw token.
    if (revocationStore.isRevoked(hashToken(token))) {
      return err(createError(ErrorCode.AUTH_INVALID_TOKEN, 'Preview token has been revoked.'));
    }
    let claims: PreviewUrlClaims;
    try {
      const parsed = JSON.parse(fromB64url(payload)) as unknown;
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
      const c = parsed as Record<string, unknown>;
      if (typeof c.deploymentId !== 'string' || typeof c.tenantId !== 'string' || typeof c.exp !== 'number') {
        throw new Error('missing claims');
      }
      claims = { deploymentId: c.deploymentId, tenantId: c.tenantId, exp: c.exp };
    } catch {
      return err(createError(ErrorCode.AUTH_INVALID_TOKEN, 'Unreadable preview token claims.'));
    }
    if (Math.floor(now().getTime() / 1000) >= claims.exp) {
      return err(createError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Preview token has expired.'));
    }
    return ok(claims);
  }

  return { isConfigured, sign, verify, revoke, hashToken };
}
