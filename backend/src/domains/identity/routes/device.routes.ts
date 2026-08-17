/**
 * Device-flow routes — the RFC-8628 CLI device authorization edges under
 * `/api/identity/device`.
 *
 *   POST /code     public       start a grant → `device_code` + `user_code`
 *   POST /token    public       poll/exchange → `sk_` key or pending/slow_down
 *   POST /approve  session-gated the browser approves a `user_code`
 *
 * The `/token` endpoint pipes the RFC-8628 poll outcomes onto the uniform
 * `sendSuccess`/`sendError` envelope: `authorization_pending` / `slow_down` are
 * truthful 200 statuses (the CLI branches on `data.status`), while
 * `expired_token` / `access_denied` are real error codes. On `approved` it
 * atomically exchanges the grant for a freshly minted `sk_` key.
 *
 * Input is validated with zod at the boundary; body validation failures return
 * `VALIDATION_ERROR`. Handlers are wrapped with `asyncHandler` so a thrown
 * `AppError` (e.g. the key issuer being unconfigured → `SERVICE_UNAVAILABLE`)
 * flows to the uniform error envelope rather than crashing the process.
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
import type { AuthMiddleware } from '../middleware/authenticate.middleware.js';
import type { DeviceFlowService } from '../ports/device-flow.port.js';

export interface DeviceRouterDeps {
  readonly service: DeviceFlowService;
  readonly middleware: AuthMiddleware;
}

/** Accept either an OAuth-style space-delimited `scope` or an explicit `scopes[]`. */
const requestCodeSchema = z.object({
  client_id: z.string().min(1).max(128),
  scope: z.string().max(512).optional(),
  scopes: z.array(z.string().min(1).max(64)).max(32).optional(),
});

const tokenSchema = z.object({
  device_code: z.string().min(1).max(512),
  // Present for RFC-8628 compatibility; not required by this impl.
  grant_type: z.string().max(128).optional(),
  client_id: z.string().max(128).optional(),
});

const approveSchema = z.object({
  user_code: z.string().min(1).max(32),
  action: z.enum(['approve', 'deny']).optional(),
});

/** Parse a body against a schema; returns the value or `null` after sending 400. */
function parseBody<T>(schema: z.ZodType<T>, req: Request, res: Parameters<typeof sendError>[0]): T | null {
  const result = schema.safeParse((req as { body?: unknown }).body ?? {});
  if (!result.success) {
    sendError(res, createError(ErrorCode.VALIDATION_ERROR, result.error.issues[0]?.message ?? 'Invalid request body.'));
    return null;
  }
  return result.data;
}

/** Merge the two accepted scope shapes into a single list. */
function mergeScopes(scope: string | undefined, scopes: readonly string[] | undefined): readonly string[] {
  const fromSpace = scope ? scope.split(/\s+/).filter(Boolean) : [];
  return [...fromSpace, ...(scopes ?? [])];
}

/** Build the device-flow router (mount at `/api/identity/device`). */
export function buildDeviceRouter(deps: DeviceRouterDeps): Router {
  const router = Router();
  const { service, middleware } = deps;

  // 1. Start a device grant (public — identified only by client_id).
  router.post(
    '/code',
    asyncHandler(async (req, res) => {
      const body = parseBody(requestCodeSchema, req, res);
      if (!body) return;
      const grant = await service.requestGrant({
        clientId: body.client_id,
        scopes: mergeScopes(body.scope, body.scopes),
      });
      sendSuccess(res, {
        device_code: grant.deviceCode,
        user_code: grant.userCode,
        verification_uri: grant.verificationUri,
        ...(grant.verificationUriComplete ? { verification_uri_complete: grant.verificationUriComplete } : {}),
        expires_in: grant.expiresInSeconds,
        interval: grant.intervalSeconds,
      });
    }),
  );

  // 2. Poll / exchange (public — bearer is the opaque device_code itself).
  router.post(
    '/token',
    asyncHandler(async (req, res) => {
      const body = parseBody(tokenSchema, req, res);
      if (!body) return;
      const outcome = await service.pollStatus(body.device_code);

      switch (outcome.status) {
        case 'authorization_pending':
          sendSuccess(res, { status: 'authorization_pending' });
          return;
        case 'slow_down':
          sendSuccess(res, { status: 'slow_down', interval: outcome.intervalSeconds });
          return;
        case 'expired_token':
          sendError(res, createError(ErrorCode.AUTH_TOKEN_EXPIRED, 'The device code has expired. Restart sign-in.'));
          return;
        case 'access_denied':
          sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'The device authorization was denied.'));
          return;
        case 'approved': {
          const result = await service.exchange(body.device_code);
          if (!result) {
            // Lost the consume race or the grant moved on — surface as expired.
            sendError(res, createError(ErrorCode.AUTH_TOKEN_EXPIRED, 'The device code is no longer valid.'));
            return;
          }
          sendSuccess(res, {
            status: 'complete',
            access_token: result.rawKey,
            token_type: 'bearer',
            scope: result.scopes.join(' '),
          });
          return;
        }
        default: {
          // Exhaustiveness guard — an unknown outcome must not silently 200.
          const _never: never = outcome;
          void _never;
          sendError(res, createError(ErrorCode.INTERNAL_ERROR));
        }
      }
    }),
  );

  // 3. Browser approval (session-gated — a real, signed-in, non-anonymous user).
  router.post(
    '/approve',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = parseBody(approveSchema, req, res);
      if (!body) return;
      const userId = req.principal?.userId;
      if (!userId) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      if (body.action === 'deny') {
        // A REAL deny: flip the pending grant to `denied` so a later approve can't
        // succeed and the CLI polls `access_denied`. A miss (already used/expired/
        // unknown code) is reported truthfully rather than a fake success.
        const denied = await service.deny(body.user_code, userId);
        if (!denied) {
          sendError(res, createError(ErrorCode.NOT_FOUND, 'That code is invalid, already used, or expired.'));
          return;
        }
        sendSuccess(res, { approved: false, denied: true });
        return;
      }
      const ok = await service.approve(body.user_code, userId);
      if (!ok) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'That code is invalid, already used, or expired.'));
        return;
      }
      sendSuccess(res, { approved: true });
    }),
  );

  return router;
}
