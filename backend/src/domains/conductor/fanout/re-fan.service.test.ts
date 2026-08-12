/**
 * `ReFanService` — proves the SECOND-ROUND re-fan orchestration against INJECTED
 * FAKES (no real Loom daemon, git, gate, or wait hub):
 *
 *  - it RESOLVES the prior convergence for the first-round group and hands the shipped
 *    fan-out `base = recoder/converge-<id>` (never a fabricated base) + a task text
 *    carrying the round-1 provenance;
 *  - the second round's >=2 done ⇒ the fan-out's new converge branch is surfaced,
 *    linked back to round 1;
 *  - the second round's <2 done ⇒ `converged:null` + the fan-out's truthful reason;
 *  - NO prior converged branch ⇒ a truthful REFUSAL and the fan-out is NEVER invoked;
 *  - carried memory rides each pane's task text; the round-1 assisted paths surface on
 *    the provenance link;
 *  - driving the REAL {@link ConvergeFanoutService} as the fan-out seam, the base
 *    propagates to every governed create and a timed-out / errored pane is EXCLUDED
 *    from the second-round converge set (the same shipped truthful path).
 */
import { describe, it, expect } from 'vitest';
import type { Principal } from '../../identity/types.js';
import type { AttentionState } from '../types.js';
import type { WaitOutcome, WaitRequest } from '../wait/wait.service.js';
import type { ConvergencePlan } from '../converge/converge-plan.service.js';
import type { ConvergenceProvenance } from '../converge/converge.ops.js';
import {
  ConvergeFanoutService,
  type FanoutComposeOutcome,
  type FanoutConvergeOps,
  type FanoutInput,
  type FanoutResult,
  type FanoutWorkspaceCreateOutcome,
  type FanoutWorkspaceCreateRequest,
  type FanoutWorkspaceCreator,
} from './converge-fanout.service.js';
import {
  ReFanService,
  buildReFanTask,
  type PriorConvergence,
  type PriorConvergenceResolver,
  type ReFanFanoutPort,
  type ReFanInput,
} from './re-fan.service.js';

