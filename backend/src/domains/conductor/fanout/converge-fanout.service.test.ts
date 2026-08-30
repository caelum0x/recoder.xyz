/**
 * `ConvergeFanoutService` — proves the fan-out + auto-converge orchestration against
 * INJECTED FAKES (no real Loom daemon, git, gate, or wait hub):
 *
 *  - N GOVERNED creates share ONE taskGroup + `substrate:'loom'` + a
 *    `recoder/fan-<kind>-<short>` branch; the task is delivered to each pane;
 *  - all panes settle done → `composeConvergence` runs over the settled set and the
 *    composed branch is returned;
 *  - a timed-out pane is `settled:false` + EXCLUDED from the converge set;
 *  - an `error`-settled pane is truthful (`settled:true`) but still excluded (not done-ish);
 *  - fewer than 2 done panes → `converged:null` with a truthful reason (plan/compose never run);
 *  - a managed kind without screen-status detection reports `nativeStatus:false`
 *    (managed launch support is never misrepresented as native status);
 *  - one create failure is reported per-agent and the other kinds still converge;
 *  - a synthesizable contested path is auto-selected `@synthesize`; a compose failure
 *    degrades to `converged:null` + the real reason (never a fabricated branch).
 */
import { describe, it, expect } from 'vitest';
import type { Principal } from '../../identity/types.js';
import type { AttentionState } from '../types.js';
import type { WaitOutcome, WaitRequest } from '../wait/wait.service.js';
import { SYNTHESIZE_SELECTION } from '../converge/converge-plan.service.js';
import type { ConvergencePlan } from '../converge/converge-plan.service.js';
import {
  ConvergeFanoutService,
  type FanoutComposeOutcome,
  type FanoutConvergeOps,
  type FanoutTaskDelivery,
  type FanoutWaitPort,
  type FanoutWorkspaceCreateOutcome,
  type FanoutWorkspaceCreateRequest,
  type FanoutWorkspaceCreator,
} from './converge-fanout.service.js';

