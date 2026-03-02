/**
 * Enhanced Git Operations Tests
 * Tests for merge, rebase, getGitState, getConflicts, renameBranch, pushForceWithLease,
 * cloneRepo, push, pull — the previously untested exported functions.
 *
 * Uses mocked Docker container execution to test business logic
 * without requiring actual containers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== Mock execInContainer ====================

let execInContainerMock: ReturnType<typeof vi.fn>;

// Track commands executed for assertion
const executedCommands: string[] = [];

vi.mock('dockerode', () => {
  return {
    default: class MockDockerode {
      getContainer(id: string) {
        return {
          async exec(options: { Cmd: string[] }) {
            const cmd = options.Cmd[options.Cmd.length - 1]; // bash -c <cmd>
            executedCommands.push(cmd);

            const result = execInContainerMock(id, cmd);
            const output = typeof result === 'string' ? result : (await result);

            return {
              async start() {
                const content = Buffer.from(output);
                const header = Buffer.alloc(8);
                header.writeUInt8(1, 0);
                header.writeUInt32BE(content.length, 4);
                const chunk = Buffer.concat([header, content]);

                return {
                  on(event: string, callback: (data: Buffer) => void) {
                    if (event === 'data') callback(chunk);
                    if (event === 'end') callback(Buffer.alloc(0));
                    return this;
                  },
                };
              },
            };
          },
        };
      }
    },
  };
});

// ==================== Import under test ====================

let gitOps: typeof import('../git-operations.js');

beforeEach(async () => {
  executedCommands.length = 0;
  execInContainerMock = vi.fn(() => '');
  vi.resetModules();
  gitOps = await import('../git-operations.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const CONTAINER_ID = 'test-container-123';

// ==================== Helper to set up mock responses ====================

function mockExecResponses(responses: Record<string, string | (() => string)>) {
  execInContainerMock = vi.fn((_id: string, cmd: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        return typeof response === 'function' ? response() : response;
      }
    }
    return '';
  });
}

// ==================== getGitState Tests ====================

describe('getGitState', () => {
  it('should detect clean state', async () => {
    mockExecResponses({
      'MERGE_HEAD': 'no',
      'rebase-merge': 'no',
      'CHERRY_PICK_HEAD': 'no',
    });

    const state = await gitOps.gitOperations.getGitState(CONTAINER_ID);
    expect(state.state).toBe('clean');
    expect(state.conflictFiles).toBeUndefined();
  });

  it('should detect merging state', async () => {
    mockExecResponses({
      'MERGE_HEAD': 'exists',
      'diff --name-only --diff-filter=U': 'src/index.ts\nsrc/app.ts',
    });

    const state = await gitOps.gitOperations.getGitState(CONTAINER_ID);
    expect(state.state).toBe('merging');
    expect(state.conflictFiles).toContain('src/index.ts');
    expect(state.conflictFiles).toContain('src/app.ts');
  });

  it('should detect rebasing state', async () => {
    mockExecResponses({
      'MERGE_HEAD': 'no',
      'rebase-merge': 'exists',
      'diff --name-only --diff-filter=U': 'package.json',
    });

    const state = await gitOps.gitOperations.getGitState(CONTAINER_ID);
    expect(state.state).toBe('rebasing');
    expect(state.conflictFiles).toContain('package.json');
  });

  it('should detect cherry-picking state', async () => {
    mockExecResponses({
      'MERGE_HEAD': 'no',
      'rebase-merge': 'no',
      'CHERRY_PICK_HEAD': 'exists',
      'diff --name-only --diff-filter=U': '',
    });

    const state = await gitOps.gitOperations.getGitState(CONTAINER_ID);
    expect(state.state).toBe('cherry-picking');
  });
});

// ==================== getConflicts Tests ====================

describe('getConflicts', () => {
  it('should return merge type conflicts', async () => {
    mockExecResponses({
      'MERGE_HEAD': 'exists',
      'diff --name-only --diff-filter=U': 'conflicting-file.ts',
    });

    const conflicts = await gitOps.gitOperations.getConflicts(CONTAINER_ID);
    expect(conflicts.type).toBe('merge');
    expect(conflicts.files).toContain('conflicting-file.ts');
  });

  it('should return rebase type conflicts', async () => {
    mockExecResponses({
      'MERGE_HEAD': 'no',
      'rebase-merge': 'exists',
      'diff --name-only --diff-filter=U': 'src/utils.ts',
    });

    const conflicts = await gitOps.gitOperations.getConflicts(CONTAINER_ID);
    expect(conflicts.type).toBe('rebase');
    expect(conflicts.files).toContain('src/utils.ts');
  });

  it('should return empty files when no conflicts', async () => {
    mockExecResponses({
      'MERGE_HEAD': 'no',
      'rebase-merge': 'no',
      'CHERRY_PICK_HEAD': 'no',
      'diff --name-only --diff-filter=U': '',
    });

    const conflicts = await gitOps.gitOperations.getConflicts(CONTAINER_ID);
    expect(conflicts.files).toEqual([]);
  });
});

// ==================== merge Tests ====================

describe('merge', () => {
  it('should merge a branch successfully', async () => {
    mockExecResponses({
      'git merge': 'Merge made by the recursive strategy.',
    });

    const result = await gitOps.gitOperations.merge(CONTAINER_ID, 'feature/login');
    expect(result.success).toBe(true);
  });

  it('should detect merge conflicts', async () => {
    execInContainerMock = vi.fn((_id: string, cmd: string) => {
      if (cmd.includes('git merge')) {
        throw new Error('CONFLICT (content): Merge conflict in src/index.ts\nAutomatic merge failed');
      }
      if (cmd.includes('diff --name-only --diff-filter=U')) {
        return 'src/index.ts';
      }
      return '';
    });

    const result = await gitOps.gitOperations.merge(CONTAINER_ID, 'feature/conflicting');
    expect(result.success).toBe(false);
    expect(result.error).toContain('conflict');
    expect(result.conflicts).toBeDefined();
  });

  it('should reject invalid branch names', async () => {
    const result = await gitOps.gitOperations.merge(CONTAINER_ID, '../etc/passwd');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should support --no-ff option', async () => {
    mockExecResponses({
      'git merge': 'Merge made by the recursive strategy.',
    });

    await gitOps.gitOperations.merge(CONTAINER_ID, 'feature/test', { noFf: true });
    const mergeCmd = executedCommands.find(c => c.includes('git merge'));
    expect(mergeCmd).toContain('--no-ff');
  });

  it('should support --squash option', async () => {
    mockExecResponses({
      'git merge': 'Squash commit',
    });

    await gitOps.gitOperations.merge(CONTAINER_ID, 'feature/test', { squash: true });
    const mergeCmd = executedCommands.find(c => c.includes('git merge'));
    expect(mergeCmd).toContain('--squash');
  });
});

// ==================== rebase Tests ====================

describe('rebase', () => {
  it('should rebase successfully', async () => {
    mockExecResponses({
      'git rebase': 'Successfully rebased and updated refs/heads/feature.',
    });

    const result = await gitOps.gitOperations.rebase(CONTAINER_ID, 'main');
    expect(result.success).toBe(true);
  });

  it('should detect rebase conflicts', async () => {
    execInContainerMock = vi.fn((_id: string, cmd: string) => {
      if (cmd.includes('git rebase')) {
        throw new Error('CONFLICT (content): could not apply abc123');
      }
      if (cmd.includes('diff --name-only --diff-filter=U')) {
        return 'src/app.ts';
      }
      return '';
    });

    const result = await gitOps.gitOperations.rebase(CONTAINER_ID, 'main');
    expect(result.success).toBe(false);
    expect(result.error).toContain('conflict');
    expect(result.conflicts).toContain('src/app.ts');
  });

  it('should reject invalid branch names', async () => {
    const result = await gitOps.gitOperations.rebase(CONTAINER_ID, '--help');
    expect(result.success).toBe(false);
  });
});

// ==================== rebaseAbort Tests ====================

describe('rebaseAbort', () => {
  it('should abort rebase successfully', async () => {
    mockExecResponses({
      'git rebase --abort': '',
    });

    const result = await gitOps.gitOperations.rebaseAbort(CONTAINER_ID);
    expect(result.success).toBe(true);
  });

  it('should handle error when no rebase in progress', async () => {
    execInContainerMock = vi.fn(() => {
      throw new Error('fatal: No rebase in progress?');
    });

    const result = await gitOps.gitOperations.rebaseAbort(CONTAINER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No rebase');
  });
});

// ==================== rebaseContinue Tests ====================

describe('rebaseContinue', () => {
  it('should continue rebase successfully', async () => {
    mockExecResponses({
      'git rebase --continue': 'Successfully rebased.',
    });

    const result = await gitOps.gitOperations.rebaseContinue(CONTAINER_ID);
    expect(result.success).toBe(true);
  });

  it('should detect more conflicts during continue', async () => {
    execInContainerMock = vi.fn((_id: string, cmd: string) => {
      if (cmd.includes('git rebase --continue')) {
        throw new Error('CONFLICT: could not apply next commit');
      }
      if (cmd.includes('diff --name-only --diff-filter=U')) {
        return 'src/next-conflict.ts';
      }
      return '';
    });

    const result = await gitOps.gitOperations.rebaseContinue(CONTAINER_ID);
    expect(result.success).toBe(false);
    expect(result.conflicts).toContain('src/next-conflict.ts');
  });
});

// ==================== renameBranch Tests ====================

describe('renameBranch', () => {
  it('should rename a branch successfully', async () => {
    mockExecResponses({
      'git branch -m': '',
    });

    const result = await gitOps.gitOperations.renameBranch(CONTAINER_ID, 'old-name', 'new-name');
    expect(result.success).toBe(true);

    const renameCmd = executedCommands.find(c => c.includes('git branch -m'));
    expect(renameCmd).toContain('old-name');
    expect(renameCmd).toContain('new-name');
  });

  it('should reject invalid old branch name', async () => {
    const result = await gitOps.gitOperations.renameBranch(CONTAINER_ID, '../exploit', 'new-name');
    expect(result.success).toBe(false);
    expect(result.error).toContain('old branch name');
  });

  it('should reject invalid new branch name', async () => {
    const result = await gitOps.gitOperations.renameBranch(CONTAINER_ID, 'old-name', '--help');
    expect(result.success).toBe(false);
    expect(result.error).toContain('new branch name');
  });
});

// ==================== pushForceWithLease Tests ====================

describe('pushForceWithLease', () => {
  it('should push with force-with-lease successfully', async () => {
    mockExecResponses({
      'git push --force-with-lease': '',
      'git config --unset': '',
    });

    const result = await gitOps.gitOperations.pushForceWithLease(CONTAINER_ID, 'origin', 'feature/test');
    expect(result.success).toBe(true);

    const pushCmd = executedCommands.find(c => c.includes('git push'));
    expect(pushCmd).toContain('--force-with-lease');
  });

  it('should handle auth failure', async () => {
    execInContainerMock = vi.fn((_id: string, cmd: string) => {
      if (cmd.includes('git push')) {
        throw new Error('fatal: Authentication failed for https://github.com');
      }
      return '';
    });

    const result = await gitOps.gitOperations.pushForceWithLease(CONTAINER_ID, 'origin', 'feature/test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication');
  });

  it('should reject invalid branch name', async () => {
    const result = await gitOps.gitOperations.pushForceWithLease(CONTAINER_ID, 'origin', '--delete main');
    expect(result.success).toBe(false);
  });

  it('should set up and clean up token credential helper', async () => {
    mockExecResponses({
      'git push': '',
      'git config credential.helper': '',
      'git config --unset': '',
    });

    await gitOps.gitOperations.pushForceWithLease(CONTAINER_ID, 'origin', 'main', 'my-secret-token');

    const credCmd = executedCommands.find(c => c.includes('credential.helper'));
    expect(credCmd).toBeDefined();

    const cleanupCmd = executedCommands.find(c => c.includes('--unset'));
    expect(cleanupCmd).toBeDefined();
  });
});

// ==================== cloneRepo Tests ====================

describe('cloneRepo', () => {
  it('should clone a repository successfully', async () => {
    mockExecResponses({
      'rm -rf': '',
      'git clone': '',
    });

    const result = await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'https://github.com/user/repo.git');
    expect(result.success).toBe(true);
  });

  it('should reject non-HTTPS, non-SSH URLs', async () => {
    const result = await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'ftp://evil.com/repo.git');
    expect(result.success).toBe(false);
    expect(result.error).toContain('URL must start with');
  });

  it('should accept SSH URLs', async () => {
    mockExecResponses({
      'rm -rf': '',
      'git clone': '',
    });

    const result = await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'git@github.com:user/repo.git');
    expect(result.success).toBe(true);
  });

  it('should handle auth failure during clone', async () => {
    execInContainerMock = vi.fn((_id: string, cmd: string) => {
      if (cmd.includes('git clone')) {
        throw new Error('fatal: Authentication failed');
      }
      return '';
    });

    const result = await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'https://github.com/private/repo.git');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Authentication');
  });

  it('should handle repo not found', async () => {
    execInContainerMock = vi.fn((_id: string, cmd: string) => {
      if (cmd.includes('git clone')) {
        throw new Error('fatal: repository not found');
      }
      return '';
    });

    const result = await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'https://github.com/user/nonexistent.git');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should support shallow clone with depth', async () => {
    mockExecResponses({
      'rm -rf': '',
      'git clone': '',
    });

    await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'https://github.com/user/repo.git', { depth: 1 });

    const cloneCmd = executedCommands.find(c => c.includes('git clone'));
    expect(cloneCmd).toContain('--depth 1');
  });

  it('should cap clone depth at 100', async () => {
    mockExecResponses({
      'rm -rf': '',
      'git clone': '',
    });

    await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'https://github.com/user/repo.git', { depth: 999 });

    const cloneCmd = executedCommands.find(c => c.includes('git clone'));
    expect(cloneCmd).toContain('--depth 100');
  });

  it('should strip token from remote URL after clone', async () => {
    mockExecResponses({
      'rm -rf': '',
      'git clone': '',
      'git remote set-url': '',
    });

    await gitOps.gitOperations.cloneRepo(CONTAINER_ID, 'https://github.com/user/repo.git', {
      token: 'secret-token',
    });

    const setUrlCmd = executedCommands.find(c => c.includes('git remote set-url'));
    expect(setUrlCmd).toBeDefined();
    expect(setUrlCmd).not.toContain('secret-token');
  });
});

// ==================== push Tests ====================

describe('push', () => {
  it('should push successfully', async () => {
    mockExecResponses({
      'git push': '',
    });

    const result = await gitOps.gitOperations.push(CONTAINER_ID);
    expect(result.success).toBe(true);
  });

  it('should handle push rejection (non-fast-forward)', async () => {
    execInContainerMock = vi.fn((_id: string, cmd: string) => {
      if (cmd.includes('git push')) {
        throw new Error('! [rejected] main -> main (non-fast-forward)');
      }
      return '';
    });

    const result = await gitOps.gitOperations.push(CONTAINER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rejected');
  });

  it('should use --force-with-lease when force option is true', async () => {
    mockExecResponses({
      'git push': '',
      'git config': '',
    });

    await gitOps.gitOperations.push(CONTAINER_ID, 'origin', 'main', { force: true });

    const pushCmd = executedCommands.find(c => c.includes('git push'));
    expect(pushCmd).toContain('--force-with-lease');
  });

  it('should set upstream with -u flag', async () => {
    mockExecResponses({
      'git push': '',
    });

    await gitOps.gitOperations.push(CONTAINER_ID, 'origin', 'feature', { setUpstream: true });

    const pushCmd = executedCommands.find(c => c.includes('git push'));
    expect(pushCmd).toContain('-u');
  });
});

// ==================== pull Tests ====================

describe('pull', () => {
  it('should pull successfully', async () => {
    mockExecResponses({
      'git pull': 'Already up to date.',
    });

    const result = await gitOps.gitOperations.pull(CONTAINER_ID);
    expect(result.success).toBe(true);
  });

  it('should detect merge conflicts on pull', async () => {
    mockExecResponses({
      'git pull': 'Auto-merging src/index.ts\nCONFLICT (content): Merge conflict in src/index.ts\nAutomatic merge failed',
      'git status --porcelain': 'UU src/index.ts',
    });

    const result = await gitOps.gitOperations.pull(CONTAINER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('conflict');
    expect(result.conflicts).toContain('src/index.ts');
  });

  it('should support --rebase option', async () => {
    mockExecResponses({
      'git pull': 'Already up to date.',
    });

    await gitOps.gitOperations.pull(CONTAINER_ID, 'origin', undefined, { rebase: true });

    const pullCmd = executedCommands.find(c => c.includes('git pull'));
    expect(pullCmd).toContain('--rebase');
  });
});

// ==================== isGitRepo Tests ====================

describe('isGitRepo', () => {
  it('should return true for a git repo', async () => {
    mockExecResponses({
      'git rev-parse --is-inside-work-tree': 'true',
    });

    const result = await gitOps.isGitRepo(CONTAINER_ID);
    expect(result).toBe(true);
  });

  it('should return false for non-git directory', async () => {
    mockExecResponses({
      'git rev-parse --is-inside-work-tree': '',
    });

    const result = await gitOps.isGitRepo(CONTAINER_ID);
    expect(result).toBe(false);
  });

  it('should return false on error', async () => {
    execInContainerMock = vi.fn(() => {
      throw new Error('fatal: not a git repository');
    });

    const result = await gitOps.isGitRepo(CONTAINER_ID);
    expect(result).toBe(false);
  });
});

// ==================== Exported Interface Completeness ====================

describe('gitOperations export', () => {
  it('should export all expected operations', () => {
    const ops = gitOps.gitOperations;

    // Core operations
    expect(typeof ops.isGitRepo).toBe('function');
    expect(typeof ops.initRepo).toBe('function');
    expect(typeof ops.getStatus).toBe('function');
    expect(typeof ops.getBranches).toBe('function');
    expect(typeof ops.createBranch).toBe('function');
    expect(typeof ops.checkoutBranch).toBe('function');
    expect(typeof ops.deleteBranch).toBe('function');
    expect(typeof ops.getCommitHistory).toBe('function');
    expect(typeof ops.getFileDiff).toBe('function');
    expect(typeof ops.stageFiles).toBe('function');
    expect(typeof ops.unstageFiles).toBe('function');
    expect(typeof ops.commit).toBe('function');
    expect(typeof ops.discardChanges).toBe('function');
    expect(typeof ops.autoCommit).toBe('function');
    expect(typeof ops.revertToCommit).toBe('function');

    // Remote operations
    expect(typeof ops.getRemotes).toBe('function');
    expect(typeof ops.setRemote).toBe('function');
    expect(typeof ops.removeRemote).toBe('function');
    expect(typeof ops.push).toBe('function');
    expect(typeof ops.pull).toBe('function');
    expect(typeof ops.fetchRemote).toBe('function');
    expect(typeof ops.cloneRepo).toBe('function');

    // Enhanced operations
    expect(typeof ops.merge).toBe('function');
    expect(typeof ops.rebase).toBe('function');
    expect(typeof ops.rebaseAbort).toBe('function');
    expect(typeof ops.rebaseContinue).toBe('function');
    expect(typeof ops.getGitState).toBe('function');
    expect(typeof ops.getConflicts).toBe('function');
    expect(typeof ops.renameBranch).toBe('function');
    expect(typeof ops.pushForceWithLease).toBe('function');
  });
});
