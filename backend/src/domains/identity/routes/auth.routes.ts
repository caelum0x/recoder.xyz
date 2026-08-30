/**
 * Auth routes — hosts Better Auth in-process at `/api/auth/[...all]`.
 *
 * The catch-all pipes each express request through the adapter's Web-Fetch
 * handler (sign-in/up, social, magic-link, reset, session management). A
 * dedicated `GET /api/auth/session` resolves the current {@link Principal} via
 * the {@link SessionVerifier} for surfaces that want the canonical shape rather
 * than Better Auth's raw session.
 *
 * DEGRADE-SAFE: when the engine is down, every route returns
 * `SERVICE_UNAVAILABLE` — never a faked 200.
 *
 * Mounting: this router is mounted at `/api/auth`; it reconstructs the full URL
 * from `req.originalUrl`, so Better Auth's own path matching is unaffected.
 */
import { Router, type Request, type Response } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { BetterAuthAdapter } from '../adapters/better-auth.adapter.js';
import type { SessionVerifier } from '../ports/session-verifier.port.js';
import type { Principal } from '../types.js';
import { credentialFromRequest } from '../middleware/authenticate.middleware.js';

export interface AuthRouterDeps {
  readonly adapter: BetterAuthAdapter;
  readonly verifier: SessionVerifier;
  readonly onSignOut?: (principal: Principal) => Promise<void>;
}

/** Reconstruct a Web `Request` from an express request (body-order independent). */
function toWebRequest(req: Request): globalThis.Request {
  const host = req.get('host') ?? 'localhost';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol ?? 'http';
  const url = `${proto}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else headers.set(name, value);
  }

  const method = req.method.toUpperCase();
  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const parsed = (req as { body?: unknown }).body;
    if (parsed && typeof parsed === 'object' && Object.keys(parsed as object).length > 0) {
      body = JSON.stringify(parsed);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
  }

  return new globalThis.Request(url, { method, headers, ...(body !== undefined ? { body } : {}) });
}

/** Pipe a Web `Response` back onto the express `Response` (incl. Set-Cookie). */
async function writeWebResponse(res: Response, webRes: globalThis.Response): Promise<void> {
  res.status(webRes.status);
  // Forward all headers; Set-Cookie needs the multi-value accessor.
  const setCookies = typeof webRes.headers.getSetCookie === 'function' ? webRes.headers.getSetCookie() : [];
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return; // handled below
    res.setHeader(key, value);
  });
  if (setCookies.length > 0) res.setHeader('set-cookie', setCookies);
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.end(buf);
}

/** Build the auth router (mount at `/api/auth`). */
export function buildAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();

  // Canonical resolved-principal endpoint (specific route BEFORE the catch-all).
  router.get(
    '/session',
    asyncHandler(async (req, res) => {
      const principal = await deps.verifier.verify(credentialFromRequest(req));
      if (!principal || principal.isAnonymous) {
        sendSuccess(res, { authenticated: false, principal: null });
        return;
      }
      sendSuccess(res, {
        authenticated: true,
        principal: {
          userId: principal.userId,
          orgId: principal.orgId ?? null,
          sessionId: principal.sessionId ?? null,
          email: principal.email ?? null,
          kind: principal.kind,
          scopes: principal.scopes,
        },
      });
    }),
  );

  // Better Auth catch-all — everything else under /api/auth/*.
  router.all(
    /.*/,
    asyncHandler(async (req, res) => {
      if (!deps.adapter.isReady()) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Authentication service is not configured.'));
        return;
      }
      // Resolve and revoke owner-bound remote continuations BEFORE Better Auth
      // destroys the credential. This exact backend hook covers website,
      // desktop, and any future client using the canonical sign-out endpoint.
      if (req.method === 'POST' && req.path === '/sign-out' && deps.onSignOut) {
        const principal = await deps.verifier.verify(credentialFromRequest(req));
        if (principal && !principal.isAnonymous && principal.kind === 'session') {
          await deps.onSignOut(principal);
        }
      }
      const webRes = await deps.adapter.handler(toWebRequest(req));
      await writeWebResponse(res, webRes);
    }),
  );

  return router;
}
