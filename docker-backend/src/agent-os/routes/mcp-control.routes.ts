import { Router } from 'express';
import {
  billingMcpServer,
  browserMcpServer,
  tasksMcpServer,
  runsMcpServer,
  artifactsMcpServer,
  approvalsMcpServer,
  deploymentMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  githubMcpServer,
  logsMcpServer,
  memoryMcpServer,
  ossMcpServer,
  previewMcpServer,
  repoMcpServer,
  recodergitMcpServer,
  checkMcpToolPermission,
  createMcpToolAuditEvent,
  createMcpToolCall,
} from '@recoder/agent-mcp';
import type { AgentProfile, PolicyDecision, TaskSpec } from '@recoder/agent-os';
import type { McpServerRegistration, McpToolAuditEvent } from '@recoder/agent-mcp';
import { agentOsContainer } from '../service-container';
import { getInteropHostBundle, type InteropHostBundle } from '../mcp/interop-host';

const defaultServers = [
  tasksMcpServer,
  runsMcpServer,
  artifactsMcpServer,
  approvalsMcpServer,
  githubMcpServer,
  repoMcpServer,
  browserMcpServer,
  memoryMcpServer,
  beadsMcpServer,
  gitNexusMcpServer,
  previewMcpServer,
  logsMcpServer,
  ossMcpServer,
  deploymentMcpServer,
  billingMcpServer,
];

/**
 * Minimal, injectable slice of the code-graph service the host needs to decide
 * whether to additively register the recodergit MCP server and to supervise its
 * `mcp --http` process. Defaults to the live agentOsContainer.codeGraph.
 */
export type CodeGraphServerProvider = {
  isEnabled: () => boolean;
  ensureServer: () => Promise<unknown> | unknown;
};

