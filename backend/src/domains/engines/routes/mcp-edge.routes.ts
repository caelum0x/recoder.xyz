/**
 * The governed MCP HTTP edge — the ONE wire surface the agents' stdio bridge
 * (`mcp/recoder-capability-tools.cjs`) calls on an agent's behalf. Mounted by the
 * engines composer under the domain base (`/api/mcp`):
 *
 *   GET  /servers                        — the gated registry catalog (in-proc + external)
 *   POST /tools/:server/:tool/call       — governed tool call (the bridge's contract)
 *   POST /call                           — same call, server/tool in the body
 *   POST /engines/:id/restart            — restart a supervised engine (admin/internal)
 *
 * Plus the INTERNAL_SERVICE_KEY-gated worker surface (mounted at `/internal/engines`
 * by bootstrap): GET /health — truthful per-engine health.
 *
 * Every tool call traverses the interop gate (`authorize → risk → execute →
 * audit`) via `host.call()` — this edge NEVER executes a handler itself. Gate
 * outcomes (completed / denied / needs_approval / failed) are returned as a 200
 * success envelope whose `data.status` carries the truthful decision (the bridge
 * branches on it); transport-level problems stay HTTP errors (401/400/404).
 * SECURITY: the audit event is surfaced as `auditEventId` only — never the raw
 * event (it embeds the call args).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AgentProfile } from '@recoder/agent-os';
import {
  ErrorCode,
  createError,
  sendError,
  sendSuccess,
  asyncHandler,
} from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { McpHostPort, HostCallOutcome } from '../ports/mcp-host.port.js';
import { isEngineId } from '../constants.js';
import type { EngineHealth, EngineId } from '../types.js';

/** The truthful outcome shape `restartEngine` yields (mirrors the MCP tool). */
export interface RestartOutcome {
  readonly outcome: 'restarted' | 'skipped' | 'failed';
  readonly reason?: string;
}

export interface McpEdgeRoutesDeps {
  /** The interop-gated MCP host (authorize → risk → execute → audit). */
  readonly host: McpHostPort;
  /** The composed identity auth middleware. */
  readonly mw: AuthMiddleware;
  readonly log: Logger;
  /** Restart a supervised engine (truthful outcome; napi/CLI → skipped). */
  readonly restartEngine: (
    id: EngineId,
    requestedBy: string,
    reason?: string,
  ) => Promise<RestartOutcome>;
}

// --- body validation (zod at the system boundary; the bridge's wire shape) ---

const toolRuleSchema = z.object({
  toolName: z.string().trim().min(1).max(200),
  effect: z.enum(['allow', 'deny']),
  modes: z.array(z.string().max(64)).max(16).optional(),
  reason: z.string().max(500).optional(),
  requiresApproval: z.boolean().optional(),
});

const actorSchema = z.object({
  agentId: z.string().trim().min(1).max(128),
  permissions: z.object({ toolRules: z.array(toolRuleSchema).max(64) }).partial().optional(),
});

const callBodySchema = z.object({
  actor: actorSchema.optional(),
  args: z.record(z.unknown()).optional(),
});

const bodyCallSchema = callBodySchema.extend({
  server: z.string().trim().min(1).max(200),
  tool: z.string().trim().min(1).max(200),
});

const restartBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

type EdgeToolRules = z.infer<typeof toolRuleSchema>[];

/**
 * Build a full deny-biased `AgentProfile` for the wire caller. The gate reads
 * only `agentId` + `permissions.toolRules`, but we hand it a complete profile so
 * no cast crosses the seam. No standing high-risk rights — those are governed.
 */
