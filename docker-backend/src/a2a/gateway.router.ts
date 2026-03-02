/**
 * @module gateway.router
 *
 * Unified A2A gateway router -- the single entry point for all A2A
 * subsystem routes. Chains tracing, rate limiting, and identity extraction
 * middleware before dispatching to the individual sub-routers.
 *
 * Mount this router under `/api/a2a` in the main Express application:
 *
 * ```ts
 * import { createA2AGateway } from './a2a/gateway.router';
 * app.use('/api/a2a', createA2AGateway());
 * ```
 *
 * P18-003: A2A Gateway router (unified entry point)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
} from '@recoder/shared/a2a';

// Middleware -- imported directly from source files to avoid circular imports
// through the barrel (index.ts will re-export the gateway later).
import { createTraceMiddleware } from './trace-context.middleware';
import { createRateLimitMiddleware, type RateLimitConfig } from './rate-limiter.service';
import { extractA2AIdentity } from './rbac.middleware';

// Sub-routers -- imported from their individual source files (not the barrel)
import { taskLifecycleRouter } from './task-lifecycle.routes';
import { collaborationRouter } from './collaboration.routes';
import { heartbeatRouter } from './heartbeat.routes';
import { agentRegistryRouter } from './agent-registry.routes';
import { sseStreamRouter } from './sse-stream.router';
import { claudeConnectorRouter } from './claude-connector.routes';
import { codexConnectorRouter } from './codex-connector.routes';
import { cursorConnectorRouter } from './cursor-connector.routes';
import { windsurfConnectorRouter } from './windsurf-connector.routes';
import { replitConnectorRouter } from './replit-connector.routes';
import { connectorHealthRouter } from './connector-health.routes';
import { contextBridgeRouter } from './context-bridge.routes';
import { a2aOpenApiRouter } from './openapi.routes';
import { a2aSloMetricsRouter } from './slo-metrics.routes';
import { restAdapterRouter, gitAdapterRouter } from './adapters';
import { workspaceRouter } from './workspace.routes';

import { createLogger } from '../logger';

const logger = createLogger('a2a-gateway');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  /** Enable trace middleware (default true). */
  enableTracing?: boolean;
  /** Enable rate limiting (default true). */
  enableRateLimit?: boolean;
  /** Enable auth extraction (default true). */
  enableAuth?: boolean;
  /** Rate limit config override. */
  rateLimitConfig?: { maxRequests: number; windowMs: number; maxConcurrent: number };
}

const DEFAULT_GATEWAY_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 300,
  windowMs: 60_000,
  maxConcurrent: 50,
};

// ---------------------------------------------------------------------------
// Gateway factory
// ---------------------------------------------------------------------------

/**
 * Creates and returns the unified A2A gateway Express router.
 *
 * The router applies middleware in order:
 * 1. Distributed tracing (optional, default on)
 * 2. Rate limiting (optional, default on)
 * 3. Identity extraction (optional, default on)
 *
 * Then mounts all A2A sub-routers under their respective path prefixes.
 */
export function createA2AGateway(config?: GatewayConfig): Router {
  const {
    enableTracing = true,
    enableRateLimit = true,
    enableAuth = true,
    rateLimitConfig,
  } = config ?? {};

  const router = Router();

  // -------------------------------------------------------------------------
  // 1. Distributed tracing middleware
  // -------------------------------------------------------------------------
  if (enableTracing) {
    router.use(createTraceMiddleware());
    logger.debug('A2A gateway: tracing middleware enabled');
  }

  // -------------------------------------------------------------------------
  // 2. Rate limiting middleware
  // -------------------------------------------------------------------------
  if (enableRateLimit) {
    const rlConfig: RateLimitConfig = rateLimitConfig
      ? { ...rateLimitConfig }
      : DEFAULT_GATEWAY_RATE_LIMIT;

    router.use(
      createRateLimitMiddleware(
        (req: Request) => `a2a:${req.ip}`,
        rlConfig,
      ),
    );
    logger.debug('A2A gateway: rate limiting middleware enabled');
  }

  // -------------------------------------------------------------------------
  // 3. Identity extraction (non-blocking -- does not reject anonymous)
  // -------------------------------------------------------------------------
  if (enableAuth) {
    router.use(extractA2AIdentity);
    logger.debug('A2A gateway: auth identity extraction enabled');
  }

  // -------------------------------------------------------------------------
  // Health endpoint (lightweight, no auth required)
  // -------------------------------------------------------------------------
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        service: 'a2a-gateway',
        timestamp: new Date().toISOString(),
        subsystems: {
          tracing: enableTracing,
          rateLimit: enableRateLimit,
          auth: enableAuth,
        },
      },
    });
  });

  // -------------------------------------------------------------------------
  // Sub-router mounts
  // -------------------------------------------------------------------------

  // Task lifecycle (CRUD + transitions)
  router.use('/tasks', taskLifecycleRouter);

  // AMB collaboration (channels, threads, messages)
  router.use('/channels', collaborationRouter);

  // Agent heartbeat / health
  router.use('/heartbeat', heartbeatRouter);

  // Agent registry (registration, discovery)
  router.use('/agents', agentRegistryRouter);

  // SSE event streams
  router.use('/events', sseStreamRouter);

  // Connector routes (one per AI coding agent platform)
  router.use('/connectors/claude', claudeConnectorRouter);
  router.use('/connectors/codex', codexConnectorRouter);
  router.use('/connectors/cursor', cursorConnectorRouter);
  router.use('/connectors/windsurf', windsurfConnectorRouter);
  router.use('/connectors/replit', replitConnectorRouter);
  router.use('/connectors/health', connectorHealthRouter);

  // Context bridge
  router.use('/context', contextBridgeRouter);

  // OpenAPI documentation
  router.use('/docs', a2aOpenApiRouter);

  // SLO metrics
  router.use('/metrics', a2aSloMetricsRouter);

  // Protocol adapters
  router.use('/adapters/rest', restAdapterRouter);
  router.use('/adapters/git', gitAdapterRouter);

  // Workspaces
  router.use('/workspaces', workspaceRouter);

  // -------------------------------------------------------------------------
  // Catch-all error handler
  // -------------------------------------------------------------------------
  router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = typeof err.status === 'number' ? err.status : 500;

    logger.error(`A2A gateway error: ${err.message ?? 'Unknown error'}`, {
      status: statusCode,
      stack: err.stack,
    });

    res.status(statusCode).json({
      success: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: err.message || 'Internal gateway error',
      }),
    });
  });

  logger.info('A2A gateway router created', {
    tracing: enableTracing,
    rateLimit: enableRateLimit,
    auth: enableAuth,
  });

  return router;
}
