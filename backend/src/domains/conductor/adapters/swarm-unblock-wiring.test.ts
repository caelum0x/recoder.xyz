/**
 * `createSwarmUnblockDeps` wiring + module-boundary proof. Two halves:
 *
 *  A) The REAL adapter maps each of the seven seams to its concrete system over
 *     fakes (a fake loom client / recall / approvals / candidates), proving the
 *     truthful behaviour: loom read/prompt on `sessionName`, memory recall →
 *     `risk:'medium'` proposals, a same-group sibling precedent → low-risk
 *     evidenced auto-answer candidate, the deterministic policy verdict, the real
 *     approval id, and the evidenced candidate propose.
 *
 *  B) Injecting the bundle at the CONDUCTOR MODULE boundary flips the
 *     `recoder_swarm_unblock` path from SERVICE_UNAVAILABLE to a real escalate /
 *     answer — the seams are actually invoked through the pure service.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import type { LoomResult } from '@recoder/agent-runtimes/loom';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { CompareView } from '../services/compare.service.js';
import type { LoomClientPort } from './loom-substrate.adapter.js';
import {
  createSwarmUnblockDeps,
  extractSiblingAnswer,
  type SwarmUnblockWiringDeps,
} from './swarm-unblock-wiring.js';
import { composeConductor } from '../__fixtures__/harness.js';
import type { ConductorSwarmUnblockSurface } from '../swarm/swarm-unblock-tool.js';
import type {
  ResolveBlockedInput,
  SwarmUnblockDeps,
} from '../swarm/swarm-unblock.service.js';

const ACTOR: Principal = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

function paneRead(text: string): LoomResult {
  return {
    type: 'pane_read',
    read: {
      pane_id: 'p',
      workspace_id: 'w',
      tab_id: 't',
      source: 'recent',
      format: 'text',
      text,
      revision: 1,
      truncated: false,
    },
  };
}

/** A fake loom client whose `call` is keyed by method, recording every call. */
function fakeLoom(handlers: {
  read?: (params: Record<string, unknown>) => LoomResult;
  prompt?: (params: Record<string, unknown>) => LoomResult;
  get?: (params: Record<string, unknown>) => LoomResult;
  calls?: Array<{ method: string; params: Record<string, unknown> }>;
}): LoomClientPort {
  const record = handlers.calls ?? [];
  return {
    async ping() {
      return { type: 'pong', version: '1', protocol: 20 } as Extract<
        LoomResult,
        { type: 'pong' }
      >;
    },
    async call<Result extends LoomResult = LoomResult>(
      method: string,
      params: unknown
    ): Promise<Result> {
      const p = (params ?? {}) as Record<string, unknown>;
      record.push({ method, params: p });
      if (method === 'agent.read' && handlers.read)
        return handlers.read(p) as Result;
      if (method === 'agent.prompt' && handlers.prompt)
        return handlers.prompt(p) as Result;
      if (method === 'agent.get' && handlers.get)
        return handlers.get(p) as Result;
      return { type: 'ok' } as Result;
    },
    async callAndWait<Result extends LoomResult = LoomResult>(): Promise<Result> {
      return { type: 'ok' } as Result;
    },
  };
}

/** An `agent_info` loom result carrying optional declared provenance. */
function agentInfoResult(
  extra: Record<string, unknown> = {}
): LoomResult {
  return {
    type: 'agent_info',
    agent: {
      terminal_id: 'term-1',
      agent_status: 'blocked',
      workspace_id: 'w',
      tab_id: 't',
      pane_id: 'p',
      focused: false,
      revision: 1,
      ...extra,
    },
  } as LoomResult;
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-1',
    createdBy: 'user-1',
    sessionName: 'pane-1',
    ...overrides,
  } as unknown as Workspace;
}

function emptyCompareView(): CompareView {
  return { taskGroup: 'grp', workspaceIds: [], siblings: [], contested: [] };
}

