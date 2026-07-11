/**
 * Multica managed-agents/squads API Routes
 *
 * Surfaces the Multica loopback seam at `/api/multica/*` for:
 *   - Status/health inspection (truthful — never green-washes when absent)
 *   - Squad list (GET /api/multica/squads)
 *
 * DEGRADE-SAFE: when the Multica server is unconfigured or absent, every
 * endpoint returns a 503 with a descriptive reason, never a 200 fake-success.
 * The local squad.service.ts handles squad state without Multica; Multica is
 * an OPTIONAL enrichment layer, not the source of truth.
 *
 * All routes require authentication (authenticateRequest middleware).
 *
 * Pattern: mirrors tensorzero.routes.ts + ziti.routes.ts.
 */

import express, { Router } from 'express';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface MulticaRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createMulticaRouter(deps: MulticaRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  /**
   * GET /api/multica/status
   * Truthful Multica seam health: mode (managed/external/unconfigured),
   * available flag, and the configured base URL. Authenticated.
   *
   * Returns 503 when unavailable — never fakes a 200.
   */
  router.get(
    '/api/multica/status',
    authenticateRequest,
    asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
      const { multicaHealth, multicaHandle, MULTICA_URL_ENV, MULTICA_BIN_ENV, resolveMulticaBin } =
        await import('../multica-client.js');

      const health = await multicaHealth();
      const h = multicaHandle();
      const externalUrl = process.env[MULTICA_URL_ENV]?.trim();
      const binPath = resolveMulticaBin();

      const payload = {
        service: 'multica',
        available: health.available,
        mode: health.mode,
        baseUrl: h?.baseUrl ?? externalUrl ?? null,
        listenAddr: h?.listenAddr ?? null,
        binaryFound: binPath !== undefined,
        reason: health.available ? undefined : health.reason,
        env: {
          MULTICA_URL: !!externalUrl,
          MULTICA_BIN: !!process.env[MULTICA_BIN_ENV]?.trim(),
        },
      };

      if (!health.available) {
        res.status(503).json({ success: false, data: payload, error: health.reason });
        return;
      }
      sendSuccess(res, payload);
    }),
  );

  /**
   * GET /api/multica/squads
   * List squads from the Multica loopback. Returns { routed: false, squads: [] }
   * when Multica is absent so callers can fall back to local squad state.
   * Never fabricates squad data. Authenticated.
   */
  router.get(
    '/api/multica/squads',
    authenticateRequest,
    asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
      const { listMulticaSquads } = await import('../multica-client.js');
      const result = await listMulticaSquads();

      if (!result.routed) {
        return sendError(
          res,
          createError(
            ErrorCode.SERVICE_UNAVAILABLE,
            result.reason ?? 'Multica server unavailable — squad list not available',
          ),
        );
      }

      sendSuccess(res, { routed: true, squads: result.squads ?? [] });
    }),
  );

  return router;
}
