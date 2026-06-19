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
  checkMcpToolPermission,
  createMcpToolAuditEvent,
  createMcpToolCall,
} from '@recoder/agent-mcp';
import type { AgentProfile, PolicyDecision, TaskSpec } from '@recoder/agent-os';
import type { McpToolAuditEvent } from '@recoder/agent-mcp';

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

export type AgentMcpRouterOptions = {
  recordAuditEvent?: (event: McpToolAuditEvent) => Promise<void> | void;
  recordPolicyDecision?: (decision: PolicyDecision) => Promise<void> | void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createAgentMcpRouter(options: AgentMcpRouterOptions = {}): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        service: 'recoder-mcp-host',
        servers: defaultServers.length,
        tools: defaultServers.flatMap((server) => server.toolNames).length,
      },
    });
  });

  router.get('/servers', (_req, res) => {
    res.json({ success: true, data: defaultServers });
  });

  router.get('/tools', (_req, res) => {
    res.json({
      success: true,
      data: defaultServers.flatMap((server) => (
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
    const server = defaultServers.find((candidate) => candidate.serverId === req.params.serverId);
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
