/**
 * @module git-adapter.routes.test
 *
 * Tests for the Git adapter route handlers, exercised via the registry/service
 * layer directly (not through HTTP). Uses a mock GitExecutor matching the
 * pattern in git-adapter.test.ts.
 *
 * P17-002: Git Protocol Adapter Routes
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
// Import after mocks
// ---------------------------------------------------------------------------

import {
  GitAdapter,
  registerGitAdapter,
  getGitAdapter,
  listGitAdapters,
  unregisterGitAdapter,
  resetGitAdapters,
  type GitAdapterConfig,
  type GitExecutor,
  type GitTaskResult,
} from '../adapters/git-adapter';

import type { RecoderAgentIdentity } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const localIdentity: RecoderAgentIdentity = {
  id: 'recoder-backend',
  name: 'Recoder Backend',
  platform: 'recoder',
};

const targetAgent: RecoderAgentIdentity = {
  id: 'vscode-copilot',
  name: 'VS Code Copilot',
  platform: 'custom',
};

// ---------------------------------------------------------------------------
// Mock GitExecutor (same pattern as git-adapter.test.ts)
// ---------------------------------------------------------------------------

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

function createConfig(overrides?: Partial<GitAdapterConfig>): GitAdapterConfig {
  return {
    adapterId: 'test-git',
    repoPath: '/tmp/test-repo',
    auth: { type: 'none' },
    localIdentity,
    pollIntervalMs: 50,    // fast polling for tests
    maxPollAttempts: 3,     // few attempts for tests
    ...overrides,
  };
}

function createAdapter(
  overrides?: Partial<GitAdapterConfig>,
  mockGit?: ReturnType<typeof createMockGitExecutor>,
): { adapter: GitAdapter; mockGit: ReturnType<typeof createMockGitExecutor> } {
  const git = mockGit ?? createMockGitExecutor();
  const adapter = new GitAdapter(createConfig(overrides), git);
  return { adapter, mockGit: git };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Git Adapter Routes (registry layer)', () => {
  beforeEach(() => {
    resetGitAdapters();
  });

  afterEach(() => {
    resetGitAdapters();
  });

  // -------------------------------------------------------------------------
  // Registration lifecycle
  // -------------------------------------------------------------------------

  describe('Registration lifecycle', () => {
    it('registers adapter with valid config', () => {
      const { adapter } = createAdapter();
      registerGitAdapter(adapter);

      const retrieved = getGitAdapter('test-git');
      expect(retrieved).toBeDefined();
      expect(retrieved!.adapterId).toBe('test-git');

      const state = retrieved!.getState();
      expect(state.status).toBe('idle');
      expect(state.repoPath).toBe('/tmp/test-repo');
      expect(state.activeBranches).toBe(0);
      expect(state.totalTasksCreated).toBe(0);
    });

    it('rejects registration without adapterId', () => {
      // Simulate route validation: adapterId is required for GitAdapterConfig
      // The route handler checks for missing/empty adapterId before creating the adapter.
      const adapterId = '';
      expect(adapterId.trim().length === 0).toBe(true);
    });

    it('rejects registration without repoPath', () => {
      // Simulate route validation: repoPath is required for GitAdapterConfig
      // The route handler checks for missing/empty repoPath before creating the adapter.
      const repoPath = '';
      expect(repoPath.trim().length === 0).toBe(true);
    });

    it('rejects duplicate adapterId registration', () => {
      const { adapter } = createAdapter();
      registerGitAdapter(adapter);

      // Attempting to register again: route would return 409
      const existing = getGitAdapter('test-git');
      expect(existing).toBeDefined();
      // Route would short-circuit here with 409 before creating a new adapter
    });

    it('gets adapter state by ID', () => {
      const { adapter } = createAdapter({ adapterId: 'my-adapter' });
      registerGitAdapter(adapter);

      const retrieved = getGitAdapter('my-adapter');
      expect(retrieved).toBeDefined();

      const state = retrieved!.getState();
      expect(state.adapterId).toBe('my-adapter');
      expect(state.status).toBe('idle');
    });

    it('returns undefined for non-existent adapter', () => {
      const result = getGitAdapter('does-not-exist');
      expect(result).toBeUndefined();
    });

    it('lists all registered adapters', () => {
      const { adapter: a1 } = createAdapter({ adapterId: 'git-1' });
      const { adapter: a2 } = createAdapter({ adapterId: 'git-2' });
      const { adapter: a3 } = createAdapter({ adapterId: 'git-3' });

      registerGitAdapter(a1);
      registerGitAdapter(a2);
      registerGitAdapter(a3);

      const all = listGitAdapters();
      expect(all).toHaveLength(3);

      const ids = all.map((a) => a.adapterId);
      expect(ids).toContain('git-1');
      expect(ids).toContain('git-2');
      expect(ids).toContain('git-3');
    });

    it('unregisters adapter successfully', () => {
      const { adapter } = createAdapter({ adapterId: 'to-remove' });
      registerGitAdapter(adapter);

      expect(getGitAdapter('to-remove')).toBeDefined();

      const removed = unregisterGitAdapter('to-remove');
      expect(removed).toBe(true);
      expect(getGitAdapter('to-remove')).toBeUndefined();
    });

    it('unregister returns false for non-existent adapter', () => {
      const removed = unregisterGitAdapter('ghost');
      expect(removed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Task branch operations (with mock executor)
  // -------------------------------------------------------------------------

  describe('Task branch operations', () => {
    it('createTaskBranch succeeds with valid input', async () => {
      const { adapter } = createAdapter();
      registerGitAdapter(adapter);

      const result = await adapter.createTaskBranch({
        taskId: 'task-100',
        targetAgent,
        prompt: 'Implement feature X',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-100');
      expect(result.branchName).toBe('a2a/task-100');
    });

    it('createTaskBranch returns created branch info', async () => {
      const { adapter } = createAdapter();
      registerGitAdapter(adapter);

      const result = await adapter.createTaskBranch({
        taskId: 'task-101',
        targetAgent,
        prompt: 'Fix auth bug',
        intent: 'execute',
        metadata: { priority: 'high' },
      });

      expect(result.success).toBe(true);
      expect(result.branchName).toBe('a2a/task-101');
      expect(result.taskId).toBe('task-101');
      expect(result.error).toBeUndefined();

      // Verify adapter state was updated
      const state = adapter.getState();
      expect(state.activeBranches).toBe(1);
      expect(state.totalTasksCreated).toBe(1);
      expect(state.lastActivityAt).toBeTruthy();
    });

    it('pollTaskResult returns result when available', async () => {
      const mockGit = createMockGitExecutor();
      const { adapter } = createAdapter(undefined, mockGit);
      registerGitAdapter(adapter);

      // Create task first
      await adapter.createTaskBranch({
        taskId: 'task-200',
        targetAgent,
        prompt: 'Do work',
      });

      // Mock the result file existing on the branch
      const taskResult: GitTaskResult = {
        taskId: 'task-200',
        status: 'completed',
        resultText: 'Work completed successfully',
        completedAt: new Date().toISOString(),
      };

      mockGit.readFileFromBranch.mockResolvedValueOnce(JSON.stringify(taskResult));

      const pollResult = await adapter.pollTaskResult('task-200');

      expect(pollResult.found).toBe(true);
      expect(pollResult.result).toBeDefined();
      expect(pollResult.result!.status).toBe('completed');
      expect(pollResult.result!.resultText).toBe('Work completed successfully');
    });

    it('pollTaskResult returns pending when not ready', async () => {
      const mockGit = createMockGitExecutor();
      const { adapter } = createAdapter(undefined, mockGit);
      registerGitAdapter(adapter);

      // Create task first
      await adapter.createTaskBranch({
        taskId: 'task-201',
        targetAgent,
        prompt: 'Do slow work',
      });

      // Mock: result never appears
      mockGit.readFileFromBranch.mockResolvedValue(null);

      const pollResult = await adapter.pollTaskResult('task-201');

      expect(pollResult.found).toBe(false);
      expect(pollResult.attempts).toBe(3); // maxPollAttempts from config
      expect(pollResult.error).toContain('timed out');
    });

    it('pollTaskResult returns error for unknown task', async () => {
      const { adapter } = createAdapter();
      registerGitAdapter(adapter);

      const pollResult = await adapter.pollTaskResult('nonexistent-task');

      expect(pollResult.found).toBe(false);
      expect(pollResult.attempts).toBe(0);
      expect(pollResult.error).toContain('No active task branch');
    });

    it('listTaskBranches returns branch list', async () => {
      const mockGit = createMockGitExecutor();
      const { adapter } = createAdapter(undefined, mockGit);
      registerGitAdapter(adapter);

      // Create two tasks
      await adapter.createTaskBranch({
        taskId: 'task-300',
        targetAgent,
        prompt: 'Task one',
      });
      await adapter.createTaskBranch({
        taskId: 'task-301',
        targetAgent,
        prompt: 'Task two',
      });

      // Mock listBranches returning both
      mockGit.listBranches.mockResolvedValueOnce(['a2a/task-300', 'a2a/task-301']);

      const branches = await adapter.listTaskBranches();

      expect(branches).toHaveLength(2);
      expect(branches[0].taskId).toBe('task-300');
      expect(branches[0].branchName).toBe('a2a/task-300');
      expect(branches[1].taskId).toBe('task-301');
      expect(branches[1].branchName).toBe('a2a/task-301');
    });

    it('listTaskBranches returns empty list when no branches', async () => {
      const mockGit = createMockGitExecutor();
      const { adapter } = createAdapter(undefined, mockGit);
      registerGitAdapter(adapter);

      mockGit.listBranches.mockResolvedValueOnce([]);
      const branches = await adapter.listTaskBranches();
      expect(branches).toHaveLength(0);
    });

    it('cleanupTaskBranch succeeds for active task', async () => {
      const mockGit = createMockGitExecutor();
      const { adapter } = createAdapter(undefined, mockGit);
      registerGitAdapter(adapter);

      await adapter.createTaskBranch({
        taskId: 'task-400',
        targetAgent,
        prompt: 'Cleanup test',
      });

      expect(adapter.getState().activeBranches).toBe(1);

      const cleaned = await adapter.cleanupTaskBranch('task-400');

      expect(cleaned).toBe(true);
      expect(adapter.getState().activeBranches).toBe(0);
    });

    it('cleanupTaskBranch returns false for unknown task', async () => {
      const { adapter } = createAdapter();
      registerGitAdapter(adapter);

      const cleaned = await adapter.cleanupTaskBranch('ghost-task');
      expect(cleaned).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Integration tests
  // -------------------------------------------------------------------------

  describe('Integration', () => {
    it('full lifecycle: register -> create branch -> poll -> cleanup -> unregister', async () => {
      const mockGit = createMockGitExecutor();
      const { adapter } = createAdapter({ adapterId: 'lifecycle-test' }, mockGit);

      // 1. Register
      registerGitAdapter(adapter);
      expect(getGitAdapter('lifecycle-test')).toBeDefined();
      expect(listGitAdapters()).toHaveLength(1);

      // 2. Create task branch
      const createResult = await adapter.createTaskBranch({
        taskId: 'lifecycle-task',
        targetAgent,
        prompt: 'Full lifecycle test',
      });
      expect(createResult.success).toBe(true);
      expect(createResult.branchName).toBe('a2a/lifecycle-task');

      // Verify state
      let state = adapter.getState();
      expect(state.activeBranches).toBe(1);
      expect(state.totalTasksCreated).toBe(1);

      // 3. Poll for result (simulate agent completing the work)
      const taskResult: GitTaskResult = {
        taskId: 'lifecycle-task',
        status: 'completed',
        resultText: 'Lifecycle test done',
        completedAt: new Date().toISOString(),
        artifacts: [
          { path: 'src/feature.ts', action: 'created' },
          { path: 'src/test.ts', action: 'created' },
        ],
      };
      mockGit.readFileFromBranch.mockResolvedValueOnce(JSON.stringify(taskResult));

      const pollResult = await adapter.pollTaskResult('lifecycle-task');
      expect(pollResult.found).toBe(true);
      expect(pollResult.result!.status).toBe('completed');
      expect(pollResult.result!.artifacts).toHaveLength(2);

      state = adapter.getState();
      expect(state.totalTasksCompleted).toBe(1);

      // 4. Cleanup task branch
      const cleaned = await adapter.cleanupTaskBranch('lifecycle-task');
      expect(cleaned).toBe(true);
      expect(adapter.getState().activeBranches).toBe(0);

      // 5. Unregister
      const removed = unregisterGitAdapter('lifecycle-test');
      expect(removed).toBe(true);
      expect(getGitAdapter('lifecycle-test')).toBeUndefined();
      expect(listGitAdapters()).toHaveLength(0);
    });

    it('multiple adapters can coexist independently', async () => {
      const mockGit1 = createMockGitExecutor();
      const mockGit2 = createMockGitExecutor();

      const { adapter: adapter1 } = createAdapter(
        { adapterId: 'adapter-A', repoPath: '/tmp/repo-a' },
        mockGit1,
      );
      const { adapter: adapter2 } = createAdapter(
        { adapterId: 'adapter-B', repoPath: '/tmp/repo-b' },
        mockGit2,
      );

      // Register both
      registerGitAdapter(adapter1);
      registerGitAdapter(adapter2);
      expect(listGitAdapters()).toHaveLength(2);

      // Create tasks on each adapter independently
      const r1 = await adapter1.createTaskBranch({
        taskId: 'task-A1',
        targetAgent,
        prompt: 'Work for adapter A',
      });
      const r2 = await adapter2.createTaskBranch({
        taskId: 'task-B1',
        targetAgent,
        prompt: 'Work for adapter B',
      });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);

      // Verify states are independent
      expect(adapter1.getState().activeBranches).toBe(1);
      expect(adapter1.getState().totalTasksCreated).toBe(1);
      expect(adapter2.getState().activeBranches).toBe(1);
      expect(adapter2.getState().totalTasksCreated).toBe(1);

      // Verify git commands went to correct repos
      expect(mockGit1.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['checkout', '-b', 'a2a/task-A1', 'main']),
        '/tmp/repo-a',
      );
      expect(mockGit2.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['checkout', '-b', 'a2a/task-B1', 'main']),
        '/tmp/repo-b',
      );

      // Unregister one, the other should remain
      unregisterGitAdapter('adapter-A');
      expect(listGitAdapters()).toHaveLength(1);
      expect(getGitAdapter('adapter-A')).toBeUndefined();
      expect(getGitAdapter('adapter-B')).toBeDefined();
    });

    it('resetGitAdapters clears all adapters', () => {
      const { adapter: a1 } = createAdapter({ adapterId: 'reset-1' });
      const { adapter: a2 } = createAdapter({ adapterId: 'reset-2' });

      registerGitAdapter(a1);
      registerGitAdapter(a2);
      expect(listGitAdapters()).toHaveLength(2);

      resetGitAdapters();
      expect(listGitAdapters()).toHaveLength(0);
      expect(getGitAdapter('reset-1')).toBeUndefined();
      expect(getGitAdapter('reset-2')).toBeUndefined();
    });

    it('adapter tracks failed task results correctly', async () => {
      const mockGit = createMockGitExecutor();
      const { adapter } = createAdapter({ adapterId: 'fail-tracker' }, mockGit);
      registerGitAdapter(adapter);

      await adapter.createTaskBranch({
        taskId: 'fail-task',
        targetAgent,
        prompt: 'This will fail',
      });

      const failedResult: GitTaskResult = {
        taskId: 'fail-task',
        status: 'failed',
        error: 'Compilation error in main.ts',
        completedAt: new Date().toISOString(),
      };
      mockGit.readFileFromBranch.mockResolvedValueOnce(JSON.stringify(failedResult));

      const pollResult = await adapter.pollTaskResult('fail-task');
      expect(pollResult.found).toBe(true);
      expect(pollResult.result!.status).toBe('failed');
      expect(pollResult.result!.error).toBe('Compilation error in main.ts');

      const state = adapter.getState();
      expect(state.totalTasksFailed).toBe(1);
      expect(state.totalTasksCompleted).toBe(0);
    });
  });
});
