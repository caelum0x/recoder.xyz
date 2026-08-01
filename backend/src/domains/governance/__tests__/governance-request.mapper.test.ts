import { describe, it, expect } from 'vitest';
import type { GovernanceVerdict } from '@recoder/governance';
import {
  buildKernelActor,
  toGovernanceRequest,
  toKernelVerdict,
} from '../adapters/governance-request.mapper.js';
import type { KernelEngine, KernelRequest } from '../types.js';

/**
 * These tests lock in the deny-by-default privilege invariants of the governance
 * request/verdict bridge. A silent edit that widens any of these defaults is a
 * privilege escalation that no other test catches — so the assertions here are
 * intentionally exact about the "no standing rights" posture.
 */

function req(overrides: Partial<KernelRequest> = {}): KernelRequest {
  return {
    requestId: 'req-1',
    actorId: 'agent-42',
    action: 'file.write',
    target: { path: '/repo/a.ts' },
    ...overrides,
  };
}

describe('buildKernelActor — deny-biased synthetic actor', () => {
  it('grants NO standing high-risk rights and requires a write lock', () => {
    const actor = buildKernelActor('agent-42');
    const perms = actor.permissions;

    // Default file effect is a hard deny — nothing is writable without a grant.
    expect(perms.defaultFileEffect).toBe('deny');
    // No ambient network / shell / git-write / PR / secrets access.
    expect(perms.allowNetwork).toBe(false);
    expect(perms.allowShell).toBe(false);
    expect(perms.allowGitWrite).toBe(false);
    expect(perms.allowPrCreation).toBe(false);
    expect(perms.allowSecretsAccess).toBe(false);
    // Writes must be lock-covered; concurrency is pinned to a single subagent.
    expect(perms.writeLockRequired).toBe(true);
    expect(perms.maxParallelSubagents).toBe(1);
  });

  it('carries NO capabilities, tools, or path/tool rules (no standing grants)', () => {
    const actor = buildKernelActor('agent-42');
    expect(actor.capabilities).toEqual([]);
    expect(actor.tools).toEqual([]);
    expect(actor.permissions.pathRules).toEqual([]);
    expect(actor.permissions.toolRules).toEqual([]);
    expect(actor.supportedTaskIntents).toEqual([]);
  });

  it('cannot self-clear: approvalPolicy is policy-mode with auto-approval OFF', () => {
    const actor = buildKernelActor('agent-42');
    expect(actor.approvalPolicy.mode).toBe('policy');
    expect(actor.approvalPolicy.allowAutoApprovalForLowRisk).toBe(false);
    expect(actor.approvalPolicy.requiredRules).toEqual([]);
  });

  it('falls back to "anonymous" for an empty/blank actorId (no accidental identity)', () => {
    expect(buildKernelActor('').agentId).toBe('anonymous');
    // A non-empty id is preserved verbatim.
    expect(buildKernelActor('agent-42').agentId).toBe('agent-42');
  });

  it('contains cwd to the passed workspaceRoot, empty allowlist when none', () => {
    const unbounded = buildKernelActor('agent-42');
    expect(unbounded.cwdPolicy.mode).toBe('workspace_root');
    expect(unbounded.cwdPolicy.allowedRoots).toEqual([]);

    const bounded = buildKernelActor('agent-42', '/repo');
    expect(bounded.cwdPolicy.allowedRoots).toEqual(['/repo']);
  });
});

