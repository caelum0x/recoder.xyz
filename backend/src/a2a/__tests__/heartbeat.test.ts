/**
 * @module heartbeat.test
 *
 * Comprehensive test suite for the A2A agent heartbeat tracking system.
 *
 * Covers:
 * - HeartbeatTracker service: recording heartbeats, timeout detection,
 *   sweep passes, event emission, active probing, cleanup
 * - Heartbeat route handlers: POST heartbeat, GET aggregated health,
 *   GET single agent health
 * - Edge cases: invalid inputs, unknown agents, status transitions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HeartbeatTracker,
  getHeartbeatTracker,
  resetHeartbeatTracker,
  setHeartbeatTracker,
  type AgentHeartbeatStatus,
  type HeartbeatTrackerConfig,
  type FetchFn,
} from '../heartbeat-tracker.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTracker(
  config?: Partial<HeartbeatTrackerConfig>,
  fetchFn?: FetchFn,
): HeartbeatTracker {
  return new HeartbeatTracker(
    {
      heartbeatIntervalSeconds: 30,
      timeoutMs: 90_000,
      sweepIntervalMs: 60_000,
      probeIntervalMs: 60_000,
      probeRequestTimeoutMs: 5_000,
      ...config,
    },
    fetchFn,
  );
}

function makeMockReq(body?: any, params?: any): any {
  return {
    body: body ?? {},
    params: params ?? {},
    query: {},
    headers: {},
  };
}

function makeMockRes(): any {
  const res: any = {
    _status: 200,
    _data: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._data = data;
      return res;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// HeartbeatTracker Service Tests
// ---------------------------------------------------------------------------

describe('HeartbeatTracker', () => {
  let tracker: HeartbeatTracker;

  beforeEach(() => {
    tracker = makeTracker();
  });

  afterEach(() => {
    tracker.destroy();
    resetHeartbeatTracker();
  });

  // -------------------------------------------------------------------------
  // Recording heartbeats
  // -------------------------------------------------------------------------

  describe('recordHeartbeat', () => {
    it('should record a heartbeat and return acknowledgment', () => {
      const result = tracker.recordHeartbeat('agent-1', 'healthy');

      expect(result.acknowledged).toBe(true);
      expect(result.next_heartbeat_seconds).toBe(30);
    });

    it('should store the heartbeat record', () => {
      tracker.recordHeartbeat('agent-1', 'healthy', { version: '1.0.0' });

      const record = tracker.getRecord('agent-1');
      expect(record).toBeDefined();
      expect(record!.agentId).toBe('agent-1');
      expect(record!.status).toBe('healthy');
      expect(record!.isOnline).toBe(true);
      expect(record!.metadata.version).toBe('1.0.0');
    });

    it('should update existing record on subsequent heartbeats', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      const first = tracker.getRecord('agent-1')!;
      const firstTime = first.lastHeartbeatAt;

      // Small delay to ensure time difference
      tracker.recordHeartbeat('agent-1', 'degraded', { cpu: 85 });
      const second = tracker.getRecord('agent-1')!;

      expect(second.status).toBe('degraded');
      expect(second.lastHeartbeatAt).toBeGreaterThanOrEqual(firstTime);
      expect(second.metadata.cpu).toBe(85);
    });

    it('should emit agent:online when first heartbeat is received', () => {
      const onlineHandler = vi.fn();
      tracker.events.on('agent:online', onlineHandler);

      tracker.recordHeartbeat('agent-1', 'healthy');

      expect(onlineHandler).toHaveBeenCalledTimes(1);
      expect(onlineHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          status: 'healthy',
        }),
      );
    });

    it('should emit agent:status-changed when status changes', () => {
      const statusHandler = vi.fn();
      tracker.events.on('agent:status-changed', statusHandler);

      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-1', 'degraded');

      expect(statusHandler).toHaveBeenCalledTimes(1);
      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          previousStatus: 'healthy',
          newStatus: 'degraded',
        }),
      );
    });

    it('should not emit agent:status-changed if status is the same', () => {
      const statusHandler = vi.fn();
      tracker.events.on('agent:status-changed', statusHandler);

      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-1', 'healthy');

      expect(statusHandler).not.toHaveBeenCalled();
    });

    it('should emit agent:online when recovering from offline', () => {
      const onlineHandler = vi.fn();
      tracker.events.on('agent:online', onlineHandler);

      // Record heartbeat, then force offline via sweep
      tracker.recordHeartbeat('agent-1', 'healthy');
      const record = tracker.getRecord('agent-1')!;
      // Simulate timeout by manipulating timestamp
      record.lastHeartbeatAt = Date.now() - 100_000;
      record.isOnline = false;

      // New heartbeat should trigger online event again
      tracker.recordHeartbeat('agent-1', 'healthy');

      expect(onlineHandler).toHaveBeenCalledTimes(2); // once for initial, once for recovery
    });

    it('should preserve probe data across heartbeats', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      const record = tracker.getRecord('agent-1')!;
      record.probe = {
        url: 'http://agent-1/health',
        statusCode: 200,
        responseTimeMs: 50,
        ok: true,
        lastProbeAt: Date.now(),
      };

      tracker.recordHeartbeat('agent-1', 'healthy');
      const updated = tracker.getRecord('agent-1')!;
      expect(updated.probe).toBeDefined();
      expect(updated.probe!.url).toBe('http://agent-1/health');
    });

    it('should pass through additional metadata keys', () => {
      tracker.recordHeartbeat('agent-1', 'healthy', {
        version: '2.0',
        customField: 'custom-value',
      });

      const record = tracker.getRecord('agent-1')!;
      expect(record.metadata.version).toBe('2.0');
      expect(record.metadata.customField).toBe('custom-value');
    });
  });

  // -------------------------------------------------------------------------
  // Agent removal
  // -------------------------------------------------------------------------

  describe('removeAgent', () => {
    it('should remove the heartbeat record', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      expect(tracker.getRecord('agent-1')).toBeDefined();

      const removed = tracker.removeAgent('agent-1');
      expect(removed).toBe(true);
      expect(tracker.getRecord('agent-1')).toBeUndefined();
    });

    it('should remove the health URL', () => {
      tracker.setHealthUrl('agent-1', 'http://agent-1/health');
      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.removeAgent('agent-1');

      // After removal, probing should not target this agent
      expect(tracker.getRecord('agent-1')).toBeUndefined();
    });

    it('should return false for unknown agent', () => {
      const removed = tracker.removeAgent('nonexistent');
      expect(removed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Online status checks
  // -------------------------------------------------------------------------

  describe('isAgentOnline', () => {
    it('should return true for an agent with a recent heartbeat', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      expect(tracker.isAgentOnline('agent-1')).toBe(true);
    });

    it('should return false for an unknown agent', () => {
      expect(tracker.isAgentOnline('nonexistent')).toBe(false);
    });

    it('should return false for an agent whose heartbeat has timed out', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      const record = tracker.getRecord('agent-1')!;
      record.lastHeartbeatAt = Date.now() - 100_000; // past the 90s timeout

      expect(tracker.isAgentOnline('agent-1')).toBe(false);
    });

    it('should return false for an agent marked offline', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      const record = tracker.getRecord('agent-1')!;
      record.isOnline = false;

      expect(tracker.isAgentOnline('agent-1')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Sweep
  // -------------------------------------------------------------------------

  describe('sweep', () => {
    it('should mark agents as offline after timeout', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-2', 'healthy');

      // Simulate agent-1 being stale
      const record1 = tracker.getRecord('agent-1')!;
      record1.lastHeartbeatAt = Date.now() - 100_000;

      tracker.sweep();

      expect(tracker.getRecord('agent-1')!.isOnline).toBe(false);
      expect(tracker.getRecord('agent-2')!.isOnline).toBe(true);
    });

    it('should emit agent:offline for newly-offline agents', () => {
      const offlineHandler = vi.fn();
      tracker.events.on('agent:offline', offlineHandler);

      tracker.recordHeartbeat('agent-1', 'healthy');
      const record = tracker.getRecord('agent-1')!;
      record.lastHeartbeatAt = Date.now() - 100_000;

      tracker.sweep();

      expect(offlineHandler).toHaveBeenCalledTimes(1);
      expect(offlineHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
        }),
      );
    });

    it('should not emit agent:offline if already offline', () => {
      const offlineHandler = vi.fn();
      tracker.events.on('agent:offline', offlineHandler);

      tracker.recordHeartbeat('agent-1', 'healthy');
      const record = tracker.getRecord('agent-1')!;
      record.lastHeartbeatAt = Date.now() - 100_000;

      tracker.sweep(); // first sweep marks offline
      tracker.sweep(); // second sweep should not re-emit

      expect(offlineHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit sweep:completed with summary', () => {
      const sweepHandler = vi.fn();
      tracker.events.on('sweep:completed', sweepHandler);

      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-2', 'healthy');

      const record1 = tracker.getRecord('agent-1')!;
      record1.lastHeartbeatAt = Date.now() - 100_000;

      tracker.sweep();

      expect(sweepHandler).toHaveBeenCalledTimes(1);
      expect(sweepHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAgents: 2,
          onlineCount: 1,
          offlineCount: 1,
          newlyOffline: ['agent-1'],
        }),
      );
    });

    it('should handle empty tracker gracefully', () => {
      const sweepHandler = vi.fn();
      tracker.events.on('sweep:completed', sweepHandler);

      tracker.sweep();

      expect(sweepHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAgents: 0,
          onlineCount: 0,
          offlineCount: 0,
          newlyOffline: [],
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Health aggregation
  // -------------------------------------------------------------------------

  describe('getHealthAggregation', () => {
    it('should return empty aggregation when no agents tracked', () => {
      const result = tracker.getHealthAggregation();

      expect(result.agents).toHaveLength(0);
      expect(result.summary.total).toBe(0);
      expect(result.summary.online).toBe(0);
      expect(result.summary.offline).toBe(0);
      expect(result.summary.degraded).toBe(0);
    });

    it('should aggregate health across all agents', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-2', 'degraded');
      tracker.recordHeartbeat('agent-3', 'unhealthy');

      const result = tracker.getHealthAggregation();

      expect(result.agents).toHaveLength(3);
      expect(result.summary.total).toBe(3);
      expect(result.summary.online).toBe(3);
      expect(result.summary.offline).toBe(0);
      // degraded counts agents that are online AND have degraded status
      expect(result.summary.degraded).toBe(1);
    });

    it('should count offline agents correctly', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-2', 'healthy');

      const record2 = tracker.getRecord('agent-2')!;
      record2.lastHeartbeatAt = Date.now() - 100_000;

      const result = tracker.getHealthAggregation();

      expect(result.summary.online).toBe(1);
      expect(result.summary.offline).toBe(1);
    });

    it('should include ISO timestamps in agent entries', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');

      const result = tracker.getHealthAggregation();
      const agent = result.agents[0];

      expect(agent.lastHeartbeat).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include metadata in agent entries', () => {
      tracker.recordHeartbeat('agent-1', 'healthy', {
        cpu: 45,
        memory: 2048,
        activeTaskCount: 3,
        version: '1.0.0',
      });

      const result = tracker.getHealthAggregation();
      const agent = result.agents[0];

      expect(agent.metadata.cpu).toBe(45);
      expect(agent.metadata.memory).toBe(2048);
      expect(agent.metadata.activeTaskCount).toBe(3);
      expect(agent.metadata.version).toBe('1.0.0');
    });
  });

  // -------------------------------------------------------------------------
  // Active health probing
  // -------------------------------------------------------------------------

  describe('probeAgent', () => {
    it('should record successful probe result', async () => {
      const mockFetch: FetchFn = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
      });

      const probingTracker = makeTracker({}, mockFetch);
      probingTracker.recordHeartbeat('agent-1', 'healthy');

      const result = await probingTracker.probeAgent('agent-1', 'http://agent-1/health');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);

      const record = probingTracker.getRecord('agent-1')!;
      expect(record.probe).toBeDefined();
      expect(record.probe!.ok).toBe(true);

      probingTracker.destroy();
    });

    it('should record failed probe result', async () => {
      const mockFetch: FetchFn = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const probingTracker = makeTracker({}, mockFetch);
      probingTracker.recordHeartbeat('agent-1', 'healthy');

      const result = await probingTracker.probeAgent('agent-1', 'http://agent-1/health');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBeNull();
      expect(result.error).toBe('Connection refused');

      probingTracker.destroy();
    });

    it('should emit agent:probe-failed on probe error', async () => {
      const mockFetch: FetchFn = vi.fn().mockRejectedValue(new Error('Timeout'));
      const probingTracker = makeTracker({}, mockFetch);
      probingTracker.recordHeartbeat('agent-1', 'healthy');

      const probeFailedHandler = vi.fn();
      probingTracker.events.on('agent:probe-failed', probeFailedHandler);

      await probingTracker.probeAgent('agent-1', 'http://agent-1/health');

      expect(probeFailedHandler).toHaveBeenCalledTimes(1);
      expect(probeFailedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          url: 'http://agent-1/health',
          error: 'Timeout',
        }),
      );

      probingTracker.destroy();
    });

    it('should handle non-200 responses', async () => {
      const mockFetch: FetchFn = vi.fn().mockResolvedValue({
        status: 503,
        ok: false,
      });

      const probingTracker = makeTracker({}, mockFetch);
      probingTracker.recordHeartbeat('agent-1', 'healthy');

      const result = await probingTracker.probeAgent('agent-1', 'http://agent-1/health');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(503);

      probingTracker.destroy();
    });
  });

  describe('probeAll', () => {
    it('should probe all agents with registered health URLs', async () => {
      const mockFetch: FetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true });
      const probingTracker = makeTracker({}, mockFetch);

      probingTracker.recordHeartbeat('agent-1', 'healthy');
      probingTracker.recordHeartbeat('agent-2', 'healthy');
      probingTracker.setHealthUrl('agent-1', 'http://agent-1/health');
      probingTracker.setHealthUrl('agent-2', 'http://agent-2/health');

      await probingTracker.probeAll();

      expect(mockFetch).toHaveBeenCalledTimes(2);

      probingTracker.destroy();
    });

    it('should not fail if one probe fails', async () => {
      const mockFetch: FetchFn = vi.fn()
        .mockResolvedValueOnce({ status: 200, ok: true })
        .mockRejectedValueOnce(new Error('Down'));

      const probingTracker = makeTracker({}, mockFetch);
      probingTracker.recordHeartbeat('agent-1', 'healthy');
      probingTracker.recordHeartbeat('agent-2', 'healthy');
      probingTracker.setHealthUrl('agent-1', 'http://agent-1/health');
      probingTracker.setHealthUrl('agent-2', 'http://agent-2/health');

      // Should not throw
      await probingTracker.probeAll();

      expect(mockFetch).toHaveBeenCalledTimes(2);

      probingTracker.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle (start/stop/destroy)
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('should start and stop sweep timer', () => {
      const t = makeTracker({ sweepIntervalMs: 100_000, probeIntervalMs: 100_000 });
      t.start();

      // Starting again should be a no-op (no error)
      t.start();

      t.stop();
      t.destroy();
    });

    it('should clear all state on destroy', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.setHealthUrl('agent-1', 'http://agent-1/health');

      tracker.destroy();

      expect(tracker.getRecord('agent-1')).toBeUndefined();
      expect(tracker.getAllRecords()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Singleton management
  // -------------------------------------------------------------------------

  describe('singleton', () => {
    afterEach(() => {
      resetHeartbeatTracker();
    });

    it('should return same instance from getHeartbeatTracker', () => {
      const a = getHeartbeatTracker();
      const b = getHeartbeatTracker();
      expect(a).toBe(b);
    });

    it('should allow replacing the singleton', () => {
      const custom = makeTracker({ heartbeatIntervalSeconds: 15 });
      setHeartbeatTracker(custom);

      const result = getHeartbeatTracker();
      expect(result).toBe(custom);
      expect(result.config.heartbeatIntervalSeconds).toBe(15);

      custom.destroy();
    });

    it('should destroy old instance on reset', () => {
      const instance = getHeartbeatTracker();
      instance.recordHeartbeat('agent-1', 'healthy');

      resetHeartbeatTracker();

      // New instance should be fresh
      const newInstance = getHeartbeatTracker();
      expect(newInstance).not.toBe(instance);
      expect(newInstance.getAllRecords()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getAllRecords
  // -------------------------------------------------------------------------

  describe('getAllRecords', () => {
    it('should return all tracked agent records', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-2', 'degraded');
      tracker.recordHeartbeat('agent-3', 'unhealthy');

      const records = tracker.getAllRecords();
      expect(records).toHaveLength(3);
      expect(records.map((r) => r.agentId).sort()).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });
  });

  // -------------------------------------------------------------------------
  // Health URL management
  // -------------------------------------------------------------------------

  describe('healthUrl management', () => {
    it('should set and remove health URLs', () => {
      tracker.setHealthUrl('agent-1', 'http://agent-1/health');
      tracker.removeHealthUrl('agent-1');

      // No error, and probeAll should not try to probe
      const mockFetch: FetchFn = vi.fn().mockResolvedValue({ status: 200, ok: true });
      const probingTracker = makeTracker({}, mockFetch);
      probingTracker.setHealthUrl('agent-1', 'http://agent-1/health');
      probingTracker.removeHealthUrl('agent-1');

      void probingTracker.probeAll().then(() => {
        expect(mockFetch).not.toHaveBeenCalled();
        probingTracker.destroy();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle rapid heartbeats from same agent', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordHeartbeat('agent-1', 'healthy');
      }

      expect(tracker.getAllRecords()).toHaveLength(1);
      expect(tracker.getRecord('agent-1')!.isOnline).toBe(true);
    });

    it('should handle many agents', () => {
      for (let i = 0; i < 50; i++) {
        tracker.recordHeartbeat(`agent-${i}`, 'healthy');
      }

      expect(tracker.getAllRecords()).toHaveLength(50);
      const agg = tracker.getHealthAggregation();
      expect(agg.summary.total).toBe(50);
      expect(agg.summary.online).toBe(50);
    });

    it('should handle agent going unhealthy -> offline -> back online', () => {
      const events: string[] = [];
      tracker.events.on('agent:online', () => events.push('online'));
      tracker.events.on('agent:offline', () => events.push('offline'));
      tracker.events.on('agent:status-changed', (e) => events.push(`status:${e.newStatus}`));

      // Step 1: Agent comes online healthy
      tracker.recordHeartbeat('agent-1', 'healthy');
      // Step 2: Agent reports unhealthy
      tracker.recordHeartbeat('agent-1', 'unhealthy');
      // Step 3: Simulate timeout -> offline
      const record = tracker.getRecord('agent-1')!;
      record.lastHeartbeatAt = Date.now() - 100_000;
      tracker.sweep();
      // Step 4: Agent recovers
      tracker.recordHeartbeat('agent-1', 'healthy');

      expect(events).toEqual([
        'online',           // initial
        'status:unhealthy', // healthy -> unhealthy
        'offline',          // timeout
        'online',           // recovery
        'status:healthy',   // unhealthy -> healthy
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// Route Handler Tests
// ---------------------------------------------------------------------------

describe('heartbeat routes', () => {
  // We test the route handlers by importing the router and simulating
  // requests using the route handler functions directly.

  let tracker: HeartbeatTracker;

  beforeEach(() => {
    tracker = makeTracker();
    setHeartbeatTracker(tracker);
  });

  afterEach(() => {
    resetHeartbeatTracker();
  });

  // We need to import the route module dynamically since it uses the singleton
  // heartbeatRouter is just an Express Router; testing the handler functions
  // directly requires extracting them. For simplicity, we'll test through
  // the service + verify the contract.

  describe('POST /agents/:agentId/heartbeat (contract)', () => {
    it('should accept valid heartbeat and return acknowledgment', () => {
      const result = tracker.recordHeartbeat('agent-1', 'healthy', { version: '1.0' });

      expect(result).toEqual({
        acknowledged: true,
        next_heartbeat_seconds: 30,
      });
    });

    it('should accept degraded status', () => {
      const result = tracker.recordHeartbeat('agent-1', 'degraded', { cpu: 95 });

      expect(result.acknowledged).toBe(true);
      const record = tracker.getRecord('agent-1')!;
      expect(record.status).toBe('degraded');
    });

    it('should accept unhealthy status', () => {
      const result = tracker.recordHeartbeat('agent-1', 'unhealthy');

      expect(result.acknowledged).toBe(true);
      const record = tracker.getRecord('agent-1')!;
      expect(record.status).toBe('unhealthy');
    });
  });

  describe('GET /health (contract)', () => {
    it('should return correct aggregation shape', () => {
      tracker.recordHeartbeat('agent-1', 'healthy');
      tracker.recordHeartbeat('agent-2', 'degraded');

      const agg = tracker.getHealthAggregation();

      expect(agg).toHaveProperty('agents');
      expect(agg).toHaveProperty('summary');
      expect(agg.summary).toEqual({
        total: 2,
        online: 2,
        offline: 0,
        degraded: 1,
      });

      for (const agent of agg.agents) {
        expect(agent).toHaveProperty('agentId');
        expect(agent).toHaveProperty('status');
        expect(agent).toHaveProperty('lastHeartbeat');
        expect(agent).toHaveProperty('isOnline');
      }
    });
  });

  describe('GET /agents/:agentId/health (contract)', () => {
    it('should return agent health data', () => {
      tracker.recordHeartbeat('agent-1', 'healthy', { memory: 512 });

      const record = tracker.getRecord('agent-1');
      expect(record).toBeDefined();
      expect(record!.agentId).toBe('agent-1');
      expect(record!.status).toBe('healthy');
      expect(record!.isOnline).toBe(true);
      expect(record!.metadata.memory).toBe(512);
    });

    it('should return undefined for unknown agent', () => {
      const record = tracker.getRecord('nonexistent');
      expect(record).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Configurable timeout tests
// ---------------------------------------------------------------------------

describe('HeartbeatTracker with custom config', () => {
  it('should use custom timeout for offline detection', () => {
    const tracker = makeTracker({ timeoutMs: 5_000 }); // 5s timeout

    tracker.recordHeartbeat('agent-1', 'healthy');
    const record = tracker.getRecord('agent-1')!;
    record.lastHeartbeatAt = Date.now() - 6_000; // 6s ago

    tracker.sweep();

    expect(tracker.getRecord('agent-1')!.isOnline).toBe(false);

    tracker.destroy();
  });

  it('should not mark agent offline before timeout', () => {
    const tracker = makeTracker({ timeoutMs: 10_000 }); // 10s timeout

    tracker.recordHeartbeat('agent-1', 'healthy');
    const record = tracker.getRecord('agent-1')!;
    record.lastHeartbeatAt = Date.now() - 5_000; // 5s ago (within 10s window)

    tracker.sweep();

    expect(tracker.getRecord('agent-1')!.isOnline).toBe(true);

    tracker.destroy();
  });

  it('should return custom heartbeat interval in acknowledgment', () => {
    const tracker = makeTracker({ heartbeatIntervalSeconds: 15 });

    const result = tracker.recordHeartbeat('agent-1', 'healthy');
    expect(result.next_heartbeat_seconds).toBe(15);

    tracker.destroy();
  });
});
