/**
 * Tests for governance-gate — the conductor's risk-aware delivery gate.
 *
 * These drive the REAL @recoder/governance facade (Governance.create -> the real
 * tier-classifier, the fused agent-policy chain, the deny-biased fallback
 * enforcer, and the SHA-256 Merkle audit chain). Nothing in governance's decision
 * logic is stubbed: the high-risk verdict, the audit record, and the Merkle
 * verification are the package's real behavior over its real in-memory audit store.
 *
 * `decideDelivery` builds a delivery actor with NO standing git-write / PR rights,
 * so a `pr`/`merge` delivery classifies `high` and the real policy chain returns
 * `needs_approval` — the verdict BLOCKS. The default governance singleton has
 * auto-approve disabled, so even an `approvedByControlPlane` (autonomous) delivery
 * stays needs_approval at the governance layer: governance reports the risk, the
 * conductor's separate Approval record clears the gate (delivery-approval.ts).
 *
 * The ONLY test doubles:
 *   - one test swaps the real `Governance.create` for a real Governance instance
 *     built with auto-approve ENABLED (a legitimate config), proving the gate
 *     honors a genuine `allow` verdict and lets the delivery proceed.
 *   - one test injects a FAILING @recoder/governance to exercise the fail-CLOSED
 *     synthetic-deny path. The product code under test stays unstubbed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Workspace } from '@recoder/agent-os';

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  const now = new Date().toISOString();
  return {
    workspaceId: 'ws_gov_test',
    spaceId: 'space_gov',
    projectId: 'proj_gov',
    taskId: 'task_gov',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/gov-test',
    baseRef: 'HEAD',
    worktreePath: '/tmp/gov-test',
    state: 'running',
    createdBy: 'gov-test',
    createdAt: now,
    updatedAt: now,
    metadata: {},
    ...overrides,
  };
}

describe('governance-gate.decideDelivery (real @recoder/governance)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@recoder/governance');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('a PR delivery yields a high-tier needs_approval verdict that BLOCKS (real risk classification)', async () => {
    const { decideDelivery, __resetGovernanceForTest } = await import('./governance-gate.js');
    __resetGovernanceForTest();

    const decision = await decideDelivery(workspace(), 'pr', false);

    expect(decision.verdict.effect).toBe('needs_approval');
    expect(decision.verdict.tier).toBe('high');
    expect(decision.blocks).toBe(true);
    // needs_approval is risky but NOT a hard policy veto — an approval record may clear it.
    expect(decision.hardDeny).toBe(false);
    // The Rust daemon is deferred -> the verdict truthfully reports the TS fallback.
    expect(decision.degraded).toBe(true);
    // The decision was sealed into the Merkle audit chain.
    expect(decision.auditHash).toBeTruthy();
  });

  it('a merge delivery also routes high (branch.push) and blocks', async () => {
    const { decideDelivery, __resetGovernanceForTest } = await import('./governance-gate.js');
    __resetGovernanceForTest();

    const decision = await decideDelivery(workspace(), 'merge', false);

    expect(decision.verdict.tier).toBe('high');
    expect(decision.verdict.effect).toBe('needs_approval');
    expect(decision.blocks).toBe(true);
    // The policy action mapped from `merge` is the branch push.
    expect(decision.verdict.policy.action).toBe('branch.push');
  });

  it('the default singleton (auto-approve OFF) does not silently clear an autonomous delivery', async () => {
    const { decideDelivery, __resetGovernanceForTest } = await import('./governance-gate.js');
    __resetGovernanceForTest();

    // Even with the control-plane sign-off (autonomous), governance still returns
    // needs_approval because the default config never auto-approves a high tier.
    const decision = await decideDelivery(workspace(), 'pr', true);
    expect(decision.verdict.effect).toBe('needs_approval');
    expect(decision.blocks).toBe(true);
  });

  it('honors a genuine ALLOW verdict from governance (auto-approve enabled) so the delivery proceeds', async () => {
    // Build a REAL Governance instance with auto-approve enabled at the high
    // ceiling — a legitimate config, not a fake. The gate must then let an
    // autonomous (approved) delivery proceed.
    const real = await vi.importActual<typeof import('@recoder/governance')>('@recoder/governance');
    vi.doMock('@recoder/governance', () => ({
      ...real,
      Governance: {
        ...real.Governance,
        create: (input: Record<string, unknown> = {}) =>
          real.Governance.create({ ...input, autoApprove: { enabled: true, ceiling: 'high' } }),
      },
    }));

    const { decideDelivery, __resetGovernanceForTest } = await import('./governance-gate.js');
    __resetGovernanceForTest();

    // Without the control-plane sign-off the autonomous flag is false -> still blocks.
    const blocked = await decideDelivery(workspace(), 'pr', false);
    expect(blocked.verdict.effect).toBe('needs_approval');
    expect(blocked.blocks).toBe(true);

    // With the control-plane sign-off (autonomous), the real auto-approver clears it.
    const allowed = await decideDelivery(workspace(), 'pr', true);
    expect(allowed.verdict.effect).toBe('allow');
    expect(allowed.blocks).toBe(false);
    expect(allowed.hardDeny).toBe(false);
    expect(allowed.auditHash).toBeTruthy();
  });

  it('fails CLOSED with a synthetic hard-deny when governance cannot be built (never auto-delivers)', async () => {
    const real = await vi.importActual<typeof import('@recoder/governance')>('@recoder/governance');
    vi.doMock('@recoder/governance', () => ({
      ...real,
      Governance: {
        ...real.Governance,
        create: () => {
          throw new Error('governance unavailable (injected failure)');
        },
      },
    }));

    const { decideDelivery, __resetGovernanceForTest } = await import('./governance-gate.js');
    __resetGovernanceForTest();

    const decision = await decideDelivery(workspace(), 'pr', true);
    // Fail closed: a governance failure must NEVER produce an allow.
    expect(decision.verdict.effect).toBe('deny');
    expect(decision.hardDeny).toBe(true);
    expect(decision.blocks).toBe(true);
    expect(decision.degraded).toBe(true);
    expect(decision.verdict.tier).toBe('critical');
  });
});

describe('governance-gate audit chain (real Merkle verification)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('records every delivery decision and verifies the Merkle chain tip', async () => {
    const { decideDelivery, verifyGovernanceAudit, governanceAuditEntries, __resetGovernanceForTest } =
      await import('./governance-gate.js');
    __resetGovernanceForTest();

    const before = await governanceAuditEntries();
    await decideDelivery(workspace({ workspaceId: 'ws_audit_a' }), 'pr', false);
    await decideDelivery(workspace({ workspaceId: 'ws_audit_b' }), 'merge', false);
    const after = await governanceAuditEntries();

    // Two new decisions were sealed into the audit chain.
    expect(after.length).toBe(before.length + 2);

    const audit = await verifyGovernanceAudit();
    expect(audit.ok).toBe(true);
    expect(audit.tipHash).toBeTruthy();
    expect(audit.entries).toBe(after.length);
  });

  it('verifyGovernanceAudit reports ok:false (truthful, not fake-green) when governance is unavailable', async () => {
    const real = await vi.importActual<typeof import('@recoder/governance')>('@recoder/governance');
    vi.doMock('@recoder/governance', () => ({
      ...real,
      Governance: {
        ...real.Governance,
        create: () => {
          throw new Error('governance unavailable (injected failure)');
        },
      },
    }));

    const { verifyGovernanceAudit, governanceAuditEntries, __resetGovernanceForTest } =
      await import('./governance-gate.js');
    __resetGovernanceForTest();

    const audit = await verifyGovernanceAudit();
    expect(audit.ok).toBe(false);
    expect(audit.entries).toBe(0);
    expect(await governanceAuditEntries()).toEqual([]);

    vi.doUnmock('@recoder/governance');
  });
});
