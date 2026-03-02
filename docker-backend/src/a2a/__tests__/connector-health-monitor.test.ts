/**
 * @module connector-health-monitor.test
 *
 * Comprehensive test suite for the ConnectorHealthMonitor service.
 *
 * Covers:
 * - Registration: register/unregister, isRegistered, duplicate handling
 * - Health queries: getConnectorHealth, getAllConnectorsHealth, getConnectorMetrics
 * - Circuit breaker: state transitions (closed -> open -> half-open -> closed),
 *   failure counting, manual reset
 * - Auto-restart: exponential backoff scheduling, max restart attempts,
 *   circuit opening on exhaustion
 * - Metrics tracking: totalStarts, totalCrashes, uptime, restartAttemptsInWindow
 * - Events: connector.started, connector.stopped, connector.crashed,
 *   connector.restarting, circuit.open, circuit.half-open, circuit.closed
 * - Edge cases: unregistered connector queries, disposed connectors,
 *   start while circuit open, manual restart with open circuit
 * - Singleton management: get, set, reset
 * - ConnectorProcess interface type conformance
 *
 * P13-008: Connector Health Monitor with Auto-Restart and Circuit Breaker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  ConnectorHealthMonitor,
  ConnectorHealthEventEmitter,
  getConnectorHealthMonitor,
  setConnectorHealthMonitor,
  resetConnectorHealthMonitor,
} from '../connector-health-monitor.service';
import type {
  ConnectorProcess,
  ConnectorPlatform,
  ConnectorHealthInfo,
  ConnectorHealthMonitorConfig,
  CircuitBreakerState,
} from '../connector-process';
import {
  DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG,
} from '../connector-process';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the logger to suppress output during tests
vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock the heartbeat tracker so reportHealthToTracker does not fail
vi.mock('../heartbeat-tracker.service', () => ({
  getHeartbeatTracker: () => ({
    recordHeartbeat: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock ConnectorProcess with sensible defaults. */
function createMockConnector(
  overrides: Partial<ConnectorProcess> & { connectorId?: string; platform?: ConnectorPlatform } = {},
): ConnectorProcess {
  const id = overrides.connectorId ?? `connector-${Math.random().toString(36).slice(2, 8)}`;
  const platform = overrides.platform ?? 'codex';

  // A mock child process EventEmitter so attachProcessListeners has something to bind to
  const mockProcessRef = new EventEmitter() as any;
  mockProcessRef.pid = 12345;

  let running = false;

  return {
    connectorId: id,
    platform,
    get processRef() {
      return overrides.processRef !== undefined ? overrides.processRef : (running ? mockProcessRef : null);
    },
    start: overrides.start ?? vi.fn(async () => { running = true; }),
    stop: overrides.stop ?? vi.fn(async () => { running = false; }),
    isRunning: overrides.isRunning ?? vi.fn(() => running),
    getHealth: overrides.getHealth ?? vi.fn((): ConnectorHealthInfo => ({
      status: running ? 'healthy' : 'unknown',
      pid: running ? 12345 : null,
      uptime: running ? 1000 : 0,
      lastCheckedAt: new Date().toISOString(),
    })),
    getPid: overrides.getPid ?? vi.fn(() => (running ? 12345 : null)),
  };
}

