/**
 * `createRemoteAttachDeps` wiring + module-boundary proof (GOVERNED REMOTE ATTACH,
 * LOOM Bigger Bet C). Two halves:
 *
 *  A) The REAL adapter maps each injected seam to its concrete system over fakes
 *     (a fake loom client / approvals / audit chain / compare read), proving the
 *     truthful behaviour: `evaluatePolicy` is the REAL `@recoder/agent-policy`
 *     engine (bound by identity — never a permissive stub), `deliver` drives loom
 *     `agent.prompt` on the workspace `sessionName` (a bad reply / dead session
 *     throws), `approval` opens a real approval, `audit` seals a `remote.steer`
 *     `allow` into the durable chain, and the taskGroup resolver maps siblings to
 *     their workspace ids.
 *
 *  B) Injecting the bundle at the CONDUCTOR MODULE boundary flips the
 *     `remoteAttach`/`remoteSnapshot`/`remoteSteer` methods (and the
 *     `recoder_remote_*` tools) from SERVICE_UNAVAILABLE into the real, governed
 *     service — the injected seams are actually reached through it.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import { evaluatePolicy } from '@recoder/agent-policy';
import type { LoomResult } from '@recoder/agent-runtimes/loom';
import { ErrorCode } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { ApprovalRecord } from '../../governance/types.js';
import type { AuditEntryInput, AuditRecord } from '../../governance/types.js';
import type { ApprovalService } from '../../governance/services/approval.service.js';
import type { AuditChainService } from '../../governance/services/audit-chain.service.js';
import type { CompareView } from '../services/compare.service.js';
import type { LoomClientPort } from './loom-substrate.adapter.js';
import type {
  RemoteAttachExternalDeps,
} from '../remote-attach/remote-attach.service.js';
import type { RemoteAttachSurface } from '../mcp/conductor-remote-attach-tool.js';
import {
  createRemoteAttachDeps,
  type RemoteAttachWiringDeps,
} from './remote-attach-wiring.js';
import { composeConductor } from '../__fixtures__/harness.js';

const OWNER: Principal = {
  userId: 'user-1',
  orgId: 'org-1',
  scopes: ['read', 'write'],
  kind: 'apikey',
  isAnonymous: false,
  raw: null,
};

/** A fake loom client keyed by method, recording every call. */
function fakeLoom(handlers: {
  prompt?: (params: Record<string, unknown>) => LoomResult;
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
      if (method === 'agent.prompt' && handlers.prompt)
        return handlers.prompt(p) as Result;
      return { type: 'ok' } as Result;
    },
    async callAndWait<Result extends LoomResult = LoomResult>(): Promise<Result> {
      return { type: 'ok' } as Result;
    },
  };
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
function makeWiring(overrides: Partial<RemoteAttachWiringDeps> = {}): {
  bundle: RemoteAttachExternalDeps;
  loomCalls: Array<{ method: string; params: Record<string, unknown> }>;
  approvalCalls: Array<{ action: string; target?: string | null; reason?: string | null }>;
  auditCalls: AuditEntryInput[];
} {
  const loomCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const approvalCalls: Array<{ action: string; target?: string | null; reason?: string | null }> = [];
  const auditCalls: AuditEntryInput[] = [];
  const approvals = {
    async request(params: { action: string; target?: string | null; reason?: string | null }) {
      approvalCalls.push({ action: params.action, target: params.target, reason: params.reason });
      return { id: 'appr-1' } as ApprovalRecord;
    },
  } as unknown as ApprovalService;
  const audit = {
    async append(entry: AuditEntryInput) {
      auditCalls.push(entry);
      return {
        id: 'audit-1',
        seq: auditCalls.length,
        prevHash: '0'.repeat(64),
        entryHash: 'h'.repeat(64),
        actorId: entry.actorId,
        action: entry.action,
        resource: entry.resource,
        effect: entry.effect,
        riskTier: entry.riskTier,
        degraded: entry.degraded,
        payload: entry.payload,
        createdAt: '1970-01-01T00:00:00.000Z',
      } as AuditRecord;
    },
  } as unknown as AuditChainService;
  const base: RemoteAttachWiringDeps = {
    loom: fakeLoom({ prompt: () => ({ type: 'agent_prompted' }) as LoomResult, calls: loomCalls }),
    getWorkspace: async () => workspace(),
    compareGroup: async () => emptyCompareView(),
    approvals,
    audit,
    ...overrides,
  };
  return { bundle: createRemoteAttachDeps(base), loomCalls, approvalCalls, auditCalls };
}

// --- part A: real seam mapping ----------------------------------------------

