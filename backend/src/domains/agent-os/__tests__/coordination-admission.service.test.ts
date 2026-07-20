/**
 * `CoordinationAdmissionService` — the double-assignment admission gate over the
 * Multica coordination fabric. These tests inject a FAKE `CoordinationEnginePort`
 * (no Go server, no network) and pin the four behaviours the conductor relies on:
 *
 *   1. Engine present + the SAME issue held by 2+ agents ⇒ launch DEFERRED
 *      (`admit:false, deferred:true`) — the fusion FIRES.
 *   2. The governance-gated reroute runs ONLY when `authorizeReroute` allows.
 *   3. Engine present + no contention for the issue ⇒ cleared (`admit:true, gated:true`).
 *   4. Engine ABSENT / errored ⇒ degrade OPEN (`admit:true, gated:false`) — the
 *      optional enrichment layer NEVER blocks a run.
 */
import { describe, it, expect, vi } from 'vitest';
import { CoordinationAdmissionService } from '../services/coordination-admission.service.js';
import type {
  CoordinationConflictResult,
  CoordinationEnginePort,
  RerouteRequest,
  RerouteResult,
} from '../ports/coordination-engine.port.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

/** A fake coordination engine — only the two methods the gate touches matter. */
function fakeEngine(
  conflictStatus: () => Promise<CoordinationConflictResult>,
  requestReroute: (req: RerouteRequest) => Promise<RerouteResult> = async (req) => ({
    routed: true,
    issueId: req.issueId,
  }),
): CoordinationEnginePort {
  return {
    routingStatus: async () => ({ available: false, mode: 'unconfigured', squads: [] }),
    coordinationStatus: async () => ({
      available: false,
      mode: 'unconfigured',
      locks: [],
      workingCount: 0,
      idleCount: 0,
    }),
    conflictStatus: vi.fn(conflictStatus),
    requestReroute: vi.fn(requestReroute),
  };
}

const CONTENDED: CoordinationConflictResult = {
  available: true,
  mode: 'external',
  conflicts: [
    {
      issueId: 'rec-42',
      identifier: 'REC-42',
      contenders: [
        { squadId: 's1', memberId: 'agent-a' },
        { squadId: 's1', memberId: 'agent-b' },
      ],
    },
  ],
};

describe('CoordinationAdmissionService — double-assignment admission gate', () => {
  it('DEFERS a launch when the issue is already actively held by 2+ agents', async () => {
    const svc = new CoordinationAdmissionService({ engine: fakeEngine(async () => CONTENDED), logger: silentLogger });

    const decision = await svc.admitIssue({ issueId: 'rec-42' });

    expect(decision.admit).toBe(false);
    expect(decision.deferred).toBe(true);
    expect(decision.gated).toBe(true);
    expect(decision.conflict?.issueId).toBe('rec-42');
    expect(decision.reason).toContain('already actively held by 2 agents');
  });

  it('matches a contended issue by its human identifier too', async () => {
    const svc = new CoordinationAdmissionService({ engine: fakeEngine(async () => CONTENDED), logger: silentLogger });

    const decision = await svc.admitIssue({ issueId: 'unknown-id', identifier: 'REC-42' });

    expect(decision.admit).toBe(false);
    expect(decision.deferred).toBe(true);
  });

  it('runs the governance-gated reroute ONLY when authorization allows', async () => {
    const engine = fakeEngine(async () => CONTENDED);
    const svc = new CoordinationAdmissionService({ engine, logger: silentLogger });

    const allowed = await svc.admitIssue({ issueId: 'rec-42' }, { authorizeReroute: async () => true });
    expect(allowed.reroute?.routed).toBe(true);
    expect(engine.requestReroute).toHaveBeenCalledWith({ issueId: 'rec-42', reason: expect.any(String) });

    const denied = await svc.admitIssue({ issueId: 'rec-42' }, { authorizeReroute: async () => false });
    expect(denied.admit).toBe(false); // still deferred
    expect(denied.reroute?.routed).toBe(false);
    expect(denied.reroute?.reason).toContain('not authorized');
    // The write was NOT attempted again (still only the one allowed call above).
    expect(engine.requestReroute).toHaveBeenCalledTimes(1);
  });

  it('clears the launch when the engine answers and sees NO contention for the issue', async () => {
    const svc = new CoordinationAdmissionService({
      engine: fakeEngine(async () => ({ available: true, mode: 'external', conflicts: [] })),
      logger: silentLogger,
    });

    const decision = await svc.admitIssue({ issueId: 'rec-99' });

    expect(decision.admit).toBe(true);
    expect(decision.deferred).toBe(false);
    expect(decision.gated).toBe(true); // the gate RAN and cleared it
  });

  it('degrades OPEN (never blocks) when the coordination engine is unavailable', async () => {
    const svc = new CoordinationAdmissionService({
      engine: fakeEngine(async () => ({
        available: false,
        mode: 'unconfigured',
        reason: 'Multica engine not configured',
        conflicts: [],
      })),
      logger: silentLogger,
    });

    const decision = await svc.admitIssue({ issueId: 'rec-42' });

    expect(decision.admit).toBe(true);
    expect(decision.deferred).toBe(false);
    expect(decision.gated).toBe(false); // truthful: the gate did NOT run
    expect(decision.reason).toContain('Multica engine not configured');
  });

  it('degrades OPEN when conflictStatus THROWS (a coordination hiccup never blocks a run)', async () => {
    const svc = new CoordinationAdmissionService({
      engine: fakeEngine(async () => {
        throw new Error('boom');
      }),
      logger: silentLogger,
    });

    const decision = await svc.admitIssue({ issueId: 'rec-42' });

    expect(decision.admit).toBe(true);
    expect(decision.gated).toBe(false);
  });

  it('skips the gate (no issue id ⇒ nothing to key on)', async () => {
    const engine = fakeEngine(async () => CONTENDED);
    const svc = new CoordinationAdmissionService({ engine, logger: silentLogger });

    const decision = await svc.admitIssue({ issueId: '   ' });

    expect(decision.admit).toBe(true);
    expect(decision.gated).toBe(false);
    expect(engine.conflictStatus).not.toHaveBeenCalled();
  });
});
