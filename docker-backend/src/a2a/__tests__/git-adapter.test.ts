/**
 * @module git-adapter.test
 *
 * Tests for the Git protocol adapter.
 * P17-002: Git Protocol Adapter
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
  id: 'docker-backend',
  name: 'Docker Backend',
  platform: 'recoder_backend',
};

const targetAgent: RecoderAgentIdentity = {
  id: 'vscode-copilot',
  name: 'VS Code Copilot',
  platform: 'custom',
};

// ---------------------------------------------------------------------------
// Mock GitExecutor
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
    pollIntervalMs: 50,   // fast polling for tests
    maxPollAttempts: 3,    // few attempts for tests
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitAdapter', () => {
  let adapter: GitAdapter;
  let mockGit: ReturnType<typeof createMockGitExecutor>;

  beforeEach(() => {
    resetGitAdapters();
    mockGit = createMockGitExecutor();
    adapter = new GitAdapter(createConfig(), mockGit);
  });

  afterEach(() => {
    resetGitAdapters();
  });

  // -----------------------------------------------------------------------
  // Construction and state
  // -----------------------------------------------------------------------

  it('creates adapter with correct initial state', () => {
    const state = adapter.getState();
    expect(state.adapterId).toBe('test-git');
    expect(state.status).toBe('idle');
    expect(state.repoPath).toBe('/tmp/test-repo');
    expect(state.activeBranches).toBe(0);
    expect(state.totalTasksCreated).toBe(0);
    expect(state.totalTasksCompleted).toBe(0);
    expect(state.totalTasksFailed).toBe(0);
    expect(state.lastActivityAt).toBeNull();
  });

  it('exposes adapterId and status', () => {
    expect(adapter.adapterId).toBe('test-git');
    expect(adapter.status).toBe('idle');
  });

  // -----------------------------------------------------------------------
  // createTaskBranch
  // -----------------------------------------------------------------------

  it('creates task branch with correct git operations', async () => {
    const result = await adapter.createTaskBranch({
      taskId: 'task-001',
      targetAgent,
      prompt: 'Fix the bug in auth module',
    });

    expect(result.success).toBe(true);
    expect(result.branchName).toBe('a2a/task-001');
    expect(result.taskId).toBe('task-001');

    // Should have created branch from main
    expect(mockGit.exec).toHaveBeenCalledWith(
      ['checkout', '-b', 'a2a/task-001', 'main'],
      '/tmp/test-repo',
    );

    // Should have written task.json
    expect(mockGit.writeFileOnBranch).toHaveBeenCalledWith(
      'a2a/task-001',
      '.a2a/task.json',
      expect.any(String),
      'a2a: create task task-001',
      '/tmp/test-repo',
    );

    // Verify task descriptor content
    const descriptorJson = mockGit.writeFileOnBranch.mock.calls[0][2];
    const descriptor = JSON.parse(descriptorJson);
    expect(descriptor.taskId).toBe('task-001');
    expect(descriptor.status).toBe('pending');
    expect(descriptor.envelope.from).toEqual(localIdentity);
    expect(descriptor.envelope.to).toEqual(targetAgent);
    expect(descriptor.envelope.payload[0].text).toBe('Fix the bug in auth module');

    // State should update
    const state = adapter.getState();
    expect(state.activeBranches).toBe(1);
    expect(state.totalTasksCreated).toBe(1);
    expect(state.lastActivityAt).toBeTruthy();
  });

  it('creates branch with custom intent', async () => {
    const result = await adapter.createTaskBranch({
      taskId: 'task-002',
      targetAgent,
      prompt: 'Review the PR',
      intent: 'review',
    });

    expect(result.success).toBe(true);
    const descriptorJson = mockGit.writeFileOnBranch.mock.calls[0][2];
    const descriptor = JSON.parse(descriptorJson);
    expect(descriptor.envelope.intent).toBe('review');
  });

  it('returns failure when git operation fails', async () => {
    mockGit.exec.mockRejectedValueOnce(new Error('fatal: not a git repository'));
    adapter.on('error', () => {}); // suppress unhandled error

    const result = await adapter.createTaskBranch({
      taskId: 'task-003',
      targetAgent,
      prompt: 'Do something',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not a git repository');
    expect(adapter.status).toBe('error');
  });

  it('emits task.branch-created event', async () => {
    const events: unknown[] = [];
    adapter.on('task.branch-created', (e) => events.push(e));

    await adapter.createTaskBranch({
      taskId: 'task-004',
      targetAgent,
      prompt: 'test',
    });

    expect(events).toHaveLength(1);
    expect((events[0] as any).branchName).toBe('a2a/task-004');
  });

  it('emits error event on failure', async () => {
    mockGit.exec.mockRejectedValueOnce(new Error('git error'));
    const errors: unknown[] = [];
    adapter.on('error', (e) => errors.push(e));

    await adapter.createTaskBranch({
      taskId: 'task-005',
      targetAgent,
      prompt: 'test',
    });

    expect(errors).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // pollTaskResult
  // -----------------------------------------------------------------------

  it('polls and finds task result', async () => {
    // First create the task branch
    await adapter.createTaskBranch({
      taskId: 'task-010',
      targetAgent,
      prompt: 'Fix it',
    });

    // Set up mock to return result.json on second poll
    const taskResult: GitTaskResult = {
      taskId: 'task-010',
      status: 'completed',
      resultText: 'Bug fixed!',
      completedAt: new Date().toISOString(),
    };

    mockGit.readFileFromBranch
      .mockResolvedValueOnce(null) // first poll: no result
      .mockResolvedValueOnce(JSON.stringify(taskResult)); // second poll: found

    const pollResult = await adapter.pollTaskResult('task-010');

    expect(pollResult.found).toBe(true);
    expect(pollResult.result?.status).toBe('completed');
    expect(pollResult.result?.resultText).toBe('Bug fixed!');
    expect(pollResult.attempts).toBe(2);

    // State should update
    const state = adapter.getState();
    expect(state.totalTasksCompleted).toBe(1);
  });

  it('poll timeout when no result found', async () => {
    await adapter.createTaskBranch({
      taskId: 'task-011',
      targetAgent,
      prompt: 'Do work',
    });

    // Never return a result
    mockGit.readFileFromBranch.mockResolvedValue(null);

    const events: unknown[] = [];
    adapter.on('task.poll-timeout', (e) => events.push(e));

    const pollResult = await adapter.pollTaskResult('task-011');

    expect(pollResult.found).toBe(false);
    expect(pollResult.attempts).toBe(3); // maxPollAttempts = 3
    expect(pollResult.error).toContain('timed out');
    expect(events).toHaveLength(1);
  });

  it('returns error for unknown task', async () => {
    const pollResult = await adapter.pollTaskResult('unknown-task');
    expect(pollResult.found).toBe(false);
    expect(pollResult.error).toContain('No active task branch');
  });

  it('handles failed task result', async () => {
    await adapter.createTaskBranch({
      taskId: 'task-012',
      targetAgent,
      prompt: 'Try this',
    });

    const failedResult: GitTaskResult = {
      taskId: 'task-012',
      status: 'failed',
      error: 'Compilation error',
      completedAt: new Date().toISOString(),
    };

    mockGit.readFileFromBranch.mockResolvedValueOnce(JSON.stringify(failedResult));

    const pollResult = await adapter.pollTaskResult('task-012');

    expect(pollResult.found).toBe(true);
    expect(pollResult.result?.status).toBe('failed');
    expect(adapter.getState().totalTasksFailed).toBe(1);
  });

  it('emits task.result-detected event', async () => {
    await adapter.createTaskBranch({
      taskId: 'task-013',
      targetAgent,
      prompt: 'work',
    });

    const taskResult: GitTaskResult = {
      taskId: 'task-013',
      status: 'completed',
      resultText: 'Done',
      completedAt: new Date().toISOString(),
    };

    mockGit.readFileFromBranch.mockResolvedValueOnce(JSON.stringify(taskResult));

    const events: unknown[] = [];
    adapter.on('task.result-detected', (e) => events.push(e));

    await adapter.pollTaskResult('task-013');

    expect(events).toHaveLength(1);
    expect((events[0] as any).taskId).toBe('task-013');
  });

  // -----------------------------------------------------------------------
  // listTaskBranches
  // -----------------------------------------------------------------------

  it('lists task branches from git', async () => {
    // Create one active task
    await adapter.createTaskBranch({
      taskId: 'task-020',
      targetAgent,
      prompt: 'test',
    });

    // Mock listing returns our active branch + an unknown one
    mockGit.listBranches.mockResolvedValueOnce(['a2a/task-020', 'a2a/task-021']);

    // For the unknown branch, return task.json
    mockGit.readFileFromBranch
      .mockResolvedValueOnce(JSON.stringify({
        taskId: 'task-021',
        status: 'completed',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        taskId: 'task-021',
        status: 'completed',
        resultText: 'done',
        completedAt: '2026-01-01T00:00:00Z',
      }));

    const branches = await adapter.listTaskBranches();

    expect(branches).toHaveLength(2);
    expect(branches[0].taskId).toBe('task-020');
    expect(branches[1].taskId).toBe('task-021');
  });

  it('handles empty branch list', async () => {
    mockGit.listBranches.mockResolvedValueOnce([]);
    const branches = await adapter.listTaskBranches();
    expect(branches).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // cleanupTaskBranch
  // -----------------------------------------------------------------------

  it('cleans up a task branch', async () => {
    await adapter.createTaskBranch({
      taskId: 'task-030',
      targetAgent,
      prompt: 'cleanup test',
    });

    expect(adapter.getState().activeBranches).toBe(1);

    const cleaned = await adapter.cleanupTaskBranch('task-030');

    expect(cleaned).toBe(true);
    expect(adapter.getState().activeBranches).toBe(0);

    // Should have checked out base and deleted branch
    expect(mockGit.exec).toHaveBeenCalledWith(['checkout', 'main'], '/tmp/test-repo');
    expect(mockGit.exec).toHaveBeenCalledWith(['branch', '-D', 'a2a/task-030'], '/tmp/test-repo');
  });

  it('returns false for unknown task cleanup', async () => {
    const cleaned = await adapter.cleanupTaskBranch('nonexistent');
    expect(cleaned).toBe(false);
  });

  it('handles cleanup failure gracefully', async () => {
    await adapter.createTaskBranch({
      taskId: 'task-031',
      targetAgent,
      prompt: 'test',
    });

    // Make branch deletion fail
    mockGit.exec
      .mockResolvedValueOnce('') // checkout main
      .mockRejectedValueOnce(new Error('branch not found')); // branch -D

    const cleaned = await adapter.cleanupTaskBranch('task-031');
    expect(cleaned).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Registry
  // -----------------------------------------------------------------------

  it('registers and retrieves adapters', () => {
    registerGitAdapter(adapter);
    expect(getGitAdapter('test-git')).toBe(adapter);
    expect(listGitAdapters()).toHaveLength(1);

    unregisterGitAdapter('test-git');
    expect(getGitAdapter('test-git')).toBeUndefined();
    expect(listGitAdapters()).toHaveLength(0);
  });

  it('resetGitAdapters clears all', () => {
    registerGitAdapter(adapter);
    registerGitAdapter(new GitAdapter(createConfig({ adapterId: 'test-git-2' }), mockGit));
    expect(listGitAdapters()).toHaveLength(2);

    resetGitAdapters();
    expect(listGitAdapters()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Custom config
  // -----------------------------------------------------------------------

  it('uses custom branch prefix and metadata dir', async () => {
    const customAdapter = new GitAdapter(
      createConfig({ branchPrefix: 'tasks/', metadataDir: '.tasks' }),
      mockGit,
    );

    await customAdapter.createTaskBranch({
      taskId: 'task-040',
      targetAgent,
      prompt: 'test',
    });

    expect(mockGit.exec).toHaveBeenCalledWith(
      ['checkout', '-b', 'tasks/task-040', 'main'],
      '/tmp/test-repo',
    );
    expect(mockGit.writeFileOnBranch).toHaveBeenCalledWith(
      'tasks/task-040',
      '.tasks/task.json',
      expect.any(String),
      expect.any(String),
      '/tmp/test-repo',
    );
  });
});
