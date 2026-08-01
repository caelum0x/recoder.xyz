import { describe, it, expect } from 'vitest';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../ports/governance-gate.port.js';
import type { GateDecisionContext, GateVerdict, GovernanceAction } from '../../governance/types.js';
import { createGovernanceGateAdapter } from '../adapters/governance-gate.adapter.js';

/**
 * The governance-gate adapter is the deny-biased wrapper every agent-os write
 * passes before it persists. These tests lock in the two invariants that keep a
 * write from ever proceeding on a faked allow:
 *   1. the raw gate effect (allow/deny/needs_approval) maps to `allowed` truthfully;
 *   2. an INFRA throw fails CLOSED (synthetic deny, degraded) — never an allow.
 * They also pin the principal/context shaping the adapter hands the frozen gate.
 */

interface DecideCall {
  readonly action: GovernanceAction;
  readonly principal: Principal;
  readonly ctx: GateDecisionContext;
}

function verdict(overrides: Partial<GateVerdict> = {}): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect: 'allow',
    tier: 'low',
    reason: 'ok',
    degraded: false,
    engine: 'napi',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * A fake `GovernanceGate` that only implements `decide` (the sole method the
 * adapter calls). `decide` records its args so we can assert principal/context
 * shaping; the other four methods throw if ever touched (they must not be).
 */
function fakeGate(opts: { verdict?: GateVerdict; throwOnDecide?: boolean }): {
  gate: GovernanceGate;
  calls: DecideCall[];
} {
  const calls: DecideCall[] = [];
  const gate = {
    async decide(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext) {
      calls.push({ action, principal, ctx });
      if (opts.throwOnDecide) throw new Error('kernel unavailable');
      return opts.verdict ?? verdict();
    },
    enforceTool: () => {
      throw new Error('enforceTool must not be called by the adapter');
    },
    route: () => {
      throw new Error('route must not be called by the adapter');
    },
    recordAudit: () => {
      throw new Error('recordAudit must not be called by the adapter');
    },
    verifyAudit: () => {
      throw new Error('verifyAudit must not be called by the adapter');
    },
  } as unknown as GovernanceGate;
  return { gate, calls };
}

describe('governance-gate.adapter — deny-biased write seam', () => {
  it('ALLOWS a write when the gate returns effect=allow', async () => {
    const { gate } = fakeGate({ verdict: verdict({ effect: 'allow' }) });
    const adapter = createGovernanceGateAdapter(gate);

    const decision = await adapter.guard('task.upsert', { ownerId: 'user-1' });

    expect(decision.allowed).toBe(true);
    expect(decision.effect).toBe('allow');
    expect(decision.degraded).toBe(false);
    expect(decision.approvalId).toBeUndefined();
  });

  it('FAIL-CLOSED: refuses a write when the gate returns effect=deny', async () => {
    const { gate } = fakeGate({ verdict: verdict({ effect: 'deny', reason: 'policy denied' }) });
    const adapter = createGovernanceGateAdapter(gate);

    const decision = await adapter.guard('run.transition', { ownerId: 'user-1' });

    expect(decision.allowed).toBe(false);
    expect(decision.effect).toBe('deny');
    expect(decision.reason).toBe('policy denied');
  });

  it('needs_approval is NOT allowed and surfaces the approvalId (approval gate, not a faked pass)', async () => {
    const { gate } = fakeGate({
      verdict: verdict({ effect: 'needs_approval', approvalId: 'appr-42', reason: 'human review' }),
    });
    const adapter = createGovernanceGateAdapter(gate);

    const decision = await adapter.guard('pr.create', { ownerId: 'user-1' });

    expect(decision.allowed).toBe(false); // only `allow` proceeds
    expect(decision.effect).toBe('needs_approval');
    expect(decision.approvalId).toBe('appr-42');
  });

  it('FAIL-CLOSED: an INFRA throw yields a synthetic deny (degraded), never an allow', async () => {
    const { gate } = fakeGate({ throwOnDecide: true });
    const adapter = createGovernanceGateAdapter(gate);

    const decision = await adapter.guard('memory.candidate.write', { ownerId: 'user-1' });

    expect(decision.allowed).toBe(false);
    expect(decision.effect).toBe('deny');
    expect(decision.degraded).toBe(true);
    expect(decision.reason).toBe('kernel unavailable');
  });

  it('propagates the gate degraded flag on an otherwise-allowed verdict (truthful posture)', async () => {
    const { gate } = fakeGate({ verdict: verdict({ effect: 'allow', degraded: true, engine: 'synthetic' }) });
    const adapter = createGovernanceGateAdapter(gate);

    const decision = await adapter.guard('task.upsert', { ownerId: 'user-1' });

    expect(decision.allowed).toBe(true);
    expect(decision.degraded).toBe(true);
  });

  it('attributes an un-owned write to the internal `agent-os` system principal', async () => {
    const { gate, calls } = fakeGate({ verdict: verdict() });
    const adapter = createGovernanceGateAdapter(gate);

    await adapter.guard('run.transition', {}); // no ownerId

    expect(calls).toHaveLength(1);
    expect(calls[0].principal.userId).toBe('agent-os');
    expect(calls[0].principal.kind).toBe('internal');
    expect(calls[0].principal.scopes).toContain('internal');
    expect(calls[0].principal.isAnonymous).toBe(false);
  });

  it('binds a provided ownerId as the principal identity', async () => {
    const { gate, calls } = fakeGate({ verdict: verdict() });
    const adapter = createGovernanceGateAdapter(gate);

    await adapter.guard('run.transition', { ownerId: 'owner-77' });

    expect(calls[0].principal.userId).toBe('owner-77');
    expect(calls[0].principal.kind).toBe('internal');
  });

  it('threads taskId/runId/target/metadata into the decision context for audit correlation', async () => {
    const { gate, calls } = fakeGate({ verdict: verdict() });
    const adapter = createGovernanceGateAdapter(gate);

    await adapter.guard('file.write', {
      ownerId: 'user-1',
      taskId: 'task-9',
      runId: 'run-9',
      target: { path: '/repo/a.ts' },
      metadata: { source: 'conductor' },
    });

    expect(calls[0].action).toBe('file.write');
    expect(calls[0].ctx.taskId).toBe('task-9');
    expect(calls[0].ctx.runId).toBe('run-9');
    expect(calls[0].ctx.target).toEqual({ path: '/repo/a.ts' });
    expect(calls[0].ctx.metadata).toEqual({ source: 'conductor' });
  });

  it('defaults to an empty target when none is declared (never undefined into the gate)', async () => {
    const { gate, calls } = fakeGate({ verdict: verdict() });
    const adapter = createGovernanceGateAdapter(gate);

    await adapter.guard('task.upsert', { ownerId: 'user-1' });

    expect(calls[0].ctx.target).toEqual({});
    expect(calls[0].ctx.taskId).toBeUndefined();
    expect(calls[0].ctx.runId).toBeUndefined();
  });
});
