/**
 * `securityHeaders` — HTTP security-response-header hardening (item #24).
 *
 * A small, dependency-free helmet-equivalent applied as the FIRST link in the
 * edge chain (before request-context / cors / body), so every HTTP response —
 * mounted route, 404, or terminal error — carries the hardening headers. It only
 * SETS response headers (never reads the body, never short-circuits, always
 * calls `next()`), so it is inert with respect to CORS (a later link) and the WS
 * upgrade path (which bypasses express middleware entirely).
 *
 * This matters most for self-host / desktop deployments that have no nginx or
 * cloud proxy in front to add these headers. It is config-driven so an operator
 * can loosen the CSP or disable HSTS for a plain-HTTP self-host.
 */
import type { RequestHandler } from 'express';

/** Tunable security-header policy. Every field has a secure default. */
export interface SecurityHeadersConfig {
  /** Master switch — `false` makes the middleware a pass-through. */
  readonly enabled: boolean;
  /** Emit `Strict-Transport-Security`. Harmless over plain HTTP (browsers ignore it there). */
  readonly hsts: boolean;
  readonly hstsMaxAgeSeconds: number;
  readonly hstsIncludeSubDomains: boolean;
  /** `Content-Security-Policy` value, or `false` to omit the header. */
  readonly contentSecurityPolicy: string | false;
  /** `X-Frame-Options` value, or `false` to omit. */
  readonly frameOptions: string | false;
  /** `Referrer-Policy` value, or `false` to omit. */
  readonly referrerPolicy: string | false;
  /** Emit `X-Content-Type-Options: nosniff`. */
  readonly noSniff: boolean;
}

/**
 * Secure defaults tuned for a JSON API (this backend serves JSON, not HTML, so a
 * restrictive `default-src 'none'` CSP is both feasible and safe): responses are
 * un-framable, never MIME-sniffed, leak no referrer, and assert HSTS.
 */
export const DEFAULT_SECURITY_HEADERS: SecurityHeadersConfig = {
  enabled: true,
  hsts: true,
  hstsMaxAgeSeconds: 15_552_000, // 180 days (matches helmet's default)
  hstsIncludeSubDomains: true,
  contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  frameOptions: 'DENY',
  referrerPolicy: 'no-referrer',
  noSniff: true,
};

/** Merge caller overrides over the secure defaults. */
export function resolveSecurityHeadersConfig(
  partial?: Partial<SecurityHeadersConfig>,
): SecurityHeadersConfig {
  return { ...DEFAULT_SECURITY_HEADERS, ...(partial ?? {}) };
}

/** Build the hardening middleware from a (partial) config. */
export function securityHeaders(partial?: Partial<SecurityHeadersConfig>): RequestHandler {
  const cfg = resolveSecurityHeadersConfig(partial);
  const hstsValue = cfg.hsts
    ? `max-age=${cfg.hstsMaxAgeSeconds}${cfg.hstsIncludeSubDomains ? '; includeSubDomains' : ''}`
    : null;

  return (_req, res, next) => {
    if (!cfg.enabled) {
      next();
      return;
    }
    if (cfg.noSniff) res.setHeader('X-Content-Type-Options', 'nosniff');
    if (cfg.frameOptions) res.setHeader('X-Frame-Options', cfg.frameOptions);
    if (cfg.referrerPolicy) res.setHeader('Referrer-Policy', cfg.referrerPolicy);
    if (cfg.contentSecurityPolicy) {
      res.setHeader('Content-Security-Policy', cfg.contentSecurityPolicy);
    }
    if (hstsValue) res.setHeader('Strict-Transport-Security', hstsValue);
    // Belt-and-suspenders headers helmet also sets by default.
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    next();
  };
}