/** Build the wiring over sensible fakes; callers override the parts they probe. */
function makeWiring(
  overrides: Partial<SwarmUnblockWiringDeps> = {}
): { deps: SwarmUnblockDeps; loomCalls: Array<{ method: string; params: Record<string, unknown> }>; approvals: string[]; proposed: unknown[] } {
  const loomCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const approvals: string[] = [];
  const proposed: unknown[] = [];
  const base: SwarmUnblockWiringDeps = {
    loom: fakeLoom({ read: () => paneRead('What now?'), calls: loomCalls }),
    getWorkspace: async () => workspace(),
    compareGroup: async () => emptyCompareView(),
    recall: {
      async recall() {
        return { memories: [], sources: [], reranker: 'identity' };
      },
    },
    approvals: {
      async request(params: { action: string }) {
        approvals.push(params.action);
        return { id: 'appr-1' } as never;
      },
    } as never,
    candidates: {
      async propose(input: unknown) {
        proposed.push(input);
        return {} as never;
      },
    } as never,
    ...overrides,
  };
  return { deps: createSwarmUnblockDeps(base), loomCalls, approvals, proposed };
}

describe('extractSiblingAnswer', () => {
  it('quotes the line after the same question once the sibling moved past it', () => {
    const tail = 'Which framework?\nUse Vitest.\n$ npm test';
    expect(extractSiblingAnswer(tail, 'Which framework?')).toBe('Use Vitest.');
  });

  it('returns null when the sibling is still blocked on the question (last line)', () => {
    expect(extractSiblingAnswer('foo\nWhich framework?', 'Which framework?')).toBeNull();
  });

  it('returns null when the question never appears (never fabricates)', () => {
    expect(extractSiblingAnswer('unrelated output', 'Which framework?')).toBeNull();
  });

  it('skips a following question line and returns null tail', () => {
    expect(extractSiblingAnswer('Which framework?\nReally?', 'Which framework?')).toBeNull();
  });
});

