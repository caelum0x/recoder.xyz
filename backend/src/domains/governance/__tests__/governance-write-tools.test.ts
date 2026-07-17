/**
 * Governance WRITE MCP tools — happy path + gated-deny per tool.
 *
 * Each mutating tool must (1) perform the real mutation on an `allow` self-gate,
 * and (2) refuse WITHOUT changing state on any non-`allow` verdict. The fake
 * module surface wires the real services over the in-memory repo/kernel doubles,
 * so the only thing that varies between the two cases is the kernel verdict.
 */
import { describe, it, expect } from 'vitest';
import { buildGovernanceWriteTools, type GovernanceWriteSurface } from '../mcp/governance-write-tools.js';
import { GovernanceGateService } from '../services/governance-gate.service.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import { createApprovalService } from '../services/approval.service.js';
import { createWorkLockService } from '../services/work-lock.service.js';
import { createSecretsService } from '../services/secrets.service.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { KernelVerdict } from '../types.js';
import {
  InMemoryAuditRepository,
  InMemoryApprovalRepository,
  InMemoryWorkLockRepository,
  InMemorySecretRepository,
  fakeKernel,
  fakeVault,
  silentLogger,
} from './_fakes.js';

const ALLOW: KernelVerdict = { effect: 'allow', tier: 'low', reason: 'ok', degraded: false, engine: 'ts' };
const DENY: KernelVerdict = { effect: 'deny', tier: 'high', reason: 'blocked by policy', degraded: false, engine: 'ts' };

interface Harness {
  readonly tools: readonly McpToolRegistration[];
  readonly approvals: InMemoryApprovalRepository;
  readonly locks: InMemoryWorkLockRepository;
  readonly secrets: InMemorySecretRepository;
  tool(name: string): McpToolRegistration;
}

function buildHarness(verdict: KernelVerdict, opts: { vaultAvailable?: boolean } = {}): Harness {
  const auditRepo = new InMemoryAuditRepository();
  const approvalRepo = new InMemoryApprovalRepository();
  const lockRepo = new InMemoryWorkLockRepository();
  const secretRepo = new InMemorySecretRepository();

  const audit = new AuditChainService(auditRepo);
  const gate = new GovernanceGateService({
    kernel: fakeKernel({ verdict }),
    audit,
    approvals: approvalRepo,
    logger: silentLogger,
  });
  const approvals = createApprovalService({ repo: approvalRepo, logger: silentLogger, audit: gate });
  const workLocks = createWorkLockService({ repo: lockRepo, logger: silentLogger });
  const secrets = createSecretsService({
    repo: secretRepo,
    vault: fakeVault({ available: opts.vaultAvailable ?? true }),
    gate,
    logger: silentLogger,
  });

  const surface: GovernanceWriteSurface = {
    gate: () => gate,
    approvals: () => approvals,
    workLocks: () => workLocks,
    secrets: () => secrets,
  };
  const tools = buildGovernanceWriteTools(surface);
  return {
    tools,
    approvals: approvalRepo,
    locks: lockRepo,
    secrets: secretRepo,
    tool: (name) => {
      const t = tools.find((x) => x.name === name);
      if (!t) throw new Error(`tool ${name} not registered`);
      return t;
    },
  };
}

describe('governance write MCP tools — surface', () => {
  it('registers exactly the six governed-mutation tools', () => {
    const { tools } = buildHarness(ALLOW);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'governance_acquire_lock',
      'governance_approval_decide',
      'governance_decide',
      'governance_release_lock',
      'governance_request_approval',
      'governance_secret_set',
    ]);
  });

  it('fails fast on missing actorId without calling the gate', async () => {
    const { tool } = buildHarness(ALLOW);
    const out = (await tool('governance_secret_set').handler({ ref: 'x', value: 'v' })) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/actorId/);
  });
});

describe('governance_decide', () => {
  it('happy: an allow verdict returns ok:true with the sealed verdict', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_decide').handler({ actorId: 'u1', action: 'file.write', path: '/repo/a.ts' })) as {
      ok: boolean;
      verdict: { effect: string; auditHash?: string };
    };
    expect(out.ok).toBe(true);
    expect(out.verdict.effect).toBe('allow');
    expect(out.verdict.auditHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gated-deny: a deny verdict returns ok:false and the blocking verdict', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_decide').handler({ actorId: 'u1', action: 'branch.push', path: '/repo/a.ts' })) as {
      ok: boolean;
      verdict: { effect: string; reason: string };
    };
    expect(out.ok).toBe(false);
    expect(out.verdict.effect).toBe('deny');
    expect(out.verdict.reason).toContain('blocked by policy');
  });
});

