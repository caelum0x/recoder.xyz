/**
 * Observability edges. Three route groups the composer exposes; the edge route
 * table owns the base mounts:
 *
 *  - health   (mounted at root)      GET /health              liveness (open, no secrets)
 *                                    GET /health/full         deep per-domain + SLO rollup
 *                                    GET /api/agent-os/health  agent-os canonical alias
 *  - metrics  (mounted at root)      GET /metrics             Prometheus scrape (INTERNAL_SERVICE_KEY)
 *  - control  (/api/agent-os/observability)
 *                                    GET  /slo                 SLO targets + attainment
 *                                    GET  /alerts              rules + firing/acked events
 *                                    POST /alerts/:id/ack      ack (governance-gated write)
 *                                    GET  /signals             work-signals + dispositions
 *                                    POST /signals/:id/disposition  set disposition (gated write)
 *                                    GET  /audit               XDR query (Merkle re-verified)
 *                                    GET  /logs                recent ring-buffer log records
 *
 * Truthful degrade: `/health` maps overall `down` → 503; `/metrics` fails safe with
 * 503 when no auth token is configured (never an open scrape); `/audit` returns 503
 * when the verify seam is unavailable and an EMPTY verified:false result on tamper.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createError, ErrorCode, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { ObservabilityConfig } from '../config.js';
import type { HealthAggregator } from '../services/health-aggregator.service.js';
import type { AlertingService } from '../services/alerting.service.js';
import type { WorkSignalsService } from '../services/work-signals.service.js';
import { AuditUnavailableError, type AuditXdrProjection } from '../adapters/audit-xdr.adapter.js';
import type { PrometheusMetrics } from '../adapters/prometheus-registry.adapter.js';
import type { SloRepository } from '../ports/observability.repository.js';
import type { LogRingBuffer } from '../adapters/pino-logger.adapter.js';
import type { EngineHealth, DispositionState, XdrQuery } from '../types.js';

/** A non-anonymous principal, or null (mirrors the billing/cloud route helper). */
function actor(req: Request): Principal | null {
  return req.principal && !req.principal.isAnonymous ? req.principal : null;
}

/**
 * Does the caller carry an elevated scope that may read an ARBITRARY tenant's
 * governance audit chain? Mirrors `resolveActorId` in `mcp/observability-engine.ts`
 * (the `obs_audit_search` twin) and the middleware's `requireAdmin` notion of an
 * operator: an `internal` service caller, or a principal holding the `admin`/
 * `internal` scope. A NON-privileged principal may only read its OWN rows.
 */
function isAuditOperator(principal: Principal): boolean {
  return (
    principal.kind === 'internal' ||
    principal.scopes.includes('admin') ||
    principal.scopes.includes('internal')
  );
}

/**
 * Resolve the `actorId` audit filter, bound to the authenticated {@link Principal}
 * (mirrors `resolveActorId` in the `obs_audit_search` MCP twin). A NON-privileged
 * principal is pinned to its OWN `userId`; a caller-supplied foreign `actorId` is
 * REJECTED (never served) — cross-tenant audit-trail disclosure is the IDOR. An
 * operator (`admin`/`internal`) may name any `actorId`, or omit it for the global
 * ops view. On a foreign-actor attempt, returns `{ denied: true }` so the handler
 * responds 403 rather than leaking another tenant's ledger.
 */
function resolveAuditActorId(
  principal: Principal,
  requested: string | undefined,
): { actorId: string | undefined } | { denied: true } {
  if (isAuditOperator(principal)) {
    return { actorId: requested };
  }
  if (requested && requested !== principal.userId) {
    return { denied: true };
  }
  return { actorId: principal.userId };
}

// --- health (root) ----------------------------------------------------------

export interface HealthRoutesDeps {
  readonly aggregator: HealthAggregator;
  /** The module's own engine breakdown, computed fresh per probe. */
  readonly engines: () => Promise<readonly EngineHealth[]> | readonly EngineHealth[];
}

/** GET /health (+ /health/full + /api/agent-os/health) — the aggregated contract. */
export function buildHealthRoutes(deps: HealthRoutesDeps): Router {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const shallow = await deps.aggregator.shallow();
      res.status(shallow.status === 'down' ? 503 : 200).json(shallow);
    }),
  );

  const full = asyncHandler(async (_req: Request, res: Response) => {
    const engines = await deps.engines();
    const report = await deps.aggregator.full(engines);
    res.status(report.status === 'down' ? 503 : 200).json(report);
  });
  router.get('/health/full', full);
  router.get('/api/agent-os/health', full);

  return router;
}

// --- metrics (root) ---------------------------------------------------------

export interface MetricsRoutesDeps {
  readonly metrics: PrometheusMetrics;
  readonly config: ObservabilityConfig;
  readonly mw: AuthMiddleware;
}

/**
 * GET /metrics — Prometheus scrape. Gated by the INTERNAL_SERVICE_KEY. Fail-safe:
 * when NO metrics-auth token is configured in production, the scrape returns 503
 * (never an open, secret-leaking scrape).
 */
export function buildMetricsRoutes(deps: MetricsRoutesDeps): Router {
  const router = Router();
  router.get(
    '/metrics',
    (req, res, next) => {
      if (!deps.config.metricsAuthPresent && deps.config.isProduction) {
        sendError(
          res,
          createError(ErrorCode.SERVICE_UNAVAILABLE, 'metrics scrape disabled: no auth token configured'),
        );
        return;
      }
      next();
    },
    deps.mw.requireInternal,
    (_req, res) => {
      res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
      res.status(200).send(deps.metrics.render());
    },
  );
  return router;
}

