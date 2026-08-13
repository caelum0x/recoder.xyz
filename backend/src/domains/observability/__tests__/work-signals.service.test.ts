/**
 * T4 — raw signal → RunEvent normalization; and the truthfulness gate: when the
 * sidecar is `down`, `refresh()` returns an EMPTY, `degraded:true` batch with NO
 * fabricated signals.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { WorkSignalsPort, RawWorkSignal } from '../ports/signals.port.js';
import type { SignalDispositionRepository } from '../ports/observability.repository.js';
import { WorkSignalsService, normalizeSignal, toRunEvent, classifyKind } from '../services/work-signals.service.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
const gate = {} as GovernanceGate;
const repo = {
  list: vi.fn().mockResolvedValue([]),
  getBySignal: vi.fn(),
  upsert: vi.fn(),
  setDisposition: vi.fn(),
} as unknown as SignalDispositionRepository;

const rawSignal: RawWorkSignal = {
  id: 'sig1',
  source: 'github',
  item_type: 'pull_request',
  title: 'PR blocked on review',
  source_url: 'https://github.com/x/y/pull/1',
  detected_reason: 'awaiting review',
  priority: 'high',
  agent_handoff_prompt: 'go review',
  detected_at: '2026-01-01T00:00:00.000Z',
};

describe('normalizeSignal', () => {
  it('maps a raw sidecar signal into the domain shape', () => {
    const s = normalizeSignal(rawSignal);
    expect(s.id).toBe('sig1');
    expect(s.kind).toBe('needs-you'); // "review" → needs-you
    expect(s.priority).toBe('high');
    expect(s.handoffPrompt).toBe('go review');
  });

  it('classifies block/fail reasons as blocked', () => {
    expect(classifyKind({ ...rawSignal, detected_reason: 'CI failed' })).toBe('blocked');
    expect(classifyKind({ ...rawSignal, detected_reason: 'idle for 3 days' })).toBe('stuck');
  });

  it('toRunEvent produces a needs_input RunEvent', () => {
    const ev = toRunEvent(normalizeSignal(rawSignal));
    expect(ev.type).toBe('needs_input');
    expect(ev.data?.source).toBe('ops-recorder');
  });
});

describe('WorkSignalsService.refresh', () => {
  it('sidecar down → empty + degraded, NO fabricated signals', async () => {
    const port: WorkSignalsPort = {
      availability: vi.fn().mockResolvedValue({ status: 'down', reason: 'sidecar absent' }),
      fetchSignals: vi.fn().mockResolvedValue([]),
      fetchSignal: vi.fn().mockResolvedValue(null),
      syncGithub: vi.fn().mockResolvedValue({ triggered: false, degraded: true }),
      syncLinear: vi.fn().mockResolvedValue({ triggered: false, degraded: true }),
    };
    const svc = new WorkSignalsService({ logger, port, gate, repository: repo, defaultSpaceId: 'default' });
    const result = await svc.refresh();
    expect(result.signals).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('sidecar absent');
    // fetchSignals is never even consulted when the sidecar is down.
    expect(port.fetchSignals).not.toHaveBeenCalled();
  });

  it('sidecar up → normalizes + emits each signal to the RunEvent bus', async () => {
    const ingest = vi.fn();
    const port: WorkSignalsPort = {
      availability: vi.fn().mockResolvedValue({ status: 'up' }),
      fetchSignals: vi.fn().mockResolvedValue([rawSignal]),
      fetchSignal: vi.fn(),
      syncGithub: vi.fn().mockResolvedValue({ triggered: true, degraded: false }),
      syncLinear: vi.fn().mockResolvedValue({ triggered: true, degraded: false }),
    };
    const svc = new WorkSignalsService({
      logger,
      port,
      gate,
      repository: repo,
      runEvents: { ingest },
      defaultSpaceId: 'default',
    });
    const result = await svc.refresh();
    expect(result.signals).toHaveLength(1);
    expect(result.degraded).toBe(false);
    expect(ingest).toHaveBeenCalledOnce();
  });
});

describe('WorkSignalsService.scan', () => {
  it('triggers BOTH detectors on demand, then returns the refreshed signals', async () => {
    const port: WorkSignalsPort = {
      availability: vi.fn().mockResolvedValue({ status: 'up' }),
      fetchSignals: vi.fn().mockResolvedValue([rawSignal]),
      fetchSignal: vi.fn(),
      syncGithub: vi.fn().mockResolvedValue({ triggered: true, degraded: false }),
      syncLinear: vi.fn().mockResolvedValue({ triggered: true, degraded: false }),
    };
    const svc = new WorkSignalsService({ logger, port, gate, repository: repo, defaultSpaceId: 'default' });

    const result = await svc.scan();

    expect(port.syncGithub).toHaveBeenCalledOnce();
    expect(port.syncLinear).toHaveBeenCalledOnce();
    expect(result.triggered.github.triggered).toBe(true);
    expect(result.signals).toHaveLength(1);
    expect(result.degraded).toBe(false);
  });

  it('is degraded when a detector reports the sidecar down — never a faked scan', async () => {
    const port: WorkSignalsPort = {
      availability: vi.fn().mockResolvedValue({ status: 'up' }),
      fetchSignals: vi.fn().mockResolvedValue([]),
      fetchSignal: vi.fn(),
      syncGithub: vi.fn().mockResolvedValue({ triggered: false, degraded: true, reason: 'sidecar down' }),
      syncLinear: vi.fn().mockResolvedValue({ triggered: false, degraded: true }),
    };
    const svc = new WorkSignalsService({ logger, port, gate, repository: repo, defaultSpaceId: 'default' });

    const result = await svc.scan();

    expect(result.degraded).toBe(true);
    expect(result.triggered.github.triggered).toBe(false);
  });
});
