/**
 * `RemoteAttachService` — SECURITY-substantive TDD for governed remote attach.
 *
 * Every test asserts a real security invariant of LOOM Bigger Bet C:
 *  - attach REFUSES a scope containing a NON-owned workspace (403), and mints only
 *    over owned scope;
 *  - snapshot/steer REJECT an expired session, a wrong-principal session (caller !=
 *    session.principalId), and a workspace OUTSIDE the session scope;
 *  - steer WITHOUT the 'steer' capability refuses (no escalation);
 *  - steer is policy-gated: deny ⇒ refuse (no deliver); needs_approval ⇒ approval,
 *    NOT executed; allow ⇒ deliver + audit written;
 *  - ownership is RE-CHECKED on every call — a workspace whose ownership CHANGED after
 *    mint is refused (snapshot drops it, steer 403s);
 *  - an ALLOW-ed steer with no delivery transport ⇒ SERVICE_UNAVAILABLE (never faked).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import type { Workspace } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { StatusBoardScope, StatusBoardSnapshot } from '../attention/status-board.service.js';
import { STATUS_BOARD_COLUMNS } from '../attention/status-board.service.js';
import type { AttentionState } from '../types.js';
import {
  RemoteAttachService,
  type RemoteAttachDeps,
  type RemoteAttachDeliverPort,
} from './remote-attach.service.js';

// --- fixtures ----------------------------------------------------------------

const OWNER: Principal = {
  userId: 'user-owner',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

const OTHER: Principal = {
  userId: 'user-other',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

function makeWorkspace(id: string, createdBy: string, taskGroup?: string): Workspace {
  return {
    workspaceId: id,
    spaceId: 'space-1',
    projectId: 'project-1',
    taskId: 'task-1',
    runtimeId: 'claude_code',
    substrate: 'loom',
    branch: `feat/${id}`,
    baseRef: 'main',
    sessionName: `sess-${id}`,
    state: 'running',
    createdBy,
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
    ...(taskGroup ? { metadata: { taskGroup } } : {}),
  };
}

/** A board with one cell per given workspace id, all in the `working` column. */
function boardWith(workspaceIds: readonly string[]): StatusBoardSnapshot {
  const columns = {} as Record<AttentionState, StatusBoardSnapshot['columns'][AttentionState]>;
  const totals = {} as Record<AttentionState, number>;
  for (const state of STATUS_BOARD_COLUMNS) {
    columns[state] = [];
    totals[state] = 0;
  }
  const cells = workspaceIds.map(workspaceId => ({
    workspaceId,
    agentKind: 'claude',
    nativeStatus: 'working' as const,
  }));
  columns.working = cells;
  totals.working = cells.length;
  return {
    scope: {},
    columns,
    totals,
    total: cells.length,
    degraded: false,
  };
}

function decision(effect: PolicyDecision['effect'], reason: string): PolicyDecision {
  return {
    decisionId: `dec-${effect}`,
    effect,
    action: 'tool.call',
    actorAgentId: OWNER.userId,
    reason,
    createdAt: '1970-01-01T00:00:00.000Z',
    findings: [],
  };
}

const ALLOW = decision('allow', 'ok');
const DENY = decision('deny', 'blocked by rule');
const NEEDS = decision('needs_approval', 'human required');