describe('toGovernanceRequest — domain KernelRequest → package GovernanceRequest', () => {
  it('uses the deny-biased profile built from actorId + workspaceRoot', () => {
    const gov = toGovernanceRequest(
      req({ actorId: 'agent-99', context: { target: { path: '/repo/a.ts' }, workspaceRoot: '/ws' } }),
    );
    expect(gov.actor.agentId).toBe('agent-99');
    expect(gov.actor.permissions.defaultFileEffect).toBe('deny');
    expect(gov.actor.permissions.allowGitWrite).toBe(false);
    // Containment threads the workspace root into the actor's cwd allowlist.
    expect(gov.actor.cwdPolicy.allowedRoots).toEqual(['/ws']);
  });

  it('defaults context.autonomous to false when absent (deny-biased absence)', () => {
    const gov = toGovernanceRequest(req());
    expect(gov.context?.autonomous).toBe(false);

    // An explicit true is preserved (control-plane sign-off is the only opener).
    const auto = toGovernanceRequest(
      req({ context: { target: { path: '/repo/a.ts' }, autonomous: true } }),
    );
    expect(auto.context?.autonomous).toBe(true);
  });

  it('prefers context.taskId, falling back to req.taskId', () => {
    const preferred = toGovernanceRequest(
      req({ taskId: 'task-outer', context: { target: { path: '/x' }, taskId: 'task-inner' } }),
    );
    expect(preferred.context?.metadata?.taskId).toBe('task-inner');

    const fallback = toGovernanceRequest(req({ taskId: 'task-outer' }));
    expect(fallback.context?.metadata?.taskId).toBe('task-outer');
  });

  it('defaults workLocks to [] and each lock mode to "exclusive"', () => {
    const none = toGovernanceRequest(req());
    expect(none.workLocks).toEqual([]);

    const locked = toGovernanceRequest(
      req({
        workLocks: [{ pathGlob: '/repo/**' }, { pathGlob: '/other/**', mode: 'shared' }],
      }),
    );
    const locks = locked.workLocks as ReadonlyArray<{ pathGlob: string; mode: string }>;
    expect(locks[0]).toEqual({ pathGlob: '/repo/**', mode: 'exclusive' });
    expect(locks[1]).toEqual({ pathGlob: '/other/**', mode: 'shared' });
  });

  it('passes target + an arbitrary unknown action through unchanged (no normalization)', () => {
    const gov = toGovernanceRequest(
      req({
        action: 'totally.made.up.verb',
        target: {
          path: '/repo/x.ts',
          command: 'rm -rf /',
          toolName: 'shell',
          environment: 'prod',
        },
      }),
    );
    // The mapper must not throw or normalize an unknown action — the kernel
    // classifies it deny-biased downstream.
    expect(gov.action).toBe('totally.made.up.verb');
    expect(gov.target).toEqual({
      path: '/repo/x.ts',
      command: 'rm -rf /',
      toolName: 'shell',
      environment: 'prod',
    });
  });
});

describe('toKernelVerdict — package GovernanceVerdict → domain KernelVerdict', () => {
  function fakeVerdict(overrides: Partial<GovernanceVerdict> = {}): GovernanceVerdict {
    return {
      verdictId: 'v-1',
      requestId: 'req-1',
      effect: 'needs_approval',
      tier: 'high',
      reason: 'gated by policy',
      degraded: true,
      auditHash: 'deadbeef',
      approvalGateId: 'gate-7',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as unknown as GovernanceVerdict;
  }

  it('copies effect/tier/reason/degraded/auditHash/approvalGateId verbatim and stamps the engine', () => {
    const engines: KernelEngine[] = ['napi', 'daemon', 'ts', 'synthetic'];
    for (const engine of engines) {
      const kv = toKernelVerdict(fakeVerdict(), engine);
      expect(kv).toEqual({
        effect: 'needs_approval',
        tier: 'high',
        reason: 'gated by policy',
        degraded: true,
        engine,
        auditHash: 'deadbeef',
        approvalGateId: 'gate-7',
      });
    }
  });

  it('preserves an undefined auditHash / approvalGateId (never fabricates audit integrity)', () => {
    const kv = toKernelVerdict(
      fakeVerdict({ effect: 'allow', degraded: false, auditHash: undefined, approvalGateId: undefined }),
      'napi',
    );
    expect(kv.effect).toBe('allow');
    expect(kv.degraded).toBe(false);
    expect(kv.auditHash).toBeUndefined();
    expect(kv.approvalGateId).toBeUndefined();
    expect(kv.engine).toBe('napi');
  });
});
