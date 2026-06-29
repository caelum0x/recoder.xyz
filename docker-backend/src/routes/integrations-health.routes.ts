/**
 * Integrations Health API Route
 *
 * Consolidated health of the Recoder-owned OSS integrations (mem0, context7,
 * daytona SDK) — surfaces which merged capabilities are live/configured.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * body, path, middleware order, auth, and dynamic imports are unchanged. The auth
 * middleware closure that previously lived in server.ts is injected via the factory.
 */

import express, { Router } from 'express';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface IntegrationsHealthRouterDeps {
  authenticateRequest: Middleware;
}

export function createIntegrationsHealthRouter(deps: IntegrationsHealthRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  // Consolidated health of the Recoder-owned OSS integrations (mem0, context7,
  // daytona SDK) — surfaces which merged capabilities are live/configured.
  router.get('/api/integrations/health', authenticateRequest, async (_req: AuthenticatedRequest, res) => {
    const [{ mem0Health }, { isContext7Available }, { isDaytonaSdkEnabled }] = await Promise.all([
      import('../mem0-client.js'),
      import('../context7.js'),
      import('../daytona-sdk.js'),
    ]);
    const mem0 = await mem0Health();
    res.json({
      success: true,
      data: {
        mem0: { available: mem0.available, mode: mem0.mode, reason: mem0.reason },
        context7: { available: isContext7Available() },
        daytonaSdk: { enabled: isDaytonaSdkEnabled() },
      },
    });
  });

  return router;
}