export function buildEdgeActor(agentId: string, toolRules: EdgeToolRules): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId,
    displayName: `MCP edge caller ${agentId}`,
    vendorSurface: 'custom',
    connectorId: 'mcp-http-edge',
    runtimeKind: 'external',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: toolRules.map((rule) => ({ ...rule })),
      allowNetwork: false,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'workspace_root', allowedRoots: [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

/**
 * Project a gate outcome onto the wire (SECURITY: `auditEventId` only — the raw
 * audit event embeds the call args). `error` mirrors `reason` on `failed` so the
 * bridge's `data.error` fallback reads truthfully.
 */
function outcomeToWire(outcome: HostCallOutcome): Record<string, unknown> {
  if (outcome.status === 'completed') {
    return {
      status: outcome.status,
      risk: outcome.risk,
      result: outcome.result,
      auditEventId: outcome.audit.eventId,
    };
  }
  return {
    status: outcome.status,
    risk: outcome.risk,
    reason: outcome.reason,
    ...(outcome.status === 'failed' ? { error: outcome.reason } : {}),
    auditEventId: outcome.audit.eventId,
  };
}

/** The governed MCP edge router (mounted under the engines domain base `/api/mcp`). */
export function buildMcpEdgeRouter(deps: McpEdgeRoutesDeps): Router {
  const { host, mw, log } = deps;
  const router = Router();

  router.get(
    '/servers',
    mw.authenticate,
    asyncHandler(async (_req, res) => {
      const servers = host.listServers();
      sendSuccess(res, { count: servers.length, servers });
    }),
  );

  /** Resolve + run one governed call; shared by both call edges. */
  const runGatedCall = async (
    serverId: string,
    toolName: string,
    body: z.infer<typeof callBodySchema>,
    fallbackAgentId: string,
  ): Promise<{ notFound: true } | { notFound?: false; wire: Record<string, unknown> }> => {
    const server = host.getServer(serverId);
    if (!server) return { notFound: true };
    const agentId = body.actor?.agentId ?? fallbackAgentId;
    const actor = buildEdgeActor(agentId, body.actor?.permissions?.toolRules ?? []);
    const outcome = await host.call({
      server,
      toolName,
      actor,
      args: body.args ?? {},
    });
    log.info(
      { serverId, toolName, agentId, status: outcome.status },
      'mcp edge: governed tool call',
    );
    return { wire: outcomeToWire(outcome) };
  };

  const handleCall = (
    extract: (req: { params: Record<string, string>; body: unknown }) =>
      | { serverId: string; toolName: string; body: z.infer<typeof callBodySchema> }
      | null,
  ) =>
    asyncHandler(async (req, res) => {
      const extracted = extract({ params: req.params as Record<string, string>, body: req.body });
      if (!extracted) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid MCP call body.'));
        return;
      }
      const fallbackAgentId = req.principal?.userId ?? 'agent_http';
      const ran = await runGatedCall(
        extracted.serverId,
        extracted.toolName,
        extracted.body,
        fallbackAgentId,
      );
      if (ran.notFound) {
        sendError(
          res,
          createError(ErrorCode.NOT_FOUND, `MCP server not registered: ${extracted.serverId}`),
        );
        return;
      }
      sendSuccess(res, ran.wire);
    });

  // The bridge's contract: POST /tools/:server/:tool/call
  router.post(
    '/tools/:server/:tool/call',
    mw.authenticateMutating,
    handleCall(({ params, body }) => {
      const parsed = callBodySchema.safeParse(body ?? {});
      if (!parsed.success) return null;
      const serverId = params.server ?? '';
      const toolName = params.tool ?? '';
      if (!serverId || !toolName) return null;
      return { serverId, toolName, body: parsed.data };
    }),
  );

  // Body-addressed variant: POST /call { server, tool, actor?, args? }
  router.post(
    '/call',
    mw.authenticateMutating,
    handleCall(({ body }) => {
      const parsed = bodyCallSchema.safeParse(body ?? {});
      if (!parsed.success) return null;
      const { server, tool, ...rest } = parsed.data;
      return { serverId: server, toolName: tool, body: rest };
    }),
  );

  // Governed restart of a supervised engine (admin or internal principal only).
  router.post(
    '/engines/:id/restart',
    mw.authenticate,
    mw.requireAdmin,
    asyncHandler(async (req, res) => {
      const id = req.params.id ?? '';
      if (!isEngineId(id)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, `Unknown engine: ${id}`));
        return;
      }
      const parsed = restartBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid restart body.'));
        return;
      }
      const requestedBy = req.principal?.userId ?? 'unknown';
      const result = await deps.restartEngine(id, requestedBy, parsed.data.reason);
      log.info({ engineId: id, requestedBy, outcome: result.outcome }, 'mcp edge: engine restart');
      sendSuccess(res, { engineId: id, ...result });
    }),
  );

  return router;
}

export interface InternalEnginesRoutesDeps {
  readonly mw: AuthMiddleware;
  /** Truthful live health for every declared engine. */
  readonly listHealth: () => Promise<readonly EngineHealth[]>;
}

/**
 * The `INTERNAL_SERVICE_KEY`-gated worker surface. Bootstrap mounts it at
 * `/internal/engines` → `GET /internal/engines/health`.
 */
export function buildInternalEnginesRouter(deps: InternalEnginesRoutesDeps): Router {
  const router = Router();
  router.get(
    '/health',
    deps.mw.requireInternal,
    asyncHandler(async (_req, res) => {
      const engines = await deps.listHealth();
      sendSuccess(res, {
        count: engines.length,
        up: engines.filter((engine) => engine.status === 'up').length,
        engines,
      });
    }),
  );
  return router;
}
