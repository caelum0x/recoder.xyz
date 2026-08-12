/**
 * `PlaybookService` — proves the built-in playbooks SEQUENCE the shipped primitives
 * against INJECTED FAKES (no real fan-out / swarm / re-fan):
 *
 *  - `fan-converge` runs the shipped fan-out and returns its REAL converged branch,
 *    linking the step to ONE shared taskGroup;
 *  - `fan-unblock-converge` invokes swarm-unblock on the pane the fan-out reported
 *    BLOCKED (`awaiting_approval`), threading the SAME taskGroup, then reports the real
 *    escalation — and is a truthful no-op when no pane is blocked;
 *  - `blockedPanesOf` counts ONLY settled `awaiting_approval` panes (never a timed-out /
 *    unknown / done-ish pane);
 *  - `fan-converge-refan` re-fans a supplied follow-up off the converged branch;
 *  - a re-fan whose primitive REFUSES (no prior convergence) is reported truthfully
 *    (`status:'degraded'`) and NEVER fabricates a downstream converged branch;
 *  - a `re_fan` step SKIPS truthfully when no follow-up task is supplied;
 *  - the `stopIfNotConverged` / `stopIfDegraded` step flags stop the run and record the
 *    remaining steps as `skipped` (documented stop-vs-continue policy);
 *  - an unknown playbook id throws `NOT_FOUND` (a bad recipe never launches anything).
 */
import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { AttentionState } from '../types.js';
import type {
  FanoutAgentResult,
  FanoutInput,
  FanoutResult,
} from '../fanout/converge-fanout.service.js';
import type { ReFanInput, ReFanResult } from '../fanout/re-fan.service.js';
import type {
  ResolveBlockedInput,
  SwarmUnblockResult,
} from '../swarm/swarm-unblock.service.js';
import { PlaybookService, blockedPanesOf } from './playbook.service.js';
import type {
  Playbook,
  PlaybookFanoutPort,
  PlaybookReFanPort,
  PlaybookRunInput,
  PlaybookSwarmUnblockPort,
} from './playbook.types.js';

