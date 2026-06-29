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

/**
 * Tests for the OPTIONAL lazy `@recoder/browser-tools` (Playwright) page-check path.
 *
 * The real preview-render branch only activates when BOTH `playwright` and
 * `@recoder/browser-tools` load (the genuine dynamic `import()` inside
 * `loadBrowserDriver`) AND a Chromium page actually renders. We exercise that branch
 * by mocking those two MODULES (so the real lazy-import seam runs, but no real
 * browser is ever launched). We assert:
 *   - when the driver renders a document, the check uses the stronger browser signal
 *     (engine: 'playwright') and `fetch` is NEVER called;
 *   - when the driver is unavailable (import throws -> null) or its launch throws, we
 *     transparently fall back to the dependency-light `fetch` reachability probe.
 *
 * `loadBrowserDriver` is verified directly so the lazy-import contract is pinned.
 */

// Controllable fakes for the dynamically-imported optional packages. The factories
// must reference only hoist-safe mutable holders (vi.mock is hoisted above imports).
const rbtMock = vi.hoisted(() => ({
  launch: undefined as undefined | ((opts?: { headless?: boolean }) => Promise<unknown>),
  navigateTo: undefined as undefined | ((url: string, options: { page: unknown }) => Promise<unknown>),
  importThrows: false,
}));

// Factories are evaluated/cached once, so the "import fails" state is modeled at
// ACCESS time via getters that read the live `rbtMock.importThrows` holder.
vi.mock('playwright', () => ({
  get chromium() {
    if (rbtMock.importThrows) throw new Error('Cannot find module playwright');
    return { launch: (opts?: { headless?: boolean }) => rbtMock.launch!(opts) };
  },
}));

vi.mock('@recoder/browser-tools', () => ({
  get navigateTo() {
    if (rbtMock.importThrows) throw new Error('Cannot find module @recoder/browser-tools');
    return (url: string, options: { page: unknown }) => rbtMock.navigateTo!(url, options);
  },
}));

describe('runBrowserCheck — lazy @recoder/browser-tools (Playwright) path', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    rbtMock.importThrows = false;
    rbtMock.launch = undefined;
    rbtMock.navigateTo = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loadBrowserDriver resolves the lazy seam (real dynamic import, mocked modules)', async () => {
    const { loadBrowserDriver } = await import('./browser-check.js');
    rbtMock.launch = vi.fn(async () => ({}));
    rbtMock.navigateTo = vi.fn(async () => ({ url: 'x', title: 'x' }));

    const driver = await loadBrowserDriver();
    expect(driver).not.toBeNull();
    expect(typeof driver?.chromium.launch).toBe('function');
    expect(typeof driver?.navigateTo).toBe('function');
  });

  it('loadBrowserDriver returns null (never throws) when an optional package import fails', async () => {
    const { loadBrowserDriver } = await import('./browser-check.js');
    rbtMock.importThrows = true;

    await expect(loadBrowserDriver()).resolves.toBeNull();
  });

  it('uses the real browser render when the lazy driver is available (no fetch)', async () => {
    const previewUrl = 'https://preview.recoder.xyz/published/rendered';
    const ws = seedWorkspace({ previewUrl });

    const close = vi.fn(async () => {});
    const newPage = vi.fn(async () => ({}) as unknown);
    rbtMock.launch = vi.fn(async () => ({ newPage, close }));
    rbtMock.navigateTo = vi.fn(async (url: string) => ({ url, title: 'Demo App' }));

    // If the browser path is taken correctly, fetch must never be touched.
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { runBrowserCheck: run } = await import('./browser-check.js');
    const outcome = await run(ws.workspaceId);

    expect(rbtMock.launch).toHaveBeenCalledOnce();
    expect(rbtMock.navigateTo).toHaveBeenCalledWith(
      previewUrl,
      expect.objectContaining({ page: expect.anything() }),
    );
    expect(close).toHaveBeenCalledOnce(); // browser is always torn down
    expect(fetchSpy).not.toHaveBeenCalled(); // never fell back to the probe

    expect(outcome.attempted).toBe(true);
    expect(outcome.result?.status).toBe('passed');
    const check = outcome.result?.checks[0];
    expect(check?.tool).toBe('recoder.browser.open_preview');
    expect(check?.metadata?.engine).toBe('playwright');
    expect(check?.actual).toBe('Demo App');
    expect(outcome.artifact?.kind).toBe('verification_summary');
  });

  it('falls back to the fetch probe when the lazy driver is unavailable (import fails)', async () => {
    const previewUrl = 'https://preview.recoder.xyz/published/no-playwright';
    const ws = seedWorkspace({ previewUrl });
    rbtMock.importThrows = true;

    const fetchSpy = vi.fn(async () => ({ status: 200 }) as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { runBrowserCheck: run } = await import('./browser-check.js');
    const outcome = await run(ws.workspaceId);

    expect(fetchSpy).toHaveBeenCalledOnce(); // fell back to reachability probe
    expect(outcome.attempted).toBe(true);
    expect(outcome.result?.status).toBe('passed');
    expect(outcome.result?.checks[0]?.metadata?.httpStatus).toBe(200);
    expect(outcome.result?.checks[0]?.metadata?.engine).toBeUndefined();
  });

  it('falls back to the fetch probe when the browser launch throws', async () => {
    const previewUrl = 'https://preview.recoder.xyz/published/launch-fails';
    const ws = seedWorkspace({ previewUrl });

    rbtMock.launch = vi.fn(async () => {
      throw new Error("Executable doesn't exist");
    });
    rbtMock.navigateTo = vi.fn();

    const fetchSpy = vi.fn(async () => ({ status: 200 }) as Response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { runBrowserCheck: run } = await import('./browser-check.js');
    const outcome = await run(ws.workspaceId);

    expect(rbtMock.launch).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledOnce(); // launch failure => fetch fallback
    expect(outcome.attempted).toBe(true);
    expect(outcome.result?.status).toBe('passed');
    expect(outcome.result?.checks[0]?.metadata?.engine).toBeUndefined();
  });
});
