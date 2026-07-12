/**
 * preview-engine — resolves a workspace's conductor-owned preview URL, probes
 * health, runs the browser-check, and attaches evidence. Deps are faked so no
 * conductor or network is needed.
 */
import { describe, expect, it, vi } from 'vitest';
import { McpRegistry, McpToolRouter, previewMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';
import { registerPreviewMcpTools, type PreviewEngineDeps, type PreviewWorkspaceLike } from './preview-engine';

const actor = { agentId: 'agent_p', permissions: { toolRules: [] } } as unknown as AgentProfile;

function setup(workspaces: PreviewWorkspaceLike[], overrides: Partial<PreviewEngineDeps> = {}) {
  const repo = new InMemoryAgentOsRepository();
  const router = new McpToolRouter(new McpRegistry());
  const deps: PreviewEngineDeps = {
    getWorkspace: async (id) => workspaces.find((w) => w.workspaceId === id) ?? null,
    listWorkspaces: async () => workspaces,
    ...overrides,
  };
  registerPreviewMcpTools(router, repo, deps);
  return { repo, router };
}

const call = (router: McpToolRouter, toolName: string, args: Record<string, unknown>, task?: { taskId: string }) =>
  router.call({ server: previewMcpServer, toolName, actor, args, task } as never);

describe('preview engine', () => {
  it('preview.issue_url returns the conductor-owned preview URL for the workspace', async () => {
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't1', metadata: { previewUrl: 'https://p.example/x' } }]);
    const out = await call(router, 'preview.issue_url', { workspaceId: 'ws1' });
    expect((out.content as { url: string }).url).toBe('https://p.example/x');
  });

  it('preview.issue_url resolves the workspace from task context when no id is given', async () => {
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't7', metadata: { preview_url: 'https://p.example/task' } }]);
    const out = await call(router, 'preview.issue_url', {}, { taskId: 't7' });
    expect((out.content as { url: string }).url).toBe('https://p.example/task');
  });

  it('preview.issue_url returns a truthful null (not a fake URL) when there is no preview', async () => {
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't1', metadata: {} }]);
    const out = await call(router, 'preview.issue_url', { workspaceId: 'ws1' });
    const c = out.content as { url: string | null; message: string };
    expect(c.url).toBeNull();
    expect(c.message).toMatch(/no preview URL/i);
  });

  it('preview.health probes the URL and reports the status', async () => {
    const probe = vi.fn(async () => ({ ok: true, status: 200, message: 'Preview reachable (HTTP 200)' }));
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't1', metadata: { previewUrl: 'https://p.example/x' } }], { probe });
    const out = await call(router, 'preview.health', { workspaceId: 'ws1' });
    expect(probe).toHaveBeenCalledWith('https://p.example/x');
    expect((out.content as { healthy: boolean; status: number }).healthy).toBe(true);
  });

  it('preview.browser_check delegates to runBrowserCheck', async () => {
    const runBrowserCheck = vi.fn(async () => ({ attempted: true, status: 'passed' }));
    const { router } = setup([{ workspaceId: 'ws1', taskId: 't1', metadata: { previewUrl: 'https://p.example/x' } }], { runBrowserCheck });
    const out = await call(router, 'preview.browser_check', { workspaceId: 'ws1' });
    expect(runBrowserCheck).toHaveBeenCalledWith('ws1');
    expect((out.content as { outcome: { attempted: boolean } }).outcome.attempted).toBe(true);
  });

  it('preview.attach_evidence persists an artifact on the task', async () => {
    const { router, repo } = setup([{ workspaceId: 'ws1', taskId: 't1', metadata: { previewUrl: 'https://p.example/x' } }]);
    const out = await call(router, 'preview.attach_evidence', { workspaceId: 'ws1', note: 'looks good' });
    const artifactId = (out.content as { artifactId: string }).artifactId;
    const artifacts = await repo.listArtifacts();
    expect(artifacts.find((a) => a.artifactId === artifactId)?.content).toMatch(/looks good/);
  });

  it('surfaces a truthful error when the workspace cannot be resolved', async () => {
    const { router } = setup([]);
    await expect(call(router, 'preview.issue_url', { workspaceId: 'nope' })).rejects.toThrow(/not found/i);
  });
});
