/**
 * `SwarmUnblockService` -- proves the swarm auto-unblock decision loop against
 * INJECTED FAKES (no real Loom daemon, memory engine, policy engine, or approval
 * store). The invariant under test is ESCALATE-BY-DEFAULT:
 *
 *  - autoAnswer=false ALWAYS escalates, even when a strong candidate exists;
 *  - autoAnswer=true + policy `allow` + an evidenced high-confidence low-risk
 *    candidate is the ONLY path that answers -> agent.prompt delivered + an
 *    evidenced memory candidate recorded;
 *  - a policy `deny`/`needs_approval` verdict escalates, never answers;
 *  - no candidate found escalates (never a fabricated answer);
 *  - the recorded memory candidate always carries evidence;
 *  - the blocking question is read via the agent.read seam (strip-ANSI).
 */
import { describe, it, expect } from 'vitest';
import type { Principal } from '../../identity/types.js';
import {
  SwarmUnblockService,
  type ResolveBlockedInput,
  type SwarmUnblockAgentPrompt,
  type SwarmUnblockAgentRead,
  type SwarmUnblockApprovalGate,
  type SwarmUnblockDeps,
  type SwarmUnblockMemorySearch,
  type SwarmUnblockPolicyGate,
  type SwarmUnblockRememberCandidate,
  type SwarmUnblockSiblingDecision,
  type UnblockCandidate,
} from './swarm-unblock.service.js';

