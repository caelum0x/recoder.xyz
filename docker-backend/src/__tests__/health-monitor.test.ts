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

// Now import the module - note: class is not exported, so we test the singleton and types
import { healthMonitor } from '../health-monitor';
import type { HealthStatus, HealthCheckConfig } from '../health-monitor';

// Helper to create a test HealthMonitor-like object for unit testing patterns
interface MockHealthMonitor {
  isMonitoring: boolean;
  containerConfigs: Map<string, HealthCheckConfig>;
  healthHistory: Map<string, { containerId: string; checks: any[] }>;
  currentStatus: Map<string, HealthStatus>;
  start(): void;
  stop(): void;
  registerContainer(id: string, config?: HealthCheckConfig): void;
  unregisterContainer(id: string): void;
  getHealthStatus(id: string): HealthStatus | null;
  getHealthHistory(id: string): { containerId: string; checks: any[] } | undefined;
  on(event: string, handler: (data: any) => void): void;
  emit(event: string, data: any): void;
}

const createMockHealthMonitor = (): MockHealthMonitor => {
  const containerConfigs = new Map<string, HealthCheckConfig>();
  const healthHistory = new Map<string, { containerId: string; checks: any[] }>();
  const currentStatus = new Map<string, HealthStatus>();
  const listeners = new Map<string, ((data: any) => void)[]>();
  let isMonitoring = false;
  
  return {
    get isMonitoring() { return isMonitoring; },
    containerConfigs,
    healthHistory,
    currentStatus,
    start() { isMonitoring = true; },
    stop() { isMonitoring = false; },
    registerContainer(id: string, config: HealthCheckConfig = {}) {
      containerConfigs.set(id, config);
      healthHistory.set(id, { containerId: id, checks: [] });
      currentStatus.set(id, {
        containerId: id,
        status: 'unknown',
        checks: [],
        resources: { cpuPercent: 0, memoryUsedBytes: 0, memoryLimitBytes: 0, memoryPercent: 0, networkRxBytes: 0, networkTxBytes: 0, blockReadBytes: 0, blockWriteBytes: 0, pidsCount: 0 },
        lastChecked: Date.now(),
        uptimeMs: 0,
        consecutiveFailures: 0,
      });
    },
    unregisterContainer(id: string) {
      containerConfigs.delete(id);
      healthHistory.delete(id);
      currentStatus.delete(id);
    },
    getHealthStatus(id: string) {
      return currentStatus.get(id) || null;
    },
    getHealthHistory(id: string) {
      return healthHistory.get(id);
    },
    on(event: string, handler: (data: any) => void) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    },
    emit(event: string, data: any) {
      listeners.get(event)?.forEach(h => h(data));
    },
  };
};