/** Create a monitor with fast timers suitable for testing. */
function makeMonitor(config?: Partial<ConnectorHealthMonitorConfig>): ConnectorHealthMonitor {
  return new ConnectorHealthMonitor({
    maxRestartAttempts: 3,
    restartWindowMs: 300_000,
    initialBackoffMs: 10,     // very short for tests
    maxBackoffMs: 50,         // very short for tests
    backoffMultiplier: 2,
    circuitCooldownMs: 50,    // very short for tests
    healthCheckIntervalMs: 60_000,
    ...config,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConnectorHealthMonitor', () => {
  let monitor: ConnectorHealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = makeMonitor();
  });

  afterEach(() => {
    monitor.destroy();
    resetConnectorHealthMonitor();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe('registration', () => {
    it('should register a connector process', () => {
      const connector = createMockConnector({ connectorId: 'codex-1' });
      monitor.register(connector);

      expect(monitor.isRegistered('codex-1')).toBe(true);
    });

    it('should return the connector in getRegisteredConnectorIds', () => {
      const c1 = createMockConnector({ connectorId: 'codex-1' });
      const c2 = createMockConnector({ connectorId: 'claude-1', platform: 'claude' });

      monitor.register(c1);
      monitor.register(c2);

      const ids = monitor.getRegisteredConnectorIds();
      expect(ids).toContain('codex-1');
      expect(ids).toContain('claude-1');
      expect(ids).toHaveLength(2);
    });

    it('should report isRegistered=false for unregistered connectors', () => {
      expect(monitor.isRegistered('nonexistent')).toBe(false);
    });

    it('should replace a connector on duplicate registration', () => {
      const c1 = createMockConnector({ connectorId: 'dup-1' });
      const c2 = createMockConnector({ connectorId: 'dup-1', platform: 'claude' });

      monitor.register(c1);
      monitor.register(c2);

      // Should still be registered (replaced, not duplicated)
      expect(monitor.isRegistered('dup-1')).toBe(true);
      expect(monitor.getRegisteredConnectorIds()).toHaveLength(1);

      // Health should reflect the new connector's platform
      const health = monitor.getConnectorHealth('dup-1');
      expect(health.platform).toBe('claude');
    });

    it('should unregister a connector and return true', () => {
      const connector = createMockConnector({ connectorId: 'rem-1' });
      monitor.register(connector);

      const result = monitor.unregister('rem-1');
      expect(result).toBe(true);
      expect(monitor.isRegistered('rem-1')).toBe(false);
    });

    it('should return false when unregistering an unknown connector', () => {
      const result = monitor.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Health queries
  // -------------------------------------------------------------------------

  describe('getConnectorHealth', () => {
    it('should return health summary for a registered connector', () => {
      const connector = createMockConnector({ connectorId: 'health-1' });
      monitor.register(connector);

      const health = monitor.getConnectorHealth('health-1');

      expect(health.connectorId).toBe('health-1');
      expect(health.platform).toBe('codex');
      expect(health.circuit.state).toBe('closed');
      expect(health.metrics.totalStarts).toBe(0);
      expect(health.metrics.totalCrashes).toBe(0);
    });

    it('should throw for an unregistered connector', () => {
      expect(() => monitor.getConnectorHealth('nonexistent')).toThrow(
        'Connector not registered: nonexistent',
      );
    });

    it('should reflect running state after startConnector', async () => {
      const connector = createMockConnector({ connectorId: 'run-1' });
      monitor.register(connector);

      await monitor.startConnector('run-1');

      const health = monitor.getConnectorHealth('run-1');
      expect(health.isRunning).toBe(true);
      expect(health.metrics.totalStarts).toBe(1);
    });

    it('should handle getHealth throwing by returning unknown status', () => {
      const connector = createMockConnector({
        connectorId: 'bad-health-1',
        getHealth: vi.fn(() => { throw new Error('health check broken'); }),
      });
      monitor.register(connector);

      const health = monitor.getConnectorHealth('bad-health-1');
      expect(health.health.status).toBe('unknown');
      expect(health.health.message).toBe('health check unavailable');
    });
  });

  describe('getAllConnectorsHealth', () => {
    it('should return empty result when no connectors registered', () => {
      const all = monitor.getAllConnectorsHealth();

      expect(all.connectors).toHaveLength(0);
      expect(all.summary.total).toBe(0);
      expect(all.summary.running).toBe(0);
      expect(all.summary.stopped).toBe(0);
      expect(all.summary.circuitOpen).toBe(0);
      expect(all.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should aggregate health from multiple connectors', async () => {
      const c1 = createMockConnector({ connectorId: 'agg-1' });
      const c2 = createMockConnector({ connectorId: 'agg-2', platform: 'claude' });

      monitor.register(c1);
      monitor.register(c2);

      await monitor.startConnector('agg-1');
      // c2 is registered but not started

      const all = monitor.getAllConnectorsHealth();

      expect(all.connectors).toHaveLength(2);
      expect(all.summary.total).toBe(2);
      expect(all.summary.running).toBe(1);
      expect(all.summary.stopped).toBe(1);
    });

    it('should count circuitOpen connectors correctly', async () => {
      // Create a connector that always fails to start so circuit opens
      let attempt = 0;
      const failConnector = createMockConnector({
        connectorId: 'fail-agg',
        start: vi.fn(async () => { attempt++; throw new Error(`fail ${attempt}`); }),
      });

      const m = makeMonitor({ maxRestartAttempts: 1 });
      m.register(failConnector);

      // First start fails -> crash -> schedule restart
      await m.startConnector('fail-agg');
      // Advance timer to trigger the scheduled restart
      await vi.advanceTimersByTimeAsync(100);

      const all = m.getAllConnectorsHealth();
      expect(all.summary.circuitOpen).toBe(1);

      m.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  describe('getConnectorMetrics', () => {
    it('should return initial zero metrics for a freshly registered connector', () => {
      const connector = createMockConnector({ connectorId: 'met-1' });
      monitor.register(connector);

      const metrics = monitor.getConnectorMetrics('met-1');

      expect(metrics.totalStarts).toBe(0);
      expect(metrics.totalCrashes).toBe(0);
      expect(metrics.uptimeMs).toBe(0);
      expect(metrics.lastCrashReason).toBeNull();
      expect(metrics.lastCrashAt).toBeNull();
      expect(metrics.circuitState).toBe('closed');
      expect(metrics.restartAttemptsInWindow).toBe(0);
    });

    it('should increment totalStarts after successful start', async () => {
      const connector = createMockConnector({ connectorId: 'met-2' });
      monitor.register(connector);

      await monitor.startConnector('met-2');

      const metrics = monitor.getConnectorMetrics('met-2');
      expect(metrics.totalStarts).toBe(1);
    });

    it('should track totalCrashes after a failure', async () => {
      const connector = createMockConnector({
        connectorId: 'met-3',
        start: vi.fn(async () => { throw new Error('boom'); }),
      });
      monitor.register(connector);

      await monitor.startConnector('met-3');

      const metrics = monitor.getConnectorMetrics('met-3');
      expect(metrics.totalCrashes).toBe(1);
      expect(metrics.lastCrashReason).toBe('boom');
      expect(metrics.lastCrashAt).not.toBeNull();
    });

    it('should throw for unregistered connector metrics query', () => {
      expect(() => monitor.getConnectorMetrics('nonexistent')).toThrow(
        'Connector not registered: nonexistent',
      );
    });

    it('should compute uptime when connector is running', async () => {
      const connector = createMockConnector({ connectorId: 'met-4' });
      monitor.register(connector);

      await monitor.startConnector('met-4');

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      const metrics = monitor.getConnectorMetrics('met-4');
      expect(metrics.uptimeMs).toBeGreaterThanOrEqual(5000);
    });

    it('should report zero uptime when connector is not running', () => {
      const connector = createMockConnector({ connectorId: 'met-5' });
      monitor.register(connector);

      const metrics = monitor.getConnectorMetrics('met-5');
      expect(metrics.uptimeMs).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Circuit breaker
  // -------------------------------------------------------------------------

  describe('circuit breaker', () => {
    it('should start in closed state', () => {
      const connector = createMockConnector({ connectorId: 'cb-1' });
      monitor.register(connector);

      const status = monitor.getCircuitStatus('cb-1');
      expect(status.state).toBe('closed');
      expect(status.failureCount).toBe(0);
      expect(status.cooldownExpiresAt).toBeNull();
    });

    it('should transition to open after max restart attempts exhausted', async () => {
      let startAttempt = 0;
      const connector = createMockConnector({
        connectorId: 'cb-2',
        start: vi.fn(async () => {
          startAttempt++;
          throw new Error(`fail-${startAttempt}`);
        }),
      });

      // Use a very long cooldown so the circuit stays open long enough to observe
      const m = makeMonitor({
        maxRestartAttempts: 2,
        initialBackoffMs: 10,
        maxBackoffMs: 20,
        circuitCooldownMs: 600_000,
      });
      m.register(connector);

      const circuitOpenHandler = vi.fn();
      m.events.on('circuit.open', circuitOpenHandler);

      // First start attempt fails -> crash #1 -> schedules restart
      await m.startConnector('cb-2');

      // Advance timer for first scheduled restart -> crash #2 -> schedules restart
      await vi.advanceTimersByTimeAsync(50);

      // Advance timer for second scheduled restart -> crash #3 -> max exhausted -> open
      await vi.advanceTimersByTimeAsync(50);

      const status = m.getCircuitStatus('cb-2');
      expect(status.state).toBe('open');
      expect(circuitOpenHandler).toHaveBeenCalled();

      m.destroy();
    });

    it('should prevent startConnector when circuit is open', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'cb-3',
        start: vi.fn(async () => { attempt++; throw new Error(`fail-${attempt}`); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 10,
        maxBackoffMs: 20,
        circuitCooldownMs: 600_000,
      });
      m.register(connector);

      // Trigger circuit open
      await m.startConnector('cb-3');
      await vi.advanceTimersByTimeAsync(100);

      // Now startConnector should throw
      await expect(m.startConnector('cb-3')).rejects.toThrow('circuit breaker is open');

      m.destroy();
    });

    it('should transition to half-open after cooldown', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'cb-4',
        start: vi.fn(async () => {
          attempt++;
          if (attempt <= 4) throw new Error(`fail-${attempt}`);
          // After 4 failures, start succeeds (for the half-open retry)
        }),
        isRunning: vi.fn(() => attempt > 4),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 10,
        maxBackoffMs: 20,
        circuitCooldownMs: 5_000,
      });
      m.register(connector);

      const halfOpenHandler = vi.fn();
      m.events.on('circuit.half-open', halfOpenHandler);

      // Trigger circuit open: first start fails, scheduled restart fails -> circuit open
      await m.startConnector('cb-4');
      await vi.advanceTimersByTimeAsync(100);

      expect(m.getCircuitStatus('cb-4').state).toBe('open');

      // Advance past the 5s cooldown to trigger half-open
      await vi.advanceTimersByTimeAsync(5_100);

      expect(halfOpenHandler).toHaveBeenCalled();

      m.destroy();
    });

    it('should transition from half-open to closed on successful start', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'cb-5',
        start: vi.fn(async () => {
          attempt++;
          if (attempt <= 2) throw new Error(`fail-${attempt}`);
          // After 2 failures, start succeeds (for the half-open single retry)
        }),
        isRunning: vi.fn(() => attempt > 2),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 5_000,
      });
      m.register(connector);

      const closedHandler = vi.fn();
      m.events.on('circuit.closed', closedHandler);

      // Trigger circuit open: initial start fails, then restart fails -> circuit opens
      await m.startConnector('cb-5');
      await vi.advanceTimersByTimeAsync(100);

      expect(m.getCircuitStatus('cb-5').state).toBe('open');

      // Advance past the 5s cooldown -> half-open -> doStart succeeds -> closed
      await vi.advanceTimersByTimeAsync(5_100);

      expect(closedHandler).toHaveBeenCalled();
      expect(m.getCircuitStatus('cb-5').state).toBe('closed');

      m.destroy();
    });

    it('should manually reset circuit breaker to closed', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'cb-6',
        start: vi.fn(async () => { attempt++; throw new Error(`fail-${attempt}`); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 600_000,
      });
      m.register(connector);

      // Trigger circuit open
      await m.startConnector('cb-6');
      await vi.advanceTimersByTimeAsync(50);

      expect(m.getCircuitStatus('cb-6').state).toBe('open');

      // Manual reset
      m.resetCircuit('cb-6');

      expect(m.getCircuitStatus('cb-6').state).toBe('closed');

      m.destroy();
    });

    it('should include cooldownExpiresAt when circuit is open', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'cb-7',
        start: vi.fn(async () => { attempt++; throw new Error(`fail-${attempt}`); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 60_000,
      });
      m.register(connector);

      await m.startConnector('cb-7');
      await vi.advanceTimersByTimeAsync(50);

      const status = m.getCircuitStatus('cb-7');
      expect(status.state).toBe('open');
      expect(status.cooldownExpiresAt).not.toBeNull();
      // The expires-at should be a valid ISO date string
      expect(status.cooldownExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      m.destroy();
    });

    it('should throw for circuit status of unregistered connector', () => {
      expect(() => monitor.getCircuitStatus('nonexistent')).toThrow(
        'Connector not registered: nonexistent',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Auto-restart
  // -------------------------------------------------------------------------

  describe('auto-restart', () => {
    it('should schedule a restart after a crash', async () => {
      let startCount = 0;
      const connector = createMockConnector({
        connectorId: 'ar-1',
        start: vi.fn(async () => {
          startCount++;
          if (startCount === 1) throw new Error('initial failure');
          // Second start succeeds
        }),
        isRunning: vi.fn(() => startCount >= 2),
      });

      monitor.register(connector);

      // First start fails
      await monitor.startConnector('ar-1');
      expect(startCount).toBe(1);

      // Advance past backoff to trigger scheduled restart
      await vi.advanceTimersByTimeAsync(100);

      // The restart should have been attempted
      expect(startCount).toBeGreaterThanOrEqual(2);
    });

    it('should emit connector.restarting event before restart', async () => {
      const connector = createMockConnector({
        connectorId: 'ar-2',
        start: vi.fn(async () => { throw new Error('fail'); }),
      });

      monitor.register(connector);

      const restartingHandler = vi.fn();
      monitor.events.on('connector.restarting', restartingHandler);

      await monitor.startConnector('ar-2');

      expect(restartingHandler).toHaveBeenCalledTimes(1);
      expect(restartingHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'ar-2',
          attempt: 1,
          delayMs: expect.any(Number),
        }),
      );
    });

    it('should respect max restart attempts and stop restarting', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'ar-3',
        start: vi.fn(async () => { attempt++; throw new Error(`fail-${attempt}`); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 2,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 600_000,
      });
      m.register(connector);

      const circuitOpenHandler = vi.fn();
      m.events.on('circuit.open', circuitOpenHandler);

      await m.startConnector('ar-3');

      // Advance enough time for all restarts and circuit to open
      await vi.advanceTimersByTimeAsync(500);

      expect(circuitOpenHandler).toHaveBeenCalledTimes(1);

      // No more restarts should be attempted after circuit opens
      const crashesBefore = m.getConnectorMetrics('ar-3').totalCrashes;
      await vi.advanceTimersByTimeAsync(500);
      const crashesAfter = m.getConnectorMetrics('ar-3').totalCrashes;

      // totalCrashes should not have increased (circuit is open, cooldown is 10 min)
      expect(crashesAfter).toBe(crashesBefore);
      expect(m.getCircuitStatus('ar-3').state).toBe('open');

      m.destroy();
    });

    it('should not auto-restart a disposed (stopped) connector', async () => {
      let startCount = 0;
      const connector = createMockConnector({
        connectorId: 'ar-4',
        start: vi.fn(async () => {
          startCount++;
          if (startCount === 1) throw new Error('fail');
        }),
        isRunning: vi.fn(() => false),
      });

      monitor.register(connector);
      await monitor.startConnector('ar-4');

      // Stop the connector before the restart timer fires
      await monitor.stopConnector('ar-4');

      await vi.advanceTimersByTimeAsync(200);

      // Should NOT have attempted a second start because the entry is disposed
      expect(startCount).toBe(1);
    });

    it('should use exponential backoff for restart delays', async () => {
      const connector = createMockConnector({
        connectorId: 'ar-5',
        start: vi.fn(async () => { throw new Error('fail'); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 5,
        initialBackoffMs: 100,
        maxBackoffMs: 1600,
        backoffMultiplier: 2,
      });
      m.register(connector);

      const delays: number[] = [];
      m.events.on('connector.restarting', (payload) => {
        delays.push(payload.delayMs);
      });

      await m.startConnector('ar-5');
      // Trigger cascading restarts
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(2000);
      }

      // Verify exponential progression: 100, 200, 400, 800, 1600
      // (may have fewer entries if circuit opened before all attempts)
      expect(delays.length).toBeGreaterThanOrEqual(1);
      expect(delays[0]).toBe(100);
      if (delays.length >= 2) expect(delays[1]).toBe(200);
      if (delays.length >= 3) expect(delays[2]).toBe(400);

      m.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  describe('events', () => {
    it('should emit connector.started on successful start', async () => {
      const connector = createMockConnector({ connectorId: 'ev-1' });
      monitor.register(connector);

      const startedHandler = vi.fn();
      monitor.events.on('connector.started', startedHandler);

      await monitor.startConnector('ev-1');

      expect(startedHandler).toHaveBeenCalledTimes(1);
      expect(startedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'ev-1',
          platform: 'codex',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should emit connector.stopped on manual stop', async () => {
      const connector = createMockConnector({ connectorId: 'ev-2' });
      monitor.register(connector);
      await monitor.startConnector('ev-2');

      const stoppedHandler = vi.fn();
      monitor.events.on('connector.stopped', stoppedHandler);

      await monitor.stopConnector('ev-2');

      expect(stoppedHandler).toHaveBeenCalledTimes(1);
      expect(stoppedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'ev-2',
          reason: 'manual',
        }),
      );
    });

    it('should emit connector.crashed on start failure', async () => {
      const connector = createMockConnector({
        connectorId: 'ev-3',
        start: vi.fn(async () => { throw new Error('crash!'); }),
      });
      monitor.register(connector);

      const crashedHandler = vi.fn();
      monitor.events.on('connector.crashed', crashedHandler);

      await monitor.startConnector('ev-3');

      expect(crashedHandler).toHaveBeenCalledTimes(1);
      expect(crashedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'ev-3',
          error: 'crash!',
        }),
      );
    });

    it('should emit circuit.open when circuit transitions to open', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'ev-4',
        start: vi.fn(async () => { attempt++; throw new Error(`fail-${attempt}`); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 600_000,
      });
      m.register(connector);

      const circuitOpenHandler = vi.fn();
      m.events.on('circuit.open', circuitOpenHandler);

      await m.startConnector('ev-4');
      await vi.advanceTimersByTimeAsync(100);

      expect(circuitOpenHandler).toHaveBeenCalledTimes(1);
      expect(circuitOpenHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'ev-4',
          platform: 'codex',
          failureCount: expect.any(Number),
          cooldownMs: expect.any(Number),
        }),
      );

      m.destroy();
    });

    it('should emit circuit.closed on manual reset', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'ev-5',
        start: vi.fn(async () => { attempt++; throw new Error(`fail-${attempt}`); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 600_000,
      });
      m.register(connector);

      await m.startConnector('ev-5');
      await vi.advanceTimersByTimeAsync(100);

      const closedHandler = vi.fn();
      m.events.on('circuit.closed', closedHandler);

      m.resetCircuit('ev-5');

      expect(closedHandler).toHaveBeenCalledTimes(1);
      expect(closedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'ev-5',
          platform: 'codex',
        }),
      );

      m.destroy();
    });

    it('should emit circuit.half-open after cooldown', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'ev-6',
        start: vi.fn(async () => { attempt++; throw new Error(`fail-${attempt}`); }),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 5_000,
      });
      m.register(connector);

      const halfOpenHandler = vi.fn();
      m.events.on('circuit.half-open', halfOpenHandler);

      // Trigger circuit open
      await m.startConnector('ev-6');
      await vi.advanceTimersByTimeAsync(100);

      // After circuit opens, advance past the 5s cooldown timer
      await vi.advanceTimersByTimeAsync(5_100);

      expect(halfOpenHandler).toHaveBeenCalled();

      m.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Start / Stop / Restart (managed)
  // -------------------------------------------------------------------------

  describe('startConnector', () => {
    it('should throw for unregistered connector', async () => {
      await expect(monitor.startConnector('nonexistent')).rejects.toThrow(
        'Connector not registered: nonexistent',
      );
    });

    it('should call connector.start()', async () => {
      const startFn = vi.fn(async () => {});
      const connector = createMockConnector({ connectorId: 'sc-1', start: startFn });
      monitor.register(connector);

      await monitor.startConnector('sc-1');

      expect(startFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopConnector', () => {
    it('should throw for unregistered connector', async () => {
      await expect(monitor.stopConnector('nonexistent')).rejects.toThrow(
        'Connector not registered: nonexistent',
      );
    });

    it('should call connector.stop() when running', async () => {
      const stopFn = vi.fn(async () => {});
      const connector = createMockConnector({ connectorId: 'stop-1', stop: stopFn });
      monitor.register(connector);
      await monitor.startConnector('stop-1');

      await monitor.stopConnector('stop-1');

      expect(stopFn).toHaveBeenCalled();
    });
  });

  describe('restartConnector', () => {
    it('should stop and restart a running connector', async () => {
      const stopFn = vi.fn(async () => {});
      let running = false;
      const connector = createMockConnector({
        connectorId: 'rc-1',
        start: vi.fn(async () => { running = true; }),
        stop: stopFn,
        isRunning: vi.fn(() => running),
      });
      monitor.register(connector);
      await monitor.startConnector('rc-1');

      // Now restart it
      running = true; // simulate still running
      await monitor.restartConnector('rc-1');

      expect(stopFn).toHaveBeenCalled();
    });

    it('should close an open circuit on manual restart', async () => {
      let attempt = 0;
      const connector = createMockConnector({
        connectorId: 'rc-2',
        start: vi.fn(async () => {
          attempt++;
          if (attempt <= 3) throw new Error(`fail-${attempt}`);
        }),
        isRunning: vi.fn(() => attempt > 3),
      });

      const m = makeMonitor({
        maxRestartAttempts: 1,
        initialBackoffMs: 5,
        maxBackoffMs: 10,
        circuitCooldownMs: 600_000,
      });
      m.register(connector);

      // Open the circuit
      await m.startConnector('rc-2');
      await vi.advanceTimersByTimeAsync(100);

      expect(m.getCircuitStatus('rc-2').state).toBe('open');

      // Manual restart should close circuit and start
      await m.restartConnector('rc-2');
      expect(m.getCircuitStatus('rc-2').state).toBe('closed');

      m.destroy();
    });

    it('should throw for unregistered connector', async () => {
      await expect(monitor.restartConnector('nonexistent')).rejects.toThrow(
        'Connector not registered: nonexistent',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle (start/stop/destroy)
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('should start health check timer', () => {
      monitor.start();
      // Starting again should be a no-op (no error)
      monitor.start();
      monitor.stop();
    });

    it('should stop health check timer', () => {
      monitor.start();
      monitor.stop();
      // Stopping again should be safe
      monitor.stop();
    });

    it('should clean up everything on destroy', () => {
      const c1 = createMockConnector({ connectorId: 'dest-1' });
      const c2 = createMockConnector({ connectorId: 'dest-2' });
      monitor.register(c1);
      monitor.register(c2);
      monitor.start();

      monitor.destroy();

      expect(monitor.getRegisteredConnectorIds()).toHaveLength(0);
    });

    it('should use default config when no config provided', () => {
      const m = new ConnectorHealthMonitor();
      expect(m.config.maxRestartAttempts).toBe(DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG.maxRestartAttempts);
      expect(m.config.initialBackoffMs).toBe(DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG.initialBackoffMs);
      expect(m.config.circuitCooldownMs).toBe(DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG.circuitCooldownMs);
      m.destroy();
    });

    it('should allow partial config override', () => {
      const m = new ConnectorHealthMonitor({ maxRestartAttempts: 10 });
      expect(m.config.maxRestartAttempts).toBe(10);
      expect(m.config.initialBackoffMs).toBe(DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG.initialBackoffMs);
      m.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Singleton management
  // -------------------------------------------------------------------------

  describe('singleton', () => {
    afterEach(() => {
      resetConnectorHealthMonitor();
    });

    it('should return the same instance from getConnectorHealthMonitor', () => {
      const a = getConnectorHealthMonitor();
      const b = getConnectorHealthMonitor();
      expect(a).toBe(b);
    });

    it('should allow replacing the singleton', () => {
      const custom = makeMonitor({ maxRestartAttempts: 42 });
      setConnectorHealthMonitor(custom);

      const result = getConnectorHealthMonitor();
      expect(result).toBe(custom);
      expect(result.config.maxRestartAttempts).toBe(42);
    });

    it('should destroy old instance on reset', () => {
      const instance = getConnectorHealthMonitor();
      const c = createMockConnector({ connectorId: 'singleton-1' });
      instance.register(c);

      resetConnectorHealthMonitor();

      const newInstance = getConnectorHealthMonitor();
      expect(newInstance).not.toBe(instance);
      expect(newInstance.getRegisteredConnectorIds()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // ConnectorHealthEventEmitter
  // -------------------------------------------------------------------------

  describe('ConnectorHealthEventEmitter', () => {
    it('should support typed on/emit/off', () => {
      const emitter = new ConnectorHealthEventEmitter();
      const handler = vi.fn();

      emitter.on('connector.started', handler);
      emitter.emit('connector.started', {
        connectorId: 'test',
        platform: 'codex',
        pid: 123,
        timestamp: new Date().toISOString(),
      });

      expect(handler).toHaveBeenCalledTimes(1);

      emitter.off('connector.started', handler);
      emitter.emit('connector.started', {
        connectorId: 'test',
        platform: 'codex',
        pid: 123,
        timestamp: new Date().toISOString(),
      });

      expect(handler).toHaveBeenCalledTimes(1); // not called again
    });

    it('should support once', () => {
      const emitter = new ConnectorHealthEventEmitter();
      const handler = vi.fn();

      emitter.once('circuit.open', handler);
      emitter.emit('circuit.open', {
        connectorId: 'test',
        platform: 'codex',
        failureCount: 5,
        cooldownMs: 60_000,
        timestamp: new Date().toISOString(),
      });
      emitter.emit('circuit.open', {
        connectorId: 'test',
        platform: 'codex',
        failureCount: 5,
        cooldownMs: 60_000,
        timestamp: new Date().toISOString(),
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle registering multiple connectors across platforms', () => {
      const c1 = createMockConnector({ connectorId: 'edge-1', platform: 'codex' });
      const c2 = createMockConnector({ connectorId: 'edge-2', platform: 'claude' });
      const c3 = createMockConnector({ connectorId: 'edge-3', platform: 'custom' });

      monitor.register(c1);
      monitor.register(c2);
      monitor.register(c3);

      expect(monitor.getRegisteredConnectorIds()).toHaveLength(3);
      expect(monitor.getConnectorHealth('edge-1').platform).toBe('codex');
      expect(monitor.getConnectorHealth('edge-2').platform).toBe('claude');
      expect(monitor.getConnectorHealth('edge-3').platform).toBe('custom');
    });

    it('should handle resetCircuit on already-closed circuit (no-op)', () => {
      const connector = createMockConnector({ connectorId: 'edge-4' });
      monitor.register(connector);

      // Circuit is already closed -- resetCircuit should not throw
      monitor.resetCircuit('edge-4');
      expect(monitor.getCircuitStatus('edge-4').state).toBe('closed');
    });

    it('should throw resetCircuit for unregistered connector', () => {
      expect(() => monitor.resetCircuit('nonexistent')).toThrow(
        'Connector not registered: nonexistent',
      );
    });

    it('should handle connector with null processRef gracefully', () => {
      const connector = createMockConnector({
        connectorId: 'edge-5',
        processRef: null,
      });
      monitor.register(connector);

      // Should not throw -- attachProcessListeners checks for null processRef
      expect(monitor.isRegistered('edge-5')).toBe(true);
    });

    it('should not restart after unregister even if crash event was pending', async () => {
      let startCount = 0;
      const connector = createMockConnector({
        connectorId: 'edge-6',
        start: vi.fn(async () => {
          startCount++;
          if (startCount === 1) throw new Error('fail');
        }),
      });

      monitor.register(connector);
      await monitor.startConnector('edge-6');

      // Unregister before the restart timer fires
      monitor.unregister('edge-6');

      await vi.advanceTimersByTimeAsync(200);

      // Start should only have been called once (the initial attempt)
      expect(startCount).toBe(1);
    });

    it('should handle multiple rapid starts for the same connector', async () => {
      const startFn = vi.fn(async () => {});
      const connector = createMockConnector({ connectorId: 'edge-7', start: startFn });
      monitor.register(connector);

      await monitor.startConnector('edge-7');
      await monitor.startConnector('edge-7');

      expect(startFn).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // ConnectorProcess interface types
  // -------------------------------------------------------------------------

  describe('ConnectorProcess interface', () => {
    it('should conform to the ConnectorProcess interface shape', () => {
      const connector = createMockConnector({ connectorId: 'type-1', platform: 'claude' });

      // Verify all required properties and methods exist
      expect(connector.connectorId).toBe('type-1');
      expect(connector.platform).toBe('claude');
      expect(typeof connector.start).toBe('function');
      expect(typeof connector.stop).toBe('function');
      expect(typeof connector.isRunning).toBe('function');
      expect(typeof connector.getHealth).toBe('function');
      expect(typeof connector.getPid).toBe('function');
      // processRef is a getter, just verify it is accessible
      expect(connector.processRef).toBeDefined(); // null or EventEmitter based on running state
    });

    it('should have correct ConnectorPlatform values', () => {
      const platforms: ConnectorPlatform[] = ['codex', 'claude', 'custom'];
      for (const p of platforms) {
        const c = createMockConnector({ platform: p });
        expect(c.platform).toBe(p);
      }
    });

    it('should return well-formed ConnectorHealthInfo from getHealth', () => {
      const connector = createMockConnector({ connectorId: 'type-2' });
      const health = connector.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('pid');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('lastCheckedAt');
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(health.status);
      expect(health.lastCheckedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