const ACTOR: Principal = {
  userId: 'user-1',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

/** A deterministic id generator: 'id1','id2',… so taskGroup/branch are predictable. */
function seqIds(): () => string {
  let n = 0;
  return () => `id${++n}`;
}

/** A settled wait outcome in a given state. */
function settled(state: AttentionState): WaitOutcome {
  return { settled: true, state, reason: `classified:${state}`, seq: 1 };
}

/** A non-settled (timeout) wait outcome. */
function timedOut(lastState: AttentionState = 'working'): WaitOutcome {
  return { settled: false, reason: 'timeout', lastState };
}

// --- fakes -------------------------------------------------------------------

/** Fake governed creator: deterministic `ws_<kind>` ids; per-kind failure override. */
class FakeCreator implements FanoutWorkspaceCreator {
  readonly requests: {
    request: FanoutWorkspaceCreateRequest;
    actor: Principal;
  }[] = [];
  constructor(private readonly failKinds: ReadonlySet<string> = new Set()) {}
  async create(
    request: FanoutWorkspaceCreateRequest,
    actor: Principal
  ): Promise<FanoutWorkspaceCreateOutcome> {
    this.requests.push({ request, actor });
    if (this.failKinds.has(request.kind)) {
      return { ok: false, reason: `gate denied ${request.kind}` };
    }
    return { ok: true, workspaceId: `ws_${request.kind}` };
  }
}

/** Fake delivery: records each delivery; can throw for a chosen kind. */
class FakeDelivery implements FanoutTaskDelivery {
  readonly delivered: { workspaceId: string; kind: string; task: string }[] =
    [];
  constructor(private readonly throwKinds: ReadonlySet<string> = new Set()) {}
  async deliver(request: {
    workspaceId: string;
    kind: string;
    task: string;
  }): Promise<void> {
    if (this.throwKinds.has(request.kind)) {
      throw new Error(`prompt refused for ${request.kind}`);
    }
    this.delivered.push({ ...request });
  }
}

/** Fake wait: scripted per workspaceId; records the requests it saw. */
class FakeWait implements FanoutWaitPort {
  readonly seen: WaitRequest[] = [];
  constructor(private readonly script: ReadonlyMap<string, WaitOutcome>) {}
  async waitUntilSettled(request: WaitRequest): Promise<WaitOutcome> {
    this.seen.push(request);
    const outcome = this.script.get(request.workspaceId);
    if (!outcome)
      throw new Error(`no scripted wait for ${request.workspaceId}`);
    return outcome;
  }
}

/** Fake converge ops: records plan/compose calls; returns a scripted plan + outcome. */
class FakeConverge implements FanoutConvergeOps {
  readonly planCalls: {
    taskGroup: string;
    workspaceIds: readonly string[];
    probe: boolean;
  }[] = [];
  readonly composeCalls: {
    taskGroup: string;
    workspaceIds: readonly string[];
    selection: Readonly<Record<string, string>>;
  }[] = [];
  constructor(
    private readonly planResult: ConvergencePlan,
    private readonly composeResult: FanoutComposeOutcome
  ) {}
  async plan(request: {
    taskGroup: string;
    workspaceIds: readonly string[];
    probe: boolean;
  }): Promise<ConvergencePlan> {
    this.planCalls.push({ ...request });
    return this.planResult;
  }
  async compose(request: {
    taskGroup: string;
    workspaceIds: readonly string[];
    selection: Readonly<Record<string, string>>;
  }): Promise<FanoutComposeOutcome> {
    this.composeCalls.push({
      taskGroup: request.taskGroup,
      workspaceIds: request.workspaceIds,
      selection: request.selection,
    });
    return this.composeResult;
  }
}

/** A trivially-complete plan (no contested paths). */
function emptyPlan(taskGroup: string): ConvergencePlan {
  return {
    taskGroup,
    siblingCount: 2,
    files: [],
    unresolved: [],
    sources: [],
    changedFiles: [],
    complete: true,
    contested: [],
  };
}

const OK_COMPOSE: FanoutComposeOutcome = {
  ok: true,
  workspaceId: 'ws_converged',
  branch: 'recoder/converge-abcd1234',
};

// --- tests -------------------------------------------------------------------

describe('ConvergeFanoutService', () => {
  it('creates N governed loom workspaces sharing ONE taskGroup, delivers the task, waits on all, and converges', async () => {
    const creator = new FakeCreator();
    const delivery = new FakeDelivery();
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', settled('agent_idle_prompt')],
        ['ws_cursor', settled('awaiting_approval')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery,
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 'add a health endpoint',
      agentKinds: ['claude', 'codex', 'cursor'],
      base: 'main',
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    // Shared taskGroup on every create + the returned result.
    expect(result.taskGroup).toBe('fan-id1');
    expect(creator.requests).toHaveLength(3);
    for (const { request } of creator.requests) {
      expect(request.taskGroup).toBe('fan-id1');
      expect(request.substrate).toBe('loom');
      expect(request.base).toBe('main');
      expect(request.task).toBe('add a health endpoint');
      expect(request.branch).toBe(`recoder/fan-${request.kind}-id2`);
    }
    // Task delivered to EACH pane.
    expect(delivery.delivered.map(d => d.workspaceId).sort()).toEqual([
      'ws_claude',
      'ws_codex',
      'ws_cursor',
    ]);
    expect(
      delivery.delivered.every(d => d.task === 'add a health endpoint')
    ).toBe(true);
    // Waited on all three.
    expect(wait.seen.map(s => s.workspaceId).sort()).toEqual([
      'ws_claude',
      'ws_codex',
      'ws_cursor',
    ]);
    // All settled done → composed over the settled set, with the shared taskGroup.
    expect(converge.planCalls).toHaveLength(1);
    expect(converge.planCalls[0].probe).toBe(true);
    expect(converge.planCalls[0].taskGroup).toBe('fan-id1');
    expect([...converge.planCalls[0].workspaceIds].sort()).toEqual([
      'ws_claude',
      'ws_codex',
      'ws_cursor',
    ]);
    expect(converge.composeCalls).toHaveLength(1);
    expect(result.converged).toEqual({
      workspaceId: 'ws_converged',
      branch: 'recoder/converge-abcd1234',
    });
    expect(result.workspaceIds.sort()).toEqual([
      'ws_claude',
      'ws_codex',
      'ws_cursor',
    ]);
    expect(result.perAgent.every(a => a.settled && a.nativeStatus)).toBe(true);
  });

  it('waits on all panes but EXCLUDES a timed-out pane from the converge set', async () => {
    const creator = new FakeCreator();
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', settled('review_ready')],
        ['ws_cursor', timedOut('working')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'codex', 'cursor'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    const cursor = result.perAgent.find(a => a.kind === 'cursor');
    expect(cursor?.settled).toBe(false);
    expect(cursor?.reason).toBe('timeout');
    // Converge folded ONLY the two settled panes — the timed-out pane is excluded.
    expect([...converge.composeCalls[0].workspaceIds].sort()).toEqual([
      'ws_claude',
      'ws_codex',
    ]);
    expect(result.converged).toEqual({
      workspaceId: 'ws_converged',
      branch: 'recoder/converge-abcd1234',
    });
  });

  it('EXCLUDES an error-settled pane from the converge set (settled true, not done-ish)', async () => {
    const creator = new FakeCreator();
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', settled('review_ready')],
        ['ws_cursor', settled('error')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'codex', 'cursor'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    const cursor = result.perAgent.find(a => a.kind === 'cursor');
    expect(cursor?.settled).toBe(true);
    expect(cursor?.state).toBe('error');
    expect([...converge.composeCalls[0].workspaceIds].sort()).toEqual([
      'ws_claude',
      'ws_codex',
    ]);
  });

  it('does NOT converge when fewer than 2 panes settle done — converged:null, truthful reason', async () => {
    const creator = new FakeCreator();
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', timedOut()],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'codex'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    expect(result.converged).toBeNull();
    expect(result.convergeReason).toMatch(/nothing to converge/i);
    // Never fabricated: plan/compose were never called.
    expect(converge.planCalls).toHaveLength(0);
    expect(converge.composeCalls).toHaveLength(0);
  });

  it('reports nativeStatus:false for a managed kind without status detection (never faked native)', async () => {
    const creator = new FakeCreator();
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_crush', settled('review_ready')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'crush'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    const claude = result.perAgent.find(a => a.kind === 'claude');
    const crush = result.perAgent.find(a => a.kind === 'crush');
    expect(claude?.nativeStatus).toBe(true);
    expect(crush?.nativeStatus).toBe(false);
  });

  it('isolates one create failure per-agent and lets the other kinds proceed + converge', async () => {
    const creator = new FakeCreator(new Set(['codex']));
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_cursor', settled('review_ready')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'codex', 'cursor'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    const codex = result.perAgent.find(a => a.kind === 'codex');
    expect(codex?.workspaceId).toBeNull();
    expect(codex?.settled).toBe(false);
    expect(codex?.reason).toMatch(/launch failed/i);
    // The failed kind is never waited on and never in the created set.
    expect(wait.seen.map(s => s.workspaceId).sort()).toEqual([
      'ws_claude',
      'ws_cursor',
    ]);
    expect(result.workspaceIds.sort()).toEqual(['ws_claude', 'ws_cursor']);
    // The other two still converge.
    expect(result.converged).not.toBeNull();
    expect([...converge.composeCalls[0].workspaceIds].sort()).toEqual([
      'ws_claude',
      'ws_cursor',
    ]);
  });

  it('reports a task-delivery failure per-agent and excludes it, others proceed', async () => {
    const creator = new FakeCreator();
    const delivery = new FakeDelivery(new Set(['cursor']));
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', settled('review_ready')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery,
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'codex', 'cursor'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    const cursor = result.perAgent.find(a => a.kind === 'cursor');
    expect(cursor?.settled).toBe(false);
    expect(cursor?.reason).toMatch(/task delivery failed/i);
    // The workspace WAS created (SoR record) but is not waited on nor converged.
    expect(cursor?.workspaceId).toBe('ws_cursor');
    expect(wait.seen.map(s => s.workspaceId).sort()).toEqual([
      'ws_claude',
      'ws_codex',
    ]);
    expect([...converge.composeCalls[0].workspaceIds].sort()).toEqual([
      'ws_claude',
      'ws_codex',
    ]);
  });

  it('auto-selects @synthesize for a synthesizable contested path (and only that one)', async () => {
    const creator = new FakeCreator();
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', settled('review_ready')],
      ])
    );
    const plan: ConvergencePlan = {
      taskGroup: 'fan-id1',
      siblingCount: 2,
      files: [],
      unresolved: [],
      sources: [],
      changedFiles: ['a.ts', 'b.ts'],
      complete: false,
      contested: [
        {
          path: 'a.ts',
          workspaceIds: ['ws_claude', 'ws_codex'],
          synthesizable: true,
        },
        {
          path: 'b.ts',
          workspaceIds: ['ws_claude', 'ws_codex'],
          synthesizable: false,
          reason: 'overlap',
        },
      ],
    };
    const converge = new FakeConverge(plan, OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'codex'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    expect(converge.composeCalls[0].selection).toEqual({
      'a.ts': SYNTHESIZE_SELECTION,
    });
  });

  it('degrades to converged:null with the real reason when compose fails (never a fake branch)', async () => {
    const creator = new FakeCreator();
    const wait = new FakeWait(
      new Map([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', settled('review_ready')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-id1'), {
      ok: false,
      reason: 'convergence plan has 1 unresolved contested path(s): b.ts',
    });
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.fanout({
      task: 't',
      agentKinds: ['claude', 'codex'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    expect(result.converged).toBeNull();
    expect(result.convergeReason).toMatch(/unresolved contested/i);
  });

  it('retries one failed agent into the original group without composing the replacement alone', async () => {
    const creator = new FakeCreator();
    const wait = new FakeWait(
      new Map([['ws_codex', settled('review_ready')]])
    );
    const converge = new FakeConverge(emptyPlan('fan-existing'), OK_COMPOSE);
    const svc = new ConvergeFanoutService({
      creator,
      delivery: new FakeDelivery(),
      wait,
      converge,
      newId: seqIds(),
    });

    const result = await svc.retry({
      taskGroup: 'fan-existing',
      task: 'finish the original task',
      agentKinds: ['codex'],
      repoPath: '/repo',
      spaceId: 'space-1',
      projectId: 'proj-1',
      actor: ACTOR,
    });

    expect(creator.requests[0].request.taskGroup).toBe('fan-existing');
    expect(creator.requests[0].request.branch).toBe('recoder/fan-codex-id1');
    expect(result).toMatchObject({
      taskGroup: 'fan-existing',
      workspaceIds: ['ws_codex'],
      reviewableWorkspaceIds: ['ws_codex'],
    });
    expect(converge.planCalls).toHaveLength(0);
    expect(converge.composeCalls).toHaveLength(0);
  });
});
