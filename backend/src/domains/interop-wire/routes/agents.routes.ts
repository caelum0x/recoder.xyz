/**
 * Agent-registry routes — owner-scoped CRUD over registered A2A agents / runtime
 * endpoints plus heartbeat ingest + liveness SLO:
 *
 *   GET    /agents                 list this owner's registered agents
 *   GET    /agents/:id             fetch one (owner-scoped; 404 when absent)
 *   POST   /agents                 register/upsert an agent (mutating)
 *   DELETE /agents/:id             deregister (mutating)
 *   POST   /agents/:id/heartbeat   record a liveness heartbeat (mutating)
 *   GET    /agents/:id/liveness    the derived SLO verdict (up/degraded/down)
 *
 * Owner (`userId`) is taken from the resolved `Principal`, NEVER the body. Reads
 * use `authenticate`; writes use `authenticateMutating` (a real principal).
 */
import { Router } from 'express';
import {
  ErrorCode,
  createError,
  sendError,
  sendSuccess,
  asyncHandler,
} from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AgentRegistryService } from '../registry/agent-registry.js';
import type {
  HeartbeatSloService,
  LivenessVerdict,
} from '../registry/heartbeat-slo.js';
import type { AgentKind } from '../types.js';

const AGENT_KINDS: readonly AgentKind[] = [
  'runtime',
  'remote_a2a',
  'connector',
];

export interface AgentsRouterDeps {
  readonly registry: AgentRegistryService;
  readonly heartbeat: HeartbeatSloService;
  readonly middleware: AuthMiddleware;
}

interface HeartbeatRouteInput {
  readonly ok: boolean;
  readonly latencyMs?: number;
}

/**
 * Owner-bound heartbeat mutation shared by the route and unit tests. The
 * ownership read happens before the stateful sample write, so a guessed foreign
 * id is indistinguishable from absence and never reaches the heartbeat store.
 */
async function recordOwnedHeartbeat(
  registry: AgentRegistryService,
  heartbeat: HeartbeatSloService,
  agentId: string,
  userId: string,
  input: HeartbeatRouteInput
): Promise<LivenessVerdict | null> {
  if (!(await registry.get(agentId, userId))) return null;
  await heartbeat.record({
    agentId,
    userId,
    ok: input.ok,
    latencyMs: input.latencyMs,
  });
  return heartbeat.reconcile(agentId, userId);
}

/** Owner-bound liveness read; a foreign id returns the same null as an absent id. */
async function readOwnedLiveness(
  registry: AgentRegistryService,
  heartbeat: HeartbeatSloService,
  agentId: string,
  userId: string
): Promise<LivenessVerdict | null> {
  if (!(await registry.get(agentId, userId))) return null;
  return heartbeat.liveness(agentId, userId);
}

/** Build the `/api/interop/agents` router. */
export function buildAgentsRoutes(deps: AgentsRouterDeps): Router {
  const router = Router();
  const { registry, heartbeat, middleware } = deps;

  router.get(
    '/',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const kind = isKind(req.query.kind) ? req.query.kind : undefined;
      sendSuccess(res, {
        agents: await registry.list(req.principal!.userId, kind),
      });
    })
  );

  router.get(
    '/:id',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const agent = await registry.get(req.params.id, req.principal!.userId);
      if (!agent) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'agent not found'));
        return;
      }
      sendSuccess(res, { agent });
    })
  );

  router.post(
    '/',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const kind = isKind(body.kind) ? body.kind : 'remote_a2a';
      const name = requireString(body, 'name');
      const agent = await registry.register({
        id: requireString(body, 'id'),
        userId: req.principal!.userId,
        kind,
        ...(typeof body.runtimeId === 'string'
          ? { runtimeId: body.runtimeId }
          : {}),
        card: {
          name,
          ...(typeof body.description === 'string'
            ? { description: body.description }
            : {}),
          ...(typeof body.url === 'string' ? { url: body.url } : {}),
          ...(Array.isArray(body.capabilities)
            ? {
                capabilities: body.capabilities.filter(
                  (c): c is string => typeof c === 'string'
                ),
              }
            : {}),
        },
        ...(typeof body.publicKey === 'string'
          ? { publicKey: body.publicKey }
          : {}),
      });
      sendSuccess(res, { agent }, { statusCode: 201 });
    })
  );

  router.delete(
    '/:id',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const removed = await registry.deregister(
        req.params.id,
        req.principal!.userId
      );
      if (!removed) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'agent not found'));
        return;
      }
      sendSuccess(res, { removed: true });
    })
  );

  router.post(
    '/:id/heartbeat',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const userId = req.principal!.userId;
      const verdict = await recordOwnedHeartbeat(
        registry,
        heartbeat,
        req.params.id,
        userId,
        {
          ok: body.ok === undefined ? true : Boolean(body.ok),
          ...(typeof body.latencyMs === 'number'
            ? { latencyMs: body.latencyMs }
            : {}),
        }
      );
      if (!verdict) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'agent not found'));
        return;
      }
      sendSuccess(res, { verdict });
    })
  );

  router.get(
    '/:id/liveness',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const userId = req.principal!.userId;
      const verdict = await readOwnedLiveness(
        registry,
        heartbeat,
        req.params.id,
        userId
      );
      if (!verdict) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'agent not found'));
        return;
      }
      sendSuccess(res, { verdict });
    })
  );

  return router;
}

export { readOwnedLiveness, recordOwnedHeartbeat };

function isKind(value: unknown): value is AgentKind {
  return (
    typeof value === 'string' &&
    (AGENT_KINDS as readonly string[]).includes(value)
  );
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'request body must be a JSON object'
    );
  }
  return value as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, `\`${key}\` is required`);
  }
  return value;
}