// --- control (/api/agent-os/observability) ----------------------------------

const dispositionSchema = z.object({
  disposition: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']),
});

export interface ControlRoutesDeps {
  readonly aggregator: HealthAggregator;
  readonly alerting: AlertingService;
  readonly workSignals: WorkSignalsService;
  readonly auditXdr: AuditXdrProjection;
  readonly slo: SloRepository;
  readonly logRing: LogRingBuffer;
  readonly engines: () => Promise<readonly EngineHealth[]> | readonly EngineHealth[];
  readonly mw: AuthMiddleware;
  readonly logger: Logger;
  readonly config: ObservabilityConfig;
}

/** The `/api/agent-os/observability/*` control edges (self-gated by identity mw). */
export function buildControlRoutes(deps: ControlRoutesDeps): Router {
  const router = Router();
  const space = deps.config.defaultSpaceId;

  // SLO targets + attainment.
  router.get(
    '/slo',
    deps.mw.authenticate,
    asyncHandler(async (_req, res) => {
      const engines = await deps.engines();
      const report = await deps.aggregator.full(engines);
      const targets = await deps.slo.listTargets(space);
      sendSuccess(res, { targets, attainment: report.slo });
    }),
  );

  // Alert rules + events.
  router.get(
    '/alerts',
    deps.mw.authenticate,
    asyncHandler(async (_req, res) => {
      const [rules, events] = await Promise.all([
        deps.alerting.listRules(space),
        deps.alerting.listEvents(space),
      ]);
      sendSuccess(res, { rules, events });
    }),
  );

  // Ack a firing alert (governance-gated write).
  router.post(
    '/alerts/:id/ack',
    deps.mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = actor(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'authentication required'));
        return;
      }
      try {
        const event = await deps.alerting.acknowledgeAlert({ eventId: req.params.id, principal });
        sendSuccess(res, { event });
      } catch (err) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, errMsg(err)));
      }
    }),
  );

  // Work signals + dispositions.
  router.get(
    '/signals',
    deps.mw.authenticate,
    asyncHandler(async (_req, res) => {
      const [refresh, dispositions] = await Promise.all([
        deps.workSignals.refresh(),
        deps.workSignals.listDispositions(space),
      ]);
      sendSuccess(res, {
        signals: refresh.signals,
        degraded: refresh.degraded,
        ...(refresh.reason ? { reason: refresh.reason } : {}),
        dispositions,
      });
    }),
  );

  // Set a work signal's disposition (governance-gated write).
  router.post(
    '/signals/:id/disposition',
    deps.mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = actor(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'authentication required'));
        return;
      }
      const parsed = dispositionSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'invalid disposition'));
        return;
      }
      try {
        const disposition = await deps.workSignals.disposition({
          signalId: req.params.id,
          disposition: parsed.data.disposition as DispositionState,
          principal,
        });
        sendSuccess(res, { disposition });
      } catch (err) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, errMsg(err)));
      }
    }),
  );

  // XDR audit query (Merkle re-verified before display).
  //
  // SECURITY (cross-tenant IDOR): the governance audit chain is tenant-owned
  // data. `authenticateMutating` (not `authenticate`) requires a NON-anonymous
  // principal — closing the omit-all read where an anonymous caller pulled EVERY
  // tenant's ledger — while honoring RECODER_SOLO_MODE fail-open (the middleware
  // promotes the single local caller to the synthetic solo owner). A non-operator
  // principal is then pinned to its OWN `actorId`; a caller-named foreign
  // `actorId` is refused 403. Mirrors the `obs_audit_search` MCP twin.
  router.get(
    '/audit',
    deps.mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = actor(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'authentication required'));
        return;
      }
      const requestedActorId =
        typeof req.query.actorId === 'string' && req.query.actorId.trim()
          ? req.query.actorId.trim()
          : undefined;
      const resolved = resolveAuditActorId(principal, requestedActorId);
      if ('denied' in resolved) {
        sendError(
          res,
          createError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            'may only read your own audit rows',
          ),
        );
        return;
      }
      const effect =
        req.query.effect === 'allow' || req.query.effect === 'deny' ? req.query.effect : undefined;
      const query: XdrQuery = {
        ...(resolved.actorId ? { actorId: resolved.actorId } : {}),
        ...(typeof req.query.action === 'string' ? { action: req.query.action } : {}),
        ...(effect ? { effect } : {}),
        limit: Math.min(Number(req.query.limit) || 100, 500),
      };
      try {
        const result = await deps.auditXdr.verifyAndProject(query);
        // Tamper (verified:false) returns 200 with an explicit verified flag + zero
        // rows — the caller sees the chain is untrustworthy, not a silent pass.
        sendSuccess(res, result);
      } catch (err) {
        if (err instanceof AuditUnavailableError) {
          sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, err.message));
          return;
        }
        sendError(res, createError(ErrorCode.INTERNAL_ERROR, errMsg(err)));
      }
    }),
  );

  // Recent structured logs from the ops ring buffer.
  //
  // SECURITY (cross-tenant disclosure): the ring is process-GLOBAL — it holds
  // every tenant's log lines with no per-tenant scoping. Gate it to internal
  // operators via `requireInternal` (the same INTERNAL_SERVICE_KEY boundary the
  // sibling `/metrics` scrape uses), not plain `authenticate`, so a single
  // authenticated tenant can't read across the tenancy.
  router.get(
    '/logs',
    deps.mw.requireInternal,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      sendSuccess(res, { records: deps.logRing.recent(limit) });
    }),
  );

  return router;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
