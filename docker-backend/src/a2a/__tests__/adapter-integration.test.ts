/**
 * @module adapter-integration.test
 *
 * Integration tests for the unified AdapterRegistry that wraps
 * both REST and Git per-type registries into a single facade.
 *
 * P17-011: Unified Adapter Registry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../task-lifecycle.service', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}-test-id`),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  RestAdapter,
  resetRestAdapters,
  listRestAdapters,
  type RestAdapterConfig,
} from '../adapters/rest-adapter';

import {
  GitAdapter,
  resetGitAdapters,
  listGitAdapters,
  type GitAdapterConfig,
  type GitExecutor,
  type GitTaskResult,
} from '../adapters/git-adapter';

import {
  AdapterRegistry,
  getAdapterRegistry,
  resetAdapterRegistry,
  type AdapterType,
} from '../adapters/adapter-registry';

import type { RecoderAgentIdentity } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const localIdentity: RecoderAgentIdentity = {
  id: 'docker-backend',
  name: 'Docker Backend',
  platform: 'recoder_backend',
};

const targetAgent: RecoderAgentIdentity = {
  id: 'remote-agent',
  name: 'Remote Agent',
  platform: 'custom',
};

function createRestConfig(overrides?: Partial<RestAdapterConfig>): RestAdapterConfig {
  return {
    adapterId: 'rest-test',
    baseUrl: 'http://localhost:9999',
    auth: { type: 'none' },
    timeoutMs: 5_000,
    maxRetries: 1,
    retryDelayMs: 100,
    maxRetryDelayMs: 500,
    localIdentity,
    ...overrides,
  };
}

function createGitConfig(overrides?: Partial<GitAdapterConfig>): GitAdapterConfig {
  return {
    adapterId: 'git-test',
    repoPath: '/tmp/test-repo',
    auth: { type: 'none' },
    localIdentity,
    pollIntervalMs: 50,
    maxPollAttempts: 3,
    ...overrides,
  };
}

function createMockGitExecutor(): GitExecutor & {
  exec: ReturnType<typeof vi.fn>;
  readFileFromBranch: ReturnType<typeof vi.fn>;
  writeFileOnBranch: ReturnType<typeof vi.fn>;
  branchExists: ReturnType<typeof vi.fn>;
  listBranches: ReturnType<typeof vi.fn>;
} {
  return {
    exec: vi.fn(async () => ''),
    readFileFromBranch: vi.fn(async () => null),
    writeFileOnBranch: vi.fn(async () => 'abc123'),
    branchExists: vi.fn(async () => false),
    listBranches: vi.fn(async () => []),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdapterRegistry — Unified Registry Tests', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    resetRestAdapters();
    resetGitAdapters();
    resetAdapterRegistry();
    registry = getAdapterRegistry();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetAdapterRegistry();
  });

  // -----------------------------------------------------------------------
  // 1. registerAdapter('rest', ...) adds to unified list
  // -----------------------------------------------------------------------

  it('registerAdapter("rest") adds REST adapter to unified list', () => {
    const adapter = new RestAdapter(createRestConfig());
    registry.registerAdapter('rest', adapter);

    const entries = registry.listAdapters();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('rest');
    expect(entries[0].adapterId).toBe('rest-test');
    expect(entries[0].status).toBe('idle');
    expect(entries[0].registeredAt).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. registerAdapter('git', ...) adds to unified list
  // -----------------------------------------------------------------------

  it('registerAdapter("git") adds Git adapter to unified list', () => {
    const mockGit = createMockGitExecutor();
    const adapter = new GitAdapter(createGitConfig(), mockGit);
    registry.registerAdapter('git', adapter);

    const entries = registry.listAdapters();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('git');
    expect(entries[0].adapterId).toBe('git-test');
    expect(entries[0].status).toBe('idle');
  });

  // -----------------------------------------------------------------------
  // 3. listAdapters() returns both types combined
  // -----------------------------------------------------------------------

  it('listAdapters() returns both REST and Git adapters combined', () => {
    const restAdapter = new RestAdapter(createRestConfig());
    const mockGit = createMockGitExecutor();
    const gitAdapter = new GitAdapter(createGitConfig(), mockGit);

    registry.registerAdapter('rest', restAdapter);
    registry.registerAdapter('git', gitAdapter);

    const entries = registry.listAdapters();
    expect(entries).toHaveLength(2);

    const types = entries.map((e) => e.type);
    expect(types).toContain('rest');
    expect(types).toContain('git');
  });

  // -----------------------------------------------------------------------
  // 4. listAdapters('rest') returns only REST adapters
  // -----------------------------------------------------------------------

  it('listAdapters("rest") returns only REST adapters', () => {
    const restAdapter = new RestAdapter(createRestConfig());
    const mockGit = createMockGitExecutor();
    const gitAdapter = new GitAdapter(createGitConfig(), mockGit);

    registry.registerAdapter('rest', restAdapter);
    registry.registerAdapter('git', gitAdapter);

    const entries = registry.listAdapters('rest');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('rest');
    expect(entries[0].adapterId).toBe('rest-test');
  });

  // -----------------------------------------------------------------------
  // 5. listAdapters('git') returns only Git adapters
  // -----------------------------------------------------------------------

  it('listAdapters("git") returns only Git adapters', () => {
    const restAdapter = new RestAdapter(createRestConfig());
    const mockGit = createMockGitExecutor();
    const gitAdapter = new GitAdapter(createGitConfig(), mockGit);

    registry.registerAdapter('rest', restAdapter);
    registry.registerAdapter('git', gitAdapter);

    const entries = registry.listAdapters('git');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('git');
    expect(entries[0].adapterId).toBe('git-test');
  });

  // -----------------------------------------------------------------------
  // 6. getAdapter('rest', id) returns correct adapter
  // -----------------------------------------------------------------------

  it('getAdapter("rest", id) returns the correct REST adapter', () => {
    const adapter = new RestAdapter(createRestConfig());
    registry.registerAdapter('rest', adapter);

    const found = registry.getAdapter('rest', 'rest-test');
    expect(found).toBe(adapter);
    expect(found?.adapterId).toBe('rest-test');
  });

  // -----------------------------------------------------------------------
  // 7. unregisterAdapter removes from unified list
  // -----------------------------------------------------------------------

  it('unregisterAdapter removes adapter from unified list', () => {
    const adapter = new RestAdapter(createRestConfig());
    registry.registerAdapter('rest', adapter);
    expect(registry.listAdapters()).toHaveLength(1);

    const removed = registry.unregisterAdapter('rest', 'rest-test');
    expect(removed).toBe(true);
    expect(registry.listAdapters()).toHaveLength(0);
    expect(registry.getAdapter('rest', 'rest-test')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 8. getHealthSummary returns correct counts
  // -----------------------------------------------------------------------

  it('getHealthSummary returns correct aggregate counts', () => {
    const rest1 = new RestAdapter(createRestConfig({ adapterId: 'rest-1' }));
    const rest2 = new RestAdapter(createRestConfig({ adapterId: 'rest-2' }));
    const mockGit = createMockGitExecutor();
    const git1 = new GitAdapter(createGitConfig({ adapterId: 'git-1' }), mockGit);

    registry.registerAdapter('rest', rest1);
    registry.registerAdapter('rest', rest2);
    registry.registerAdapter('git', git1);

    const summary = registry.getHealthSummary();

    expect(summary.total).toBe(3);
    expect(summary.byType.rest).toBe(2);
    expect(summary.byType.git).toBe(1);
    expect(summary.byStatus['idle']).toBe(3);
    expect(summary.adapters).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // 9. Events emitted on register/unregister
  // -----------------------------------------------------------------------

  it('emits adapter:registered and adapter:unregistered events', () => {
    const registeredEvents: unknown[] = [];
    const unregisteredEvents: unknown[] = [];

    registry.on('adapter:registered', (e) => registeredEvents.push(e));
    registry.on('adapter:unregistered', (e) => unregisteredEvents.push(e));

    const adapter = new RestAdapter(createRestConfig());
    registry.registerAdapter('rest', adapter);

    expect(registeredEvents).toHaveLength(1);
    expect((registeredEvents[0] as any).type).toBe('rest');
    expect((registeredEvents[0] as any).adapterId).toBe('rest-test');
    expect((registeredEvents[0] as any).timestamp).toBeTruthy();

    registry.unregisterAdapter('rest', 'rest-test');

    expect(unregisteredEvents).toHaveLength(1);
    expect((unregisteredEvents[0] as any).type).toBe('rest');
    expect((unregisteredEvents[0] as any).adapterId).toBe('rest-test');
  });

  // -----------------------------------------------------------------------
  // 10. resetAdapterRegistry clears everything
  // -----------------------------------------------------------------------

  it('resetAdapterRegistry clears all adapters and listeners', () => {
    const adapter = new RestAdapter(createRestConfig());
    const mockGit = createMockGitExecutor();
    const gitAdapter = new GitAdapter(createGitConfig(), mockGit);

    registry.registerAdapter('rest', adapter);
    registry.registerAdapter('git', gitAdapter);

    expect(registry.listAdapters()).toHaveLength(2);

    resetAdapterRegistry();

    // Need a fresh registry after reset since instance is nulled
    const freshRegistry = getAdapterRegistry();
    expect(freshRegistry.listAdapters()).toHaveLength(0);

    // Per-type registries also cleared
    expect(listRestAdapters()).toHaveLength(0);
    expect(listGitAdapters()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-Adapter Workflow Tests
// ---------------------------------------------------------------------------

describe('AdapterRegistry — Cross-Adapter Workflow Tests', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    resetRestAdapters();
    resetGitAdapters();
    resetAdapterRegistry();
    registry = getAdapterRegistry();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetAdapterRegistry();
  });

  // -----------------------------------------------------------------------
  // 11. REST adapter full lifecycle
  // -----------------------------------------------------------------------

  it('REST adapter full lifecycle: register -> execute task -> unregister', async () => {
    const adapter = new RestAdapter(createRestConfig());
    registry.registerAdapter('rest', adapter);

    // Mock fetch for executeTask
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ result: 'Task completed' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    // Execute task through the adapter
    const result = await adapter.executeTask({
      targetAgent,
      taskId: 'task-rest-001',
      prompt: 'Fix the bug',
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);

    // Verify it's still in the registry
    expect(registry.listAdapters()).toHaveLength(1);

    // Unregister
    registry.unregisterAdapter('rest', 'rest-test');
    expect(registry.listAdapters()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 12. Git adapter full lifecycle
  // -----------------------------------------------------------------------

  it('Git adapter full lifecycle: register -> create branch -> poll -> cleanup -> unregister', async () => {
    const mockGit = createMockGitExecutor();
    const adapter = new GitAdapter(createGitConfig(), mockGit);
    registry.registerAdapter('git', adapter);

    // Create task branch
    const createResult = await adapter.createTaskBranch({
      taskId: 'task-git-001',
      targetAgent,
      prompt: 'Implement feature',
    });
    expect(createResult.success).toBe(true);
    expect(createResult.branchName).toBe('a2a/task-git-001');

    // Set up mock to return a result on the first poll
    const taskResult: GitTaskResult = {
      taskId: 'task-git-001',
      status: 'completed',
      resultText: 'Feature implemented',
      completedAt: new Date().toISOString(),
    };
    mockGit.readFileFromBranch.mockResolvedValueOnce(JSON.stringify(taskResult));

    // Poll for result
    const pollResult = await adapter.pollTaskResult('task-git-001');
    expect(pollResult.found).toBe(true);
    expect(pollResult.result?.status).toBe('completed');

    // Cleanup branch
    const cleaned = await adapter.cleanupTaskBranch('task-git-001');
    expect(cleaned).toBe(true);

    // Unregister
    registry.unregisterAdapter('git', 'git-test');
    expect(registry.listAdapters()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 13. Both adapters registered simultaneously
  // -----------------------------------------------------------------------

  it('both adapter types registered simultaneously without interference', async () => {
    const restAdapter = new RestAdapter(createRestConfig());
    const mockGit = createMockGitExecutor();
    const gitAdapter = new GitAdapter(createGitConfig(), mockGit);

    registry.registerAdapter('rest', restAdapter);
    registry.registerAdapter('git', gitAdapter);

    // REST operation (mock fetch)
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ result: 'ok' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const restResult = await restAdapter.executeTask({
      targetAgent,
      taskId: 'task-rest-002',
      prompt: 'REST task',
    });
    expect(restResult.success).toBe(true);

    // Git operation
    const gitCreateResult = await gitAdapter.createTaskBranch({
      taskId: 'task-git-002',
      targetAgent,
      prompt: 'Git task',
    });
    expect(gitCreateResult.success).toBe(true);

    // Both still in registry
    const allAdapters = registry.listAdapters();
    expect(allAdapters).toHaveLength(2);

    // Unregister REST doesn't affect Git
    registry.unregisterAdapter('rest', 'rest-test');
    expect(registry.listAdapters()).toHaveLength(1);
    expect(registry.listAdapters('git')).toHaveLength(1);
    expect(registry.getAdapter('git', 'git-test')).toBe(gitAdapter);
  });

  // -----------------------------------------------------------------------
  // 14. Register multiple REST adapters
  // -----------------------------------------------------------------------

  it('registers multiple REST adapters, list shows all', () => {
    const rest1 = new RestAdapter(createRestConfig({ adapterId: 'rest-alpha' }));
    const rest2 = new RestAdapter(createRestConfig({ adapterId: 'rest-beta' }));
    const rest3 = new RestAdapter(createRestConfig({ adapterId: 'rest-gamma' }));

    registry.registerAdapter('rest', rest1);
    registry.registerAdapter('rest', rest2);
    registry.registerAdapter('rest', rest3);

    const entries = registry.listAdapters('rest');
    expect(entries).toHaveLength(3);

    const ids = entries.map((e) => e.adapterId).sort();
    expect(ids).toEqual(['rest-alpha', 'rest-beta', 'rest-gamma']);
  });

  // -----------------------------------------------------------------------
  // 15. Register multiple Git adapters
  // -----------------------------------------------------------------------

  it('registers multiple Git adapters, list shows all', () => {
    const mockGit = createMockGitExecutor();
    const git1 = new GitAdapter(createGitConfig({ adapterId: 'git-alpha' }), mockGit);
    const git2 = new GitAdapter(createGitConfig({ adapterId: 'git-beta' }), mockGit);
    const git3 = new GitAdapter(createGitConfig({ adapterId: 'git-gamma' }), mockGit);

    registry.registerAdapter('git', git1);
    registry.registerAdapter('git', git2);
    registry.registerAdapter('git', git3);

    const entries = registry.listAdapters('git');
    expect(entries).toHaveLength(3);

    const ids = entries.map((e) => e.adapterId).sort();
    expect(ids).toEqual(['git-alpha', 'git-beta', 'git-gamma']);
  });

  // -----------------------------------------------------------------------
  // 16. Health summary with mixed adapter statuses
  // -----------------------------------------------------------------------

  it('getHealthSummary reflects mixed statuses', async () => {
    // REST adapter — will become 'active' after a successful health check
    const rest1 = new RestAdapter(createRestConfig({ adapterId: 'rest-healthy' }));
    const mockHealthyResponse = {
      ok: true,
      status: 200,
      headers: new Headers(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockHealthyResponse as Response);
    await rest1.checkHealth(); // sets status to 'active'

    // REST adapter — stays 'idle'
    const rest2 = new RestAdapter(createRestConfig({ adapterId: 'rest-idle' }));

    // Git adapter — will become 'error' after a failed branch creation
    const mockGit = createMockGitExecutor();
    mockGit.exec.mockRejectedValueOnce(new Error('fatal'));
    const git1 = new GitAdapter(createGitConfig({ adapterId: 'git-error' }), mockGit);
    git1.on('error', () => {}); // suppress
    await git1.createTaskBranch({ taskId: 't1', targetAgent, prompt: 'fail' });

    registry.registerAdapter('rest', rest1);
    registry.registerAdapter('rest', rest2);
    registry.registerAdapter('git', git1);

    const summary = registry.getHealthSummary();

    expect(summary.total).toBe(3);
    expect(summary.byType.rest).toBe(2);
    expect(summary.byType.git).toBe(1);
    expect(summary.byStatus['active']).toBe(1);
    expect(summary.byStatus['idle']).toBe(1);
    expect(summary.byStatus['error']).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 17. Unregister one doesn't affect others
  // -----------------------------------------------------------------------

  it('unregistering one adapter does not affect others', () => {
    const rest1 = new RestAdapter(createRestConfig({ adapterId: 'rest-a' }));
    const rest2 = new RestAdapter(createRestConfig({ adapterId: 'rest-b' }));
    const mockGit = createMockGitExecutor();
    const git1 = new GitAdapter(createGitConfig({ adapterId: 'git-a' }), mockGit);

    registry.registerAdapter('rest', rest1);
    registry.registerAdapter('rest', rest2);
    registry.registerAdapter('git', git1);

    expect(registry.listAdapters()).toHaveLength(3);

    // Remove rest-a
    registry.unregisterAdapter('rest', 'rest-a');

    expect(registry.listAdapters()).toHaveLength(2);
    expect(registry.getAdapter('rest', 'rest-a')).toBeUndefined();
    expect(registry.getAdapter('rest', 'rest-b')).toBe(rest2);
    expect(registry.getAdapter('git', 'git-a')).toBe(git1);
  });

  // -----------------------------------------------------------------------
  // 18. getAdapter for Git type returns correct adapter
  // -----------------------------------------------------------------------

  it('getAdapter("git", id) returns the correct Git adapter', () => {
    const mockGit = createMockGitExecutor();
    const adapter = new GitAdapter(createGitConfig({ adapterId: 'git-lookup' }), mockGit);
    registry.registerAdapter('git', adapter);

    const found = registry.getAdapter('git', 'git-lookup');
    expect(found).toBe(adapter);
    expect(found?.adapterId).toBe('git-lookup');

    // Non-existent ID returns undefined
    expect(registry.getAdapter('git', 'nonexistent')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 19. Singleton pattern works correctly
  // -----------------------------------------------------------------------

  it('getAdapterRegistry returns same singleton instance', () => {
    const r1 = getAdapterRegistry();
    const r2 = getAdapterRegistry();
    expect(r1).toBe(r2);
  });

  // -----------------------------------------------------------------------
  // 20. Per-type registries stay in sync with unified registry
  // -----------------------------------------------------------------------

  it('per-type registries stay in sync after unified operations', () => {
    const restAdapter = new RestAdapter(createRestConfig({ adapterId: 'sync-rest' }));
    const mockGit = createMockGitExecutor();
    const gitAdapter = new GitAdapter(createGitConfig({ adapterId: 'sync-git' }), mockGit);

    registry.registerAdapter('rest', restAdapter);
    registry.registerAdapter('git', gitAdapter);

    // Per-type registries should have the adapters
    expect(listRestAdapters()).toHaveLength(1);
    expect(listGitAdapters()).toHaveLength(1);

    // Unregister from unified
    registry.unregisterAdapter('rest', 'sync-rest');

    // Per-type REST registry should also be updated
    expect(listRestAdapters()).toHaveLength(0);
    // Git should be unaffected
    expect(listGitAdapters()).toHaveLength(1);
  });
});
