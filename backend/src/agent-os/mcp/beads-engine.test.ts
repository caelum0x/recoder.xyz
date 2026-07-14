/**
 * beads-engine — the concrete bd-backed executor for the recoder.beads MCP
 * server, driven with an injected runner (no real `bd` binary needed).
 */
import { describe, expect, it, vi } from 'vitest';
import { McpRegistry, McpToolRouter, beadsMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import { registerBeadsMcpTools } from './beads-engine';

function router(runner: (args: string[]) => string): McpToolRouter {
  const r = new McpToolRouter(new McpRegistry());
  r.getRegistry?.().register?.(beadsMcpServer);
  registerBeadsMcpTools(r, { runner, cwd: '/repo' });
  return r;
}

const actor = { agentId: 'agent_test', permissions: { toolRules: [] } } as unknown as AgentProfile;

describe('registerBeadsMcpTools', () => {
  it('beads.ready shells to `bd ready --json` and returns parsed issues', async () => {
    const runner = vi.fn((args: string[]) => {
      expect(args).toEqual(['ready', '--json']);
      return JSON.stringify([{ id: 'recoder-1', title: 'do a thing' }]);
    });
    const r = router(runner);
    const out = await r.call({ server: beadsMcpServer, toolName: 'beads.ready', actor, args: {} });
    expect(out.content).toEqual([{ id: 'recoder-1', title: 'do a thing' }]);
    expect(runner).toHaveBeenCalledOnce();
  });

  it('beads.create passes title + description', async () => {
    const runner = vi.fn(() => JSON.stringify({ id: 'recoder-2' }));
    const r = router(runner);
    await r.call({
      server: beadsMcpServer,
      toolName: 'beads.create',
      actor,
      args: { title: 'new work', description: 'details' },
    });
    expect(runner).toHaveBeenCalledWith(['create', 'new work', '--json', '-d', 'details']);
  });

  it('beads.close passes id + reason', async () => {
    const runner = vi.fn(() => JSON.stringify({ id: 'recoder-3', status: 'closed' }));
    const r = router(runner);
    await r.call({
      server: beadsMcpServer,
      toolName: 'beads.close',
      actor,
      args: { id: 'recoder-3', reason: 'done' },
    });
    expect(runner).toHaveBeenCalledWith(['close', 'recoder-3', '--json', '--reason', 'done']);
  });

  it('surfaces a truthful error when bd is not installed', async () => {
    const runner = vi.fn(() => {
      throw new Error('spawn bd ENOENT');
    });
    const r = router(runner);
    await expect(
      r.call({ server: beadsMcpServer, toolName: 'beads.ready', actor, args: {} }),
    ).rejects.toThrow(/not installed/i);
  });

  it('beads.show requires an id', async () => {
    const r = router(() => '');
    await expect(
      r.call({ server: beadsMcpServer, toolName: 'beads.show', actor, args: {} }),
    ).rejects.toThrow(/id is required/i);
  });
});