const ACTOR: Principal = {
  userId: 'user-1',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

const PRIOR_BRANCH = 'recoder/converge-abcd1234';

function priorConvergence(
  provenance: ConvergenceProvenance | null = null
): PriorConvergence {
  return { workspaceId: 'ws_converged_r1', branch: PRIOR_BRANCH, provenance };
}

const PROVENANCE_R1: ConvergenceProvenance = {
  fromTaskGroup: 'fan-round1',
  sourceCount: 3,
  fileCount: 4,
  selections: [],
};

/** A fake prior-convergence resolver: returns a scripted prior (or null), records calls. */
class FakeResolver implements PriorConvergenceResolver {
  readonly calls: string[] = [];
  constructor(private readonly prior: PriorConvergence | null) {}
  async resolve(taskGroup: string): Promise<PriorConvergence | null> {
    this.calls.push(taskGroup);
    return this.prior;
  }
}

/** A fake fan-out seam: records the FanoutInput it saw; returns a scripted result. */
class FakeFanout implements ReFanFanoutPort {
  readonly inputs: FanoutInput[] = [];
  constructor(private readonly result: FanoutResult) {}
  async fanout(input: FanoutInput): Promise<FanoutResult> {
    this.inputs.push(input);
    return this.result;
  }
}

function convergedResult(over: Partial<FanoutResult> = {}): FanoutResult {
  return {
    taskGroup: 'fan-round2',
    workspaceIds: ['ws_claude', 'ws_codex'],
    converged: { workspaceId: 'ws_converged_r2', branch: 'recoder/converge-r2' },
    perAgent: [
      {
        kind: 'claude',
        nativeStatus: true,
        workspaceId: 'ws_claude',
        settled: true,
        reason: 'classified:review_ready',
        state: 'review_ready',
      },
      {
        kind: 'codex',
        nativeStatus: true,
        workspaceId: 'ws_codex',
        settled: true,
        reason: 'classified:review_ready',
        state: 'review_ready',
      },
    ],
    ...over,
  };
}

const REFAN_INPUT: ReFanInput = {
  taskGroup: 'fan-round1',
  narrowedTask: 'now also add rate-limiting to the health endpoint',
  agentKinds: ['claude', 'codex'],
  repoPath: '/repo',
  spaceId: 'space-1',
  projectId: 'proj-1',
  actor: ACTOR,
};

// --- fan-out fakes (for the REAL ConvergeFanoutService seam) ------------------

function seqIds(): () => string {
  let n = 0;
  return () => `id${++n}`;
}
function settled(state: AttentionState): WaitOutcome {
  return { settled: true, state, reason: `classified:${state}`, seq: 1 };
}
function timedOut(lastState: AttentionState = 'working'): WaitOutcome {
  return { settled: false, reason: 'timeout', lastState };
}

class FakeCreator implements FanoutWorkspaceCreator {
  readonly requests: FanoutWorkspaceCreateRequest[] = [];
  async create(
    request: FanoutWorkspaceCreateRequest
  ): Promise<FanoutWorkspaceCreateOutcome> {
    this.requests.push(request);
    return { ok: true, workspaceId: `ws_${request.kind}` };
  }
}
class FakeWait {
  constructor(private readonly script: ReadonlyMap<string, WaitOutcome>) {}
  async waitUntilSettled(request: WaitRequest): Promise<WaitOutcome> {
    const outcome = this.script.get(request.workspaceId);
    if (!outcome) throw new Error(`no scripted wait for ${request.workspaceId}`);
    return outcome;
  }
}
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
class FakeConverge implements FanoutConvergeOps {
  readonly composeCalls: { workspaceIds: readonly string[] }[] = [];
  constructor(
    private readonly planResult: ConvergencePlan,
    private readonly composeResult: FanoutComposeOutcome
  ) {}
  async plan(): Promise<ConvergencePlan> {
    return this.planResult;
  }
  async compose(request: {
    workspaceIds: readonly string[];
  }): Promise<FanoutComposeOutcome> {
    this.composeCalls.push({ workspaceIds: request.workspaceIds });
    return this.composeResult;
  }
}

// --- tests -------------------------------------------------------------------

describe('ReFanService', () => {
  it('re-fans off the prior converge branch, carries round-1 provenance into the task, and links the new group back to round 1', async () => {
    const resolver = new FakeResolver(priorConvergence(PROVENANCE_R1));
    const fanout = new FakeFanout(convergedResult());
    const svc = new ReFanService({ resolver, fanout });

    const result = await svc.reFan(REFAN_INPUT);

    // Resolved the prior convergence for the first-round group.
    expect(resolver.calls).toEqual(['fan-round1']);
    // The fan-out got base = the prior converge branch (never a fabricated base).
    expect(fanout.inputs).toHaveLength(1);
    const passed = fanout.inputs[0];
    expect(passed.base).toBe(PRIOR_BRANCH);
    expect(passed.agentKinds).toEqual(['claude', 'codex']);
    expect(passed.repoPath).toBe('/repo');
    expect(passed.actor.userId).toBe('user-1');
    // The task text carries the narrowed task + round-1 provenance context.
    expect(passed.task).toContain(REFAN_INPUT.narrowedTask);
    expect(passed.task).toContain(PRIOR_BRANCH);
    expect(passed.task).toContain('fan-round1');
    expect(passed.task).toContain('4 file(s) from 3 agent(s)');

    // The truthful, round-1-linked result.
    expect(result.refused).toBe(false);
    if (result.refused) throw new Error('unreachable');
    expect(result.priorTaskGroup).toBe('fan-round1');
    expect(result.priorConverge).toEqual({
      workspaceId: 'ws_converged_r1',
      branch: PRIOR_BRANCH,
    });
    expect(result.provenanceLink).toEqual({
      fromTaskGroup: 'fan-round1',
      sourceCount: 3,
      fileCount: 4,
    });
    expect(result.taskGroup).toBe('fan-round2');
    expect(result.converged).toEqual({
      workspaceId: 'ws_converged_r2',
      branch: 'recoder/converge-r2',
    });
    expect(result.workspaceIds).toEqual(['ws_claude', 'ws_codex']);
  });

  it('surfaces converged:null + the fan-out reason when the second round has <2 done (still linked to round 1)', async () => {
    const resolver = new FakeResolver(priorConvergence(PROVENANCE_R1));
    const fanout = new FakeFanout(
      convergedResult({
        converged: null,
        convergeReason:
          'nothing to converge: 1 of 2 agent(s) settled to a reviewable state (need ≥2)',
        workspaceIds: ['ws_claude', 'ws_codex'],
      })
    );
    const svc = new ReFanService({ resolver, fanout });

    const result = await svc.reFan(REFAN_INPUT);

    expect(result.refused).toBe(false);
    if (result.refused) throw new Error('unreachable');
    expect(result.converged).toBeNull();
    expect(result.convergeReason).toMatch(/nothing to converge/i);
    // Still truthfully linked to round 1.
    expect(result.priorConverge.branch).toBe(PRIOR_BRANCH);
    expect(result.taskGroup).toBe('fan-round2');
  });

  it('REFUSES truthfully when no prior converged branch exists — the fan-out is never invoked (no fabricated base)', async () => {
    const resolver = new FakeResolver(null);
    const fanout = new FakeFanout(convergedResult());
    const svc = new ReFanService({ resolver, fanout });

    const result = await svc.reFan(REFAN_INPUT);

    expect(result.refused).toBe(true);
    if (!result.refused) throw new Error('unreachable');
    expect(result.priorTaskGroup).toBe('fan-round1');
    expect(result.reason).toMatch(/no prior converged branch/i);
    // Never a fabricated launch off a made-up base.
    expect(fanout.inputs).toHaveLength(0);
  });

  it('carries relevant memory into each pane task text when provided', async () => {
    const resolver = new FakeResolver(priorConvergence(PROVENANCE_R1));
    const fanout = new FakeFanout(convergedResult());
    const svc = new ReFanService({ resolver, fanout });

    await svc.reFan({
      ...REFAN_INPUT,
      memory: 'the health endpoint lives in src/routes/health.ts',
    });

    expect(fanout.inputs[0].task).toContain(
      'the health endpoint lives in src/routes/health.ts'
    );
  });

  it('surfaces round-1 LLM-assisted paths on the provenance link and in the task text', async () => {
    const provenance: ConvergenceProvenance = {
      ...PROVENANCE_R1,
      assisted: [{ path: 'src/merge.ts' }],
    };
    const resolver = new FakeResolver(priorConvergence(provenance));
    const fanout = new FakeFanout(convergedResult());
    const svc = new ReFanService({ resolver, fanout });

    const result = await svc.reFan(REFAN_INPUT);

    if (result.refused) throw new Error('unreachable');
    expect(result.provenanceLink?.assistedPaths).toEqual(['src/merge.ts']);
    expect(fanout.inputs[0].task).toContain('src/merge.ts');
  });

  it('has a null provenance link (and a clean task) when round 1 recorded no provenance', async () => {
    const resolver = new FakeResolver(priorConvergence(null));
    const fanout = new FakeFanout(convergedResult());
    const svc = new ReFanService({ resolver, fanout });

    const result = await svc.reFan(REFAN_INPUT);

    if (result.refused) throw new Error('unreachable');
    expect(result.provenanceLink).toBeNull();
    // The base is still the real prior branch; the task still names it.
    expect(fanout.inputs[0].base).toBe(PRIOR_BRANCH);
    expect(fanout.inputs[0].task).toContain(PRIOR_BRANCH);
  });

  it('drives the REAL fan-out: base propagates to EVERY governed create and a timed-out/errored pane is excluded from the second-round converge', async () => {
    const resolver = new FakeResolver(priorConvergence(PROVENANCE_R1));
    const creator = new FakeCreator();
    // 4 panes: two settle done, one times out, one settles to error — only the two
    // done-ish panes feed the second-round converge (the shipped truthful path).
    const wait = new FakeWait(
      new Map<string, WaitOutcome>([
        ['ws_claude', settled('review_ready')],
        ['ws_codex', settled('agent_idle_prompt')],
        ['ws_cursor', timedOut('working')],
        ['ws_opencode', settled('error')],
      ])
    );
    const converge = new FakeConverge(emptyPlan('fan-x'), {
      ok: true,
      workspaceId: 'ws_converged_r2',
      branch: 'recoder/converge-r2real',
    });
    const realFanout = new ConvergeFanoutService({
      creator,
      delivery: { deliver: async () => {} },
      wait,
      converge,
      newId: seqIds(),
    });
    const svc = new ReFanService({
      resolver,
      fanout: { fanout: input => realFanout.fanout(input) },
    });

    const result = await svc.reFan({
      ...REFAN_INPUT,
      agentKinds: ['claude', 'codex', 'cursor', 'opencode'],
    });

    // Base propagated to EVERY governed create + the carried re-fan task text.
    expect(creator.requests).toHaveLength(4);
    for (const request of creator.requests) {
      expect(request.base).toBe(PRIOR_BRANCH);
      expect(request.task).toContain(PRIOR_BRANCH);
      expect(request.task).toContain(REFAN_INPUT.narrowedTask);
    }
    // Only the two done-ish panes converged; the timed-out + errored panes excluded.
    expect(converge.composeCalls).toHaveLength(1);
    expect([...converge.composeCalls[0].workspaceIds].sort()).toEqual([
      'ws_claude',
      'ws_codex',
    ]);
    if (result.refused) throw new Error('unreachable');
    expect(result.converged).toEqual({
      workspaceId: 'ws_converged_r2',
      branch: 'recoder/converge-r2real',
    });
    const cursor = result.perAgent.find(a => a.kind === 'cursor');
    const opencode = result.perAgent.find(a => a.kind === 'opencode');
    expect(cursor?.settled).toBe(false);
    expect(opencode?.settled).toBe(true);
    expect(opencode?.state).toBe('error');
  });
});

describe('buildReFanTask', () => {
  it('names the prior branch as the base and appends the narrowed task last', () => {
    const task = buildReFanTask(REFAN_INPUT, priorConvergence(PROVENANCE_R1));
    expect(task).toContain(`YOUR BASE`);
    expect(task).toContain(PRIOR_BRANCH);
    expect(task.trimEnd().endsWith(REFAN_INPUT.narrowedTask)).toBe(true);
  });
});