const ACTOR: Principal = {
  userId: 'user-1',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

function baseInput(
  overrides: Partial<PlaybookRunInput> = {}
): PlaybookRunInput {
  return {
    playbookId: 'fan-converge',
    task: 'add a health endpoint',
    agentKinds: ['claude', 'codex'],
    repoPath: '/repo',
    spaceId: 'space-1',
    projectId: 'proj-1',
    actor: ACTOR,
    ...overrides,
  };
}

function agent(
  kind: string,
  state: AttentionState,
  settled = true
): FanoutAgentResult {
  return {
    kind,
    nativeStatus: true,
    workspaceId: `ws_${kind}`,
    settled,
    reason: `classified:${state}`,
    state,
  };
}

function fanoutResult(overrides: Partial<FanoutResult> = {}): FanoutResult {
  return {
    taskGroup: 'fan-abc123',
    workspaceIds: ['ws_claude', 'ws_codex'],
    converged: { workspaceId: 'ws_conv', branch: 'recoder/converge-deadbeef' },
    perAgent: [agent('claude', 'review_ready'), agent('codex', 'review_ready')],
    ...overrides,
  };
}

// --- fakes -------------------------------------------------------------------

class FakeFanout implements PlaybookFanoutPort {
  readonly calls: FanoutInput[] = [];
  private readonly queue: FanoutResult[];
  constructor(...results: FanoutResult[]) {
    this.queue = results.length > 0 ? results : [fanoutResult()];
  }
  async fanout(input: FanoutInput): Promise<FanoutResult> {
    this.calls.push(input);
    return this.queue.length > 1
      ? (this.queue.shift() as FanoutResult)
      : this.queue[0];
  }
}

class FakeSwarmUnblock implements PlaybookSwarmUnblockPort {
  readonly calls: ResolveBlockedInput[] = [];
  constructor(
    private readonly result: SwarmUnblockResult = {
      action: 'escalated',
      requestId: 'appr_1',
      question: 'proceed?',
      reason: 'escalate by default',
    },
    private readonly throwErr?: Error
  ) {}
  async resolveBlocked(input: ResolveBlockedInput): Promise<SwarmUnblockResult> {
    this.calls.push(input);
    if (this.throwErr) throw this.throwErr;
    return this.result;
  }
}

class FakeReFan implements PlaybookReFanPort {
  readonly calls: ReFanInput[] = [];
  constructor(private readonly result: ReFanResult) {}
  async reFan(input: ReFanInput): Promise<ReFanResult> {
    this.calls.push(input);
    return this.result;
  }
}

/** A re-fan port that must NEVER be called (asserts a step did not fabricate a launch). */
class NeverReFan implements PlaybookReFanPort {
  async reFan(): Promise<ReFanResult> {
    throw new Error('re-fan should not have been invoked');
  }
}

// --- tests -------------------------------------------------------------------

describe('PlaybookService', () => {
  it('fan-converge runs the shipped fan-out and returns its REAL converged branch, linked to ONE taskGroup', async () => {
    const fanout = new FakeFanout(fanoutResult());
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: new FakeSwarmUnblock(),
      reFan: new NeverReFan(),
    });

    const result = await svc.run(baseInput({ playbookId: 'fan-converge' }));

    expect(fanout.calls).toHaveLength(1);
    expect(fanout.calls[0].task).toBe('add a health endpoint');
    expect(result.playbookId).toBe('fan-converge');
    expect(result.taskGroup).toBe('fan-abc123');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ kind: 'fanout', status: 'ok' });
    // The REAL converged branch flows straight back (never fabricated).
    expect(result.converged).toEqual({
      workspaceId: 'ws_conv',
      branch: 'recoder/converge-deadbeef',
    });
    expect(result.convergeReason).toBeUndefined();
  });

  it('fan-converge degrades truthfully when the fan-out did not converge (converged:null + reason)', async () => {
    const fanout = new FakeFanout(
      fanoutResult({
        converged: null,
        convergeReason: 'nothing to converge: 1 of 2 agent(s) settled',
      })
    );
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: new FakeSwarmUnblock(),
      reFan: new NeverReFan(),
    });

    const result = await svc.run(baseInput({ playbookId: 'fan-converge' }));

    expect(result.steps[0]).toMatchObject({ kind: 'fanout', status: 'degraded' });
    expect(result.converged).toBeNull();
    expect(result.convergeReason).toMatch(/nothing to converge/i);
  });

  it('fan-unblock-converge invokes swarm-unblock on the BLOCKED pane (same taskGroup), then reports the real escalation', async () => {
    const fanout = new FakeFanout(
      fanoutResult({
        perAgent: [
          agent('claude', 'review_ready'),
          agent('codex', 'awaiting_approval'), // BLOCKED
        ],
      })
    );
    const swarm = new FakeSwarmUnblock();
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: swarm,
      reFan: new NeverReFan(),
    });

    const result = await svc.run(
      baseInput({ playbookId: 'fan-unblock-converge' })
    );

    // The shared taskGroup threads from the fan-out into the unblock call.
    expect(swarm.calls).toHaveLength(1);
    expect(swarm.calls[0].workspaceId).toBe('ws_codex');
    expect(swarm.calls[0].taskGroup).toBe('fan-abc123');
    expect(swarm.calls[0].policy.autoAnswer).toBe(false); // escalate by default
    expect(swarm.calls[0].actor.userId).toBe('user-1');

    expect(result.steps.map(s => s.kind)).toEqual(['fanout', 'unblock_blocked']);
    const unblock = result.steps[1];
    expect(unblock.status).toBe('ok');
    expect(unblock.unblock).toHaveLength(1);
    expect(unblock.unblock?.[0]).toEqual({
      workspaceId: 'ws_codex',
      result: {
        action: 'escalated',
        requestId: 'appr_1',
        question: 'proceed?',
        reason: 'escalate by default',
      },
    });
    // The fan-out's own convergence still stands.
    expect(result.converged).toEqual({
      workspaceId: 'ws_conv',
      branch: 'recoder/converge-deadbeef',
    });
  });

  it('fan-unblock-converge is a truthful no-op when no pane is blocked (swarm-unblock never called)', async () => {
    const fanout = new FakeFanout(fanoutResult()); // both review_ready, none blocked
    const swarm = new FakeSwarmUnblock();
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: swarm,
      reFan: new NeverReFan(),
    });

    const result = await svc.run(
      baseInput({ playbookId: 'fan-unblock-converge' })
    );

    expect(swarm.calls).toHaveLength(0);
    expect(result.steps[1]).toMatchObject({
      kind: 'unblock_blocked',
      status: 'skipped',
    });
    expect(result.steps[1].reason).toMatch(/no blocked panes/i);
  });

  it('blockedPanesOf counts ONLY settled awaiting_approval panes (never timed-out/unknown/done-ish)', () => {
    const result = fanoutResult({
      perAgent: [
        agent('claude', 'awaiting_approval'), // blocked ✓
        agent('codex', 'review_ready'), // done-ish, not blocked
        { ...agent('cursor', 'working', false), reason: 'timeout' }, // never settled
        {
          kind: 'pi',
          nativeStatus: true,
          workspaceId: null,
          settled: false,
          reason: 'launch failed',
        }, // no workspace
        { ...agent('gemini', 'awaiting_approval', false) }, // awaiting but NOT settled
      ],
    });
    expect(blockedPanesOf(result)).toEqual(['ws_claude']);
  });

  it('fan-converge-refan re-fans a supplied follow-up off the converged branch and returns the new branch', async () => {
    const fanout = new FakeFanout(fanoutResult());
    const reFan = new FakeReFan({
      refused: false,
      priorTaskGroup: 'fan-abc123',
      priorConverge: {
        workspaceId: 'ws_conv',
        branch: 'recoder/converge-deadbeef',
      },
      provenanceLink: null,
      taskGroup: 'fan-round2',
      workspaceIds: ['ws_r2a', 'ws_r2b'],
      converged: { workspaceId: 'ws_conv2', branch: 'recoder/converge-round2' },
      perAgent: [],
    });
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: new FakeSwarmUnblock(),
      reFan,
    });

    const result = await svc.run(
      baseInput({
        playbookId: 'fan-converge-refan',
        followupTask: 'now add tests',
      })
    );

    expect(reFan.calls).toHaveLength(1);
    // Re-fan iterates the run's SHARED (round-1) group with the narrowed follow-up.
    expect(reFan.calls[0].taskGroup).toBe('fan-abc123');
    expect(reFan.calls[0].narrowedTask).toBe('now add tests');
    // The run's shared group stays round-1; the final converged branch is round-2's.
    expect(result.taskGroup).toBe('fan-abc123');
    expect(result.steps.map(s => `${s.kind}:${s.status}`)).toEqual([
      'fanout:ok',
      're_fan:ok',
    ]);
    expect(result.converged).toEqual({
      workspaceId: 'ws_conv2',
      branch: 'recoder/converge-round2',
    });
  });

  it('a REFUSED re-fan (no prior convergence) is reported truthfully and does NOT fabricate a downstream success', async () => {
    // Round 1 did NOT converge, so the shipped re-fan refuses.
    const fanout = new FakeFanout(
      fanoutResult({ converged: null, convergeReason: 'only 1 settled' })
    );
    const reFan = new FakeReFan({
      refused: true,
      priorTaskGroup: 'fan-abc123',
      reason:
        "no prior converged branch exists for task group 'fan-abc123' — nothing to re-fan from",
    });
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: new FakeSwarmUnblock(),
      reFan,
    });

    const result = await svc.run(
      baseInput({ playbookId: 'fan-converge-refan', followupTask: 'refine' })
    );

    const reFanStep = result.steps[1];
    expect(reFanStep.kind).toBe('re_fan');
    expect(reFanStep.status).toBe('degraded');
    expect(reFanStep.reason).toMatch(/nothing to re-fan from/i);
    expect(reFanStep.reFan?.refused).toBe(true);
    // NEVER a fabricated convergence — the run stays truthfully unconverged.
    expect(result.converged).toBeNull();
    expect(result.convergeReason).toMatch(/nothing to re-fan from/i);
  });

  it('a re_fan step SKIPS truthfully when no follow-up task is supplied (re-fan port never called)', async () => {
    const fanout = new FakeFanout(fanoutResult());
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: new FakeSwarmUnblock(),
      reFan: new NeverReFan(), // must not be called
    });

    const result = await svc.run(
      baseInput({ playbookId: 'fan-converge-refan' }) // no followupTask
    );

    expect(result.steps[1]).toMatchObject({
      kind: 're_fan',
      status: 'skipped',
    });
    expect(result.steps[1].reason).toMatch(/no followupTask/i);
    // Round-1's convergence still stands (the skip never erased it).
    expect(result.converged).toEqual({
      workspaceId: 'ws_conv',
      branch: 'recoder/converge-deadbeef',
    });
  });

  it('a per-pane swarm-unblock fault DEGRADES the step and never fabricates an escalation', async () => {
    const fanout = new FakeFanout(
      fanoutResult({
        perAgent: [
          agent('claude', 'awaiting_approval'),
          agent('codex', 'review_ready'),
        ],
      })
    );
    const swarm = new FakeSwarmUnblock(undefined, new Error('gate down'));
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: swarm,
      reFan: new NeverReFan(),
    });

    const result = await svc.run(
      baseInput({ playbookId: 'fan-unblock-converge' })
    );

    // The step is DEGRADED with the real reason — not a fake `ok` with a synthetic escalation.
    expect(result.steps[1]).toMatchObject({ kind: 'unblock_blocked', status: 'degraded' });
    expect(result.steps[1].reason).toMatch(/gate down/i);
    const pane = result.steps[1].unblock?.[0];
    // The faulted pane carries a truthful faultReason and NO fabricated result.
    expect(pane?.result).toBeUndefined();
    expect(pane?.faultReason).toMatch(/gate down/i);
  });

  it('throws NOT_FOUND for an unknown playbook id (a bad recipe launches nothing)', async () => {
    const fanout = new FakeFanout(fanoutResult());
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: new FakeSwarmUnblock(),
      reFan: new NeverReFan(),
    });

    await expect(
      svc.run(baseInput({ playbookId: 'does-not-exist' }))
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(fanout.calls).toHaveLength(0);
  });

  it('stopIfNotConverged halts the run and records the remaining steps as skipped', async () => {
    // A synthetic playbook exercising the documented stop-vs-continue policy.
    const stopPlaybook: Playbook = {
      id: 'stop-demo',
      description: 'fanout (stop if not converged) then unblock',
      steps: [
        { kind: 'fanout', stopIfNotConverged: true },
        { kind: 'unblock_blocked' },
      ],
    };
    const fanout = new FakeFanout(
      fanoutResult({
        converged: null,
        convergeReason: 'only 1 settled',
        perAgent: [
          agent('claude', 'awaiting_approval'), // blocked — but the run stops first
          agent('codex', 'working', false),
        ],
      })
    );
    const swarm = new FakeSwarmUnblock();
    const svc = new PlaybookService({
      fanout,
      swarmUnblock: swarm,
      reFan: new NeverReFan(),
      playbooks: new Map([[stopPlaybook.id, stopPlaybook]]),
    });

    const result = await svc.run(baseInput({ playbookId: 'stop-demo' }));

    expect(result.steps.map(s => `${s.kind}:${s.status}`)).toEqual([
      'fanout:degraded',
      'unblock_blocked:skipped',
    ]);
    // The run stopped BEFORE the unblock step ran.
    expect(swarm.calls).toHaveLength(0);
    expect(result.steps[1].reason).toMatch(/only 1 settled/i);
  });

  it('AppError is thrown (not returned) for an unknown playbook', async () => {
    const svc = new PlaybookService({
      fanout: new FakeFanout(fanoutResult()),
      swarmUnblock: new FakeSwarmUnblock(),
      reFan: new NeverReFan(),
    });
    await expect(
      svc.run(baseInput({ playbookId: 'nope' }))
    ).rejects.toBeInstanceOf(AppError);
  });
});
