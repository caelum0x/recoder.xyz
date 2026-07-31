/**
 * `sk_` platform API key routes — mounted under `/api/identity` (so the paths
 * below resolve to `/api/identity/keys`).
 *
 *   GET    /keys      — list the caller's keys (masked; hash NEVER returned)
 *   POST   /keys      — mint a key (raw key returned exactly ONCE) — governance write
 *   DELETE /keys/:id  — revoke a key the caller owns — governance write
 *
 * Every route is session-gated via `authenticateMutating` (a real, non-anonymous
 * principal). Bodies are zod-validated at the boundary; responses use the uniform
 * `sendSuccess`/`sendError` envelope. The raw key is surfaced only on mint and is
 * never recoverable afterwards.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  ErrorCode,
  createError,
  sendError,
  sendSuccess,
  asyncHandler,
} from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { ApiKeyService } from '../ports/api-key.port.js';
import type { AuthMiddleware } from '../middleware/authenticate.middleware.js';
import type { PlatformApiKey } from '../types.js';

export interface ApiKeysRouterDeps {
  readonly service: ApiKeyService;
  readonly mw: AuthMiddleware;
  readonly logger: Logger;
}

/** Request body accepted by `POST /keys`. */
const mintBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().min(1).max(64)).max(32).optional(),
  /** ISO-8601 expiry; omit for a non-expiring key. */
  expiresAt: z.string().datetime().optional(),
});

/** A public, masked view of a key — never exposes `keyHash`. */
interface PublicApiKey {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly maskedKey: string;
  readonly orgId: string | null;
  readonly scopes: readonly string[];
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly active: boolean;
}

function toPublic(key: PlatformApiKey): PublicApiKey {
  const now = Date.now();
  const expired = key.expiresAt ? key.expiresAt.getTime() <= now : false;
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    maskedKey: `${key.keyPrefix}…`,
    orgId: key.orgId ?? null,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
    revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
    active: !key.revokedAt && !expired,
  };
}

/** The owning principal for a key operation (never anonymous past the guard). */
function owner(req: Request): { userId: string; orgId?: string } {
  const p = req.principal;
  return { userId: p?.userId ?? '', ...(p?.orgId ? { orgId: p.orgId } : {}) };
}

/** Build the api-keys router (mount at `/api/identity`). */
export function buildApiKeysRouter(deps: ApiKeysRouterDeps): Router {
  const { service, mw } = deps;
  const router = Router();

  router.get(
    '/keys',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const { userId } = owner(req);
      const keys = await service.list(userId);
      sendSuccess(res, { keys: keys.map(toPublic) });
    }),
  );

  router.post(
    '/keys',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const parsed = mintBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(
          res,
          createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'),
        );
        return;
      }
      const { userId, orgId } = owner(req);
      // The caller can only grant scopes it itself holds — never let a minted
      // key carry higher privilege than its minter (privilege-escalation guard).
      const granterScopes = req.principal?.scopes ?? [];
      const minted = await service.mint({
        userId,
        ...(orgId ? { orgId } : {}),
        name: parsed.data.name,
        ...(parsed.data.scopes ? { scopes: parsed.data.scopes } : {}),
        granterScopes,
        ...(parsed.data.expiresAt ? { expiresAt: new Date(parsed.data.expiresAt) } : {}),
      });
      // The raw key is returned ONCE here and is never recoverable afterwards.
      sendSuccess(
        res,
        { key: minted.rawKey, apiKey: toPublic(minted.record) },
        {
          statusCode: 201,
          message: 'Copy this key now — it will not be shown again.',
        },
      );
    }),
  );

  router.delete(
    '/keys/:id',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      if (!id) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, 'key id is required'));
        return;
      }
      const { userId } = owner(req);
      const revoked = await service.revoke(id, userId);
      if (!revoked) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'key not found or already revoked'));
        return;
      }
      sendSuccess(res, { id, revoked: true });
    }),
  );

  return router;
}