const ACTOR: Principal = {
  userId: 'user-1',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

/** A strong candidate: high-confidence, low-risk, evidenced -> auto-answerable. */
const STRONG: UnblockCandidate = {
  answer: 'yes, proceed with the rebase',
  source: 'memory',
  confidence: 0.95,
  risk: 'low',
  evidence: 'memory:mem-42 (prior run on this repo resolved the same prompt)',
};

// --- fakes -------------------------------------------------------------------

class FakeAgentRead implements SwarmUnblockAgentRead {
  readonly seen: string[] = [];
  constructor(private readonly tail: string | null) {}
  async readRecent(workspaceId: string): Promise<string | null> {
    this.seen.push(workspaceId);
    return this.tail;
  }
}

class FakeMemorySearch implements SwarmUnblockMemorySearch {
  readonly queries: string[] = [];
  constructor(private readonly answers: readonly UnblockCandidate[] = []) {}
  async search(question: string): Promise<readonly UnblockCandidate[]> {
    this.queries.push(question);
    return this.answers;
  }
}

class FakeSibling implements SwarmUnblockSiblingDecision {
  readonly calls: string[] = [];
  constructor(private readonly answer: UnblockCandidate | null = null) {}
  async find(request: {
    taskGroup: string;
    workspaceId: string;
    question: string;
  }): Promise<UnblockCandidate | null> {
    this.calls.push(request.taskGroup);
    return this.answer;
  }
}

class FakePolicyGate implements SwarmUnblockPolicyGate {
  readonly calls: UnblockCandidate[] = [];
  constructor(
    private readonly effect: 'allow' | 'deny' | 'needs_approval' = 'allow'
  ) {}
  async evaluate(request: {
    candidate: UnblockCandidate;
  }): Promise<{ effect: 'allow' | 'deny' | 'needs_approval' }> {
    this.calls.push(request.candidate);
    return { effect: this.effect };
  }
}

class FakeApprovalGate implements SwarmUnblockApprovalGate {
  readonly requests: {
    question: string | null;
    candidate: UnblockCandidate | null;
    reason: string;
  }[] = [];
  async request(input: {
    question: string | null;
    candidate: UnblockCandidate | null;
    reason: string;
  }): Promise<{ requestId: string }> {
    this.requests.push({
      question: input.question,
      candidate: input.candidate,
      reason: input.reason,
    });
    return { requestId: `appr_${this.requests.length}` };
  }
}

class FakeAgentPrompt implements SwarmUnblockAgentPrompt {
  readonly delivered: { workspaceId: string; text: string }[] = [];
  async deliver(input: { workspaceId: string; text: string }): Promise<void> {
    this.delivered.push({ workspaceId: input.workspaceId, text: input.text });
  }
}

class FakeRemember implements SwarmUnblockRememberCandidate {
  readonly recorded: {
    question: string;
    answer: string;
    source: string;
    evidence: string;
  }[] = [];
  async remember(input: {
    question: string;
    answer: string;
    source: string;
    evidence: string;
  }): Promise<void> {
    this.recorded.push({
      question: input.question,
      answer: input.answer,
      source: input.source,
      evidence: input.evidence,
    });
  }
}

interface Harness {
  readonly service: SwarmUnblockService;
  readonly agentRead: FakeAgentRead;
  readonly memory: FakeMemorySearch;
  readonly sibling: FakeSibling;
  readonly policy: FakePolicyGate;
  readonly approval: FakeApprovalGate;
  readonly prompt: FakeAgentPrompt;
  readonly remember: FakeRemember;
}

function build(overrides: Partial<SwarmUnblockDeps> = {}): Harness {
  const agentRead =
    (overrides.agentRead as FakeAgentRead) ??
    new FakeAgentRead('Should I force-push the rebase?');
  const memory =
    (overrides.memorySearch as FakeMemorySearch) ?? new FakeMemorySearch();
  const sibling =
    (overrides.siblingDecision as FakeSibling) ?? new FakeSibling();
  const policy =
    (overrides.policyGate as FakePolicyGate) ?? new FakePolicyGate();
  const approval =
    (overrides.approvalGate as FakeApprovalGate) ?? new FakeApprovalGate();
  const prompt =
    (overrides.agentPrompt as FakeAgentPrompt) ?? new FakeAgentPrompt();
  const remember =
    (overrides.rememberCandidate as FakeRemember) ?? new FakeRemember();
  const service = new SwarmUnblockService({
    agentRead,
    memorySearch: memory,
    siblingDecision: sibling,
    policyGate: policy,
    approvalGate: approval,
    agentPrompt: prompt,
    rememberCandidate: remember,
  });
  return {
    service,
    agentRead,
    memory,
    sibling,
    policy,
    approval,
    prompt,
    remember,
  };
}

function resolve(
  policy: { autoAnswer: boolean; minConfidence?: number },
  taskGroup?: string
): ResolveBlockedInput {
  return {
    workspaceId: 'ws-1',
    ...(taskGroup ? { taskGroup } : {}),
    policy,
    actor: ACTOR,
  };
}

describe('SwarmUnblockService', () => {
  it('reads the blocking question via the agent.read seam', async () => {
    const h = build({
      agentRead: new FakeAgentRead('   \nWhat branch base should I use?   \n'),
    });
    await h.service.resolveBlocked(resolve({ autoAnswer: false }));
    expect(h.agentRead.seen).toEqual(['ws-1']);
    // The question flows to the memory search (strip/trim applied).
    expect(h.memory.queries).toEqual(['What branch base should I use?']);
  });

  it('ESCALATES BY DEFAULT even when a strong candidate exists (autoAnswer=false)', async () => {
    const h = build({ memorySearch: new FakeMemorySearch([STRONG]) });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: false })
    );
    expect(result.action).toBe('escalated');
    if (result.action !== 'escalated') throw new Error('expected escalated');
    expect(result.requestId).toBe('appr_1');
    // NEVER answered: no prompt delivered, no memory candidate recorded.
    expect(h.prompt.delivered).toHaveLength(0);
    expect(h.remember.recorded).toHaveLength(0);
    // The policy gate is not even consulted on the default path.
    expect(h.policy.calls).toHaveLength(0);
    // The candidate rides the approval as a human-reviewable proposal.
    expect(h.approval.requests[0].candidate).toEqual(STRONG);
  });

  it('AUTO-ANSWERS only with autoAnswer=true + policy allow + candidate -> prompt + evidenced candidate recorded', async () => {
    const h = build({
      memorySearch: new FakeMemorySearch([STRONG]),
      policyGate: new FakePolicyGate('allow'),
    });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('answered');
    if (result.action !== 'answered') throw new Error('expected answered');
    expect(result.answer).toBe(STRONG.answer);
    expect(result.source).toBe('memory');
    // The answer was DELIVERED into the pane via agent.prompt.
    expect(h.prompt.delivered).toEqual([
      { workspaceId: 'ws-1', text: STRONG.answer },
    ]);
    // Exactly one evidenced memory candidate was recorded (question+answer+source+evidence).
    expect(h.remember.recorded).toHaveLength(1);
    const rec = h.remember.recorded[0];
    expect(rec.answer).toBe(STRONG.answer);
    expect(rec.source).toBe('memory');
    expect(rec.evidence).toBe(STRONG.evidence);
    expect(rec.question).toBe('Should I force-push the rebase?');
    // No escalation on the answered path.
    expect(h.approval.requests).toHaveLength(0);
  });

  it('a policy DENY verdict escalates, never answers', async () => {
    const h = build({
      memorySearch: new FakeMemorySearch([STRONG]),
      policyGate: new FakePolicyGate('deny'),
    });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('escalated');
    expect(h.prompt.delivered).toHaveLength(0);
    expect(h.remember.recorded).toHaveLength(0);
    expect(h.policy.calls).toHaveLength(1); // it WAS consulted, and refused
  });

  it('a policy NEEDS_APPROVAL verdict escalates, never answers', async () => {
    const h = build({
      memorySearch: new FakeMemorySearch([STRONG]),
      policyGate: new FakePolicyGate('needs_approval'),
    });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('escalated');
    expect(h.prompt.delivered).toHaveLength(0);
    expect(h.remember.recorded).toHaveLength(0);
  });

  it('no candidate found -> escalate (never a fabricated answer)', async () => {
    const h = build({ memorySearch: new FakeMemorySearch([]) });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('escalated');
    if (result.action !== 'escalated') throw new Error('expected escalated');
    expect(h.approval.requests[0].candidate).toBeNull();
    expect(h.prompt.delivered).toHaveLength(0);
    expect(h.remember.recorded).toHaveLength(0);
    // The policy gate is never consulted when there is nothing to answer.
    expect(h.policy.calls).toHaveLength(0);
  });

  it('a low-confidence candidate is NOT auto-answered (escalates)', async () => {
    const weak: UnblockCandidate = { ...STRONG, confidence: 0.4 };
    const h = build({
      memorySearch: new FakeMemorySearch([weak]),
      policyGate: new FakePolicyGate('allow'),
    });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('escalated');
    expect(h.prompt.delivered).toHaveLength(0);
    expect(h.policy.calls).toHaveLength(0); // gate not reached: not auto-answerable
  });

  it('a non-low-risk candidate is NOT auto-answered (escalates)', async () => {
    const risky: UnblockCandidate = { ...STRONG, risk: 'high' };
    const h = build({
      memorySearch: new FakeMemorySearch([risky]),
      policyGate: new FakePolicyGate('allow'),
    });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('escalated');
    expect(h.prompt.delivered).toHaveLength(0);
  });

  it('an un-evidenced candidate is NOT auto-answered (no candidate could be recorded)', async () => {
    const noEvidence: UnblockCandidate = { ...STRONG, evidence: '   ' };
    const h = build({
      memorySearch: new FakeMemorySearch([noEvidence]),
      policyGate: new FakePolicyGate('allow'),
    });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('escalated');
    expect(h.remember.recorded).toHaveLength(0);
  });

  it('a recorded memory candidate ALWAYS carries evidence', async () => {
    const h = build({
      memorySearch: new FakeMemorySearch([STRONG]),
      policyGate: new FakePolicyGate('allow'),
    });
    await h.service.resolveBlocked(resolve({ autoAnswer: true }));
    for (const rec of h.remember.recorded) {
      expect(rec.evidence.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses a sibling decision that already passed the same decision point (highest confidence wins)', async () => {
    const sibling: UnblockCandidate = {
      answer: 'use base recoder/main',
      source: 'sibling',
      confidence: 0.99,
      risk: 'low',
      evidence:
        'sibling ws-2 answered this same prompt and passed verification',
    };
    const h = build({
      siblingDecision: new FakeSibling(sibling),
      memorySearch: new FakeMemorySearch([STRONG]),
      policyGate: new FakePolicyGate('allow'),
    });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true }, 'fan-abc123')
    );
    expect(result.action).toBe('answered');
    if (result.action !== 'answered') throw new Error('expected answered');
    expect(result.source).toBe('sibling');
    expect(h.sibling.calls).toEqual(['fan-abc123']);
    expect(h.prompt.delivered[0].text).toBe(sibling.answer);
  });

  it('escalates truthfully when the pane tail is unreadable (no fabricated question)', async () => {
    const h = build({ agentRead: new FakeAgentRead(null) });
    const result = await h.service.resolveBlocked(
      resolve({ autoAnswer: true })
    );
    expect(result.action).toBe('escalated');
    if (result.action !== 'escalated') throw new Error('expected escalated');
    expect(result.question).toBeNull();
    expect(h.memory.queries).toHaveLength(0); // never searched on a missing question
    expect(h.prompt.delivered).toHaveLength(0);
  });
});
