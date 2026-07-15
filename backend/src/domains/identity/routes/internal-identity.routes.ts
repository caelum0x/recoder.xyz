/**
 * `/internal/identity/*` edges — service-to-service identity resolution.
 *
 * These are the seam the WEBSITE proxy (and any other backend service) calls to
 * turn an inbound credential into a canonical {@link Principal}, to validate an
 * `sk_` platform key, and to resolve / link the unified identity read model over
 * the separate `user` (web) and `users` (legacy CLI) tables.
 *
 * Every route is `INTERNAL_SERVICE_KEY`-gated via `requireInternal` (constant-time,
 * fail-closed) — the same middleware every internal edge uses. The edge domain
 * (Phase 4) may later fold these behind the canonical interop chain; until then
 * they mount directly so internal callers have identity the moment it is built.
 *
 * DEGRADE-SAFE: identity unification depends on the persistence executor + the
 * auth DB reader; when the repository is not wired those routes report
 * `SERVICE_UNAVAILABLE` rather than faking a resolution.
 */
import { Router } from 'express';
import {
  asyncHandler,
  sendSuccess,
  sendError,
  createError,
  ErrorCode,
} from '../../../shared/errors.js';
import type { Credential, Principal } from '../types.js';
import type { IdentityModule } from '../index.js';

/** Project a resolved principal into a stable wire shape (never leaks `raw`). */
function principalWire(p: Principal): Record<string, unknown> {
  return {
    userId: p.userId,
    orgId: p.orgId ?? null,
    sessionId: p.sessionId ?? null,
    email: p.email ?? null,
    kind: p.kind,
    scopes: p.scopes,
    isAnonymous: p.isAnonymous,
  };
}

/**
 * Build a {@link Credential} from an explicit JSON body (the proxy forwards the
 * caller's material), falling back to this request's own headers when a field is
 * omitted. String-typed and defensively narrowed — external input is untrusted.
 */
function credentialFromBody(body: unknown, header: (name: string) => string | null): Credential {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    cookieHeader: str(b.cookieHeader) ?? header('cookie'),
    authorizationHeader: str(b.authorizationHeader) ?? header('authorization'),
    apiKey: str(b.apiKey) ?? header('x-api-key'),
    // The internal key on THIS request authenticated the proxy; it is never the
    // forwarded end-user credential, so it is not read back into the resolution.
    internalKey: null,
    deviceToken: str(b.deviceToken) ?? header('x-device-token'),
    ip: str(b.ip),
    requestId: str(b.requestId) ?? header('x-request-id'),
  };
}

/** Build the internal identity router (mount at `/internal/identity`). */
export function buildInternalIdentityRouter(module: IdentityModule): Router {
  const router = Router();
  const requireInternal = module.middleware().requireInternal;
  const verifier = module.verifier();

  const headerOf =
    (req: { headers: Record<string, unknown> }) =>
    (name: string): string | null => {
      const v = req.headers[name];
      if (Array.isArray(v)) return (v[0] as string | undefined) ?? null;
      return typeof v === 'string' ? v : null;
    };

  // POST /internal/identity/resolve — credential → canonical Principal.
  router.post(
    '/resolve',
    requireInternal,
    asyncHandler(async (req, res) => {
      const cred = credentialFromBody(req.body, headerOf(req));
      const principal = await verifier.verify(cred);
      if (!principal) {
        sendSuccess(res, { authenticated: false, principal: null });
        return;
      }
      sendSuccess(res, { authenticated: !principal.isAnonymous, principal: principalWire(principal) });
    }),
  );

  // POST /internal/identity/validate-key — validate an sk_ platform key.
  router.post(
    '/validate-key',
    requireInternal,
    asyncHandler(async (req, res) => {
      const apiKey = ((req.body ?? {}) as { apiKey?: unknown }).apiKey;
      if (typeof apiKey !== 'string' || !apiKey.startsWith('sk_')) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, 'a `sk_` apiKey is required'));
        return;
      }
      const principal = await verifier.verify({ apiKey });
      if (!principal || principal.kind !== 'apikey') {
        sendSuccess(res, { valid: false });
        return;
      }
      sendSuccess(res, {
        valid: true,
        userId: principal.userId,
        orgId: principal.orgId ?? null,
        scopes: principal.scopes,
      });
    }),
  );

  // GET /internal/identity/user/:id — resolve unified identity (web or legacy id).
  router.get(
    '/user/:id',
    requireInternal,
    asyncHandler(async (req, res) => {
      const repo = module.identityRepository();
      if (!repo || !repo.isAvailable()) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'identity unification is unavailable'));
        return;
      }
      const identity = await repo.resolveIdentity(req.params.id);
      if (!identity) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'no identity for the given id'));
        return;
      }
      sendSuccess(res, { identity });
    }),
  );

  // POST /internal/identity/link — link a legacy CLI users.id to a canonical user.id.
  router.post(
    '/link',
    requireInternal,
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as { authUserId?: unknown; legacyUsersId?: unknown };
      const authUserId = typeof body.authUserId === 'string' ? body.authUserId : '';
      const legacyUsersId = typeof body.legacyUsersId === 'string' ? body.legacyUsersId : '';
      if (!authUserId || !legacyUsersId) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, 'authUserId and legacyUsersId are required'));
        return;
      }
      const repo = module.identityRepository();
      if (!repo || !repo.isAvailable()) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'identity unification is unavailable'));
        return;
      }
      const identity = await repo.linkLegacyUser(authUserId, legacyUsersId);
      if (!identity) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'canonical user not found for authUserId'));
        return;
      }
      sendSuccess(res, { linked: true, identity });
    }),
  );

  return router;
}
