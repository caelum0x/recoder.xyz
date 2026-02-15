/**
 * Health Monitor Tests
 *
 * Tests container health monitoring, status transitions, and auto-restart logic.
 * Based on issues found in docker-logs.md:
 * - Container status transitions: unknown -> degraded -> unhealthy
 * - ECONNRESET error handling
 * - Container restart on unhealthy status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() to ensure mocks are available before module loading
const { mockInspect, mockStats, mockGetContainer, mockListContainers } = vi.hoisted(() => {
  const mockInspect = vi.fn();
  const mockStats = vi.fn();
  const mockGetContainer = vi.fn();
  const mockListContainers = vi.fn();
  return { mockInspect, mockStats, mockGetContainer, mockListContainers };
});

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getContainer: mockGetContainer,
      listContainers: mockListContainers,
    })),
  };
});

// Mock http and net for health checks
vi.mock('http', () => ({
  default: {
    get: vi.fn(),
    request: vi.fn(),
  },
}));

vi.mock('net', () => ({
  default: {
    createConnection: vi.fn(),
  },
}));

import { HealthMonitor } from '../health-monitor';
import type { HealthStatus, HealthCheckConfig } from '../health-monitor';

describe('HealthMonitor', () => {
  let healthMonitor: InstanceType<typeof HealthMonitor>;
  let mockContainer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock container.stats to return data directly (non-streaming)
    mockStats.mockResolvedValue({
      cpu_stats: { cpu_usage: { total_usage: 1000 }, system_cpu_usage: 10000, online_cpus: 1 },
      precpu_stats: { cpu_usage: { total_usage: 800 }, system_cpu_usage: 9000 },
      memory_stats: { usage: 100000000, limit: 1000000000 },
      networks: { eth0: { rx_bytes: 1000, tx_bytes: 500 } },
      blkio_stats: { io_service_bytes_recursive: [] },
      pids_stats: { current: 10 },
    });

    mockContainer = {
      inspect: mockInspect.mockResolvedValue({
        State: { Running: true, Status: 'running', StartedAt: new Date().toISOString() },
        Config: { Labels: {} },
      }),
      stats: mockStats,
      restart: vi.fn().mockResolvedValue(undefined),
    };

    mockGetContainer.mockReturnValue(mockContainer);
    mockListContainers.mockResolvedValue([]);

    healthMonitor = new HealthMonitor({
      checkIntervalMs: 1000,
      unhealthyThreshold: 3,
      degradedThreshold: 1,
      historySize: 10,
      defaultTimeoutMs: 1000,
    });
  });

  afterEach(() => {
    healthMonitor.stop();
    vi.useRealTimers();
  });

  describe('Basic Operations', () => {
    it('should start and stop monitoring', () => {
      healthMonitor.start();
      expect(healthMonitor['isMonitoring']).toBe(true);

      healthMonitor.stop();
      expect(healthMonitor['isMonitoring']).toBe(false);
    });

    it('should not start twice', () => {
      healthMonitor.start();
      healthMonitor.start(); // Second call should be ignored
      expect(healthMonitor['isMonitoring']).toBe(true);
    });

    it('should register and unregister containers', () => {
      const containerId = 'test-container-123';

      healthMonitor.registerContainer(containerId);
      expect(healthMonitor['containerConfigs'].has(containerId)).toBe(true);
      expect(healthMonitor['healthHistory'].has(containerId)).toBe(true);

      healthMonitor.unregisterContainer(containerId);
      expect(healthMonitor['containerConfigs'].has(containerId)).toBe(false);
      expect(healthMonitor['healthHistory'].has(containerId)).toBe(false);
    });
  });

  describe('Health Status Transitions', () => {
    it('should go to unhealthy when inspect throws', async () => {
      const containerId = 'test-container-inspect-fail';

      healthMonitor.registerContainer(containerId);

      // When inspect rejects, createUnhealthyStatus is called which always returns 'unhealthy'
      mockContainer.inspect.mockRejectedValueOnce(new Error('Connection refused'));

      healthMonitor.start();
      // Let the initial check run
      await vi.advanceTimersByTimeAsync(0);

      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.status).toBe('unhealthy');
      expect(status?.consecutiveFailures).toBe(1);
    });

    it('should increment consecutive failures on repeated errors', async () => {
      const containerId = 'test-container-repeated-fail';

      healthMonitor.registerContainer(containerId);

      mockContainer.inspect
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'));

      healthMonitor.start();

      // Run initial check + 2 interval checks
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.status).toBe('unhealthy');
      expect(status?.consecutiveFailures).toBeGreaterThanOrEqual(3);
    });

    it('should recover to healthy after successful check', async () => {
      const containerId = 'test-container-recovery';

      healthMonitor.registerContainer(containerId);

      // First fail, then succeed
      mockContainer.inspect
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue({
          State: { Running: true, StartedAt: new Date().toISOString() },
          Config: { Labels: {} },
        });

      healthMonitor.start();

      // First check - fails → unhealthy
      await vi.advanceTimersByTimeAsync(0);
      expect(healthMonitor.getHealthStatus(containerId)?.status).toBe('unhealthy');

      // Second check - succeeds → healthy (consecutiveFailures resets to 0)
      await vi.advanceTimersByTimeAsync(1000);
      expect(healthMonitor.getHealthStatus(containerId)?.status).toBe('healthy');
      expect(healthMonitor.getHealthStatus(containerId)?.consecutiveFailures).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle ECONNRESET errors gracefully', async () => {
      const containerId = 'test-container-econnreset';

      healthMonitor.registerContainer(containerId);
      mockContainer.inspect.mockRejectedValue(new Error('read ECONNRESET'));

      healthMonitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const status = healthMonitor.getHealthStatus(containerId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('unhealthy');
    });

    it('should handle container not found', async () => {
      const containerId = 'nonexistent-container';

      mockGetContainer.mockReturnValueOnce({
        inspect: vi.fn().mockRejectedValue(new Error('No such container')),
        stats: mockStats,
      });

      healthMonitor.registerContainer(containerId);
      healthMonitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const status = healthMonitor.getHealthStatus(containerId);
      // When inspect throws, createUnhealthyStatus returns 'unhealthy'
      expect(status?.status).toBe('unhealthy');
    });

    it('should track consecutive errors accurately', async () => {
      const containerId = 'test-error-tracking';

      healthMonitor.registerContainer(containerId);
      mockContainer.inspect.mockRejectedValue(new Error('Network error'));

      healthMonitor.start();

      // Run initial + 4 interval checks = 5 total
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.consecutiveFailures).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Event Emission', () => {
    it('should emit status-change event on transition', async () => {
      const containerId = 'test-event-emission';
      const statusChangeHandler = vi.fn();

      healthMonitor.on('status-change', statusChangeHandler);
      healthMonitor.registerContainer(containerId);

      mockContainer.inspect.mockRejectedValueOnce(new Error('Check failed'));

      healthMonitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(statusChangeHandler).toHaveBeenCalled();
      const event = statusChangeHandler.mock.calls[0][0];
      expect(event.containerId).toBe(containerId);
    });

    it('should emit unhealthy event when inspect fails', async () => {
      const containerId = 'test-unhealthy-event';
      const unhealthyHandler = vi.fn();

      healthMonitor.on('unhealthy', unhealthyHandler);
      healthMonitor.registerContainer(containerId);

      mockContainer.inspect.mockRejectedValue(new Error('Persistent failure'));

      healthMonitor.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(unhealthyHandler).toHaveBeenCalled();
    });
  });

  describe('Resource Monitoring', () => {
    it('should track memory usage when container is healthy', async () => {
      const containerId = 'test-memory';

      healthMonitor.registerContainer(containerId);

      healthMonitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.resources).toBeDefined();
      expect(status?.resources.memoryPercent).toBeDefined();
    });

    it('should detect high memory usage', async () => {
      const containerId = 'test-high-memory';

      // Mock high memory usage (90%)
      mockStats.mockResolvedValue({
        memory_stats: { usage: 900000000, limit: 1000000000 },
        cpu_stats: { cpu_usage: { total_usage: 1000 }, system_cpu_usage: 10000, online_cpus: 1 },
        precpu_stats: { cpu_usage: { total_usage: 800 }, system_cpu_usage: 9000 },
        networks: {},
        blkio_stats: {},
        pids_stats: { current: 10 },
      });

      healthMonitor.registerContainer(containerId, {
        resourceThresholds: {
          maxMemoryPercent: 85,
        },
      });

      healthMonitor.start();
      await vi.advanceTimersByTimeAsync(0);

      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.resources.memoryPercent).toBeGreaterThan(85);
    });
  });

  describe('Health History', () => {
    it('should maintain health check history', async () => {
      const containerId = 'test-history';

      healthMonitor.registerContainer(containerId);
      healthMonitor.start();

      // Run several checks
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const history = healthMonitor.getHealthHistory(containerId);
      expect(history).toBeDefined();
      expect(history?.checks.length).toBeGreaterThan(0);
    });

    it('should limit history size', async () => {
      const containerId = 'test-history-limit';

      healthMonitor.registerContainer(containerId);
      healthMonitor.start();

      // Run many checks (initial + 19 interval)
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 19; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const history = healthMonitor.getHealthHistory(containerId);
      expect(history?.checks.length).toBeLessThanOrEqual(10); // historySize
    });
  });

  describe('Container Restart', () => {
    it('should trigger unhealthy event callback on failure', async () => {
      const containerId = 'test-restart-callback';
      const unhealthyCallback = vi.fn();

      healthMonitor.on('unhealthy', unhealthyCallback);
      healthMonitor.registerContainer(containerId);

      mockContainer.inspect.mockRejectedValue(new Error('Container unresponsive'));

      healthMonitor.start();
      await vi.advanceTimersByTimeAsync(0);

      // Since inspect throws, it immediately becomes unhealthy
      expect(unhealthyCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          containerId,
          status: 'unhealthy',
        })
      );
    });
  });
});