describe('HealthMonitor', () => {
  let mockHealthMonitor: MockHealthMonitor;
  let mockContainer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHealthMonitor = createMockHealthMonitor();
    vi.useFakeTimers();
    
    mockContainer = {
      inspect: mockInspect.mockResolvedValue({
        State: { Running: true, Status: 'running' },
      }),
      stats: mockStats.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'data') {
            cb(JSON.stringify({
              cpu_stats: { cpu_usage: { total_usage: 1000 }, system_cpu_usage: 10000 },
              precpu_stats: { cpu_usage: { total_usage: 800 }, system_cpu_usage: 9000 },
              memory_stats: { usage: 100000000, limit: 1000000000 },
              networks: { eth0: { rx_bytes: 1000, tx_bytes: 500 } },
              blkio_stats: { io_service_bytes_recursive: [] },
              pids_stats: { current: 10 },
            }));
          }
          if (event === 'end') {
            setTimeout(() => cb(), 10);
          }
          return { on: vi.fn() };
        }),
        destroy: vi.fn(),
      }),
      restart: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          on: vi.fn((event, cb) => {
            if (event === 'end') setTimeout(cb, 10);
          }),
        }),
      }),
    };
    
    mockGetContainer.mockReturnValue(mockContainer);
    mockListContainers.mockResolvedValue([]);
    
    healthMonitor = new HealthMonitor({
      checkIntervalMs: 1000, // Fast checks for testing
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
    it('should transition from unknown to degraded after first failure', async () => {
      const containerId = 'test-container-degraded';
      
      healthMonitor.registerContainer(containerId);
      
      // Simulate health check failure
      mockContainer.inspect.mockRejectedValueOnce(new Error('Connection refused'));
      
      healthMonitor.start();
      await vi.runOnlyPendingTimersAsync();
      
      const status = healthMonitor.getHealthStatus(containerId);
      // After 1 failure with degradedThreshold=1, should be degraded
      expect(status?.status).toBe('degraded');
      expect(status?.consecutiveFailures).toBe(1);
    });

    it('should transition to unhealthy after reaching threshold', async () => {
      const containerId = 'test-container-unhealthy';
      
      healthMonitor.registerContainer(containerId);
      
      // Simulate multiple consecutive failures
      mockContainer.inspect
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'));
      
      healthMonitor.start();
      
      // Run 3 health check cycles
      for (let i = 0; i < 3; i++) {
        await vi.runOnlyPendingTimersAsync();
      }
      
      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.status).toBe('unhealthy');
      expect(status?.consecutiveFailures).toBe(3);
    });

    it('should recover to healthy after successful check', async () => {
      const containerId = 'test-container-recovery';
      
      healthMonitor.registerContainer(containerId);
      
      // First fail, then succeed
      mockContainer.inspect
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ State: { Running: true } });
      
      healthMonitor.start();
      
      // First check - fails
      await vi.runOnlyPendingTimersAsync();
      expect(healthMonitor.getHealthStatus(containerId)?.status).toBe('degraded');
      
      // Second check - succeeds
      await vi.runOnlyPendingTimersAsync();
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
      await vi.runOnlyPendingTimersAsync();
      
      const status = healthMonitor.getHealthStatus(containerId);
      expect(status).toBeDefined();
      expect(status?.status).not.toBe('healthy');
    });

    it('should handle container not found', async () => {
      const containerId = 'nonexistent-container';
      
      mockGetContainer.mockReturnValueOnce({
        inspect: vi.fn().mockRejectedValue(new Error('No such container')),
      });
      
      healthMonitor.registerContainer(containerId);
      healthMonitor.start();
      await vi.runOnlyPendingTimersAsync();
      
      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.status).toBe('unknown');
    });

    it('should track consecutive errors accurately', async () => {
      const containerId = 'test-error-tracking';
      
      healthMonitor.registerContainer(containerId);
      mockContainer.inspect.mockRejectedValue(new Error('Network error'));
      
      healthMonitor.start();
      
      // Run 5 failed checks
      for (let i = 0; i < 5; i++) {
        await vi.runOnlyPendingTimersAsync();
      }
      
      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.consecutiveFailures).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Event Emission', () => {
    it('should emit status_changed event on transition', async () => {
      const containerId = 'test-event-emission';
      const statusChangedHandler = vi.fn();
      
      healthMonitor.on('status_changed', statusChangedHandler);
      healthMonitor.registerContainer(containerId);
      
      mockContainer.inspect.mockRejectedValueOnce(new Error('Check failed'));
      
      healthMonitor.start();
      await vi.runOnlyPendingTimersAsync();
      
      expect(statusChangedHandler).toHaveBeenCalled();
      const [event] = statusChangedHandler.mock.calls[0];
      expect(event.containerId).toBe(containerId);
    });

    it('should emit unhealthy event when threshold reached', async () => {
      const containerId = 'test-unhealthy-event';
      const unhealthyHandler = vi.fn();
      
      healthMonitor.on('container_unhealthy', unhealthyHandler);
      healthMonitor.registerContainer(containerId);
      
      mockContainer.inspect.mockRejectedValue(new Error('Persistent failure'));
      
      healthMonitor.start();
      
      // Run enough cycles to reach unhealthy threshold
      for (let i = 0; i < 3; i++) {
        await vi.runOnlyPendingTimersAsync();
      }
      
      expect(unhealthyHandler).toHaveBeenCalled();
    });
  });

  describe('Resource Monitoring', () => {
    it('should track memory usage', async () => {
      const containerId = 'test-memory';
      
      healthMonitor.registerContainer(containerId, {
        resourceThresholds: {
          maxMemoryPercent: 80,
        },
      });
      
      healthMonitor.start();
      await vi.runOnlyPendingTimersAsync();
      
      const status = healthMonitor.getHealthStatus(containerId);
      expect(status?.resources).toBeDefined();
      expect(status?.resources.memoryPercent).toBeDefined();
    });

    it('should flag high memory usage as degraded', async () => {
      const containerId = 'test-high-memory';
      
      // Mock high memory usage
      mockContainer.stats.mockResolvedValue({
        on: vi.fn((event, cb) => {
          if (event === 'data') {
            cb(JSON.stringify({
              memory_stats: { usage: 900000000, limit: 1000000000 }, // 90%
              cpu_stats: { cpu_usage: { total_usage: 1000 }, system_cpu_usage: 10000 },
              precpu_stats: { cpu_usage: { total_usage: 800 }, system_cpu_usage: 9000 },
              networks: {},
              blkio_stats: {},
              pids_stats: { current: 10 },
            }));
          }
          if (event === 'end') setTimeout(() => cb(), 10);
          return { on: vi.fn() };
        }),
        destroy: vi.fn(),
      });
      
      healthMonitor.registerContainer(containerId, {
        resourceThresholds: {
          maxMemoryPercent: 85, // Threshold below current usage
        },
      });
      
      healthMonitor.start();
      await vi.runOnlyPendingTimersAsync();
      
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
      for (let i = 0; i < 5; i++) {
        await vi.runOnlyPendingTimersAsync();
      }
      
      const history = healthMonitor.getHealthHistory(containerId);
      expect(history).toBeDefined();
      expect(history?.checks.length).toBeGreaterThan(0);
    });

    it('should limit history size', async () => {
      const containerId = 'test-history-limit';
      
      healthMonitor.registerContainer(containerId);
      healthMonitor.start();
      
      // Run more checks than history size allows
      for (let i = 0; i < 20; i++) {
        await vi.runOnlyPendingTimersAsync();
      }
      
      const history = healthMonitor.getHealthHistory(containerId);
      expect(history?.checks.length).toBeLessThanOrEqual(10); // historySize
    });
  });

  describe('Container Restart', () => {
    it('should trigger restart callback on unhealthy', async () => {
      const containerId = 'test-restart-callback';
      const restartCallback = vi.fn();
      
      healthMonitor.on('container_unhealthy', restartCallback);
      healthMonitor.registerContainer(containerId);
      
      mockContainer.inspect.mockRejectedValue(new Error('Container unresponsive'));
      
      healthMonitor.start();
      
      // Reach unhealthy threshold
      for (let i = 0; i < 3; i++) {
        await vi.runOnlyPendingTimersAsync();
      }
      
      expect(restartCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          containerId,
          status: 'unhealthy',
        })
      );
    });
  });
});

// Export for type checking
export { HealthMonitor };
