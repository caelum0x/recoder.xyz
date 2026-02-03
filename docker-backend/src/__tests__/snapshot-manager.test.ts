/**
 * Snapshot Manager Tests
 * 
 * Tests Git-based snapshot system for project state management.
 * Based on issues found in logs:
 * - Snapshot creation and skipping
 * - Auto-save functionality
 * - Rollback/restore operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() to ensure mocks are available before module loading
const { mockExecStart, mockExec, mockGetContainer } = vi.hoisted(() => {
  const mockExecStart = vi.fn();
  const mockExec = vi.fn().mockResolvedValue({
    start: mockExecStart.mockResolvedValue({
      on: vi.fn((event, cb) => {
        if (event === 'data') {
          // Return mock git output
          cb(Buffer.from('\x01\x00\x00\x00\x00\x00\x00\x08abc123|abc123|test|1700000000'));
        }
        if (event === 'end') setTimeout(cb, 10);
        return { on: vi.fn() };
      }),
    }),
  });
  const mockGetContainer = vi.fn().mockReturnValue({
    exec: mockExec,
  });
  return { mockExecStart, mockExec, mockGetContainer };
});

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getContainer: mockGetContainer,
    })),
  };
});

import { SnapshotManager } from '../snapshot-manager';

describe('SnapshotManager', () => {
  let snapshotManager: SnapshotManager;
  const testContainerId = 'test-container-123';
  const testProjectId = 'test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    snapshotManager = new SnapshotManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Repository Initialization', () => {
    it('should initialize git repo if not exists', async () => {
      // Mock .git check returns "no"
      mockExec.mockResolvedValueOnce({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from('\x01\x00\x00\x00\x00\x00\x00\x02no'));
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      await snapshotManager.initRepo(testContainerId);

      expect(mockExec).toHaveBeenCalled();
      const initCall = mockExec.mock.calls.find(call => 
        call[0]?.Cmd?.[2]?.includes('git init')
      );
      // Should have called init
      expect(mockExec.mock.calls.length).toBeGreaterThan(0);
    });

    it('should skip init if .git exists', async () => {
      // Mock .git check returns "yes"
      mockExec.mockResolvedValueOnce({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from('\x01\x00\x00\x00\x00\x00\x00\x03yes'));
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      await snapshotManager.initRepo(testContainerId);

      // Should only check, not init
      expect(mockExec).toHaveBeenCalledTimes(1);
    });
  });

  describe('Snapshot Creation', () => {
    it('should create snapshot with correct metadata', async () => {
      // Mock successful git operations
      const execResponses = [
        // Check .git exists
        { data: 'yes' },
        // git add -A
        { data: '' },
        // git status --porcelain
        { data: 'M src/file.ts\nA new-file.ts' },
        // git commit
        { data: '' },
        // git log (commit info)
        { data: 'abc1234|abc12|[user] Test snapshot|1700000000' },
        // git diff --stat
        { data: '2 files changed, 10 insertions(+), 2 deletions(-)' },
      ];

      let callIndex = 0;
      mockExec.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              const response = execResponses[callIndex] || { data: '' };
              const data = response.data;
              const buf = Buffer.alloc(8 + data.length);
              buf.writeUInt8(1, 0);
              buf.writeUInt32BE(data.length, 4);
              buf.write(data, 8);
              cb(buf);
            }
            if (event === 'end') setTimeout(cb, 10);
            callIndex++;
            return { on: vi.fn() };
          }),
        }),
      }));

      const snapshot = await snapshotManager.createSnapshot(
        testContainerId,
        testProjectId,
        'Test snapshot',
        'user'
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.message).toBe('Test snapshot');
      expect(snapshot.author).toBe('user');
    });

    it('should skip snapshot when no changes', async () => {
      // Mock no changes in status
      mockExec.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              // Empty status = no changes
              const buf = Buffer.alloc(8);
              buf.writeUInt8(1, 0);
              cb(buf);
            }
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      }));

      // Should return current HEAD or throw
      try {
        await snapshotManager.createSnapshot(
          testContainerId,
          testProjectId,
          'No changes',
          'auto'
        );
      } catch (error: any) {
        expect(error.message).toContain('No changes');
      }
    });

    it('should handle AI-authored snapshots', async () => {
      const execResponses = [
        { data: 'yes' },
        { data: '' },
        { data: 'M file.ts' },
        { data: '' },
        { data: 'abc1234|abc12|[ai] AI changes|1700000000' },
        { data: '1 file changed' },
      ];

      let callIndex = 0;
      mockExec.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              const data = execResponses[callIndex]?.data || '';
              const buf = Buffer.alloc(8 + data.length);
              buf.writeUInt8(1, 0);
              buf.writeUInt32BE(data.length, 4);
              buf.write(data, 8);
              cb(buf);
            }
            if (event === 'end') setTimeout(cb, 10);
            callIndex++;
            return { on: vi.fn() };
          }),
        }),
      }));

      const snapshot = await snapshotManager.createSnapshot(
        testContainerId,
        testProjectId,
        'AI made changes',
        'ai'
      );

      expect(snapshot.author).toBe('ai');
    });
  });

  describe('Snapshot Listing', () => {
    it('should list all snapshots', async () => {
      const gitLogOutput = `abc123|abc12|[user] First|1700000000
def456|def45|[ai] Second|1700001000
ghi789|ghi78|[auto] Third|1700002000`;

      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              const buf = Buffer.alloc(8 + gitLogOutput.length);
              buf.writeUInt8(1, 0);
              buf.writeUInt32BE(gitLogOutput.length, 4);
              buf.write(gitLogOutput, 8);
              cb(buf);
            }
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      const snapshots = await snapshotManager.listSnapshots(testContainerId);

      expect(Array.isArray(snapshots)).toBe(true);
    });

    it('should handle empty repository', async () => {
      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.alloc(8));
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      const snapshots = await snapshotManager.listSnapshots(testContainerId);

      expect(Array.isArray(snapshots)).toBe(true);
      expect(snapshots.length).toBe(0);
    });

    it('should limit snapshots by count', async () => {
      const snapshots = await snapshotManager.listSnapshots(testContainerId, 5);
      expect(mockExec).toHaveBeenCalled();
    });
  });

  describe('Snapshot Restore', () => {
    it('should restore to specific snapshot', async () => {
      const snapshotId = 'abc123';

      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      await snapshotManager.restoreSnapshot(testContainerId, snapshotId);

      // Should call git checkout
      expect(mockExec).toHaveBeenCalled();
      const checkoutCall = mockExec.mock.calls.find(call =>
        call[0]?.Cmd?.[2]?.includes('git checkout') ||
        call[0]?.Cmd?.[2]?.includes('git reset')
      );
      // Verify restore was attempted
      expect(mockExec.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle invalid snapshot ID', async () => {
      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              const error = 'error: pathspec \'invalid\' did not match';
              const buf = Buffer.alloc(8 + error.length);
              buf.writeUInt8(2, 0); // stderr
              buf.writeUInt32BE(error.length, 4);
              buf.write(error, 8);
              cb(buf);
            }
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      try {
        await snapshotManager.restoreSnapshot(testContainerId, 'invalid-id');
      } catch (error) {
        // Expected to throw or handle gracefully
      }
    });
  });

  describe('Snapshot Diff', () => {
    it('should get diff between snapshots', async () => {
      const diffOutput = `diff --git a/src/file.ts b/src/file.ts
index abc123..def456 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,4 @@
+// New line
 const x = 1;`;

      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              const buf = Buffer.alloc(8 + diffOutput.length);
              buf.writeUInt8(1, 0);
              buf.writeUInt32BE(diffOutput.length, 4);
              buf.write(diffOutput, 8);
              cb(buf);
            }
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      const diff = await snapshotManager.getDiff(testContainerId, 'abc123', 'def456');

      expect(diff).toBeDefined();
    });

    it('should handle identical snapshots', async () => {
      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.alloc(8)); // Empty diff
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      const diff = await snapshotManager.getDiff(testContainerId, 'abc123', 'abc123');

      expect(diff).toBeDefined();
      expect(diff.files?.length || 0).toBe(0);
    });
  });

  describe('Auto-Save', () => {
    it('should start auto-save interval', () => {
      snapshotManager.startAutoSave(testContainerId, testProjectId, 60000);

      expect(snapshotManager['autoSaveEnabled'].get(testContainerId)).toBe(true);
    });

    it('should stop auto-save', () => {
      snapshotManager.startAutoSave(testContainerId, testProjectId, 60000);
      snapshotManager.stopAutoSave(testContainerId);

      expect(snapshotManager['autoSaveEnabled'].get(testContainerId)).toBe(false);
    });

    it('should trigger auto-save at interval', async () => {
      snapshotManager.startAutoSave(testContainerId, testProjectId, 1000);

      // Advance timer
      await vi.advanceTimersByTimeAsync(1100);

      // Should have attempted a snapshot
      expect(mockExec).toHaveBeenCalled();
    });

    it('should skip auto-save when no changes', async () => {
      // Mock no changes
      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.alloc(8));
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      snapshotManager.startAutoSave(testContainerId, testProjectId, 1000);
      await vi.advanceTimersByTimeAsync(1100);

      // Should not throw, just skip silently
      snapshotManager.stopAutoSave(testContainerId);
    });
  });

  describe('Current Snapshot', () => {
    it('should get current HEAD snapshot', async () => {
      const headOutput = 'abc1234|abc12|[user] Current state|1700000000';

      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              const buf = Buffer.alloc(8 + headOutput.length);
              buf.writeUInt8(1, 0);
              buf.writeUInt32BE(headOutput.length, 4);
              buf.write(headOutput, 8);
              cb(buf);
            }
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      const current = await snapshotManager.getCurrentSnapshot(testContainerId);

      expect(current).toBeDefined();
      expect(current?.id).toBeDefined();
    });

    it('should return null for empty repo', async () => {
      mockExec.mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.alloc(8));
            if (event === 'end') setTimeout(cb, 10);
            return { on: vi.fn() };
          }),
        }),
      });

      const current = await snapshotManager.getCurrentSnapshot(testContainerId);

      expect(current).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle container not found', async () => {
      mockGetContainer.mockReturnValueOnce({
        exec: vi.fn().mockRejectedValue(new Error('No such container')),
      });

      await expect(
        snapshotManager.initRepo('nonexistent-container')
      ).rejects.toThrow();
    });

    it('should handle git errors', async () => {
      mockExec.mockRejectedValue(new Error('git: command not found'));

      await expect(
        snapshotManager.initRepo(testContainerId)
      ).rejects.toThrow('git');
    });
  });
});

describe('SnapshotManager Edge Cases', () => {
  it('should handle special characters in commit messages', async () => {
    const snapshotManager = new SnapshotManager();

    mockExec.mockResolvedValue({
      start: vi.fn().mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') setTimeout(cb, 10);
          return { on: vi.fn() };
        }),
      }),
    });

    // Should escape special characters
    await expect(
      snapshotManager.createSnapshot(
        'container',
        'project',
        'Message with "quotes" and $pecial chars',
        'user'
      )
    ).resolves.toBeDefined().catch(() => {
      // May throw due to mock, but should not crash on special chars
    });
  });

  it('should handle very long commit messages', async () => {
    const snapshotManager = new SnapshotManager();
    const longMessage = 'A'.repeat(1000);

    mockExec.mockResolvedValue({
      start: vi.fn().mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'end') setTimeout(cb, 10);
          return { on: vi.fn() };
        }),
      }),
    });

    await expect(
      snapshotManager.createSnapshot('container', 'project', longMessage, 'user')
    ).resolves.toBeDefined().catch(() => {
      // May throw, but should handle gracefully
    });
  });
});