export type AgentMcpRouterOptions = {
  recordAuditEvent?: (event: McpToolAuditEvent) => Promise<void> | void;
  recordPolicyDecision?: (decision: PolicyDecision) => Promise<void> | void;
  /** Injectable for tests. Defaults to the live code-graph service. */
  codeGraph?: CodeGraphServerProvider;
  /**
   * Injectable for tests. The @recoder/interop MCP host bundle that backs the
   * gated `/tools/:serverId/:toolName/call` route and `/external` PAL surface.
   * Defaults to the process-wide shared bundle. Lazily resolved so existing
   * routes keep working even if interop host construction is deferred.
   */
  interopBundle?: InteropHostBundle | (() => InteropHostBundle);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createAgentMcpRouter(options: AgentMcpRouterOptions = {}): Router {
  const router = Router();
  const codeGraph: CodeGraphServerProvider = options.codeGraph ?? agentOsContainer.codeGraph;

  /**
   * Lazily resolve the interop MCP host bundle. Resolving is deferred until a
   * route that actually needs it is hit, so the existing (non-interop) routes
   * never depend on interop host construction succeeding.
   */
  let resolvedBundle: InteropHostBundle | null = null;
  function interopBundle(): InteropHostBundle {
    if (resolvedBundle) return resolvedBundle;
    const provided = options.interopBundle;
    resolvedBundle =
      typeof provided === 'function'
        ? provided()
        : provided ?? getInteropHostBundle();
    return resolvedBundle;
  }

  /**
   * Effective server list exposed to agents. The recodergit code-graph server is
   * ADDITIVE + FLAG-GATED: included only when RECODER_CODE_GRAPH_ENABLED is on,
   * at which point we also best-effort bring up its supervised `mcp --http`
   * process. Best-effort: any failure here is swallowed so it can NEVER break the
   * existing MCP host (flag off -> identical behavior, no spawn, not registered).
   */
  function resolveServers(): McpServerRegistration[] {
    let enabled = false;
    try {
      enabled = codeGraph?.isEnabled?.() === true;
    } catch {
      // A throwing flag check must never break the host.
      return defaultServers;
    }
    if (!enabled) {
      return defaultServers;
    }
    // Best-effort supervision, fully isolated from registration: a spawn/ensure
    // failure still leaves the server registered (its live health is reported by
    // the code-graph control route), and NEVER breaks the existing host.
    try {
      void Promise.resolve(codeGraph.ensureServer()).catch(() => undefined);
    } catch {
      // ignore supervision failure
    }
    return [...defaultServers, recodergitMcpServer];
  }

  router.get('/', (_req, res) => {
    const servers = resolveServers();
    res.json({
      success: true,
      data: {
        service: 'recoder-mcp-host',
        servers: servers.length,
        tools: servers.flatMap((server) => server.toolNames).length,
      },
    });
  });

  router.get('/servers', (_req, res) => {
    res.json({ success: true, data: resolveServers() });
  });

  router.get('/tools', (_req, res) => {
    res.json({
      success: true,
      data: resolveServers().flatMap((server) => (
        server.toolNames.map((toolName) => ({
          serverId: server.serverId,
          kind: server.kind,
          toolName,
          enabled: server.enabled,
        }))
      )),
    });
  });

  router.post('/tools/:serverId/:toolName/check', async (req, res) => {
    const server = resolveServers().find((candidate) => candidate.serverId === req.params.serverId);
    if (!server) {
      res.status(404).json({ success: false, error: `MCP server not found: ${req.params.serverId}` });
      return;
    }
    if (!isRecord(req.body?.actor)) {
      res.status(400).json({ success: false, error: 'actor AgentProfile is required' });
      return;
    }

    const input = {
      server,
      toolName: req.params.toolName,
      actor: req.body.actor as AgentProfile,
      task: isRecord(req.body?.task) ? (req.body.task as TaskSpec) : undefined,
      args: isRecord(req.body?.args) ? req.body.args : {},
    };
    const decision = checkMcpToolPermission(input);
    const call = createMcpToolCall(input);
    const auditEvent = createMcpToolAuditEvent({
      call,
      decision,
      status: decision.requiresApproval
        ? 'needs_approval'
        : decision.allowed
          ? 'approved'
          : 'denied',
    });

    if (decision.policyDecision) {
      await options.recordPolicyDecision?.(decision.policyDecision);
    }
    await options.recordAuditEvent?.(auditEvent);

    res.status(decision.allowed ? 200 : decision.requiresApproval ? 202 : 403).json({
      success: true,
      data: {
        allowed: decision.allowed,
        requiresApproval: decision.requiresApproval ?? false,
        reason: decision.reason,
        policyDecision: decision.policyDecision,
        auditEvent,
      },
    });
  });

  router.get('/resources', (_req, res) => {
    res.json({
      success: true,
      data: [
        { uri: 'recoder://spaces', description: 'Recoder Agent OS spaces' },
        { uri: 'recoder://tasks', description: 'Canonical task specs and runs' },
        { uri: 'recoder://artifacts', description: 'Run artifacts and verification evidence' },
        { uri: 'recoder://memory', description: 'Reviewed memory items and candidates' },
      ],
    });
  });

  router.get('/prompts', (_req, res) => {
    res.json({
      success: true,
      data: [
        { name: 'recoder.task-spec', description: 'Create a Recoder TaskSpec from human intent' },
        { name: 'recoder.delivery-summary', description: 'Summarize artifacts, verification, approvals, and memory candidates' },
      ],
    });
  });

  router.get('/sessions', (_req, res) => {
    res.json({ success: true, data: [] });
  });

  /**
   * Truthful status of the supervised EXTERNAL MCP servers (currently the real
   * Python `py/pal-mcp-server`). Surfaces on-disk availability, the resolved
   * launch config, and live supervisor health — degrade-safe: an absent python
   * venv yields `available:false` with a reason, never a faked "ready".
   */
  router.get('/external', (_req, res) => {
    let bundle: InteropHostBundle;
    try {
      bundle = interopBundle();
    } catch (error) {
      res.status(503).json({
        success: false,
        error: `Interop MCP host unavailable: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    const pal = bundle.palStatus();
    res.json({
      success: true,
      data: {
        servers: [
          {
            serverId: pal.serverId,
            displayName: pal.config.displayName,
            command: pal.config.command,
            args: pal.config.args,
            cwd: pal.config.cwd,
            toolNames: pal.config.toolNames,
            available: pal.available,
            reason: pal.reason,
            pythonPath: pal.pythonPath,
            serverEntry: pal.serverEntry,
            health: pal.health,
          },
        ],
      },
    });
  });

  /**
   * Execute a tool through the @recoder/interop MCP host: AUTHORIZE → RISK →
   * EXECUTE → AUDIT. HOSTILE-BY-DEFAULT: the call is denied before the executor
   * is ever touched unless the actor's policy + the registered server allowlist
   * permit it. EVERY outcome (denied, needs_approval, completed, failed) is
   * audited. This is additive to the pure `/check` route above.
   */
  router.post('/tools/:serverId/:toolName/call', async (req, res) => {
    if (!isRecord(req.body?.actor)) {
      res.status(400).json({ success: false, error: 'actor AgentProfile is required' });
      return;
    }

    let bundle: InteropHostBundle;
    try {
      bundle = interopBundle();
    } catch (error) {
      res.status(503).json({
        success: false,
        error: `Interop MCP host unavailable: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    const server = bundle.getServer(req.params.serverId);
    if (!server) {
      res.status(404).json({ success: false, error: `MCP server not found: ${req.params.serverId}` });
      return;
    }

    const input = {
      server,
      toolName: req.params.toolName,
      actor: req.body.actor as AgentProfile,
      task: isRecord(req.body?.task) ? (req.body.task as TaskSpec) : undefined,
      args: isRecord(req.body?.args) ? req.body.args : {},
    };

    const outcome = await bundle.call(input);

    if (outcome.audit) {
      await options.recordAuditEvent?.(outcome.audit);
    }
    if (outcome.decision.policyDecision) {
      await options.recordPolicyDecision?.(outcome.decision.policyDecision);
    }

    const statusCode =
      outcome.status === 'completed'
        ? 200
        : outcome.status === 'needs_approval'
          ? 202
          : outcome.status === 'denied'
            ? 403
            : 502;

    res.status(statusCode).json({
      success: outcome.status === 'completed',
      data: {
        status: outcome.status,
        allowed: outcome.decision.allowed,
        requiresApproval: outcome.decision.requiresApproval ?? false,
        reason: outcome.decision.reason,
        risk: outcome.risk,
        result: outcome.status === 'completed' ? outcome.result : undefined,
        error: outcome.status !== 'completed' && 'reason' in outcome ? outcome.reason : undefined,
        policyDecision: outcome.decision.policyDecision,
        audit: outcome.audit,
      },
    });
  });

  return router;
}