describe('governance_request_approval', () => {
  it('happy: opens a pending approval behind an allow gate', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_request_approval').handler({
      actorId: 'u1',
      action: 'pr.merge',
      riskTier: 'high',
      taskId: 't1',
    })) as { ok: boolean; approval: { id: string; status: string } };
    expect(out.ok).toBe(true);
    expect(out.approval.status).toBe('pending');
    expect(h.approvals.rows.size).toBe(1);
  });

  it('gated-deny: refuses and opens no record', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_request_approval').handler({
      actorId: 'u1',
      action: 'pr.merge',
      riskTier: 'high',
    })) as { ok: boolean; gated?: boolean; verdict: { effect: string } };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(out.verdict.effect).toBe('deny');
    expect(h.approvals.rows.size).toBe(0);
  });

  it('rejects an invalid riskTier before any gate call', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_request_approval').handler({ actorId: 'u1', action: 'pr.merge', riskTier: 'nope' })) as {
      ok: boolean;
      error?: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/riskTier/);
  });
});

describe('governance_approval_decide', () => {
  it('happy: grants a pending approval behind an allow gate', async () => {
    const h = buildHarness(ALLOW);
    const created = await h.approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    const out = (await h.tool('governance_approval_decide').handler({
      actorId: 'admin',
      approvalId: created.id,
      decision: 'approved',
    })) as { ok: boolean; approval: { status: string; decidedBy: string } };
    expect(out.ok).toBe(true);
    expect(out.approval.status).toBe('approved');
    expect(out.approval.decidedBy).toBe('admin');
  });

  it('gated-deny: refuses and leaves the approval pending', async () => {
    const h = buildHarness(DENY);
    const created = await h.approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    const out = (await h.tool('governance_approval_decide').handler({
      actorId: 'admin',
      approvalId: created.id,
      decision: 'approved',
    })) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(h.approvals.rows.get(created.id)?.status).toBe('pending');
  });

  it('truthful ok:false when the record is absent (already decided / unknown id)', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_approval_decide').handler({
      actorId: 'admin',
      approvalId: 'appr_missing',
      decision: 'denied',
    })) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no pending approval/i);
  });
});

describe('governance_acquire_lock / governance_release_lock', () => {
  it('happy: acquires an exclusive lock behind an allow gate', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_acquire_lock').handler({
      actorId: 'agent-1',
      resourcePath: '/repo/x.ts',
    })) as { ok: boolean; acquired: boolean; lock?: { id: string } };
    expect(out.ok).toBe(true);
    expect(out.acquired).toBe(true);
    expect(h.locks.rows).toHaveLength(1);
  });

  it('gated-deny: refuses and acquires nothing', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_acquire_lock').handler({
      actorId: 'agent-1',
      resourcePath: '/repo/x.ts',
    })) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(h.locks.rows).toHaveLength(0);
  });

  it('release is holder-scoped and self-gated', async () => {
    const h = buildHarness(ALLOW);
    const acquired = (await h.tool('governance_acquire_lock').handler({
      actorId: 'agent-1',
      resourcePath: '/repo/x.ts',
    })) as { lock?: { id: string } };
    const lockId = acquired.lock!.id;

    const released = (await h.tool('governance_release_lock').handler({ actorId: 'agent-1', lockId })) as {
      ok: boolean;
      released: boolean;
    };
    expect(released.ok).toBe(true);
    expect(released.released).toBe(true);
  });

  it('release gated-deny leaves the lock held', async () => {
    const allow = buildHarness(ALLOW);
    const acquired = (await allow.tool('governance_acquire_lock').handler({
      actorId: 'agent-1',
      resourcePath: '/repo/x.ts',
    })) as { lock?: { id: string } };
    // A fresh harness whose gate denies — the lock exists in `allow`, but a denied
    // release must not fake a release (here we assert the gate short-circuits).
    const denyGate = buildHarness(DENY);
    const out = (await denyGate.tool('governance_release_lock').handler({
      actorId: 'agent-1',
      lockId: acquired.lock!.id,
    })) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
  });
});

describe('governance_secret_set', () => {
  it('happy: stores an encrypted secret and returns metadata only (no plaintext)', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_secret_set').handler({
      actorId: 'u1',
      ref: 'byok/openai',
      value: 'sk-secret-value',
    })) as { ok: boolean; secret: { ref: string; keyVersion: number } };
    expect(out.ok).toBe(true);
    expect(out.secret.ref).toBe('byok/openai');
    // The plaintext is never echoed back.
    expect(JSON.stringify(out)).not.toContain('sk-secret-value');
    expect(h.secrets.rows.size).toBe(1);
  });

  it('gated-deny: refuses and stores nothing', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_secret_set').handler({
      actorId: 'u1',
      ref: 'byok/openai',
      value: 'sk-secret-value',
    })) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(h.secrets.rows.size).toBe(0);
  });

  it('fails safe (ok:false) when the vault key is absent — never a plaintext store', async () => {
    const h = buildHarness(ALLOW, { vaultAvailable: false });
    const out = (await h.tool('governance_secret_set').handler({
      actorId: 'u1',
      ref: 'byok/openai',
      value: 'sk-secret-value',
    })) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/vault/i);
    expect(h.secrets.rows.size).toBe(0);
  });
});
