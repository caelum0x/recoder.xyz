/**
 * TensorZero LLM Gateway API Routes
 *
 * Surfaces the TensorZero gateway seam at `/api/gateway/*` for:
 *   - Health inspection (truthful — never green-washes when gateway is absent)
 *   - Proxied inference calls (POST /api/gateway/inference)
 *   - Observability linkage (inference_id pass-through)
 *
 * This router is degrade-safe: when the gateway is unconfigured/absent every
 * endpoint returns a 503 with a descriptive reason, never a 200 fake-success.
 *
 * All routes require authentication except GET /api/gateway/health (admin
 * health surface). Inference calls additionally route through the policy gate
 * on the caller's side — this router does NOT bypass it.
 *
 * Extracted to this file following the existing pattern (ziti.routes.ts,
 * billing-polar.routes.ts, etc.) — the route bodies, auth order, and error
 * helpers are consistent with other route files.
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

export interface TensorzeroRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createTensorzeroRouter(deps: TensorzeroRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  /**
   * GET /api/gateway/health
   * Truthful health snapshot of the TensorZero gateway seam. Public (no auth)
   * so orchestrators and load-balancers can poll it. Returns 503 when
   * unavailable — never fakes a 200.
   */
  router.get('/api/gateway/health', asyncHandler(async (_req: express.Request, res: express.Response) => {
    const { tensorzeroHealth } = await import('../tensorzero-client.js');
    const health = await tensorzeroHealth();
    if (!health.available) {
      res.status(503).json({ success: false, data: health });
      return;
    }
    sendSuccess(res, health);
  }));

  /**
   * POST /api/gateway/inference
   * Proxy an inference call through TensorZero. On success the response
   * includes the `inference_id` for observability linkage in the run journal.
   * Falls back to 503 when the gateway is not running; callers must handle
   * this by falling back to a direct provider call.
   */
  router.post(
    '/api/gateway/inference',
    authenticateRequest,
    asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
      const { function_name, input } = req.body ?? {};
      if (typeof function_name !== 'string' || !function_name.trim()) {
        return sendError(
          res,
          createError(ErrorCode.VALIDATION_ERROR, 'function_name (string) is required'),
        );
      }
      if (typeof input !== 'object' || input === null) {
        return sendError(
          res,
          createError(ErrorCode.VALIDATION_ERROR, 'input (object) is required'),
        );
      }

      const { postInference } = await import('../tensorzero-client.js');
      const result = await postInference({
        function_name: function_name.trim(),
        input,
        ...req.body,
      });

      if (!result.routed) {
        return sendError(
          res,
          createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'TensorZero gateway unavailable'),
        );
      }
      sendSuccess(res, result);
    }),
  );

  /**
   * GET /api/gateway/status
   * Lightweight status check that includes mode (managed/external/unconfigured)
   * and the configured base URL. Authenticated.
   */
  router.get(
    '/api/gateway/status',
    authenticateRequest,
    asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
      const { tensorzeroHandle, TENSORZERO_URL_ENV, resolveTensorzeroBin } = await import('../tensorzero-client.js');
      const h = tensorzeroHandle();
      const externalUrl = process.env[TENSORZERO_URL_ENV]?.trim();
      const binPath = resolveTensorzeroBin();

      sendSuccess(res, {
        gateway: 'tensorzero',
        mode: h?.child !== undefined ? 'managed' : externalUrl ? 'external' : 'unconfigured',
        available: h !== undefined || !!externalUrl,
        baseUrl: h?.baseUrl ?? externalUrl ?? null,
        listenAddr: h?.listenAddr ?? null,
        binaryFound: binPath !== undefined,
      });
    }),
  );

  return router;
}
