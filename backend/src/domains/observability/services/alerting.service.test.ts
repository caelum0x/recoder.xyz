/**
 * AlertingService invariants — the alert path must be TRUTHFUL + FAIL-SAFE:
 *  - `evaluateExpr` only fires on a recognized, explicit condition; an unknown
 *    expression NEVER fires (an alert must be explicit, never fabricated).
 *  - `evaluateRules` dedupes an already-firing rule (one live alert, not a storm),
 *    survives a rule-load failure by returning [] (no crash, no fake fire), and
 *    still PERSISTS an event when best-effort delivery throws (never silently lost).
 *  - `acknowledgeAlert` is GOVERNANCE-GATED + FAIL-CLOSED: a deny blocks the ack
 *    write (no audit, no status transition); an allow records audit + stores auditRef.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateVerdict, AuditRecord } from '../../governance/types.js';
import type { Principal } from '../../identity/types.js';
import type { AlertRepository } from '../ports/observability.repository.js';
import type { AlertEvent, AlertRule, HealthFull } from '../types.js';
import {
  AlertingService,
  evaluateExpr,
  type AlertEvalContext,
  type AlertNotifier,
} from './alerting.service.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;

const principal: Principal = {
  userId: 'user-1',
  scopes: ['write'],
  kind: 'session',
  isAnonymous: false,
  raw: null,
};

function health(partial: Partial<HealthFull> = {}): HealthFull {
  return {
    status: 'up',
    degraded: false,
    sources: [],
    engines: [],
    slo: [],
    counts: { up: 0, down: 0, degraded: 0, unknown: 0 },
    service: 'recoder-backend',
    instanceId: 'i1',
    checkedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function rule(partial: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    spaceId: 'space-1',
    name: 'backend down',
    severity: 'critical',
    expr: 'health.status == down',
    forSecs: 0,
    notifyRoute: 'board',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function firingEvent(partial: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: 'alert-1',
    ruleId: 'rule-1',
    spaceId: 'space-1',
    status: 'firing',
    value: 1,
    firedAt: '2026-01-01T00:00:00.000Z',
    ackedAt: null,
    ackedBy: null,
    resolvedAt: null,
    auditRef: null,
    ...partial,
  };
}

/** A repository whose methods are all spies; overridable per test. */
function fakeRepo(overrides: Partial<AlertRepository> = {}): AlertRepository {
  return {
    listRules: vi.fn().mockResolvedValue([]),
    listEnabledRules: vi.fn().mockResolvedValue([]),
    upsertRule: vi.fn(),
    listEvents: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn().mockResolvedValue(null),
    // insertEvent echoes the event it was given (like the real persistence).
    insertEvent: vi.fn().mockImplementation((e: AlertEvent) => Promise.resolve(e)),
    updateEventStatus: vi.fn().mockResolvedValue(null),
    latestFiring: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as AlertRepository;
}

function allowVerdict(degraded = false): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'rq1',
    effect: 'allow',
    tier: 'low',
    reason: '',
    degraded,
    engine: 'napi',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function denyVerdict(reason = 'not permitted'): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'rq1',
    effect: 'deny',
    tier: 'low',
    reason,
    degraded: false,
    engine: 'napi',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const auditRecord: AuditRecord = {
  id: 'audit-1',
  seq: 1,
  prevHash: '0'.repeat(64),
  entryHash: 'a'.repeat(64),
  actorId: 'user-1',
  action: 'alert.ack',
  resource: 'alert:alert-1',
  effect: 'allow',
  riskTier: 'low',
  degraded: false,
  payload: {},
  createdAt: '2026-01-01T00:00:00.000Z',
};

// --- evaluateExpr: the tiny, safe, fail-safe grammar ------------------------

describe('evaluateExpr', () => {
  it('an unrecognized expression NEVER fires (fail-safe: alerts must be explicit)', () => {
    const ctx: AlertEvalContext = { health: health({ status: 'down' }) };
    expect(evaluateExpr('rm -rf /', ctx)).toBeNull();
    expect(evaluateExpr('health.status', ctx)).toBeNull();
    expect(evaluateExpr('', ctx)).toBeNull();
  });

  it('health.status == down matches only when status is down', () => {
    expect(evaluateExpr('health.status == down', { health: health({ status: 'down' }) })).toBe(1);
    expect(evaluateExpr('health.status == down', { health: health({ status: 'up' }) })).toBeNull();
    expect(evaluateExpr('health.status == down', { health: health({ status: 'degraded' }) })).toBeNull();
  });

  it('health.degraded == true fires only when the report is degraded', () => {
    expect(evaluateExpr('health.degraded == true', { health: health({ degraded: true }) })).toBe(1);
    expect(evaluateExpr('health.degraded == true', { health: health({ degraded: false }) })).toBeNull();
  });

  it('slo:<name> < target fires with the observed value when attainment is below target', () => {
    const ctx: AlertEvalContext = {
      health: health({
        slo: [{ id: 's1', name: 'api-latency', target: 0.999, observed: 0.95, met: false }],
      }),
    };
    expect(evaluateExpr('slo:api-latency < 0.99', ctx)).toBe(0.95);
  });

  it('slo boundary: observed exactly at target does NOT fire (strict <)', () => {
    const ctx: AlertEvalContext = {
      health: health({
        slo: [{ id: 's1', name: 'api-latency', target: 0.99, observed: 0.99, met: true }],
      }),
    };
    expect(evaluateExpr('slo:api-latency < 0.99', ctx)).toBeNull();
  });

  it('slo with a null observed NEVER fires (missing metric is not a breach)', () => {
    const ctx: AlertEvalContext = {
      health: health({
        slo: [{ id: 's1', name: 'api-latency', target: 0.999, observed: null, met: null }],
      }),
    };
    expect(evaluateExpr('slo:api-latency < 0.99', ctx)).toBeNull();
  });

  it('slo referencing an unknown target NEVER fires', () => {
    const ctx: AlertEvalContext = { health: health({ slo: [] }) };
    expect(evaluateExpr('slo:ghost < 0.5', ctx)).toBeNull();
  });
});

// --- evaluateRules: dedupe, fail-safe load, best-effort delivery -------------

describe('AlertingService.evaluateRules', () => {
  const ctx: AlertEvalContext = { health: health({ status: 'down' }) };

  it('fires a newly-triggered rule: persists a firing event and delivers it', async () => {
    const notifier: AlertNotifier = { deliver: vi.fn() };
    const repo = fakeRepo({ listEnabledRules: vi.fn().mockResolvedValue([rule()]) });
    const svc = new AlertingService({ logger, repository: repo, gate: {} as GovernanceGate, notifier });

    const fired = await svc.evaluateRules(ctx);

    expect(fired).toHaveLength(1);
    expect(fired[0].status).toBe('firing');
    expect(fired[0].value).toBe(1);
    expect(fired[0].ruleId).toBe('rule-1');
    expect(repo.insertEvent).toHaveBeenCalledOnce();
    expect(notifier.deliver).toHaveBeenCalledOnce();
  });

  it('dedupe: a rule already firing is NOT re-fired (one live alert, not a storm)', async () => {
    const notifier: AlertNotifier = { deliver: vi.fn() };
    const repo = fakeRepo({
      listEnabledRules: vi.fn().mockResolvedValue([rule()]),
      latestFiring: vi.fn().mockResolvedValue(firingEvent()),
    });
    const svc = new AlertingService({ logger, repository: repo, gate: {} as GovernanceGate, notifier });

    const fired = await svc.evaluateRules(ctx);

    expect(fired).toEqual([]);
    expect(repo.insertEvent).not.toHaveBeenCalled();
    expect(notifier.deliver).not.toHaveBeenCalled();
  });

  it('a non-matching rule does not fire', async () => {
    const repo = fakeRepo({
      listEnabledRules: vi.fn().mockResolvedValue([rule({ expr: 'health.status == down' })]),
    });
    const svc = new AlertingService({ logger, repository: repo, gate: {} as GovernanceGate });

    const fired = await svc.evaluateRules({ health: health({ status: 'up' }) });

    expect(fired).toEqual([]);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it('rule-load failure is fail-safe: returns [] and never throws or fabricates a fire', async () => {
    const repo = fakeRepo({
      listEnabledRules: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const svc = new AlertingService({ logger, repository: repo, gate: {} as GovernanceGate });

    const fired = await svc.evaluateRules(ctx);

    expect(fired).toEqual([]);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it('delivery failure still PERSISTS the event (alert is never silently lost)', async () => {
    const notifier: AlertNotifier = {
      deliver: vi.fn().mockRejectedValue(new Error('notify engine offline')),
    };
    const repo = fakeRepo({ listEnabledRules: vi.fn().mockResolvedValue([rule()]) });
    const svc = new AlertingService({ logger, repository: repo, gate: {} as GovernanceGate, notifier });

    const fired = await svc.evaluateRules(ctx);

    // event fired + persisted despite delivery throwing
    expect(fired).toHaveLength(1);
    expect(repo.insertEvent).toHaveBeenCalledOnce();
  });
});

// --- acknowledgeAlert: governance-gated, fail-closed write ------------------

describe('AlertingService.acknowledgeAlert', () => {
  it('governance DENY blocks the ack: no audit, no status write, verdict surfaced', async () => {
    const gate = {
      decide: vi.fn().mockResolvedValue(denyVerdict('space not owned')),
      recordAudit: vi.fn(),
    } as unknown as GovernanceGate;
    const repo = fakeRepo({ getEvent: vi.fn().mockResolvedValue(firingEvent()) });
    const svc = new AlertingService({ logger, repository: repo, gate });

    await expect(
      svc.acknowledgeAlert({ eventId: 'alert-1', principal }),
    ).rejects.toThrow(/governance denied alert ack.*space not owned/);

    expect(gate.recordAudit).not.toHaveBeenCalled();
    expect(repo.updateEventStatus).not.toHaveBeenCalled();
  });

  it('a missing event throws before any governance decision is attempted', async () => {
    const gate = { decide: vi.fn(), recordAudit: vi.fn() } as unknown as GovernanceGate;
    const repo = fakeRepo({ getEvent: vi.fn().mockResolvedValue(null) });
    const svc = new AlertingService({ logger, repository: repo, gate });

    await expect(
      svc.acknowledgeAlert({ eventId: 'missing', principal }),
    ).rejects.toThrow(/alert event not found: missing/);

    expect(gate.decide).not.toHaveBeenCalled();
  });

  it('ALLOW records an audit entry and stores its id as auditRef on the acked event', async () => {
    const gate = {
      decide: vi.fn().mockResolvedValue(allowVerdict()),
      recordAudit: vi.fn().mockResolvedValue(auditRecord),
    } as unknown as GovernanceGate;
    const acked = firingEvent({
      status: 'acked',
      ackedBy: 'user-1',
      ackedAt: '2026-01-01T00:05:00.000Z',
      auditRef: 'audit-1',
    });
    const repo = fakeRepo({
      getEvent: vi.fn().mockResolvedValue(firingEvent()),
      updateEventStatus: vi.fn().mockResolvedValue(acked),
    });
    const svc = new AlertingService({ logger, repository: repo, gate });

    const result = await svc.acknowledgeAlert({ eventId: 'alert-1', principal });

    expect(gate.decide).toHaveBeenCalledWith(
      'alert.ack',
      principal,
      expect.objectContaining({ target: { path: 'alert:alert-1' } }),
    );
    expect(gate.recordAudit).toHaveBeenCalledOnce();
    expect(repo.updateEventStatus).toHaveBeenCalledWith(
      'alert-1',
      expect.objectContaining({ status: 'acked', ackedBy: 'user-1', auditRef: 'audit-1' }),
    );
    expect(result.status).toBe('acked');
    expect(result.auditRef).toBe('audit-1');
  });

  it('an event that vanishes between decide and write throws (never a silent no-op)', async () => {
    const gate = {
      decide: vi.fn().mockResolvedValue(allowVerdict()),
      recordAudit: vi.fn().mockResolvedValue(auditRecord),
    } as unknown as GovernanceGate;
    const repo = fakeRepo({
      getEvent: vi.fn().mockResolvedValue(firingEvent()),
      updateEventStatus: vi.fn().mockResolvedValue(null),
    });
    const svc = new AlertingService({ logger, repository: repo, gate });

    await expect(
      svc.acknowledgeAlert({ eventId: 'alert-1', principal }),
    ).rejects.toThrow(/alert event vanished during ack/);
  });
});
