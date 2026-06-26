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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createAgentMcpRouter(options: AgentMcpRouterOptions = {}): Router {
  const router = Router();
  const codeGraph: CodeGraphServerProvider = options.codeGraph ?? agentOsContainer.codeGraph;

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

  return router;
}
