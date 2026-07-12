/**
 * store-engines — approvals + artifacts over the canonical agent-os repository.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { McpRegistry, McpToolRouter, approvalsMcpServer, artifactsMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { registerApprovalsMcpTools, registerArtifactsMcpTools } from './store-engines';

const actor = { agentId: 'agent_x', permissions: { toolRules: [] } } as unknown as AgentProfile;

describe('approvals engine', () => {
  let repo: InMemoryAgentOsRepository;
  let router: McpToolRouter;
  beforeEach(() => {
    repo = new InMemoryAgentOsRepository();
    router = new McpToolRouter(new McpRegistry());
    registerApprovalsMcpTools(router, repo);
  });

  it('an agent requests approval → persisted pending in the canonical store', async () => {
    const out = await router.call({
      server: approvalsMcpServer,
      toolName: 'approvals.request',
      actor,
      args: { taskId: 't1', reason: 'about to push to main' },
    });
    const appr = out.content as { approvalId: string; status: string; requestedBy: string };
    expect(appr.status).toBe('pending');
    expect(appr.requestedBy).toBe('agent_x');
    const stored = await repo.listApprovals();
    expect(stored.some((a) => a.approvalId === appr.approvalId)).toBe(true);
  });

  it('request → decide(approved) → status reflects it', async () => {
    const req = await router.call({
      server: approvalsMcpServer, toolName: 'approvals.request', actor,
      args: { taskId: 't1', reason: 'sensitive' },
    });
    const id = (req.content as { approvalId: string }).approvalId;
    await router.call({
      server: approvalsMcpServer, toolName: 'approvals.decide', actor,
      args: { approvalId: id, decision: 'approved', decidedBy: 'reviewer' },
    });
    const status = await router.call({
      server: approvalsMcpServer, toolName: 'approvals.status', actor, args: { approvalId: id },
    });
    expect((status.content as { status: string }).status).toBe('approved');
  });

  it('request requires a reason', async () => {
    await expect(
      router.call({ server: approvalsMcpServer, toolName: 'approvals.request', actor, args: { taskId: 't1' } }),
    ).rejects.toThrow(/reason is required/i);
  });
});

describe('artifacts engine', () => {
  let repo: InMemoryAgentOsRepository;
  let router: McpToolRouter;
  beforeEach(() => {
    repo = new InMemoryAgentOsRepository();
    router = new McpToolRouter(new McpRegistry());
    registerArtifactsMcpTools(router, repo);
  });

  it('an agent attaches an artifact → persisted + listable by task', async () => {
    const out = await router.call({
      server: artifactsMcpServer, toolName: 'artifacts.create', actor,
      args: { taskId: 't9', content: 'the run report', kind: 'report' },
    });
    const art = out.content as { artifactId: string; createdBy: string };
    expect(art.createdBy).toBe('agent_x');
    const list = await router.call({
      server: artifactsMcpServer, toolName: 'artifacts.list', actor, args: { taskId: 't9' },
    });
    expect((list.content as Array<{ artifactId: string }>).some((a) => a.artifactId === art.artifactId)).toBe(true);
  });

  it('create requires content or a path', async () => {
    await expect(
      router.call({ server: artifactsMcpServer, toolName: 'artifacts.create', actor, args: { taskId: 't9' } }),
    ).rejects.toThrow(/content or a path/i);
  });
});
