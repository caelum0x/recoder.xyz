/**
 * Composition-root seam tests for the bootstrap → agent-os wiring
 * (`agent-os-seams.ts`): the opt-in squad-seed env parser and the squad-autopilot
 * → conductor dispatch adapter. `parseSquadSeedEnv` must be DEGRADE-TRUTHFUL —
 * absent / malformed env ⇒ `null` (seed OFF), never a fabricated squad; the
 * dispatch adapter launches through the real `createWorkspace` under a fixed
 * internal principal and surfaces a refused/faulted launch as `ok:false`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EnvSource } from './config.js';
import type { KvStore } from '../domains/persistence/ports/kv-store.port.js';
import {
  createPullRequestReviewFeedbackStore,
  createPullRequestReviewDispatch,
  createPullRequestReviewPublisher,
  createPullRequestReviewSource,
  preparePullRequestHead,
  parseSquadSeedEnv,
  createSquadAutopilotDispatch,
  type SquadAutopilotLauncher,
} from './agent-os-seams.js';

function memoryKv(): KvStore {
  const namespaces = new Map<string, Map<string, unknown>>();
  const bucket = (namespace: string): Map<string, unknown> => {
    let found = namespaces.get(namespace);
    if (!found) {
      found = new Map();
      namespaces.set(namespace, found);
    }
    return found;
  };
  return {
    get: async (namespace, key) => bucket(namespace).get(key) ?? null,
    getJson: async <T>(namespace: string, key: string) => (bucket(namespace).get(key) as T | undefined) ?? null,
    set: async (namespace, key, value) => { bucket(namespace).set(key, value); },
    setJson: async (namespace, key, value) => { bucket(namespace).set(key, value); },
    delete: async (namespace, key) => { bucket(namespace).delete(key); },
    list: async (namespace) => [...bucket(namespace)].map(([key, value]) => ({
      namespace,
      key,
      value,
      updatedAt: '2026-08-30T00:00:00.000Z',
    })),
    isDurable: () => true,
  };
}

const BACKGROUND_PROFILE = {
  repoPath: '/repo',
  spaceId: 'default',
  projectId: 'repo-project',
  runtimeId: 'codex',
} as const;

const PR_IMPACT = {
  available: true,
  source: 'recodergit',
  scope: 'file',
  risk: 'HIGH',
  partial: false,
  changedSymbols: ['computePayout'],
  files: [{
    path: 'src/pay.test.ts',
    isTest: true,
    minDepth: 1,
    directions: ['downstream'],
    changedSymbols: ['computePayout'],
    symbols: ['charges payout'],
    relationTypes: ['TESTS'],
    processes: ['Checkout settlement'],
  }],
  tests: [],
  processes: [{ id: 'checkout', label: 'Checkout settlement', processType: 'business' }],
  summary: { impactedFiles: 1, affectedTests: 1, upstreamFiles: 0, downstreamFiles: 1, affectedProcesses: 1 },
} as const;

describe('createPullRequestReviewFeedbackStore', () => {
  const record = (signature: string, disposition: 'accepted' | 'dismissed', updatedAt: string) => ({
    repoPath: '/repo',
    signature,
    file: 'src/pay.ts',
    defectKey: 'settlement-race',
    symbol: 'PaymentService.settle',
    disposition,
    actorId: 'user-1',
    updatedAt,
  });

  it('retains cumulative decisions across rule replacement, clear, and restart', async () => {
    const kv = memoryKv();
    const store = createPullRequestReviewFeedbackStore(kv);
    await store.upsert(record('symbol:settle:race', 'accepted', '2026-08-30T10:00:00.000Z'));
    await store.upsert(record('symbol:settle:race', 'dismissed', '2026-08-30T11:00:00.000Z'));

    expect(await store.list('/repo')).toMatchObject([{ disposition: 'dismissed' }]);
    expect(await store.stats?.('/repo')).toEqual({
      acceptedDecisions: 1,
      dismissedDecisions: 1,
      totalDecisions: 2,
      dismissalRate: 0.5,
      startedAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T11:00:00.000Z',
      coverage: 'since_metrics_enabled',
    });

    await store.delete('/repo', 'symbol:settle:race');
    expect(await store.list('/repo')).toEqual([]);
    const restarted = createPullRequestReviewFeedbackStore(kv);
    expect(await restarted.stats?.('/repo')).toMatchObject({
      acceptedDecisions: 1,
      dismissedDecisions: 1,
      totalDecisions: 2,
      coverage: 'since_metrics_enabled',
    });
  });

  it('migrates legacy active rules and serializes concurrent decisions', async () => {
    const kv = memoryKv();
    await kv.setJson('agent-os.pr-review-feedback', 'legacy',
      record('legacy:race', 'dismissed', '2026-08-29T10:00:00.000Z'));
    const store = createPullRequestReviewFeedbackStore(kv);
    expect(await store.stats?.('/repo')).toMatchObject({
      dismissedDecisions: 1,
      totalDecisions: 1,
      coverage: 'migrated_active_rules',
    });

    await Promise.all([
      store.upsert(record('symbol:settle:race', 'accepted', '2026-08-30T10:00:00.000Z')),
      store.upsert(record('symbol:refund:race', 'dismissed', '2026-08-30T10:00:01.000Z')),
    ]);
    expect(await store.stats?.('/repo')).toMatchObject({
      acceptedDecisions: 1,
      dismissedDecisions: 2,
      totalDecisions: 3,
      dismissalRate: 2 / 3,
      coverage: 'migrated_active_rules',
    });
    expect(await store.list('/repo')).toHaveLength(3);
  });
});

describe('parseSquadSeedEnv (opt-in squad seed)', () => {
  it('returns null when nothing is configured (seed OFF, pass-through)', () => {
    expect(parseSquadSeedEnv({} as EnvSource)).toBeNull();
  });

  it('returns null for a bare RECODER_SQUAD_ID with no members', () => {
    expect(parseSquadSeedEnv({ RECODER_SQUAD_ID: 'squad-a' } as EnvSource)).toBeNull();
  });

  it('parses a full RECODER_SQUAD_DEF JSON object', () => {
    const seed = parseSquadSeedEnv({
      RECODER_SQUAD_DEF: JSON.stringify({
        squadId: 'squad-a',
        displayName: 'Alpha',
        members: [{ agentId: 'agent-1', role: 'leader' }, { agentId: 'agent-2' }],
      }),
    } as EnvSource);
    expect(seed).toMatchObject({
      squadId: 'squad-a',
      displayName: 'Alpha',
      spaceId: 'space-default',
      routingStrategy: 'leader',
    });
    expect(seed?.members).toHaveLength(2);
  });

  it('parses RECODER_SQUAD_ID + members csv with weight + leader marking', () => {
    const seed = parseSquadSeedEnv({
      RECODER_SQUAD_ID: 'squad-b',
      RECODER_SQUAD_MEMBERS: 'agent-1:2, agent-2',
      RECODER_SQUAD_LEADER: 'agent-1',
      RECODER_SQUAD_NAME: 'Bravo',
      RECODER_SQUAD_SPACE: 'space-x',
      RECODER_SQUAD_STRATEGY: 'weighted',
    } as EnvSource);
    expect(seed).toMatchObject({
      squadId: 'squad-b',
      displayName: 'Bravo',
      spaceId: 'space-x',
      leaderAgentId: 'agent-1',
      routingStrategy: 'weighted',
    });
    expect(seed?.members).toEqual([
      { agentId: 'agent-1', role: 'leader', weight: 2 },
      { agentId: 'agent-2' },
    ]);
  });

  it('degrades to null (never throws) on a malformed RECODER_SQUAD_DEF', () => {
    expect(parseSquadSeedEnv({ RECODER_SQUAD_DEF: '{ not json' } as EnvSource)).toBeNull();
  });

  it('degrades to null when the seed fails schema validation (empty members ok, but no squadId)', () => {
    expect(
      parseSquadSeedEnv({ RECODER_SQUAD_DEF: JSON.stringify({ displayName: 'x' }) } as EnvSource),
    ).toBeNull();
  });
});

describe('pull-request review agent seams', () => {
  it('publishes only the server-derived native review target', async () => {
    const calls: unknown[] = [];
    const publisher = createPullRequestReviewPublisher(() => ({
      submitReview: async (input) => {
        calls.push(input);
        return { ok: true, value: {} };
      },
      listReviewThreads: async () => ({ ok: true, value: { threads: [] } }),
    }));

    expect(await publisher.publish({
      repoPath: '/repo',
      number: 7,
      commitId: 'head-sha',
      event: 'comment',
      body: 'Reviewed.',
    })).toEqual({ ok: true });
    expect(calls).toEqual([{ repoRoot: '/repo', pr: 7, commitId: 'head-sha', event: 'comment', body: 'Reviewed.' }]);
  });

  it('adapts GitHub list + review context without exposing a write edge', async () => {
    const source = createPullRequestReviewSource(() => ({
      listOpenPullRequests: async () => ({
        ok: true,
        value: {
          pullRequests: [{
            number: 7,
            title: 'Fix race',
            url: 'https://github.com/a/b/pull/7',
            headSha: 'abc123',
            baseRefName: 'main',
            headRefName: 'fix/race',
            isDraft: false,
            updatedAt: '2026-08-30T12:00:00Z',
          }],
        },
      }),
      reviewPR: async () => ({
        ok: true,
        value: {
          pr: {
            number: 7,
            title: 'Fix race',
            url: 'https://github.com/a/b/pull/7',
            headRefOid: 'abc123',
            baseRefName: 'main',
            headRefName: 'fix/race',
            isDraft: false,
            updatedAt: '2026-08-30T12:00:00Z',
            body: 'Details',
          },
          diff: '+lock();',
          diffTruncated: false,
          impact: PR_IMPACT,
          requirements: {
            issues: [{
              number: 11,
              title: 'Protect concurrent settlement',
              body: '- [ ] settlement is atomic',
              state: 'OPEN',
              url: 'https://github.com/a/b/issues/11',
              labels: ['product'],
            }],
            unavailable: [{ number: 12, reason: 'not accessible' }],
          },
          reviewRules: {
            source: '.recoder/review-rules.json',
            rules: [{
              id: 'migration-safety',
              level: 'required',
              text: 'Schema changes require a migration.',
              source: '.recoder/review-rules.json',
            }],
          },
        },
      }),
    }));

    expect(await source.listOpen({ repoPath: '/repo', limit: 20 })).toMatchObject({
      ok: true,
      pullRequests: [{ number: 7, headSha: 'abc123' }],
    });
    expect(await source.reviewContext({ repoPath: '/repo', number: 7 })).toMatchObject({
      ok: true,
      context: {
        number: 7,
        diff: '+lock();',
        body: 'Details',
        linkedRequirements: [{ number: 11, title: 'Protect concurrent settlement' }],
        unavailableRequirements: [{ number: 12, reason: 'not accessible' }],
        reviewRules: [{ id: 'migration-safety', level: 'required' }],
        impact: { available: true, risk: 'HIGH', files: [{ path: 'src/pay.test.ts', isTest: true }] },
      },
    });
  });

  it('dedupes against durable workspace metadata and stamps human delivery', async () => {
    const createWorkspace = vi.fn(async () => ({
      ok: true,
      value: { workspaceId: 'ws-pr', runId: 'run-pr' },
    }));
    const conductor = {
      listWorkspaces: async () => [{
        workspaceId: 'ws-existing',
        state: 'awaiting_review',
        metadata: {
          prReviewAgent: true,
          backgroundRepoPath: '/repo',
          prNumber: 7,
          prHeadSha: 'old-sha',
          backgroundRuntimeId: 'codex',
        },
      }],
      workspaceOutput: async () => ({ output: '' }),
      listWorkspaceEvents: async () => [],
      createWorkspace,
    } as unknown as SquadAutopilotLauncher;
    const port = createPullRequestReviewDispatch(conductor);

    expect(await port.findExisting({ repoPath: '/repo', number: 7, headSha: 'old-sha', runtimeId: 'codex' })).toEqual({
      workspaceId: 'ws-existing',
      state: 'awaiting_review',
      runtimeId: 'codex',
    });
    expect(await port.findExisting({ repoPath: '/repo', number: 7, headSha: 'old-sha', runtimeId: 'codex', role: 'validator' })).toBeNull();
    expect(await port.findExisting({ repoPath: '/repo', number: 7, headSha: 'new-sha', runtimeId: 'codex' })).toBeNull();

    const result = await port.dispatch({
      profile: BACKGROUND_PROFILE,
      ownerId: 'user-1',
      pullRequest: {
        number: 7,
        title: 'Fix race',
        url: 'https://github.com/a/b/pull/7',
        headSha: 'new-sha',
        baseRefName: 'main',
        headRefName: 'fix/race',
        isDraft: false,
        updatedAt: '2026-08-30T13:00:00Z',
        diff: '+lock();',
        diffTruncated: false,
        linkedBeadsRequirements: [{
          id: 'recoder-42',
          title: 'Make settlement atomic',
          description: 'Acceptance details stay in the launch prompt.',
          status: 'open',
        }],
        unavailableBeadsRequirements: [{ id: 'recoder-missing', reason: 'not found' }],
        impact: PR_IMPACT,
      },
      prompt: 'Review it',
    });

    expect(result).toEqual({ ok: true, workspaceId: 'ws-pr', runId: 'run-pr' });
    expect(createWorkspace.mock.calls[0][0]).toMatchObject({
      taskId: 'github-pr-7-new-sha-codex',
      metadata: {
        prReviewAgent: true,
        prReviewRole: 'reviewer',
        prNumber: 7,
        prHeadSha: 'new-sha',
        githubDelivery: 'human',
        backgroundOwnerId: 'user-1',
        reviewOwner: 'human',
        autoMerge: false,
        prImpact: PR_IMPACT,
        prLinkedBeadsRequirements: [{ id: 'recoder-42', title: 'Make settlement atomic', status: 'open' }],
        prUnavailableBeadsRequirements: [{ id: 'recoder-missing', reason: 'not found' }],
      },
    });

    await port.dispatch({
      profile: BACKGROUND_PROFILE,
      ownerId: 'user-1',
      pullRequest: {
        number: 7,
        title: 'Fix race',
        url: 'https://github.com/a/b/pull/7',
        headSha: 'new-sha',
        baseRefName: 'main',
        headRefName: 'fix/race',
        isDraft: false,
        updatedAt: '2026-08-30T13:00:00Z',
        diff: '+lock();',
        diffTruncated: false,
      },
      prompt: 'Validate it',
      role: 'validator',
    });
    expect(createWorkspace.mock.calls[1][0]).toMatchObject({
      taskId: 'github-pr-7-new-sha-codex-validator',
      metadata: {
        prReviewRole: 'validator',
        backgroundIssueTitle: 'Validate findings for PR #7: Fix race',
      },
    });
  });

  it('captures exact local check results and rejects duplicate names as ambiguous', async () => {
    const port = createPullRequestReviewDispatch({
      listWorkspaces: async () => [],
      workspaceOutput: async () => ({ output: '' }),
      listWorkspaceEvents: async () => [],
      workspaceChecks: async () => ({
        available: true,
        localRan: true,
        checks: [
          { name: 'Backend types', status: 'COMPLETED', conclusion: 'SUCCESS', source: 'recoder' as const, autofix: { prompt: 'server-owned' } },
          { name: 'Duplicate', status: 'COMPLETED', conclusion: 'SUCCESS', source: 'recoder' as const },
          { name: 'Duplicate', status: 'COMPLETED', conclusion: 'FAILURE', source: 'recoder' as const },
          { name: 'Backend types', status: 'COMPLETED', conclusion: 'FAILURE', source: 'github' as const },
        ],
      }),
      createWorkspace: async () => ({ ok: true, value: { workspaceId: 'unused' } }),
    });
    expect(await port.captureReviewRuleChecks!('ws-review', ['Backend types', 'Duplicate', 'Missing'])).toEqual([
      { name: 'Backend types', status: 'pass', autofix: true },
      { name: 'Duplicate', status: 'ambiguous', detail: 'Multiple Recoder checks are named "Duplicate"' },
      { name: 'Missing', status: 'missing', detail: 'No Recoder check is named "Missing"' },
    ]);
  });

  it('projects terminal named-check remediation over persisted validator evidence', async () => {
    const port = createPullRequestReviewDispatch({
      listWorkspaces: async () => [{
        workspaceId: 'ws-review',
        metadata: {
          prReviewAgent: true,
          backgroundRepoPath: '/repo',
          prNumber: 7,
          prHeadSha: 'head-sha',
          backgroundOwnerId: 'user-1',
        },
      }, {
        workspaceId: 'ws-validator',
        runtimeId: 'codex',
        state: 'awaiting_review',
        metadata: {
          prReviewAgent: true,
          prReviewRole: 'validator',
          backgroundRepoPath: '/repo',
          backgroundRuntimeId: 'codex',
          backgroundOwnerId: 'user-1',
          prNumber: 7,
          prHeadSha: 'head-sha',
          prReviewRuleChecks: [{ name: 'Backend types', status: 'fail', detail: 'before', autofix: true }],
          checkRemediation: {
            checkName: 'Backend types',
            state: 'passed',
            afterDetail: 'tsc completed',
          },
        },
      }],
      workspaceOutput: async () => ({ output: '' }),
      listWorkspaceEvents: async () => [{
        message: `RECODER_REVIEW_VALIDATION\n${JSON.stringify({ summary: 'done', validations: [], ruleAssessments: [] })}`,
      }],
      createWorkspace: async () => ({ ok: true, value: { workspaceId: 'unused' } }),
    });
    expect(await port.validation!('ws-review')).toMatchObject({
      workspaceId: 'ws-validator',
      reviewRuleChecks: [{ name: 'Backend types', status: 'pass', detail: 'tsc completed', autofix: true }],
    });
  });

  it('pins finding fixes to the reviewed head and reuses durable non-failed attempts', async () => {
    const workspaces: Array<{
      workspaceId: string;
      spaceId?: string;
      projectId?: string;
      runtimeId?: string;
      state?: string;
      createdAt?: string;
      metadata?: Record<string, unknown>;
    }> = [{
      workspaceId: 'ws-review',
      spaceId: 'default',
      projectId: 'repo-project',
      runtimeId: 'codex',
      state: 'awaiting_review',
      createdAt: '2026-08-30T12:00:00Z',
      metadata: {
        prReviewAgent: true,
        prReviewRole: 'reviewer',
        backgroundRepoPath: '/repo',
        backgroundRuntimeId: 'codex',
        backgroundOwnerId: 'user-1',
        backgroundIssueTitle: 'Review PR #7: Fix race',
        prNumber: 7,
        prUrl: 'https://github.com/a/b/pull/7',
        prHeadSha: 'head-sha-1234567890',
        prBaseRef: 'main',
        prHeadRef: 'fix/race',
        prLinkedBeadsRequirements: [{ id: 'recoder-42', title: 'Make settlement atomic', status: 'open' }],
        prUnavailableBeadsRequirements: [{ id: 'recoder-missing', reason: 'not found' }],
        prImpact: PR_IMPACT,
      },
    }];
    const createWorkspace = vi.fn(async (input: Parameters<SquadAutopilotLauncher['createWorkspace']>[0]) => {
      workspaces.push({
        workspaceId: 'ws-fix',
        spaceId: input.spaceId,
        projectId: input.projectId,
        runtimeId: input.runtimeId,
        state: 'running',
        createdAt: '2026-08-30T13:00:00Z',
        metadata: input.metadata,
      });
      return { ok: true, value: { workspaceId: 'ws-fix', runId: 'run-fix' } };
    });
    const port = createPullRequestReviewDispatch(
      {
        listWorkspaces: async () => workspaces,
        workspaceOutput: async () => ({ output: '' }),
        listWorkspaceEvents: async () => [],
        createWorkspace,
      },
      { prepareHead: async () => ({ ok: true }) },
    );
    const target = await port.getReviewTarget('ws-review');
    expect(target).toMatchObject({
      spaceId: 'default',
      projectId: 'repo-project',
      runtimeId: 'codex',
      headSha: 'head-sha-1234567890',
      baseRefName: 'main',
      headRefName: 'fix/race',
      linkedBeadsRequirements: [{ id: 'recoder-42', title: 'Make settlement atomic', status: 'open' }],
      unavailableBeadsRequirements: [{ id: 'recoder-missing', reason: 'not found' }],
      impact: { available: true, risk: 'HIGH', files: [{ path: 'src/pay.test.ts' }] },
    });
    const finding = {
      key: 'src/pay.ts:symbol:paymentservice.settle:settlement-race',
      file: 'src/pay.ts',
      line: 42,
      symbol: 'PaymentService.settle',
      defectKey: 'settlement-race',
      severity: 'high',
      message: 'Settlement can run twice.',
      evidence: ['unlocked read before write'],
    } as const;
    const first = await port.dispatchFindingFix!({
      target: target!,
      finding,
      runtimeId: 'claude_code',
      ownerId: 'user-1',
      prompt: 'Fix it',
    });
    expect(first).toEqual({ ok: true, workspaceId: 'ws-fix', runId: 'run-fix', existing: false });
    expect(createWorkspace.mock.calls[0]?.[0]).toMatchObject({
      repoPath: '/repo',
      runtimeId: 'claude_code',
      baseRef: 'head-sha-1234567890',
      metadata: {
        prReviewRole: 'fixer',
        prFindingKey: finding.key,
        prFixOriginWorkspaceId: 'ws-review',
        fixOwner: 'human',
        githubDelivery: 'human',
        autoMerge: false,
      },
    });
    expect(await port.listFindingFixes!('ws-review')).toEqual([{
      findingKey: finding.key,
      workspaceId: 'ws-fix',
      runtimeId: 'claude_code',
      state: 'running',
      headSha: 'head-sha-1234567890',
      createdAt: '2026-08-30T13:00:00Z',
    }]);
    expect(await port.dispatchFindingFix!({
      target: target!,
      finding,
      runtimeId: 'claude_code',
      ownerId: 'user-1',
      prompt: 'Fix it again',
    })).toEqual({ ok: true, workspaceId: 'ws-fix', existing: true });
    expect(createWorkspace).toHaveBeenCalledTimes(1);
  });

  it('fetches a missing PR commit through refs/pull without changing a local branch', async () => {
    const calls: string[][] = [];
    let available = false;
    const result = await preparePullRequestHead(
      { repoPath: '/repo', number: 7, headSha: 'abcdef1234567890' },
      async (_bin, args) => {
        calls.push([...args]);
        if (args.includes('cat-file')) {
          if (!available) throw new Error('missing');
          return { stdout: '', stderr: '', code: 0 };
        }
        if (args.at(-1) === 'remote') return { stdout: 'upstream\norigin\n', stderr: '', code: 0 };
        if (args.includes('fetch')) {
          available = true;
          return { stdout: '', stderr: '', code: 0 };
        }
        throw new Error('unexpected git call');
      },
    );

    expect(result).toEqual({ ok: true });
    expect(calls.find((args) => args.includes('fetch'))).toEqual([
      '-C', '/repo', 'fetch', '--no-tags', '--no-recurse-submodules', 'origin', 'refs/pull/7/head',
    ]);
    expect(calls.some((args) => args.includes('checkout') || args.includes('switch'))).toBe(false);
  });
});

describe('createSquadAutopilotDispatch (autopilot over conductor createWorkspace)', () => {
  it('dispatches through createWorkspace under the fixed internal principal', async () => {
    const createWorkspace = vi.fn(async () => ({
      ok: true,
      value: { workspaceId: 'ws-1', runId: 'run-1' },
    }));
    const port = createSquadAutopilotDispatch({
      conductor: { listWorkspaces: async () => [], createWorkspace } as unknown as SquadAutopilotLauncher,
    });

    const res = await port.dispatch({ taskId: 'rec-1', title: 'T', prompt: 'do it', profile: BACKGROUND_PROFILE });

    expect(res).toEqual({ ok: true, status: 'launched', workspaceId: 'ws-1', runId: 'run-1' });
    const [input, principal] = createWorkspace.mock.calls[0];
    expect(input).toMatchObject({
      spaceId: 'default',
      projectId: 'repo-project',
      taskId: 'rec-1',
      repoPath: '/repo',
      runtimeId: 'codex',
      prompt: 'do it',
    });
    expect(input.metadata).toMatchObject({
      backgroundAgent: true,
      backgroundRepoPath: '/repo',
      backgroundRuntimeId: 'codex',
      reviewOwner: 'human',
      autoMerge: false,
    });
    expect(principal).toMatchObject({ userId: 'squad-autopilot', kind: 'internal' });
  });

  it('carries the routed agent onto the workspace metadata when present', async () => {
    const createWorkspace = vi.fn(async () => ({ ok: true, value: { workspaceId: 'ws-2' } }));
    const port = createSquadAutopilotDispatch({
      conductor: { listWorkspaces: async () => [], createWorkspace } as unknown as SquadAutopilotLauncher,
    });

    const res = await port.dispatch({
      taskId: 'rec-2',
      title: 'T',
      prompt: 'p',
      routedAgentId: 'agent-7',
      profile: BACKGROUND_PROFILE,
    });

    expect(res).toEqual({ ok: true, status: 'launched', workspaceId: 'ws-2' });
    expect(createWorkspace.mock.calls[0][0]).toMatchObject({
      metadata: { routedAgentId: 'agent-7' },
    });
  });

  it('surfaces a truthful ok:false with the conductor reason on a refused launch', async () => {
    const port = createSquadAutopilotDispatch({
      conductor: {
        listWorkspaces: async () => [],
        createWorkspace: async () => ({ ok: false, reason: 'quota exceeded' }),
      } as unknown as SquadAutopilotLauncher,
    });

    expect(await port.dispatch({ taskId: 'rec-3', title: 'T', prompt: 'p', profile: BACKGROUND_PROFILE })).toEqual({
      ok: false,
      reason: 'quota exceeded',
    });
  });

  it('falls back to a default reason when the launch produced no value', async () => {
    const port = createSquadAutopilotDispatch({
      conductor: {
        listWorkspaces: async () => [],
        createWorkspace: async () => ({ ok: true, value: null }),
      } as unknown as SquadAutopilotLauncher,
    });

    expect(await port.dispatch({ taskId: 'rec-4', title: 'T', prompt: 'p', profile: BACKGROUND_PROFILE })).toEqual({
      ok: false,
      reason: 'conductor refused workspace.create',
    });
  });

  it('reuses canonical background work after restart instead of dispatching the same ready issue twice', async () => {
    const createWorkspace = vi.fn();
    const port = createSquadAutopilotDispatch({
      conductor: {
        listWorkspaces: async () => [{
          workspaceId: 'ws-existing',
          projectId: 'repo-project',
          metadata: {
            backgroundAgent: true,
            backgroundIssueId: 'rec-existing',
            backgroundRepoPath: '/repo',
            backgroundRuntimeId: 'codex',
          },
        }],
        createWorkspace,
      } as unknown as SquadAutopilotLauncher,
    });

    await expect(port.dispatch({
      taskId: 'rec-existing',
      title: 'Already running',
      prompt: 'continue',
      profile: BACKGROUND_PROFILE,
    })).resolves.toEqual({ ok: true, status: 'existing', workspaceId: 'ws-existing' });
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('refuses a launch when durable duplicate verification faults', async () => {
    const createWorkspace = vi.fn();
    const port = createSquadAutopilotDispatch({
      conductor: {
        listWorkspaces: async () => { throw new Error('workspace store unavailable'); },
        createWorkspace,
      } as unknown as SquadAutopilotLauncher,
    });

    await expect(port.dispatch({
      taskId: 'rec-uncertain',
      title: 'Do not duplicate',
      prompt: 'work',
      profile: BACKGROUND_PROFILE,
    })).resolves.toEqual({
      ok: false,
      reason: 'could not verify prior background work: workspace store unavailable',
    });
    expect(createWorkspace).not.toHaveBeenCalled();
  });
});
