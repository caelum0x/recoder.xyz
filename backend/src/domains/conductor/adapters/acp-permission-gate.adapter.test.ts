/**
 * createAcpPermissionGate — the ACP permission → governance gate bridge, tested
 * with a FAKE gate + fake workspace lookup (no real governance kernel).
 *
 * Proves: ACP tool kinds map to the right GovernanceAction; the gate is consulted
 * with the workspace's taskId/runId/worktree for correlation + containment; an
 * `allow` verdict grants + seals an audit entry; `needs_approval`/`deny` REFUSE;
 * a gate error denies safely; and every decision is surfaced via `onVerdict`.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createAcpPermissionGate,
  policyActionForKind,
  type AcpGateWorkspace,
  type AcpPermissionVerdictEvent,
} from './acp-permission-gate.adapter.js';
import type { AcpPermissionContext } from './acp/acp-client-requests.js';
import type { GateVerdict } from '../../governance/types.js';
import type { Principal } from '../../identity/types.js';

const PRINCIPAL: Principal = {
  userId: 'conductor-acp',
  scopes: ['internal', 'write'],
  kind: 'internal',
  isAnonymous: false,
  raw: null,
} as Principal;

function verdict(
  effect: GateVerdict['effect'],
  over: Partial<GateVerdict> = {}
): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'medium',
    reason: `${effect} by policy`,
    degraded: false,
    engine: 'ts',
    ...over,
  } as GateVerdict;
}

function fakeGate(effect: GateVerdict['effect'], over?: Partial<GateVerdict>) {
  const decideCalls: { action: string; ctx: unknown }[] = [];
  const auditCalls: unknown[] = [];
  const gate = {
    decide: vi.fn(async (action: string, _p: unknown, ctx: unknown) => {
      decideCalls.push({ action, ctx });
      return verdict(effect, over);
    }),
    recordAudit: vi.fn(async (entry: unknown) => {
      auditCalls.push(entry);
      return { recordId: 'a1' };
    }),
  };
  return { gate: gate as never, decideCalls, auditCalls };
}

const ctx = (
  kind: string,
  over: Partial<AcpPermissionContext['toolCall']> = {}
): AcpPermissionContext => ({
  workspaceId: 'ws-1',
  sessionId: 'sess-1',
  toolCall: { kind: kind as never, title: 'run the tests', ...over },
  options: [],
});

const ws: AcpGateWorkspace = {
  taskId: 't-1',
  runId: 'run-1',
  worktreePath: '/wt/ws-1',
};

describe('policyActionForKind', () => {
  it('maps ACP kinds to governance actions', () => {
    expect(policyActionForKind('execute')).toBe('command.run');
    expect(policyActionForKind('fetch')).toBe('tool.call');
    expect(policyActionForKind('read')).toBe('file.read');
    expect(policyActionForKind('edit')).toBe('file.write');
    expect(policyActionForKind('delete')).toBe('file.write');
    expect(policyActionForKind('other')).toBe('tool.call');
    expect(policyActionForKind(null)).toBe('tool.call');
  });
});

describe('createAcpPermissionGate', () => {
  it('an allow verdict grants the permission and seals an audit entry', async () => {
    const g = fakeGate('allow');
    const resolve = createAcpPermissionGate({
      gate: g.gate,
      getWorkspace: async () => ws,
      principal: PRINCIPAL,
    });
    expect(await resolve(ctx('execute'))).toBe('allow');
    // gate consulted with the mapped action + correlation + containment.
    expect(g.decideCalls[0]?.action).toBe('command.run');
    expect(g.decideCalls[0]?.ctx).toMatchObject({
      taskId: 't-1',
      runId: 'run-1',
      workspaceRoot: '/wt/ws-1',
    });
    // audit sealed on allow.
    expect(g.auditCalls).toHaveLength(1);
  });

  it('a needs_approval verdict REFUSES (no audit seal) — the human pre-approves via the gate', async () => {
    const g = fakeGate('needs_approval', { approvalId: 'appr-9' });
    const events: AcpPermissionVerdictEvent[] = [];
    const resolve = createAcpPermissionGate({
      gate: g.gate,
      getWorkspace: async () => ws,
      principal: PRINCIPAL,
      onVerdict: e => events.push(e),
    });
    expect(await resolve(ctx('execute'))).toBe('deny');
    expect(g.auditCalls).toHaveLength(0);
    expect(events[0]).toMatchObject({
      decision: 'deny',
      effect: 'needs_approval',
      approvalId: 'appr-9',
      action: 'command.run',
    });
  });

  it('a deny verdict refuses', async () => {
    const g = fakeGate('deny');
    const resolve = createAcpPermissionGate({
      gate: g.gate,
      getWorkspace: async () => ws,
      principal: PRINCIPAL,
    });
    expect(await resolve(ctx('fetch'))).toBe('deny');
  });

  it('a gate error denies safely (never a fabricated allow)', async () => {
    const gate = {
      decide: vi.fn(async () => {
        throw new Error('kernel down');
      }),
      recordAudit: vi.fn(),
    };
    const resolve = createAcpPermissionGate({
      gate: gate as never,
      getWorkspace: async () => ws,
      principal: PRINCIPAL,
    });
    expect(await resolve(ctx('execute'))).toBe('deny');
  });

  it('a workspace-lookup failure still decides (uncorrelated) rather than throwing', async () => {
    const g = fakeGate('allow');
    const resolve = createAcpPermissionGate({
      gate: g.gate,
      getWorkspace: async () => {
        throw new Error('repo down');
      },
      principal: PRINCIPAL,
    });
    expect(await resolve(ctx('execute'))).toBe('allow');
    // decided with no taskId/runId (uncorrelated) but still governed.
    expect(g.decideCalls[0]?.ctx).toMatchObject({
      target: { environment: 'conductor', command: 'run the tests' },
    });
  });

  it('surfaces the target path from the tool call locations for gate containment', async () => {
    const g = fakeGate('allow');
    const resolve = createAcpPermissionGate({
      gate: g.gate,
      getWorkspace: async () => ws,
      principal: PRINCIPAL,
    });
    await resolve(ctx('edit', { locations: [{ path: 'src/app.ts' }] }));
    expect(g.decideCalls[0]?.action).toBe('file.write');
    expect(g.decideCalls[0]?.ctx).toMatchObject({
      target: { path: 'src/app.ts' },
    });
  });
});
