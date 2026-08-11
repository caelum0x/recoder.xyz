/**
 * `governance-gate.adapter` — the deny-biased wrapper every agent-os write passes.
 *
 * Proves the security-critical branches (never a faked allow):
 *  - `effect: 'allow'` ⇒ `allowed: true`; any other effect ⇒ `allowed: false`,
 *  - `effect: 'needs_approval'` surfaces the `approvalId` and stays NOT allowed,
 *  - an INFRA throw from the underlying gate fails CLOSED (synthetic deny,
 *    `degraded: true`) — a write never proceeds on an errored gate,
 *  - a missing owner is attributed to the internal `agent-os` system principal,
 *  - task/run/target/metadata are threaded into the decision context verbatim,
 *  - the gate's truthful `degraded` flag is carried through unchanged.
 */
import { describe, it, expect, vi } from 'vitest';
import { createGovernanceGateAdapter } from './governance-gate.adapter.js';
import type { GovernanceGate } from '../ports/governance-gate.port.js';
import type { GateVerdict } from '../ports/governance-gate.port.js';
import type { Principal } from '../../identity/types.js';

function verdict(over: Partial<GateVerdict>): GateVerdict {
  return {
    verdictId: 'v-1',
    requestId: 'r-1',
    effect: 'allow',
    tier: 'low',
    reason: 'ok',
    degraded: false,
    engine: 'napi',
    createdAt: '2026-08-11T00:00:00.000Z',
    ...over,
  } as GateVerdict;
}

/** A gate whose only exercised method is `decide`; the rest throw if touched. */
function gateWith(decide: GovernanceGate['decide']): GovernanceGate {
  return {
    decide,
    enforceTool: vi.fn(),
    route: vi.fn(),
    recordAudit: vi.fn(),
    verifyAudit: vi.fn(),
  } as unknown as GovernanceGate;
}

describe('createGovernanceGateAdapter', () => {
  it('allows the write only when the gate returns effect: allow', async () => {
    const decide = vi.fn(async () => verdict({ effect: 'allow', reason: 'policy-clear' }));
    const adapter = createGovernanceGateAdapter(gateWith(decide));

    const decision = await adapter.guard('task.upsert', { ownerId: 'user-A' });

    expect(decision.allowed).toBe(true);
    expect(decision.effect).toBe('allow');
    expect(decision.reason).toBe('policy-clear');
    expect(decision.degraded).toBe(false);
    expect(decision.approvalId).toBeUndefined();
  });

  it('DENIES the write (allowed:false) on effect: deny', async () => {
    const decide = vi.fn(async () => verdict({ effect: 'deny', reason: 'blocked by policy' }));
    const adapter = createGovernanceGateAdapter(gateWith(decide));

    const decision = await adapter.guard('file.write', { ownerId: 'user-A' });

    expect(decision.allowed).toBe(false);
    expect(decision.effect).toBe('deny');
    expect(decision.reason).toBe('blocked by policy');
  });

  it('surfaces the approvalId on needs_approval and stays NOT allowed', async () => {
    const decide = vi.fn(async () =>
      verdict({ effect: 'needs_approval', reason: 'awaiting review', approvalId: 'appr-9' }),
    );
    const adapter = createGovernanceGateAdapter(gateWith(decide));

    const decision = await adapter.guard('pr.create', { ownerId: 'user-A' });

    expect(decision.allowed).toBe(false);
    expect(decision.effect).toBe('needs_approval');
    expect(decision.approvalId).toBe('appr-9');
  });

  it('fails CLOSED (synthetic deny, degraded) when the gate THROWS an infra fault', async () => {
    const decide = vi.fn(async () => {
      throw new Error('kernel unreachable');
    });
    const adapter = createGovernanceGateAdapter(gateWith(decide));

    const decision = await adapter.guard('run.transition', { ownerId: 'user-A' });

    expect(decision.allowed).toBe(false);
    expect(decision.effect).toBe('deny');
    expect(decision.degraded).toBe(true);
    expect(decision.reason).toBe('kernel unreachable');
  });

  it('reports a generic reason when a non-Error is thrown (never leaks internals)', async () => {
    const decide = vi.fn(async () => {
      throw 'boom';
    });
    const adapter = createGovernanceGateAdapter(gateWith(decide));

    const decision = await adapter.guard('run.transition', {});

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('governance gate unavailable');
    expect(decision.degraded).toBe(true);
  });

  it('attributes an un-owned write to the internal agent-os system principal', async () => {
    let seen: Principal | undefined;
    const decide = vi.fn(async (_action: string, principal: Principal) => {
      seen = principal;
      return verdict({ effect: 'allow' });
    });
    const adapter = createGovernanceGateAdapter(gateWith(decide as GovernanceGate['decide']));

    await adapter.guard('event.ingest', {});

    expect(seen?.userId).toBe('agent-os');
    expect(seen?.kind).toBe('internal');
    expect(seen?.scopes).toContain('internal');
  });

  it('binds a supplied owner as the decision principal (owner scoping upstream)', async () => {
    let seen: Principal | undefined;
    const decide = vi.fn(async (_action: string, principal: Principal) => {
      seen = principal;
      return verdict({ effect: 'allow' });
    });
    const adapter = createGovernanceGateAdapter(gateWith(decide as GovernanceGate['decide']));

    await adapter.guard('task.upsert', { ownerId: 'user-42' });

    expect(seen?.userId).toBe('user-42');
    expect(seen?.kind).toBe('internal');
  });

  it('threads task/run/target/metadata into the decision context verbatim', async () => {
    let ctx: unknown;
    const decide = vi.fn(async (_a: string, _p: Principal, c: unknown) => {
      ctx = c;
      return verdict({ effect: 'allow' });
    });
    const adapter = createGovernanceGateAdapter(gateWith(decide as GovernanceGate['decide']));

    await adapter.guard('file.write', {
      ownerId: 'user-A',
      taskId: 'task-1',
      runId: 'run-1',
      target: { path: '/repo/app.ts' },
      metadata: { origin: 'run-event' },
    });

    expect(ctx).toMatchObject({
      taskId: 'task-1',
      runId: 'run-1',
      target: { path: '/repo/app.ts' },
      metadata: { origin: 'run-event' },
    });
  });

  it('defaults to an empty target when none is supplied (no undefined leak)', async () => {
    let ctx: { target?: unknown; taskId?: unknown } | undefined;
    const decide = vi.fn(async (_a: string, _p: Principal, c: unknown) => {
      ctx = c as { target?: unknown; taskId?: unknown };
      return verdict({ effect: 'allow' });
    });
    const adapter = createGovernanceGateAdapter(gateWith(decide as GovernanceGate['decide']));

    await adapter.guard('event.ingest', {});

    expect(ctx?.target).toEqual({});
    expect('taskId' in (ctx ?? {})).toBe(false);
  });

  it('carries the gate degraded flag through on an allowed non-napi verdict', async () => {
    const decide = vi.fn(async () => verdict({ effect: 'allow', degraded: true, engine: 'synthetic' }));
    const adapter = createGovernanceGateAdapter(gateWith(decide));

    const decision = await adapter.guard('task.upsert', { ownerId: 'user-A' });

    expect(decision.allowed).toBe(true);
    expect(decision.degraded).toBe(true);
  });
});