describe('createRemoteAttachDeps — real seam mapping', () => {
  it('binds evaluatePolicy to the REAL @recoder/agent-policy engine (never a permissive stub)', () => {
    const { bundle } = makeWiring();
    // Referential identity: the bundle exposes the genuine deterministic engine —
    // the service builds the deny-biased `remote.steer` actor + input itself.
    expect(bundle.evaluatePolicy).toBe(evaluatePolicy);
  });

  it('deliver drives loom agent.prompt on the workspace sessionName (steers the live pane)', async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const { bundle } = makeWiring({
      loom: fakeLoom({ prompt: () => ({ type: 'agent_prompted' }) as LoomResult, calls }),
    });
    await bundle.deliver!.deliver({ workspaceId: 'ws-1', text: 'run tests', principal: OWNER });
    expect(calls.find(c => c.method === 'agent.prompt')?.params).toMatchObject({
      target: 'pane-1',
      text: 'run tests',
    });
  });

  it('deliver THROWS on a non-agent_prompted reply (a failed delivery is surfaced, never faked)', async () => {
    const { bundle } = makeWiring({
      loom: fakeLoom({ prompt: () => ({ type: 'ok' }) as LoomResult }),
    });
    await expect(
      bundle.deliver!.deliver({ workspaceId: 'ws-1', text: 'x', principal: OWNER })
    ).rejects.toThrow(/agent_prompted/);
  });

  it('deliver THROWS when there is no live session (never a faked delivery)', async () => {
    const { bundle } = makeWiring({
      getWorkspace: async () => workspace({ sessionName: undefined }),
    });
    await expect(
      bundle.deliver!.deliver({ workspaceId: 'ws-1', text: 'x', principal: OWNER })
    ).rejects.toThrow(/no live session/);
  });

  it('approval opens a real approval and returns its id (a needs_approval steer)', async () => {
    const { bundle, approvalCalls } = makeWiring();
    const out = await bundle.approval.request({
      action: 'remote.steer',
      riskTier: 'high',
      requestedBy: OWNER.userId,
      reason: 'human required',
      taskId: 'ws-1',
      target: 'ws-1',
    });
    expect(out.id).toBe('appr-1');
    expect(approvalCalls[0]).toMatchObject({ action: 'remote.steer', target: 'ws-1', reason: 'human required' });
  });

  it('audit seals a remote.steer allow into the durable chain (high-risk, evidenced)', async () => {
    const { bundle, auditCalls } = makeWiring();
    const out = await bundle.audit!.record({
      actorId: OWNER.userId,
      workspaceId: 'ws-1',
      sessionId: 'sess-9',
      effect: 'allow',
    });
    expect(out?.id).toBe('audit-1');
    expect(auditCalls[0]).toMatchObject({
      actorId: OWNER.userId,
      action: 'remote.steer',
      resource: 'ws-1',
      effect: 'allow',
      riskTier: 'high',
      degraded: false,
    });
    expect(auditCalls[0].payload).toMatchObject({ sessionId: 'sess-9', workspaceId: 'ws-1' });
  });

  it('listWorkspaceIdsForTaskGroup maps the compare siblings to their workspace ids', async () => {
    const { bundle } = makeWiring({
      compareGroup: async () =>
        ({
          taskGroup: 'grp',
          workspaceIds: ['ws-1', 'ws-2'],
          siblings: [
            { workspaceId: 'ws-1', sessionName: 'pane-1' },
            { workspaceId: 'ws-2', sessionName: 'pane-2' },
          ],
          contested: [],
        }) as unknown as CompareView,
    });
    const ids = await bundle.listWorkspaceIdsForTaskGroup!('grp', OWNER);
    expect([...ids].sort()).toEqual(['ws-1', 'ws-2']);
  });
});

// --- part B: conductor module boundary --------------------------------------

describe('conductor module boundary — injecting the bundle un-refuses remote attach', () => {
  it('WITHOUT the bundle, remote attach/snapshot/steer refuse truthfully (SERVICE_UNAVAILABLE)', async () => {
    const { module } = composeConductor();
    const surface = module as unknown as RemoteAttachSurface;
    await expect(
      surface.remoteAttach({ principal: OWNER, scope: { workspaceIds: ['ws-1'] }, capabilities: ['monitor'] })
    ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    await expect(
      surface.remoteSnapshot({ sessionId: 'sess-x', principal: OWNER })
    ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    await expect(
      surface.remoteSteer({ sessionId: 'sess-x', principal: OWNER, workspaceId: 'ws-1', input: 'go' })
    ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
  });

  it('WITH the bundle injected, the real service runs — no longer SERVICE_UNAVAILABLE, and the seams are reached', async () => {
    const invoked = { policy: false, resolver: false };
    const bundle: RemoteAttachExternalDeps = {
      evaluatePolicy: (_input: PolicyInput): PolicyDecision => {
        invoked.policy = true;
        return {
          decisionId: 'dec',
          effect: 'allow',
          action: 'tool.call',
          actorAgentId: OWNER.userId,
          reason: 'ok',
          createdAt: '1970-01-01T00:00:00.000Z',
          findings: [],
        };
      },
      approval: { async request() { return { id: 'appr-x' }; } },
      deliver: { async deliver() {} },
      audit: { async record() { return { id: 'audit-x' }; } },
      async listWorkspaceIdsForTaskGroup() {
        invoked.resolver = true;
        return ['ws-in-group'];
      },
    };
    const { module } = composeConductor({ remoteAttach: bundle });
    const surface = module as unknown as RemoteAttachSurface;

    // A taskGroup-scoped mint reaches the injected resolver seam through the live
    // service (proving the bundle is wired), then 403s because the harness owns no
    // such workspace — the point is it is NO LONGER SERVICE_UNAVAILABLE.
    await expect(
      surface.remoteAttach({ principal: OWNER, scope: { taskGroup: 'grp' }, capabilities: ['monitor', 'steer'] })
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    expect(invoked.resolver).toBe(true);

    // snapshot/steer likewise pass the SERVICE_UNAVAILABLE guard into the real
    // authorize gate (an unknown session is an authz refusal, not an unwired seam).
    await expect(
      surface.remoteSnapshot({ sessionId: 'sess-x', principal: OWNER })
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    await expect(
      surface.remoteSteer({ sessionId: 'sess-x', principal: OWNER, workspaceId: 'ws-1', input: 'go' })
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
  });
});
