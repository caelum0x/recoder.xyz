/**
 * CSRF admission for cookie-authenticated mutations (audit item #25).
 *
 * A mutating request (POST/PUT/PATCH/DELETE) that authenticates via an AMBIENT
 * session COOKIE — and carries no explicit bearer-style credential — is the only
 * shape a cross-site page can forge, because the browser attaches the cookie
 * automatically. This link requires such a request to PROVE it comes from an
 * allowed origin: either `Sec-Fetch-Site: same-origin|same-site` (browser-set,
 * unforgeable) or an `Origin` header on the CORS allowlist. Anything else — a
 * foreign origin, or a browser mutation with no origin proof at all — is rejected
 * with `403`.
 *
 * Deliberately NARROW so it never breaks a legitimate flow:
 *  - Non-mutating (GET/HEAD/OPTIONS) requests are never checked.
 *  - Bearer / `x-api-key` / `x-device-token` / `x-internal-service-key` callers
 *    are EXEMPT: they present an explicit credential the browser does not attach
 *    ambiently, so they are not CSRF-able (this is the desktop's embedded-key
 *    path and every server-to-server caller).
 *  - A request with no cookie has no ambient session to ride, so nothing to guard.
 *
 * The allowed-origin set is the SAME CORS allowlist ({@link isOriginAllowed}) — a
 * single source of origin truth, never a second hand-rolled list.
 */
import type { Request, RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../shared/errors.js';
import type { EdgeCorsConfig } from '../../domains/edge/config.js';
import { isOriginAllowed } from './cors.js';

/** State-changing methods a forged cross-site request could abuse. */
const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** `Sec-Fetch-Site` values the browser only sets for non-cross-site requests. */
const SAFE_FETCH_SITES: ReadonlySet<string> = new Set(['same-origin', 'same-site']);

/** Read the first value of a (possibly array) request header, or `null`. */
function firstHeader(req: Request, name: string): string | null {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}

/**
 * Does the request carry an explicit, non-ambient (bearer-style) credential? Such
 * credentials are attached by the caller, never automatically by the browser, so
 * a request bearing one cannot be forged cross-site → exempt from the CSRF check.
 */
function hasBearerCredential(req: Request): boolean {
  return Boolean(
    firstHeader(req, 'authorization') ??
      firstHeader(req, 'x-api-key') ??
      firstHeader(req, 'x-device-token') ??
      firstHeader(req, 'x-internal-service-key'),
  );
}

/**
 * Build the CSRF origin guard from the edge CORS slice. Placed after CORS and
 * before the routers so a forged cookie-auth mutation is rejected before any
 * body parsing or handler runs.
 */
export function csrfOriginGuard(cfg: EdgeCorsConfig): RequestHandler {
  return (req: Request, res, next) => {
    // 1. Only mutating methods can change state — safe methods pass untouched.
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    // 2. An explicit bearer-style credential is not ambiently attached → not CSRF-able.
    if (hasBearerCredential(req)) {
      next();
      return;
    }

    // 3. No cookie ⇒ no ambient session to ride ⇒ nothing to protect.
    if (!firstHeader(req, 'cookie')) {
      next();
      return;
    }

    // Cookie-authenticated mutation: demand same-origin proof.
    const secFetchSite = firstHeader(req, 'sec-fetch-site');
    if (secFetchSite && SAFE_FETCH_SITES.has(secFetchSite.toLowerCase())) {
      next();
      return;
    }

    const origin = firstHeader(req, 'origin');
    if (origin && isOriginAllowed(origin, cfg.origins)) {
      next();
      return;
    }

    // Foreign or absent origin on a cookie-authenticated mutation → refuse.
    sendError(
      res,
      createError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        'Cross-origin request blocked: cookie-authenticated mutations must originate from an allowed origin.',
      ),
    );
  };
}
