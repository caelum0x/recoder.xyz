/**
 * Conductor coordination-admission consult (createWorkspace).
 *
 * Proves the OPTIONAL double-assignment gate over the Multica coordination
 * fabric, consulted AFTER the entitlement quota gate + pal advisory and BEFORE
 * `engine.createWorkspace` (axis: resource-governor → coordination-admission →
 * work-lock → launch), keyed on `input.taskId`:
 *   - a LIVE engine-confirmed double-assignment (`admit:false`) DEFERS the launch
 *     truthfully (`ok:false`, no workspace persisted, audit `coordinationDeferred`);
 *   - the reroute WRITE is governance-gated by the caller (`coordination.reroute`)
 *     — a deny ⇒ no reroute, launch still deferred (fail-safe);
 *   - engine absent (`admit:true, gated:false`) ⇒ the launch proceeds untouched;
 *   - `input.taskId` absent, no gate wired, or the gate THROWING ⇒ the launch is
 *     byte-identical to today (FAIL-OPEN — a coordination engine down never blocks).
 */
import { describe, it, expect } from 'vitest';
import {
  FakeSubstrate,
  makeConfig,
  makeCreateInput,
  makeExecutor,
  makeGate,
  makeLogger,
  makeMiddleware,
  makePrincipal,
  type FakeGate,
} from './__fixtures__/harness.js';
import { createConductorModule, type ConductorModule } from './index.js';
import type {
  CoordinationAdmissionDecision,
  CoordinationAdmissionPort,
} from './ports/coordination-admission.port.js';
import type { GovernanceEffect } from '../governance/types.js';

/** A recording fake admission port. `decision` is returned (or `'throw'` faults). */
function makeAdmission(cfg: {
  decision: CoordinationAdmissionDecision | 'throw';
  /** When true, `admitIssue` exercises the caller's governance-gated reroute. */
  callAuthorize?: boolean;
}): { port: CoordinationAdmissionPort; calls: { issueIds: string[]; authorized: boolean | null } } {
  const calls = { issueIds: [] as string[], authorized: null as boolean | null };
  const port: CoordinationAdmissionPort = {
    async admitIssue(input, options) {
      calls.issueIds.push(input.issueId);
      if (cfg.decision === 'throw') throw new Error('multica unreachable');
      if (cfg.callAuthorize && options?.authorizeReroute) {
        const authorized = await options.authorizeReroute();
        calls.authorized = authorized;
        return { ...cfg.decision, reroute: { routed: authorized, issueId: input.issueId } };
      }
      return cfg.decision;
    },
  };
  return { port, calls };
}

/** Compose the module over the harness with a fake admission port injected. */
function compose(options: {
  coordinationAdmission?: CoordinationAdmissionPort;
  gate?: FakeGate;
}): { module: ConductorModule; gate: FakeGate } {
  const gate = options.gate ?? makeGate('allow');
  const module = createConductorModule({
    config: makeConfig(),
    logger: makeLogger(),
    executor: makeExecutor(false),
    middleware: makeMiddleware(),
    gate,
    substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    ...(options.coordinationAdmission ? { coordinationAdmission: options.coordinationAdmission } : {}),
  });
  return { module, gate };
}

/** A gate that allows `workspace.create` but denies exactly `deniedAction`. */
function gateDenying(deniedAction: string): FakeGate {
  const gate = makeGate('allow');
  const inner = gate.decide.bind(gate);
  gate.decide = async (action, principal, ctx) => {
    const verdict = await inner(action, principal, ctx);
    if (action === deniedAction) {
      return { ...verdict, effect: 'deny' as GovernanceEffect, reason: `${action} denied by policy` };
    }
    return verdict;
  };
  return gate;
}

const DEFER: CoordinationAdmissionDecision = {
  admit: false,
  deferred: true,
  gated: true,
  reason: 'rec-1 already held by 2 agents',
  conflict: {
    issueId: 'task_1',
    contenders: [
      { squadId: 'squad_1', memberId: 'agent_a' },
      { squadId: 'squad_1', memberId: 'agent_b' },
    ],
  },
};

describe('conductor coordination admission', () => {
  it('DEFERS a launch whose issue is a live double-assignment (never launches)', async () => {
    const { port, calls } = makeAdmission({ decision: DEFER, callAuthorize: true });
    const { module, gate } = compose({ coordinationAdmission: port });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/held|contended|deferred/i);
    // Keyed on the bd issue id; the substrate never launched.
    expect(calls.issueIds).toEqual(['task_1']);
    expect(await module.listWorkspaces()).toHaveLength(0);
    // The defer is sealed with truthful audit metadata, NOT a governance deny.
    const deferred = gate.audits.find((a) => a.payload?.coordinationDeferred === true);
    expect(deferred).toBeDefined();
    expect(deferred?.payload?.contenders).toBe(2);
    expect(deferred?.payload?.rerouted).toBe(true);
  });

  it('governance-gates the reroute WRITE: a deny ⇒ no reroute, launch still deferred', async () => {
    const { port, calls } = makeAdmission({ decision: DEFER, callAuthorize: true });
    const { module, gate } = compose({
      coordinationAdmission: port,
      gate: gateDenying('coordination.reroute'),
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(false); // launch still deferred (contended issue)
    expect(calls.authorized).toBe(false); // reroute write refused by the gate
    const deferred = gate.audits.find((a) => a.payload?.coordinationDeferred === true);
    expect(deferred?.payload?.rerouted).toBe(false);
  });

  it('PROCEEDS when the engine is absent (admit:true, gated:false — degrade open)', async () => {
    const { port, calls } = makeAdmission({
      decision: { admit: true, deferred: false, gated: false, reason: 'coordination engine unavailable' },
    });
    const { module } = compose({ coordinationAdmission: port });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
    expect(calls.issueIds).toEqual(['task_1']);
  });

  it('SKIPS the gate when the launch carries no issue id (taskId absent)', async () => {
    const { port, calls } = makeAdmission({ decision: DEFER, callAuthorize: true });
    const { module } = compose({ coordinationAdmission: port });
    const { taskId: _taskId, ...noTask } = makeCreateInput();

    const result = await module.createWorkspace(noTask, makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
    expect(calls.issueIds).toEqual([]); // gate never consulted without an issue id
  });

  it('is byte-identical to today when NO admission gate is wired', async () => {
    const { module } = compose({});

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
  });

  it('FAILS OPEN when the gate THROWS (a coordination engine down never blocks)', async () => {
    const { port } = makeAdmission({ decision: 'throw' });
    const { module } = compose({ coordinationAdmission: port });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
  });
});
