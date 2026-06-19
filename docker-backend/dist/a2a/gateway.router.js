"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createA2AGateway = createA2AGateway;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
// Middleware -- imported directly from source files to avoid circular imports
// through the barrel (index.ts will re-export the gateway later).
const trace_context_middleware_1 = require("./trace-context.middleware");
const rate_limiter_service_1 = require("./rate-limiter.service");
const rbac_middleware_1 = require("./rbac.middleware");
const signed_ingress_middleware_1 = require("./signed-ingress.middleware");
// Sub-routers -- imported from their individual source files (not the barrel)
const task_lifecycle_routes_1 = require("./task-lifecycle.routes");
const collaboration_routes_1 = require("./collaboration.routes");
const heartbeat_routes_1 = require("./heartbeat.routes");
const agent_registry_routes_1 = require("./agent-registry.routes");
const sse_stream_router_1 = require("./sse-stream.router");
const claude_connector_routes_1 = require("./claude-connector.routes");
const codex_connector_routes_1 = require("./codex-connector.routes");
const opencode_connector_routes_1 = require("./opencode-connector.routes");
const cursor_connector_routes_1 = require("./cursor-connector.routes");
const windsurf_connector_routes_1 = require("./windsurf-connector.routes");
const replit_connector_routes_1 = require("./replit-connector.routes");
const connector_health_routes_1 = require("./connector-health.routes");
const context_bridge_routes_1 = require("./context-bridge.routes");
const openapi_routes_1 = require("./openapi.routes");
const slo_metrics_routes_1 = require("./slo-metrics.routes");
const adapters_1 = require("./adapters");
const workspace_routes_1 = require("./workspace.routes");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-gateway');
const DEFAULT_GATEWAY_RATE_LIMIT = {
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
function createA2AGateway(config) {
    const { enableTracing = true, enableRateLimit = true, enableAuth = true, rateLimitConfig, } = config ?? {};
    const router = (0, express_1.Router)();
    // -------------------------------------------------------------------------
    // 1. Distributed tracing middleware
    // -------------------------------------------------------------------------
    if (enableTracing) {
        router.use((0, trace_context_middleware_1.createTraceMiddleware)());
        logger.debug('A2A gateway: tracing middleware enabled');
    }
    // -------------------------------------------------------------------------
    // 2. Rate limiting middleware
    // -------------------------------------------------------------------------
    if (enableRateLimit) {
        const rlConfig = rateLimitConfig
            ? { ...rateLimitConfig }
            : DEFAULT_GATEWAY_RATE_LIMIT;
        router.use((0, rate_limiter_service_1.createRateLimitMiddleware)((req) => `a2a:${req.ip}`, rlConfig));
        logger.debug('A2A gateway: rate limiting middleware enabled');
    }
    // -------------------------------------------------------------------------
    // 3. Identity extraction (non-blocking -- does not reject anonymous)
    // -------------------------------------------------------------------------
    if (enableAuth) {
        router.use(rbac_middleware_1.extractA2AIdentity);
        router.use((0, signed_ingress_middleware_1.createSignedA2AIngressMiddleware)());
        logger.debug('A2A gateway: auth identity extraction enabled');
    }
    // -------------------------------------------------------------------------
    // Health endpoint (lightweight, no auth required)
    // -------------------------------------------------------------------------
    router.get('/health', (_req, res) => {
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
    router.use('/tasks', task_lifecycle_routes_1.taskLifecycleRouter);
    // AMB collaboration (channels, threads, messages)
    router.use('/channels', collaboration_routes_1.collaborationRouter);
    // Agent heartbeat / health
    router.use('/heartbeat', heartbeat_routes_1.heartbeatRouter);
    // Agent registry (registration, discovery)
    router.use('/agents', agent_registry_routes_1.agentRegistryRouter);
    // SSE event streams
    router.use('/events', sse_stream_router_1.sseStreamRouter);
    // Connector routes (one per AI coding agent platform)
    router.use('/connectors/claude', claude_connector_routes_1.claudeConnectorRouter);
    router.use('/connectors/codex', codex_connector_routes_1.codexConnectorRouter);
    router.use('/connectors/opencode', opencode_connector_routes_1.opencodeConnectorRouter);
    router.use('/connectors/cursor', cursor_connector_routes_1.cursorConnectorRouter);
    router.use('/connectors/windsurf', windsurf_connector_routes_1.windsurfConnectorRouter);
    router.use('/connectors/replit', replit_connector_routes_1.replitConnectorRouter);
    router.use('/connectors/health', connector_health_routes_1.connectorHealthRouter);
    // Context bridge
    router.use('/context', context_bridge_routes_1.contextBridgeRouter);
    // OpenAPI documentation
    router.use('/docs', openapi_routes_1.a2aOpenApiRouter);
    // SLO metrics
    router.use('/metrics', slo_metrics_routes_1.a2aSloMetricsRouter);
    // Protocol adapters
    router.use('/adapters/rest', adapters_1.restAdapterRouter);
    router.use('/adapters/git', adapters_1.gitAdapterRouter);
    // Workspaces
    router.use('/workspaces', workspace_routes_1.workspaceRouter);
    // -------------------------------------------------------------------------
    // Catch-all error handler
    // -------------------------------------------------------------------------
    router.use((err, _req, res, _next) => {
        const statusCode = typeof err.status === 'number' ? err.status : 500;
        logger.error({
            status: statusCode,
            stack: err.stack,
            message: err.message ?? 'Unknown error',
        }, 'A2A gateway error');
        res.status(statusCode).json({
            success: false,
            error: (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InternalError,
                message: err.message || 'Internal gateway error',
            }),
        });
    });
    logger.info({
        tracing: enableTracing,
        rateLimit: enableRateLimit,
        auth: enableAuth,
    }, 'A2A gateway router created');
    return router;
}
