import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorHealthMonitor } from '../connector-health-monitor.service';
import type {
  ConnectorHealthInfo,
  ConnectorPlatform,
  ConnectorProcess,
} from '../connector-process';

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../heartbeat-tracker.service', () => ({
  getHeartbeatTracker: () => ({
    recordHeartbeat: vi.fn(),
  }),
}));

class FakeProcessRef extends EventEmitter {
  pid: number;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

class FakeConnectorProcess implements ConnectorProcess {
  readonly connectorId: string;
  readonly platform: ConnectorPlatform;
  private running = false;
  private proc: FakeProcessRef | null = null;
  private pidSeed = 1000;
  private startFailuresRemaining: number;
  private failMessage: string;
  startCalls = 0;
  stopCalls = 0;

  constructor(input: {
    connectorId: string;
    platform?: ConnectorPlatform;
    startFailures?: number;
    failMessage?: string;
  }) {
    this.connectorId = input.connectorId;
    this.platform = input.platform ?? 'codex';
    this.startFailuresRemaining = input.startFailures ?? 0;
    this.failMessage = input.failMessage ?? 'start failed';
  }

  get processRef() {
    return this.proc;
  }

  async start(): Promise<void> {
    this.startCalls += 1;
    if (this.startFailuresRemaining > 0) {
      this.startFailuresRemaining -= 1;
      throw new Error(this.failMessage);
    }

    this.running = true;
    this.pidSeed += 1;
    this.proc = new FakeProcessRef(this.pidSeed);
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
    this.running = false;
    this.proc = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  getHealth(): ConnectorHealthInfo {
    return {
      status: this.running ? 'healthy' : 'unknown',
      pid: this.proc?.pid ?? null,
      uptime: this.running ? 1000 : 0,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  getPid(): number | null {
    return this.proc?.pid ?? null;
  }

  crashWithExit(code = 1, signal: string | null = null): void {
    if (!this.proc) {
      throw new Error('no running process to crash');
    }
    this.running = false;
    this.proc.emit('exit', code, signal);
    this.proc = null;
  }

  crashWithError(message = 'process error'): void {
    if (!this.proc) {
      throw new Error('no running process to crash');
    }
    this.running = false;
    this.proc.emit('error', new Error(message));
    this.proc = null;
  }
}

describe('connector chaos tests (runtime crash/restart/circuit)', () => {
  let monitor: ConnectorHealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new ConnectorHealthMonitor({
      maxRestartAttempts: 2,
      restartWindowMs: 120_000,
      initialBackoffMs: 100,
      maxBackoffMs: 400,
      backoffMultiplier: 2,
      circuitCooldownMs: 300,
      healthCheckIntervalMs: 30_000,
    });
  });

  afterEach(() => {
    monitor.destroy();
    vi.useRealTimers();
  });

  it('restarts after process exit with deterministic backoff timing', async () => {
    const connector = new FakeConnectorProcess({ connectorId: 'chaos-exit' });
    monitor.register(connector);
    await monitor.startConnector('chaos-exit');
    expect(connector.startCalls).toBe(1);

    connector.crashWithExit(1, null);
    expect(connector.startCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(99);
    expect(connector.startCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(connector.startCalls).toBe(2);
    expect(monitor.getConnectorHealth('chaos-exit').isRunning).toBe(true);
  });

  it('opens circuit after repeated crash/restart storm', async () => {
    const connector = new FakeConnectorProcess({
      connectorId: 'chaos-open',
      startFailures: 3,
      failMessage: 'boot failure',
    });
    monitor.register(connector);

    await monitor.startConnector('chaos-open');
    expect(connector.startCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(connector.startCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(200);
    expect(connector.startCalls).toBe(3);

    const circuit = monitor.getCircuitStatus('chaos-open');
    expect(circuit.state).toBe('open');

    const startsBeforeCooldown = connector.startCalls;
    await vi.advanceTimersByTimeAsync(299);
    expect(connector.startCalls).toBe(startsBeforeCooldown);
  });

  it('transitions open -> half-open -> closed when cooldown retry succeeds', async () => {
    const connector = new FakeConnectorProcess({
      connectorId: 'chaos-recover',
      startFailures: 3,
    });
    monitor.register(connector);

    await monitor.startConnector('chaos-recover');
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    expect(monitor.getCircuitStatus('chaos-recover').state).toBe('open');

    await vi.advanceTimersByTimeAsync(300);
    expect(monitor.getCircuitStatus('chaos-recover').state).toBe('closed');
    expect(connector.startCalls).toBe(4);
    expect(monitor.getConnectorHealth('chaos-recover').isRunning).toBe(true);
  });

  it('handles runtime process error event and schedules restart', async () => {
    const connector = new FakeConnectorProcess({ connectorId: 'chaos-error' });
    const restartingSpy = vi.fn();
    monitor.events.on('connector.restarting', restartingSpy);

    monitor.register(connector);
    await monitor.startConnector('chaos-error');

    connector.crashWithError('stderr crash');
    expect(restartingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'chaos-error',
        attempt: 1,
        delayMs: 100,
      }),
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(connector.startCalls).toBe(2);
    expect(monitor.getConnectorHealth('chaos-error').isRunning).toBe(true);
  });
});
