/**
 * Signals-poller fusion test — proves the AUTONOMOUS work-signals feed fires.
 *
 * The product invariant: `ObservabilityModule.start()` schedules a poller that
 * calls `WorkSignalsService.refresh()` on a cadence so the ops-recorder sidecar's
 * detected stuck/needs-you signals reach the notify board + RunEvent bus WITHOUT
 * a human opening the board. These tests drive the REAL composer (not the service
 * in isolation): the timer → `refresh()` → `OpsRecorderClient` HTTP fetch →
 * normalize → `runEvents.ingest` + `board.notify` path is exercised end-to-end,
 * and the degrade-truthful path (absent sidecar ⇒ no fabricated signal) is proven.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AppConfig } from '../../../shared/app-config.js';
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { HealthSourceRegistry } from '../ports/health-source.port.js';
import type { RawWorkSignal } from '../ports/signals.port.js';
import { ObservabilityComposer } from '../observability-module.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;

const appConfig = {
  runtime: {
    nodeEnv: 'test',
    isProduction: false,
    serviceName: 'recoder-backend',
    version: '0.0.0-test',
    instanceId: 'test-instance',
  },
  internal: { serviceKeyPresent: true, serviceKey: 'internal-test-key' },
} as unknown as AppConfig;

const executor = {} as QueryExecutor;
const middleware = {} as AuthMiddleware;
const gate = {} as GovernanceGate;
const registry = { snapshot: vi.fn() } as unknown as HealthSourceRegistry;

const rawSignal: RawWorkSignal = {
  id: 'sig-poll-1',
  source: 'github',
  item_type: 'pull_request',
  title: 'PR blocked on review',
  source_url: 'https://github.com/x/y/pull/1',
  detected_reason: 'awaiting review',
  priority: 'high',
  agent_handoff_prompt: 'go review it',
  detected_at: '2026-01-01T00:00:00.000Z',
};

/** A minimal `Response` stand-in the OpsRecorderClient consumes (status + json). */
function okJson(body: unknown): Response {
  return { status: 200, json: async () => body } as unknown as Response;
}

function makeComposer(opts: {
  readonly pollIntervalMs: number;
  readonly opsRecorderUrl: string | null;
  readonly runEventsIngest?: ReturnType<typeof vi.fn>;
  readonly boardNotify?: ReturnType<typeof vi.fn>;
  readonly pollEnabled?: boolean;
}): ObservabilityComposer {
  return new ObservabilityComposer({
    config: appConfig,
    logger,
    executor,
    middleware,
    gate,
    registry,
    ...(opts.runEventsIngest ? { runEvents: { ingest: opts.runEventsIngest } } : {}),
    ...(opts.boardNotify ? { board: { notify: opts.boardNotify } } : {}),
    overrides: {
      opsRecorderUrl: opts.opsRecorderUrl,
      opsRecorderAuthDisabled: true,
      signalsPollEnabled: opts.pollEnabled ?? true,
      signalsPollIntervalMs: opts.pollIntervalMs,
    },
  });
}

describe('ObservabilityModule signals poller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('start() fires the poller → sidecar signal reaches the RunEvent bus + notify board', async () => {
    const ingest = vi.fn();
    const notify = vi.fn();
    const fetchMock = vi.fn(async () => okJson([rawSignal]));
    vi.stubGlobal('fetch', fetchMock);

    const composer = makeComposer({
      pollIntervalMs: 1_000,
      opsRecorderUrl: 'http://127.0.0.1:9099',
      runEventsIngest: ingest,
      boardNotify: notify,
    });

    await composer.start();
    // Flush the immediate first pass (start() fires one) plus one interval tick.
    await vi.advanceTimersByTimeAsync(1_000);

    // The fusion fired WITHOUT a human opening the board.
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/work-signals');
    expect(ingest).toHaveBeenCalled();
    const [event, source] = ingest.mock.calls[0] ?? [];
    expect(source).toBe('ops-recorder');
    expect((event as { type?: string }).type).toBe('needs_input');
    // A "review" reason classifies as needs-you → the board is notified.
    expect(notify).toHaveBeenCalled();

    await composer.stop();
  });

  it('keeps ticking on the interval (repeated autonomous passes)', async () => {
    const ingest = vi.fn();
    const fetchMock = vi.fn(async () => okJson([rawSignal]));
    vi.stubGlobal('fetch', fetchMock);

    const composer = makeComposer({
      pollIntervalMs: 5_000,
      opsRecorderUrl: 'http://127.0.0.1:9099',
      runEventsIngest: ingest,
    });

    await composer.start();
    await vi.advanceTimersByTimeAsync(0); // immediate first pass
    const afterFirst = ingest.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(5_000); // one scheduled tick
    expect(ingest.mock.calls.length).toBeGreaterThan(afterFirst);

    await composer.stop();
  });

  it('degrade-truthful: absent sidecar → poll fires but emits NO fabricated signal', async () => {
    const ingest = vi.fn();
    const fetchMock = vi.fn(async () => okJson([rawSignal]));
    vi.stubGlobal('fetch', fetchMock);

    // No opsRecorderUrl and no urlProvider ⇒ availability() is `down`; refresh()
    // returns an empty, degraded batch. The client never even reaches fetch.
    const composer = makeComposer({
      pollIntervalMs: 1_000,
      opsRecorderUrl: null,
      runEventsIngest: ingest,
    });

    await composer.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();

    await composer.stop();
  });

  it('poller disabled (interval 0) → no timer, no polling', async () => {
    const ingest = vi.fn();
    const fetchMock = vi.fn(async () => okJson([rawSignal]));
    vi.stubGlobal('fetch', fetchMock);

    const composer = makeComposer({
      pollIntervalMs: 0,
      opsRecorderUrl: 'http://127.0.0.1:9099',
      runEventsIngest: ingest,
    });

    await composer.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();

    await composer.stop();
  });

  it('stop() clears the poller (no ticks after shutdown)', async () => {
    const ingest = vi.fn();
    const fetchMock = vi.fn(async () => okJson([rawSignal]));
    vi.stubGlobal('fetch', fetchMock);

    const composer = makeComposer({
      pollIntervalMs: 1_000,
      opsRecorderUrl: 'http://127.0.0.1:9099',
      runEventsIngest: ingest,
    });

    await composer.start();
    await vi.advanceTimersByTimeAsync(1_000);
    await composer.stop();
    const callsAtStop = ingest.mock.calls.length;

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ingest.mock.calls.length).toBe(callsAtStop);
  });
});
