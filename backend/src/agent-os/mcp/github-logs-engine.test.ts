/**
 * github-engine (gh CLI, injected runner) + logs-engine (RunEvent store).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { McpRegistry, McpToolRouter, githubMcpServer, logsMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { registerGithubMcpTools } from './github-engine';
import { registerLogsMcpTools } from './logs-engine';

const actor = { agentId: 'agent_x', permissions: { toolRules: [] } } as unknown as AgentProfile;

describe('github engine (gh)', () => {
  it('github.search parses repo results', async () => {
    const runner = vi.fn((args: string[]) => {
      expect(args[0]).toBe('search');
      expect(args[1]).toBe('repos');
      return JSON.stringify([{ fullName: 'acme/x', description: 'a repo', url: 'https://github.com/acme/x' }]);
    });
    const r = new McpToolRouter(new McpRegistry());
    registerGithubMcpTools(r, { runner });
    const out = await r.call({ server: githubMcpServer, toolName: 'github.search', actor, args: { query: 'widget' } });
    expect((out.content as Array<{ fullName: string }>)[0].fullName).toBe('acme/x');
  });

  it('github.pr.create returns the PR url from gh output', async () => {
    const runner = vi.fn((args: string[]) => {
      expect(args.slice(0, 2)).toEqual(['pr', 'create']);
      expect(args).toContain('--title');
      return 'https://github.com/acme/x/pull/7\n';
    });
    const r = new McpToolRouter(new McpRegistry());
    registerGithubMcpTools(r, { runner });
    const out = await r.call({
      server: githubMcpServer, toolName: 'github.pr.create', actor,
      args: { title: 'My PR', body: 'does a thing' },
    });
    expect((out.content as { url: string }).url).toBe('https://github.com/acme/x/pull/7');
  });

  it('surfaces a truthful error when gh is not authenticated', async () => {
    const runner = vi.fn(() => {
      throw new Error('gh: To get started with GitHub CLI, please run: gh auth login');
    });
    const r = new McpToolRouter(new McpRegistry());
    registerGithubMcpTools(r, { runner });
    await expect(
      r.call({ server: githubMcpServer, toolName: 'github.search', actor, args: { query: 'x' } }),
    ).rejects.toThrow(/authenticated/i);
  });
});

describe('logs engine (RunEvent store)', () => {
  let repo: InMemoryAgentOsRepository;
  let router: McpToolRouter;
  beforeEach(() => {
    repo = new InMemoryAgentOsRepository();
    router = new McpToolRouter(new McpRegistry());
    registerLogsMcpTools(router, repo);
  });

  it('logs.append writes a log event that logs.stream then reads back', async () => {
    await router.call({
      server: logsMcpServer, toolName: 'logs.append', actor,
      args: { runId: 'run_1', taskId: 't1', message: 'agent note: found the bug' },
    });
    const stream = await router.call({
      server: logsMcpServer, toolName: 'logs.stream', actor, args: { runId: 'run_1' },
    });
    const events = stream.content as Array<{ message?: string; type: string }>;
    expect(events.some((e) => e.message === 'agent note: found the bug')).toBe(true);
  });

  it('logs.search finds events by text', async () => {
    await router.call({
      server: logsMcpServer, toolName: 'logs.append', actor,
      args: { runId: 'run_2', taskId: 't2', message: 'compiled successfully' },
    });
    const found = await router.call({
      server: logsMcpServer, toolName: 'logs.search', actor, args: { query: 'compiled' },
    });
    expect((found.content as unknown[]).length).toBeGreaterThan(0);
  });

  it('logs.append requires runId + message', async () => {
    await expect(
      router.call({ server: logsMcpServer, toolName: 'logs.append', actor, args: { runId: 'r' } }),
    ).rejects.toThrow(/message is required/i);
  });
});
