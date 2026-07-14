/**
 * deployment-engine — resolves a workspace's conductor-owned delivery/preview
 * state (read-only), and degrades truthfully on the risk-gated mutating tools
 * when no deploy backend is wired. Deps are faked so no conductor/network/provider
 * is needed.
 */
import { describe, expect, it, vi } from 'vitest';
import { McpRegistry, McpToolRouter, deploymentMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import {
  registerDeploymentMcpTools,
  type DeploymentBackend,
  type DeploymentEngineDeps,
  type DeploymentWorkspaceLike,
} from './deployment-engine';

const actor = { agentId: 'agent_d', permissions: { toolRules: [] } } as unknown as AgentProfile;

function setup(workspaces: DeploymentWorkspaceLike[], overrides: Partial<DeploymentEngineDeps> = {}) {
  const router = new McpToolRouter(new McpRegistry());
  const deps: DeploymentEngineDeps = {
    getWorkspace: async (id) => workspaces.find((w) => w.workspaceId === id) ?? null,
    listWorkspaces: async () => workspaces,
    ...overrides,
  };
  registerDeploymentMcpTools(router, deps);
  return { router };
}

const call = (
  router: McpToolRouter,
  toolName: string,
  args: Record<string, unknown>,
  task?: { taskId: string },
) => router.call({ server: deploymentMcpServer, toolName, actor, args, task } as never);

describe('deployment engine', () => {
  it('deploy.status reports the conductor-owned state + preview URL (read-only, always safe)', async () => {
    const { router } = setup([
      {
        workspaceId: 'ws1',
        taskId: 't1',
        state: 'awaiting_review',
        metadata: { previewUrl: 'https://p.example/x', delivery: { summary: 'built ok' } },
      },
    ]);
    const out = await call(router, 'deploy.status', { workspaceId: 'ws1' });
    const c = out.content as {
      state: string;
      previewUrl: string | null;
      delivery: unknown;
      deployBackendConfigured: boolean;
    };
    expect(c.state).toBe('awaiting_review');
    expect(c.previewUrl).toBe('https://p.example/x');
    expect(c.delivery).toEqual({ summary: 'built ok' });
    expect(c.deployBackendConfigured).toBe(false);
  });

  it('deploy.status resolves the workspace from task context when no id is given', async () => {
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't7', state: 'ready', metadata: {} }]);
    const out = await call(router, 'deploy.status', {}, { taskId: 't7' });
    expect((out.content as { state: string }).state).toBe('ready');
  });

  it('deploy.preview degrades truthfully (not a fake deploy) when no backend is configured', async () => {
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't1', state: 'ready', metadata: {} }]);
    const out = await call(router, 'deploy.preview', { workspaceId: 'ws1' });
    const c = out.content as { deployed: boolean; message: string };
    expect(c.deployed).toBe(false);
    expect(c.message).toMatch(/no deploy backend configured/i);
  });

  it('deploy.rollback degrades truthfully when no backend is configured', async () => {
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't1', state: 'merged', metadata: {} }]);
    const out = await call(router, 'deploy.rollback', { workspaceId: 'ws1' });
    const c = out.content as { rolledBack: boolean; message: string };
    expect(c.rolledBack).toBe(false);
    expect(c.message).toMatch(/no deploy backend configured/i);
  });

  it('deploy.preview delegates to a wired backend and reports its result', async () => {
    const deployBackend: DeploymentBackend = {
      preview: vi.fn(async () => ({ status: 'deployed', url: 'https://preview.example/ws1' })),
      rollback: vi.fn(async () => ({ status: 'noop' })),
    };
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't1', state: 'ready', metadata: {} }], { deployBackend });
    const out = await call(router, 'deploy.preview', { workspaceId: 'ws1' });
    expect(deployBackend.preview).toHaveBeenCalledOnce();
    const c = out.content as { deployed: boolean; status: string; url: string };
    expect(c.deployed).toBe(true);
    expect(c.status).toBe('deployed');
    expect(c.url).toBe('https://preview.example/ws1');
  });

  it('surfaces a truthful error when the workspace cannot be resolved', async () => {
    const { router } = setup([]);
    await expect(call(router, 'deploy.status', { workspaceId: 'nope' })).rejects.toThrow(/not found/i);
  });
});
