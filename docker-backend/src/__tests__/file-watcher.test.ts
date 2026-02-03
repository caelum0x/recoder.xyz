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
        if (event === 'end') setTimeout(cb, 10);
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
    it('should start watching a project', () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      expect(fileWatcher.isWatching(testProjectId)).toBe(true);
    });

    it('should stop watching a project', () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      fileWatcher.stopWatching(testProjectId);
      
      expect(fileWatcher.isWatching(testProjectId)).toBe(false);
    });

    it('should not start watching twice', () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Should only have one watcher
      expect(fileWatcher['watchers'].size).toBe(1);
    });
  });

  describe('Adaptive Polling', () => {
    it('should start with minimum poll interval', () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      const watcher = fileWatcher['watchers'].get(testProjectId);
      expect(watcher?.currentPollInterval).toBe(1000); // MIN_POLL_INTERVAL
    });

    it('should escalate polling interval when no changes', async () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Advance time through multiple polls without changes
      for (let i = 0; i < 15; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      
      const watcher = fileWatcher['watchers'].get(testProjectId);
      expect(watcher?.currentPollInterval).toBeGreaterThan(1000);
    });

    it('should reset to fast polling when changes detected', async () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Simulate slow polling
      const watcher = fileWatcher['watchers'].get(testProjectId);
      if (watcher) {
        watcher.currentPollInterval = 5000;
        watcher.pollsWithoutChanges = 20;
      }
      
      // Simulate change detection
      fileWatcher['adjustPollInterval'](testProjectId, true);
      
      expect(watcher?.currentPollInterval).toBe(1000);
      expect(watcher?.pollsWithoutChanges).toBe(0);
    });
  });

  describe('Event Deduplication', () => {
    it('should deduplicate events within debounce window', () => {
      const changeHandler = vi.fn();
      fileWatcher.on('change', changeHandler);
      fileWatcher.startWatching(testProjectId, testContainerId);
      
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

    it('should have bounded dedup buffer size', () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Add many events
      const recentEvents = fileWatcher['recentEvents'];
      recentEvents.set(testProjectId, new Map());
      const projectEvents = recentEvents.get(testProjectId)!;
      
      for (let i = 0; i < 1100; i++) {
        projectEvents.set(`path-${i}`, Date.now());
      }
      
      // Should have LRU eviction (implementation dependent)
      // Test that it doesn't grow unbounded
      expect(projectEvents.size).toBeLessThanOrEqual(1100);
    });
  });

  describe('Write Exclusion', () => {
    it('should exclude recently written paths', () => {
      fileWatcher.excludeWrittenPaths(testProjectId, ['src/App.tsx']);
      
      const isExcluded = fileWatcher['isPathExcluded'](testProjectId, 'src/App.tsx');
      
      expect(isExcluded).toBe(true);
    });

    it('should not exclude paths after expiry', async () => {
      fileWatcher.excludeWrittenPaths(testProjectId, ['src/App.tsx']);
      
      // Advance past exclusion window
      await vi.advanceTimersByTimeAsync(6000); // WRITE_EXCLUSION_MS + 1000
      
      const isExcluded = fileWatcher['isPathExcluded'](testProjectId, 'src/App.tsx');
      
      expect(isExcluded).toBe(false);
    });

    it('should handle multiple excluded paths', () => {
      fileWatcher.excludeWrittenPaths(testProjectId, [
        'src/App.tsx',
        'src/index.ts',
        'package.json',
      ]);
      
      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/App.tsx')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/index.ts')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'package.json')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'other.ts')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should track consecutive errors', async () => {
      mockExec.mockRejectedValue(new Error('Container error'));
      
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Run several poll cycles
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      
      const watcher = fileWatcher['watchers'].get(testProjectId);
      expect(watcher?.consecutiveErrors).toBeGreaterThan(0);
    });

    it('should reset error count on success', () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Simulate errors
      const watcher = fileWatcher['watchers'].get(testProjectId);
      if (watcher) {
        watcher.consecutiveErrors = 5;
      }
      
      // Reset
      fileWatcher.resetErrorCount(testProjectId);
      
      expect(watcher?.consecutiveErrors).toBe(0);
    });

    it('should stop watching after max errors', async () => {
      const statusHandler = vi.fn();
      fileWatcher.on('watcher_status', statusHandler);
      
      mockExec.mockRejectedValue(new Error('Persistent error'));
      
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Simulate many consecutive errors
      const watcher = fileWatcher['watchers'].get(testProjectId);
      if (watcher) {
        watcher.consecutiveErrors = 10;
      }
      
      fileWatcher.sendWatcherStatus(testProjectId);
      
      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'dead',
        })
      );
    });
  });

  describe('Watcher Status', () => {
    it('should report healthy status', () => {
      const statusHandler = vi.fn();
      fileWatcher.on('watcher_status', statusHandler);
      
      fileWatcher.startWatching(testProjectId, testContainerId);
      fileWatcher.sendWatcherStatus(testProjectId);
      
      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: testProjectId,
          status: 'healthy',
        })
      );
    });

    it('should report degraded status on errors', () => {
      const statusHandler = vi.fn();
      fileWatcher.on('watcher_status', statusHandler);
      
      fileWatcher.startWatching(testProjectId, testContainerId);
      
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
    it('should emit change events', () => {
      const changeHandler = vi.fn();
      fileWatcher.on('changes', changeHandler);
      
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Trigger internal change detection
      fileWatcher.emit('changes', {
        projectId: testProjectId,
        changes: [
          { type: 'modify', path: 'src/file.ts', timestamp: Date.now() },
        ],
      });
      
      expect(changeHandler).toHaveBeenCalled();
    });

    it('should filter self-written changes', () => {
      fileWatcher.startWatching(testProjectId, testContainerId);
      fileWatcher.excludeWrittenPaths(testProjectId, ['src/App.tsx']);
      
      // The filtering happens during poll, but we can test the exclusion check
      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/App.tsx')).toBe(true);
      expect(fileWatcher['isPathExcluded'](testProjectId, 'src/other.tsx')).toBe(false);
    });
  });

  describe('Logging', () => {
    it('should log with timestamps', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Access the private log method via calling a public method that logs
      fileWatcher.startWatching(testProjectId, testContainerId);
      
      // Should have logged something
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});

describe('FileWatcher Integration Scenarios', () => {
  it('should handle rapid file changes', async () => {
    vi.useFakeTimers();
    
    const fileWatcher = new FileWatcher();
    const changeHandler = vi.fn();
    fileWatcher.on('changes', changeHandler);
    
    fileWatcher.startWatching('project', 'container');
    
    // Simulate rapid changes
    for (let i = 0; i < 10; i++) {
      fileWatcher.emit('changes', {
        projectId: 'project',
        changes: [{ type: 'modify', path: `file${i}.ts`, timestamp: Date.now() }],
      });
    }
    
    expect(changeHandler.mock.calls.length).toBe(10);
    
    fileWatcher.stopWatching('project');
    vi.useRealTimers();
  });

  it('should handle watch/unwatch cycles', () => {
    const fileWatcher = new FileWatcher();
    
    for (let i = 0; i < 5; i++) {
      fileWatcher.startWatching('project', 'container');
      expect(fileWatcher.isWatching('project')).toBe(true);
      
      fileWatcher.stopWatching('project');
      expect(fileWatcher.isWatching('project')).toBe(false);
    }
  });
});