describe('createSwarmUnblockDeps — real seam mapping', () => {
  it('agentRead reads the workspace sessionName pane (strip-ANSI recent)', async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const { deps } = makeWiring({
      loom: fakeLoom({ read: () => paneRead('Proceed?'), calls }),
    });
    const text = await deps.agentRead.readRecent('ws-1', ACTOR);
    expect(text).toBe('Proceed?');
    const read = calls.find(c => c.method === 'agent.read');
    expect(read?.params).toMatchObject({
      target: 'pane-1',
      source: 'recent',
      strip_ansi: true,
    });
  });

  it('agentRead returns null (escalate truthfully) when there is no live session', async () => {
    const { deps } = makeWiring({
      getWorkspace: async () => workspace({ sessionName: undefined }),
    });
    expect(await deps.agentRead.readRecent('ws-1', ACTOR)).toBeNull();
  });

  it('blockedKindRead reads the DECLARED kind off the live AgentInfo (agent.get)', async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const { deps } = makeWiring({
      loom: fakeLoom({
        get: () => agentInfoResult({ agent_blocked_kind: 'approval', agent_rule_id: 'r-1' }),
        calls,
      }),
    });
    expect(await deps.blockedKindRead?.read('ws-1', ACTOR)).toBe('approval');
    const get = calls.find(c => c.method === 'agent.get');
    expect(get?.params).toMatchObject({ target: 'pane-1' });
  });

  it('blockedKindRead is undefined when the AgentInfo declares no kind (manifest-less)', async () => {
    const { deps } = makeWiring({
      loom: fakeLoom({ get: () => agentInfoResult() }),
    });
    expect(await deps.blockedKindRead?.read('ws-1', ACTOR)).toBeUndefined();
  });

  it('blockedKindRead drops an unrecognised kind (never fabricated)', async () => {
    const { deps } = makeWiring({
      loom: fakeLoom({ get: () => agentInfoResult({ agent_blocked_kind: 'bogus' }) }),
    });
    expect(await deps.blockedKindRead?.read('ws-1', ACTOR)).toBeUndefined();
  });

  it('blockedKindRead is undefined when there is no live session', async () => {
    const { deps } = makeWiring({
      getWorkspace: async () => workspace({ sessionName: undefined }),
    });
    expect(await deps.blockedKindRead?.read('ws-1', ACTOR)).toBeUndefined();
  });

  it('blockedKindRead degrades to undefined when agent.get is not agent_info', async () => {
    const { deps } = makeWiring({
      loom: fakeLoom({ get: () => ({ type: 'ok' }) as LoomResult }),
    });
    expect(await deps.blockedKindRead?.read('ws-1', ACTOR)).toBeUndefined();
  });

  it('agentPrompt delivers into the live pane; a bad reply throws (never faked)', async () => {
    const okCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const { deps } = makeWiring({
      loom: fakeLoom({
        prompt: () => ({ type: 'agent_prompted' }) as LoomResult,
        calls: okCalls,
      }),
    });
    await deps.agentPrompt.deliver({ workspaceId: 'ws-1', text: 'hi', actor: ACTOR });
    expect(okCalls.find(c => c.method === 'agent.prompt')?.params).toMatchObject({
      target: 'pane-1',
      text: 'hi',
    });

    const bad = makeWiring({
      loom: fakeLoom({ prompt: () => ({ type: 'ok' }) as LoomResult }),
    });
    await expect(
      bad.deps.agentPrompt.deliver({ workspaceId: 'ws-1', text: 'hi', actor: ACTOR })
    ).rejects.toThrow(/agent_prompted/);
  });

  it('memorySearch maps recall hits to risk:medium evidenced proposals', async () => {
    const { deps } = makeWiring({
      recall: {
        async recall() {
          return {
            memories: [
              {
                id: 'm1',
                title: 'Prior decision',
                body: 'Use Postgres.',
                provenance: { source: 'items', ref: 'mem-9', score: 0.91 },
              },
            ],
            sources: [],
            reranker: 'identity',
          };
        },
      },
    });
    const [candidate] = await deps.memorySearch.search('Which DB?', ACTOR);
    expect(candidate.answer).toBe('Use Postgres.');
    expect(candidate.risk).toBe('medium'); // never auto-answerable from raw recall
    expect(candidate.confidence).toBe(0.91);
    expect(candidate.evidence).toContain('items:mem-9');
    expect(candidate.source).toBe('memory:items');
  });

  it('siblingDecision quotes a same-group precedent as a low-risk evidenced answer', async () => {
    const { deps } = makeWiring({
      compareGroup: async () => ({
        taskGroup: 'grp',
        workspaceIds: ['ws-1', 'ws-2'],
        siblings: [
          { workspaceId: 'ws-1', sessionName: 'pane-1' },
          { workspaceId: 'ws-2', sessionName: 'pane-2' },
        ],
        contested: [],
      }) as unknown as CompareView,
      loom: fakeLoom({ read: () => paneRead('Which DB?\nUse Postgres.\ndone') }),
    });
    const candidate = await deps.siblingDecision.find({
      taskGroup: 'grp',
      workspaceId: 'ws-1',
      question: 'Which DB?',
      actor: ACTOR,
    });
    expect(candidate).not.toBeNull();
    expect(candidate?.risk).toBe('low');
    expect(candidate?.answer).toBe('Use Postgres.');
    expect(candidate?.source).toBe('sibling:ws-2');
    expect(candidate?.evidence).toContain('ws-2');
  });

  it('siblingDecision returns null when no sibling passed the decision', async () => {
    const { deps } = makeWiring({
      compareGroup: async () => ({
        taskGroup: 'grp',
        workspaceIds: ['ws-1', 'ws-2'],
        siblings: [
          { workspaceId: 'ws-1', sessionName: 'pane-1' },
          { workspaceId: 'ws-2', sessionName: 'pane-2' },
        ],
        contested: [],
      }) as unknown as CompareView,
      loom: fakeLoom({ read: () => paneRead('still working, Which DB?') }),
    });
    expect(
      await deps.siblingDecision.find({
        taskGroup: 'grp',
        workspaceId: 'ws-1',
        question: 'Which DB?',
        actor: ACTOR,
      })
    ).toBeNull();
  });

  it('policyGate returns a deterministic allow for a benign auto-answer', async () => {
    const { deps } = makeWiring();
    const verdict = await deps.policyGate.evaluate({
      workspaceId: 'ws-1',
      question: 'Which DB?',
      candidate: {
        answer: 'Use Postgres.',
        source: 'sibling:ws-2',
        confidence: 0.9,
        risk: 'low',
        evidence: 'ws-2',
      },
      actor: ACTOR,
    });
    expect(verdict.effect).toBe('allow');
  });

  it('approvalGate opens a real approval and returns its id', async () => {
    const { deps, approvals } = makeWiring();
    const { requestId } = await deps.approvalGate.request({
      workspaceId: 'ws-1',
      question: 'Which DB?',
      candidate: null,
      reason: 'escalate by default',
      taskGroup: 'grp',
      actor: ACTOR,
    });
    expect(requestId).toBe('appr-1');
    expect(approvals).toContain('workspace.unblock');
  });

  it('rememberCandidate proposes an evidenced candidate', async () => {
    const { deps, proposed } = makeWiring();
    await deps.rememberCandidate.remember({
      workspaceId: 'ws-1',
      taskGroup: 'grp',
      question: 'Which DB?',
      answer: 'Use Postgres.',
      source: 'sibling:ws-2',
      evidence: 'ws-2 precedent',
      actor: ACTOR,
    });
    expect(proposed).toHaveLength(1);
    expect(proposed[0]).toMatchObject({
      userId: 'user-1',
      scope: 'repo',
      evidence: { taskId: 'grp', artifactId: 'swarm-unblock:ws-1' },
    });
  });
});

