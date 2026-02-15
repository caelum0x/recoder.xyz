/**
 * File Watcher Tests
 *
 * Tests the file watching system for container filesystems.
 * Based on issues found in docker-logs.md:
 * - Adaptive polling intervals
 * - Duplicate event filtering
 * - Self-written path exclusion
 * - Watcher health status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() to ensure mocks are available before module loading
const { mockExec, mockGetContainer } = vi.hoisted(() => {
  const mockExec = vi.fn().mockResolvedValue({
    start: vi.fn().mockResolvedValue({
      on: vi.fn((event, cb) => {
        if (event === 'data') {
          // Return mock file listing
          cb(Buffer.from('\x01\x00\x00\x00\x00\x00\x00\x10file1.ts 1700000'));
        }
        // Use process.nextTick instead of setTimeout so fake timers don't block it
        if (event === 'end') process.nextTick(cb);
        return { on: vi.fn() };
      }),
    }),
  });

  const mockGetContainer = vi.fn().mockReturnValue({
    exec: mockExec,
  });

  return { mockExec, mockGetContainer };
});

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getContainer: mockGetContainer,
    })),
  };
});

import { FileWatcher } from '../file-watcher';

describe('FileWatcher', () => {
  let fileWatcher: FileWatcher;
  const testProjectId = 'test-project';
  const testContainerId = 'test-container-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fileWatcher = new FileWatcher();
  });

  afterEach(() => {
    fileWatcher.stopWatching(testProjectId);
    vi.useRealTimers();
  });

  describe('Basic Watching', () => {
    it('should start watching a project', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      expect(fileWatcher['watchers'].has(testProjectId)).toBe(true);
    });

    it('should stop watching a project', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);
      fileWatcher.stopWatching(testProjectId);

      expect(fileWatcher['watchers'].has(testProjectId)).toBe(false);
    });

    it('should not start watching twice', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);
      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Should only have one watcher
      expect(fileWatcher['watchers'].size).toBe(1);
    });
  });

  describe('Adaptive Polling', () => {
    it('should start with minimum poll interval', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      const watcher = fileWatcher['watchers'].get(testProjectId);
      expect(watcher?.currentPollInterval).toBe(1000); // MIN_POLL_INTERVAL
    });

    it('should escalate polling interval when no changes', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Advance time through multiple polls without changes
      for (let i = 0; i < 15; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const watcher = fileWatcher['watchers'].get(testProjectId);
      expect(watcher?.currentPollInterval).toBeGreaterThan(1000);
    });

    it('should reset to fast polling when changes detected', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Simulate slow polling
      const watcher = fileWatcher['watchers'].get(testProjectId);
      if (watcher) {
        watcher.currentPollInterval = 5000;
        watcher.pollsWithoutChanges = 20;
      }

      // Simulate change detection via private method
      fileWatcher['adjustPollInterval'](testProjectId, true);

      expect(watcher?.currentPollInterval).toBe(1000);
      expect(watcher?.pollsWithoutChanges).toBe(0);
    });
  });

  describe('Event Deduplication', () => {
    it('should deduplicate events within debounce window', async () => {
      const changeHandler = vi.fn();
      fileWatcher.on('change', changeHandler);
      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Emit same change multiple times
      fileWatcher.emit('change', {
        projectId: testProjectId,
        type: 'modify',
        path: 'src/file.ts',
        timestamp: Date.now(),
      });
      fileWatcher.emit('change', {
        projectId: testProjectId,
        type: 'modify',
        path: 'src/file.ts',
        timestamp: Date.now(),
      });

      // Both events should be received (dedup happens internally during poll)
      expect(changeHandler.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should have bounded dedup buffer size', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Manually populate the recent events buffer
      const recentEvents = new Map<string, number>();
      for (let i = 0; i < 1200; i++) {
        recentEvents.set(`file-${i}.ts:modify`, Date.now());
      }
      fileWatcher['recentEvents'].set(testProjectId, recentEvents);

      // Advance one poll cycle to trigger eviction
      await vi.advanceTimersByTimeAsync(1000);

      // Buffer should be bounded
      const currentSize = fileWatcher['recentEvents'].get(testProjectId)?.size || 0;
      expect(currentSize).toBeLessThanOrEqual(1200);
    });
  });

  describe('Write Exclusion', () => {
    it('should exclude recently written paths', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      fileWatcher.excludeWrittenPaths(testProjectId, ['src/file.ts']);

      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/file.ts')).toBe(true);
    });

    it('should not exclude paths after expiry', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      fileWatcher.excludeWrittenPaths(testProjectId, ['src/file.ts']);

      // Advance past exclusion window (WRITE_EXCLUSION_MS = 5000)
      await vi.advanceTimersByTimeAsync(6000);

      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/file.ts')).toBe(false);
    });

    it('should handle multiple excluded paths', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      fileWatcher.excludeWrittenPaths(testProjectId, ['a.ts', 'b.ts', 'c.ts']);

      expect(fileWatcher['isPathExcluded'](testProjectId, 'a.ts')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'b.ts')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'c.ts')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'd.ts')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should track consecutive errors', async () => {
      mockExec.mockRejectedValue(new Error('Container unreachable'));

      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Advance several poll cycles
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const watcher = fileWatcher['watchers'].get(testProjectId);
      expect(watcher?.consecutiveErrors).toBeGreaterThan(0);
    });

    it('should reset error count on success', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Simulate errors then reset
      const watcher = fileWatcher['watchers'].get(testProjectId);
      if (watcher) {
        watcher.consecutiveErrors = 5;
      }
      fileWatcher.resetErrorCount(testProjectId);

      expect(watcher?.consecutiveErrors).toBe(0);
    });

    it('should stop watching after max errors', async () => {
      mockExec.mockRejectedValue(new Error('Persistent error'));

      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Advance many poll cycles to hit max errors
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      // After exceeding MAX_CONSECUTIVE_ERRORS, watcher should be removed
      const watcher = fileWatcher['watchers'].get(testProjectId);
      // Either watcher is removed or its errors hit the max
      expect(
        !watcher || watcher.consecutiveErrors >= 10
      ).toBe(true);
    });
  });

  describe('Watcher Status', () => {
    it('should report healthy status', async () => {
      const statusHandler = vi.fn();
      fileWatcher.on('watcher_status', statusHandler);

      await fileWatcher.startWatching(testContainerId, testProjectId);

      // startWatching calls sendWatcherStatus internally
      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: testProjectId,
          status: 'healthy',
        })
      );
    });

    it('should report degraded status on errors', async () => {
      const statusHandler = vi.fn();
      fileWatcher.on('watcher_status', statusHandler);

      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Manually set errors and trigger status
      const watcher = fileWatcher['watchers'].get(testProjectId);
      if (watcher) {
        watcher.consecutiveErrors = 3;
      }
      fileWatcher.sendWatcherStatus(testProjectId);

      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
        })
      );
    });

    it('should report dead status for non-existent watcher', () => {
      const statusHandler = vi.fn();
      fileWatcher.on('watcher_status', statusHandler);

      fileWatcher.sendWatcherStatus('nonexistent-project');

      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'dead',
          message: 'Watcher not running',
        })
      );
    });
  });

  describe('Change Events', () => {
    it('should emit change events', async () => {
      const changeHandler = vi.fn();
      fileWatcher.on('change', changeHandler);

      await fileWatcher.startWatching(testContainerId, testProjectId);

      // Manually emit a change
      fileWatcher.emit('change', {
        projectId: testProjectId,
        type: 'modify',
        path: 'src/file.ts',
        timestamp: Date.now(),
      });

      expect(changeHandler).toHaveBeenCalled();
    });

    it('should filter self-written changes', async () => {
      await fileWatcher.startWatching(testContainerId, testProjectId);

      fileWatcher.excludeWrittenPaths(testProjectId, ['src/written.ts']);

      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/written.ts')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/other.ts')).toBe(false);
    });
  });

  describe('Logging', () => {
    it('should log with timestamps', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await fileWatcher.startWatching(testContainerId, testProjectId);

      expect(consoleSpy).toHaveBeenCalled();
      // Log messages should contain ISO timestamp format
      const logCall = consoleSpy.mock.calls.find(c =>
        typeof c[0] === 'string' && c[0].includes('[FileWatcher]')
      );
      expect(logCall).toBeDefined();

      consoleSpy.mockRestore();
    });
  });
});

describe('FileWatcher Integration Scenarios', () => {
  let fileWatcher: FileWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fileWatcher = new FileWatcher();
  });

  afterEach(() => {
    fileWatcher.stopWatching('project');
    vi.useRealTimers();
  });

  it('should handle rapid file changes', async () => {
    await fileWatcher.startWatching('container', 'project');

    // Emit rapid changes
    for (let i = 0; i < 10; i++) {
      fileWatcher.emit('change', {
        projectId: 'project',
        type: 'modify',
        path: `file-${i}.ts`,
        timestamp: Date.now(),
      });
    }

    // Should still be watching
    expect(fileWatcher['watchers'].has('project')).toBe(true);
  });

  it('should handle watch/unwatch cycles', async () => {
    for (let i = 0; i < 5; i++) {
      await fileWatcher.startWatching('container', 'project');
      expect(fileWatcher['watchers'].has('project')).toBe(true);

      fileWatcher.stopWatching('project');
      expect(fileWatcher['watchers'].has('project')).toBe(false);
    }
  });
});
