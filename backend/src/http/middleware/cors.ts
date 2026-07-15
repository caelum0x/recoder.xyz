/**
 * CORS admission for the edge, driven entirely by the injected
 * {@link EdgeCorsConfig} (no `process.env`, no `*`-with-credentials). It echoes an
 * allowed request `Origin` (exact match, or a leading-dot suffix entry like
 * `.recoder.xyz` for credentialed cross-subdomain), sets `Vary: Origin`, the
 * credentialed flag, and explicit method/header allowlists, and short-circuits
 * preflight `OPTIONS` with `204`.
 *
 * Security posture: a non-allowlisted origin gets NO `Access-Control-Allow-Origin`
 * header (the browser blocks it) — the request itself still proceeds for
 * same-origin / non-browser callers; credentials are only ever advertised to an
 * explicitly allowlisted origin.
 */
import type { Request, RequestHandler } from 'express';
import type { EdgeCorsConfig } from '../../domains/edge/config.js';

const ALLOW_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOW_HEADERS =
  'Content-Type,Authorization,x-api-key,x-internal-service-key,x-device-token,x-request-id,traceparent';
const MAX_AGE_SECONDS = '600';

/**
 * Does `origin` match an allowlist entry (exact, or `.suffix` subdomain match)?
 * Exported so the WS upgrade router enforces the SAME origin policy as HTTP CORS
 * (single source — the upgrade path never re-derives its own allowlist logic).
 */
export function isOriginAllowed(origin: string, allowlist: readonly string[]): boolean {
  for (const entry of allowlist) {
    if (entry === '*') return true;
    if (entry.startsWith('.')) {
      // `.recoder.xyz` matches `https://app.recoder.xyz` and `https://recoder.xyz`.
      try {
        const host = new URL(origin).host;
        if (host === entry.slice(1) || host.endsWith(entry)) return true;
      } catch {
        // Non-URL origin — fall through to exact compare below.
      }
    }
    if (entry === origin) return true;
  }
  return false;
}

/** Build the CORS middleware from the edge CORS slice. */
export function corsMiddleware(cfg: EdgeCorsConfig): RequestHandler {
  return (req: Request, res, next) => {
    const origin = req.headers.origin;
    const originValue = Array.isArray(origin) ? origin[0] : origin;

    if (originValue && isOriginAllowed(originValue, cfg.origins)) {
      res.setHeader('Access-Control-Allow-Origin', originValue);
      res.setHeader('Vary', 'Origin');
      if (cfg.allowCredentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
      res.setHeader('Access-Control-Max-Age', MAX_AGE_SECONDS);
      res.status(204).end();
      return;
    }

    next();
  };
}