describe('conductor module boundary — injecting the bundle un-refuses the tool', () => {
  const input: ResolveBlockedInput = {
    workspaceId: 'ws-1',
    policy: { autoAnswer: false },
    actor: ACTOR,
  };

  it('without the bundle, resolveSwarmUnblock refuses truthfully (SERVICE_UNAVAILABLE)', async () => {
    const { module } = composeConductor();
    const surface = module as unknown as ConductorSwarmUnblockSurface;
    await expect(surface.resolveSwarmUnblock(input)).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });

  it('with the bundle injected, the seams are invoked and it escalates (not SERVICE_UNAVAILABLE)', async () => {
    const invoked = { read: false, approve: false };
    const swarmUnblock: SwarmUnblockDeps = {
      agentRead: {
        async readRecent() {
          invoked.read = true;
          return 'Which DB?';
        },
      },
      memorySearch: { async search() { return []; } },
      siblingDecision: { async find() { return null; } },
      policyGate: { async evaluate() { return { effect: 'allow' }; } },
      approvalGate: {
        async request() {
          invoked.approve = true;
          return { requestId: 'appr-xyz' };
        },
      },
      agentPrompt: { async deliver() {} },
      rememberCandidate: { async remember() {} },
    };
    const { module } = composeConductor({ swarmUnblock });
    const surface = module as unknown as ConductorSwarmUnblockSurface;
    const result = await surface.resolveSwarmUnblock(input);
    expect(result.action).toBe('escalated');
    if (result.action === 'escalated') {
      expect(result.requestId).toBe('appr-xyz');
    }
    expect(invoked.read).toBe(true);
    expect(invoked.approve).toBe(true);
  });

  it('with autoAnswer + a low-risk evidenced candidate, it delivers and remembers', async () => {
    const invoked = { prompt: false, remember: false };
    const swarmUnblock: SwarmUnblockDeps = {
      agentRead: { async readRecent() { return 'Which DB?'; } },
      memorySearch: { async search() { return []; } },
      siblingDecision: {
        async find() {
          return {
            answer: 'Use Postgres.',
            source: 'sibling:ws-2',
            confidence: 0.9,
            risk: 'low',
            evidence: 'ws-2 precedent',
          };
        },
      },
      policyGate: { async evaluate() { return { effect: 'allow' }; } },
      approvalGate: { async request() { return { requestId: 'appr-none' }; } },
      agentPrompt: {
        async deliver() {
          invoked.prompt = true;
        },
      },
      rememberCandidate: {
        async remember() {
          invoked.remember = true;
        },
      },
    };
    const { module } = composeConductor({ swarmUnblock });
    const surface = module as unknown as ConductorSwarmUnblockSurface;
    const result = await surface.resolveSwarmUnblock({
      workspaceId: 'ws-1',
      taskGroup: 'grp',
      policy: { autoAnswer: true },
      actor: ACTOR,
    });
    expect(result.action).toBe('answered');
    if (result.action === 'answered') {
      expect(result.answer).toBe('Use Postgres.');
      expect(result.source).toBe('sibling:ws-2');
    }
    expect(invoked.prompt).toBe(true);
    expect(invoked.remember).toBe(true);
  });
});
