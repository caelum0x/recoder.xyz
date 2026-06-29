/**
 * Tests for conductor browser-check — the in-process fusion of the OWNED
 * `@recoder/browser-verification` contract package onto the post-run product path.
 *
 * These drive the REAL `runBrowserCheck` over the REAL in-memory AgentOsRepository
 * singleton (a workspace is seeded via the real `upsertWorkspace`) and the REAL
 * contract-package builders. The ONLY external-IO seam stubbed is `globalThis.fetch`
 * (the preview reachability probe), so we can assert "healthy 200 preview" vs
 * "unhealthy 503" without a live server, and "no preview URL => skipped" with no
 * network at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { runBrowserCheck } from './browser-check.js';

function seedWorkspace(metadata?: Record<string, unknown>): Workspace {
  const now = new Date().toISOString();
  const workspace: Workspace = {
    workspaceId: `ws_${randomUUID()}`,
    spaceId: 'space_test',
    projectId: 'proj_test',
    taskId: `task_${randomUUID()}`,
    runtimeId: 'claude_code',
    substrate: 'in_process',
    branch: 'browser-check-test',
    baseRef: 'main',
    state: 'running',
    createdBy: 'test',
    createdAt: now,
    updatedAt: now,
    metadata,
  };
  agentOsContainer.repository.upsertWorkspace(workspace);
  return workspace;
}

describe('runBrowserCheck', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('skips (attempted=false) when the workspace has no preview URL', async () => {
    const ws = seedWorkspace({});
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const outcome = await runBrowserCheck(ws.workspaceId);

    expect(outcome.attempted).toBe(false);
    expect(outcome.result).toBeNull();
    expect(outcome.artifact).toBeNull();
    // Degrade-safe: never even touches the network when there is no preview.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes when the preview URL responds healthy (2xx)', async () => {
    const previewUrl = 'https://preview.recoder.xyz/published/demo';
    const ws = seedWorkspace({ previewUrl });
    globalThis.fetch = vi.fn(async () => ({ status: 200 }) as Response) as unknown as typeof fetch;

    const outcome = await runBrowserCheck(ws.workspaceId);

    expect(outcome.attempted).toBe(true);
    expect(outcome.result?.status).toBe('passed');
    expect(outcome.result?.previewUrl).toBe(previewUrl);
    expect(outcome.result?.checks[0]?.tool).toBe('recoder.browser.open_preview');
    expect(outcome.artifact?.kind).toBe('verification_summary');
  });

  it('fails (truthfully) when the preview URL is unhealthy (5xx)', async () => {
    const previewUrl = 'https://preview.recoder.xyz/published/broken';
    const ws = seedWorkspace({ previewUrl });
    globalThis.fetch = vi.fn(async () => ({ status: 503 }) as Response) as unknown as typeof fetch;

    const outcome = await runBrowserCheck(ws.workspaceId);

    expect(outcome.attempted).toBe(true);
    expect(outcome.result?.status).toBe('failed');
    expect(outcome.result?.checks[0]?.actual).toBe('503');
  });

  it('degrades to skipped when fetch throws (never crashes the run)', async () => {
    const ws = seedWorkspace({ previewUrl: 'https://preview.recoder.xyz/published/timeout' });
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const outcome = await runBrowserCheck(ws.workspaceId);

    // A fetch error is a truthful FAILED check (not an exception): attempted=true,
    // result.status=failed — the run never crashes.
    expect(outcome.attempted).toBe(true);
    expect(outcome.result?.status).toBe('failed');
    expect(outcome.result?.checks[0]?.message).toContain('unreachable');
  });
});