/** A mutable test harness: a workspace registry + spies + a controllable clock. */
function harness(overrides: Partial<RemoteAttachDeps> = {}) {
  const workspaces = new Map<string, Workspace>();
  const delivered: Array<{ workspaceId: string; text: string }> = [];
  const approvals: Array<{ requestedBy: string; target?: string | null }> = [];
  const audited: Array<{ workspaceId: string; sessionId: string }> = [];
  let clock = 1_000;
  let seq = 0;
  let policy: PolicyDecision = ALLOW;

  const deliver: RemoteAttachDeliverPort = {
    async deliver(input) {
      delivered.push({ workspaceId: input.workspaceId, text: input.text });
    },
  };

  const deps: RemoteAttachDeps = {
    async getWorkspace(id) {
      return workspaces.get(id) ?? null;
    },
    async readStatusBoard(_scope: StatusBoardScope) {
      return boardWith([...workspaces.keys()]);
    },
    evaluatePolicy: (_input: PolicyInput) => policy,
    approval: {
      async request(params) {
        approvals.push({ requestedBy: params.requestedBy, target: params.target });
        return { id: `appr-${++seq}` };
      },
    },
    deliver,
    audit: {
      async record(entry) {
        audited.push({ workspaceId: entry.workspaceId, sessionId: entry.sessionId });
        return { id: `audit-${++seq}` };
      },
    },
    now: () => clock,
    ttlMs: 10_000,
    newSessionId: () => `sess-id-${++seq}`,
    ...overrides,
  };

  const service = new RemoteAttachService(deps);
  return {
    service,
    workspaces,
    delivered,
    approvals,
    audited,
    setPolicy: (p: PolicyDecision) => {
      policy = p;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

// --- attach ------------------------------------------------------------------

describe('RemoteAttachService.attach', () => {
  it('mints a monitor+steer session over OWNED workspaces', async () => {
    const h = harness();
    h.workspaces.set('ws-1', makeWorkspace('ws-1', OWNER.userId));
    const session = await h.service.attach({
      principal: OWNER,
      scope: { workspaceIds: ['ws-1'] },
      capabilities: ['monitor', 'steer'],
    });
    expect(session.principalId).toBe(OWNER.userId);
    expect(session.capabilities).toEqual(['monitor', 'steer']);
    expect(session.scope.workspaceIds).toEqual(['ws-1']);
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.parse(session.issuedAt));
  });

  it('REFUSES (403) a scope containing a NON-owned workspace', async () => {
    const h = harness();
    h.workspaces.set('ws-mine', makeWorkspace('ws-mine', OWNER.userId));
    h.workspaces.set('ws-theirs', makeWorkspace('ws-theirs', OTHER.userId));
    await expect(
      h.service.attach({
        principal: OWNER,
        scope: { workspaceIds: ['ws-mine', 'ws-theirs'] },
        capabilities: ['monitor'],
      })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('REFUSES (403) an unknown workspace (never a cross-tenant oracle)', async () => {
    const h = harness();
    await expect(
      h.service.attach({
        principal: OWNER,
        scope: { workspaceIds: ['ws-ghost'] },
        capabilities: ['monitor'],
      })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('refuses an empty scope (VALIDATION)', async () => {
    const h = harness();
    await expect(
      h.service.attach({ principal: OWNER, scope: {}, capabilities: ['monitor'] })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('defaults capabilities to monitor-only when none are requested', async () => {
    const h = harness();
    h.workspaces.set('ws-1', makeWorkspace('ws-1', OWNER.userId));
    const session = await h.service.attach({
      principal: OWNER,
      scope: { workspaceIds: ['ws-1'] },
      capabilities: [],
    });
    expect(session.capabilities).toEqual(['monitor']);
  });

  it('mints over a taskGroup scope only when the resolver is wired, refusing SERVICE_UNAVAILABLE otherwise', async () => {
    const withResolver = harness({
      listWorkspaceIdsForTaskGroup: async () => ['ws-g1', 'ws-g2'],
    });
    withResolver.workspaces.set('ws-g1', makeWorkspace('ws-g1', OWNER.userId, 'grp'));
    withResolver.workspaces.set('ws-g2', makeWorkspace('ws-g2', OWNER.userId, 'grp'));
    const session = await withResolver.service.attach({
      principal: OWNER,
      scope: { taskGroup: 'grp' },
      capabilities: ['monitor'],
    });
    expect(session.scope.taskGroup).toBe('grp');

    const noResolver = harness();
    await expect(
      noResolver.service.attach({
        principal: OWNER,
        scope: { taskGroup: 'grp' },
        capabilities: ['monitor'],
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

// --- snapshot ----------------------------------------------------------------

describe('RemoteAttachService.snapshot', () => {
  async function attachOwner(h: ReturnType<typeof harness>, caps: ('monitor' | 'steer')[] = ['monitor']) {
    h.workspaces.set('ws-1', makeWorkspace('ws-1', OWNER.userId));
    h.workspaces.set('ws-2', makeWorkspace('ws-2', OWNER.userId));
    return h.service.attach({
      principal: OWNER,
      scope: { workspaceIds: ['ws-1', 'ws-2'] },
      capabilities: caps,
    });
  }

  it('returns a snapshot filtered to the session scope', async () => {
    const h = harness();
    const session = await attachOwner(h);
    // A third owned workspace exists but is NOT in the session scope — it must not leak.
    h.workspaces.set('ws-3', makeWorkspace('ws-3', OWNER.userId));
    const snap = await h.service.snapshot({ sessionId: session.sessionId, principal: OWNER });
    const ids = snap.columns.working.map(c => c.workspaceId).sort();
    expect(ids).toEqual(['ws-1', 'ws-2']);
    expect(snap.total).toBe(2);
  });

  it('REJECTS a wrong-principal caller (403)', async () => {
    const h = harness();
    const session = await attachOwner(h);
    await expect(
      h.service.snapshot({ sessionId: session.sessionId, principal: OTHER })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('REJECTS an expired session (403)', async () => {
    const h = harness();
    const session = await attachOwner(h);
    h.advance(20_000); // past the 10s TTL
    await expect(
      h.service.snapshot({ sessionId: session.sessionId, principal: OWNER })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('REJECTS an unknown session id (403, never discloses)', async () => {
    const h = harness();
    await expect(
      h.service.snapshot({ sessionId: 'nope', principal: OWNER })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('DROPS a workspace whose ownership CHANGED after mint (ownership re-checked)', async () => {
    const h = harness();
    const session = await attachOwner(h);
    // ws-2 is handed to another tenant AFTER the session was minted.
    h.workspaces.set('ws-2', makeWorkspace('ws-2', OTHER.userId));
    const snap = await h.service.snapshot({ sessionId: session.sessionId, principal: OWNER });
    expect(snap.columns.working.map(c => c.workspaceId)).toEqual(['ws-1']);
    expect(snap.total).toBe(1);
  });
});

// --- steer -------------------------------------------------------------------

describe('RemoteAttachService.steer', () => {
  async function attach(h: ReturnType<typeof harness>, caps: ('monitor' | 'steer')[]) {
    h.workspaces.set('ws-1', makeWorkspace('ws-1', OWNER.userId));
    return h.service.attach({
      principal: OWNER,
      scope: { workspaceIds: ['ws-1'] },
      capabilities: caps,
    });
  }

  it('delivers + audits on an ALLOW verdict', async () => {
    const h = harness();
    h.setPolicy(ALLOW);
    const session = await attach(h, ['monitor', 'steer']);
    const result = await h.service.steer({
      sessionId: session.sessionId,
      principal: OWNER,
      workspaceId: 'ws-1',
      input: 'run the tests',
    });
    expect(result.status).toBe('delivered');
    expect(h.delivered).toEqual([{ workspaceId: 'ws-1', text: 'run the tests' }]);
    expect(h.audited).toHaveLength(1);
    expect(h.audited[0]).toMatchObject({ workspaceId: 'ws-1', sessionId: session.sessionId });
  });

  it('REFUSES on a DENY verdict — nothing delivered, nothing audited', async () => {
    const h = harness();
    h.setPolicy(DENY);
    const session = await attach(h, ['steer']);
    const result = await h.service.steer({
      sessionId: session.sessionId,
      principal: OWNER,
      workspaceId: 'ws-1',
      input: 'rm -rf /',
    });
    expect(result.status).toBe('refused');
    expect(h.delivered).toHaveLength(0);
    expect(h.audited).toHaveLength(0);
  });

  it('opens an APPROVAL on a needs_approval verdict — NOT executed', async () => {
    const h = harness();
    h.setPolicy(NEEDS);
    const session = await attach(h, ['steer']);
    const result = await h.service.steer({
      sessionId: session.sessionId,
      principal: OWNER,
      workspaceId: 'ws-1',
      input: 'deploy prod',
    });
    expect(result.status).toBe('needs_approval');
    if (result.status === 'needs_approval') expect(result.requestId).toBe('appr-2');
    expect(h.delivered).toHaveLength(0);
    expect(h.audited).toHaveLength(0);
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0]).toMatchObject({ requestedBy: OWNER.userId, target: 'ws-1' });
  });

  it('REFUSES (403) a steer WITHOUT the steer capability (no escalation)', async () => {
    const h = harness();
    h.setPolicy(ALLOW);
    const session = await attach(h, ['monitor']); // monitor-only
    await expect(
      h.service.steer({
        sessionId: session.sessionId,
        principal: OWNER,
        workspaceId: 'ws-1',
        input: 'anything',
      })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(h.delivered).toHaveLength(0);
  });

  it('REJECTS a workspace OUTSIDE the session scope (403), even when owned', async () => {
    const h = harness();
    h.setPolicy(ALLOW);
    const session = await attach(h, ['steer']);
    // ws-9 is owned by the caller but was never in the session scope.
    h.workspaces.set('ws-9', makeWorkspace('ws-9', OWNER.userId));
    await expect(
      h.service.steer({
        sessionId: session.sessionId,
        principal: OWNER,
        workspaceId: 'ws-9',
        input: 'sneak',
      })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(h.delivered).toHaveLength(0);
  });

  it('REJECTS a wrong-principal caller (403)', async () => {
    const h = harness();
    h.setPolicy(ALLOW);
    const session = await attach(h, ['steer']);
    await expect(
      h.service.steer({
        sessionId: session.sessionId,
        principal: OTHER,
        workspaceId: 'ws-1',
        input: 'forge',
      })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(h.delivered).toHaveLength(0);
  });

  it('REJECTS an expired session (403)', async () => {
    const h = harness();
    h.setPolicy(ALLOW);
    const session = await attach(h, ['steer']);
    h.advance(20_000);
    await expect(
      h.service.steer({
        sessionId: session.sessionId,
        principal: OWNER,
        workspaceId: 'ws-1',
        input: 'late',
      })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(h.delivered).toHaveLength(0);
  });

  it('REFUSES (403) a steer on a workspace whose ownership CHANGED after mint', async () => {
    const h = harness();
    h.setPolicy(ALLOW);
    const session = await attach(h, ['steer']);
    h.workspaces.set('ws-1', makeWorkspace('ws-1', OTHER.userId)); // ownership changed
    await expect(
      h.service.steer({
        sessionId: session.sessionId,
        principal: OWNER,
        workspaceId: 'ws-1',
        input: 'still mine?',
      })
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(h.delivered).toHaveLength(0);
  });

  it('an ALLOW-ed steer with NO delivery transport refuses SERVICE_UNAVAILABLE (never faked)', async () => {
    const h = harness({ deliver: undefined });
    h.setPolicy(ALLOW);
    const session = await attach(h, ['steer']);
    await expect(
      h.service.steer({
        sessionId: session.sessionId,
        principal: OWNER,
        workspaceId: 'ws-1',
        input: 'go',
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('delivers with a null audit id when no audit sink is wired (best-effort, truthful)', async () => {
    const h = harness({ audit: undefined });
    h.setPolicy(ALLOW);
    const session = await attach(h, ['steer']);
    const result = await h.service.steer({
      sessionId: session.sessionId,
      principal: OWNER,
      workspaceId: 'ws-1',
      input: 'go',
    });
    expect(result).toMatchObject({ status: 'delivered', workspaceId: 'ws-1', auditId: null });
    expect(h.delivered).toHaveLength(1);
  });
});
