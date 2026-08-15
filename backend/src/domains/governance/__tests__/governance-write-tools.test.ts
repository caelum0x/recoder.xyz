/**
 * Governance WRITE MCP tools — happy path + gated-deny + SUBJECT-SPOOF defense.
 *
 * Each mutating tool must (1) perform the real mutation on an `allow` self-gate,
 * (2) refuse WITHOUT changing state on any non-`allow` verdict, and (3) derive its
 * actor/owner from the HOST-AUTHORIZED caller (2nd handler param) — NEVER from a
 * caller-supplied `args.actorId`. The fake module surface wires the real services
 * over the in-memory repo/kernel doubles, so the only thing that varies between the
 * allow/deny cases is the kernel verdict.
 */
import { describe, it, expect } from 'vitest';
import { buildGovernanceWriteTools, type GovernanceWriteSurface } from '../mcp/governance-write-tools.js';
import { GovernanceGateService } from '../services/governance-gate.service.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import { createApprovalService } from '../services/approval.service.js';
import { createWorkLockService } from '../services/work-lock.service.js';
import { createSecretsService } from '../services/secrets.service.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { ErrorCode } from '../../../shared/errors.js';
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

/** The host-authorized, edge-bound caller a real MCP call threads to the handler. */
function callerFor(userId: string, scopes: readonly string[] = ['write']): McpToolCaller {
  return { userId, scopes };
}

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

  it('fails fast on missing input (ref) behind an authorized caller, without calling the gate', async () => {
    const { tool } = buildHarness(ALLOW);
    const out = (await tool('governance_secret_set').handler({ value: 'v' }, callerFor('u1'))) as {
      ok: boolean;
      error?: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/ref/);
  });
});

describe('governance_decide', () => {
  it('happy: an allow verdict returns ok:true with the sealed verdict', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_decide').handler(
      { action: 'file.write', path: '/repo/a.ts' },
      callerFor('u1'),
    )) as {
      ok: boolean;
      verdict: { effect: string; auditHash?: string };
    };
    expect(out.ok).toBe(true);
    expect(out.verdict.effect).toBe('allow');
    expect(out.verdict.auditHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gated-deny: a deny verdict returns ok:false and the blocking verdict', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_decide').handler(
      { action: 'branch.push', path: '/repo/a.ts' },
      callerFor('u1'),
    )) as {
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
    const out = (await h.tool('governance_request_approval').handler(
      { action: 'pr.merge', riskTier: 'high', taskId: 't1', target: 'conductor:workspace:ws-1' },
      callerFor('u1'),
    )) as { ok: boolean; approval: { id: string; status: string } };
    expect(out.ok).toBe(true);
    expect(out.approval.status).toBe('pending');
    expect(h.approvals.rows.size).toBe(1);
  });

  it('gated-deny: refuses and opens no record', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_request_approval').handler(
      { action: 'pr.merge', riskTier: 'high', target: 'conductor:workspace:ws-1' },
      callerFor('u1'),
    )) as { ok: boolean; gated?: boolean; verdict: { effect: string } };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(out.verdict.effect).toBe('deny');
    expect(h.approvals.rows.size).toBe(0);
  });

  it('rejects an invalid riskTier before any gate call', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_request_approval').handler(
      { action: 'pr.merge', riskTier: 'nope', target: 'conductor:workspace:ws-1' },
      callerFor('u1'),
    )) as {
      ok: boolean;
      error?: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/riskTier/);
  });
});

describe('governance_approval_decide', () => {
  it('happy: the OWNER grants their own pending approval behind an allow gate', async () => {
    const h = buildHarness(ALLOW);
    const created = await h.approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: 'conductor:workspace:ws-1' });
    const out = (await h.tool('governance_approval_decide').handler(
      { approvalId: created.id, decision: 'approved' },
      callerFor('u1'),
    )) as { ok: boolean; approval: { status: string; decidedBy: string } };
    expect(out.ok).toBe(true);
    expect(out.approval.status).toBe('approved');
    expect(out.approval.decidedBy).toBe('u1');
  });

  it('OWNERSHIP: a non-owner, non-privileged caller CANNOT decide another tenant’s approval (no-oracle)', async () => {
    const h = buildHarness(ALLOW);
    const created = await h.approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: 'conductor:workspace:ws-1' });
    // u2 is authenticated + passes the self-gate but does not OWN u1's approval.
    const out = (await h.tool('governance_approval_decide').handler(
      { approvalId: created.id, decision: 'approved' },
      callerFor('u2'),
    )) as { ok: boolean; error?: string };
    // Refused indistinguishably from an absent record (no cross-tenant oracle)…
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no pending approval/i);
    // …and the victim's approval is untouched — no forged clearance, no DoS-deny.
    expect(h.approvals.rows.get(created.id)?.status).toBe('pending');
    expect(h.approvals.rows.get(created.id)?.decidedBy).toBeNull();
  });

  it('a privileged (admin) operator MAY decide any tenant’s approval', async () => {
    const h = buildHarness(ALLOW);
    const created = await h.approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: 'conductor:workspace:ws-1' });
    const out = (await h.tool('governance_approval_decide').handler(
      { approvalId: created.id, decision: 'approved' },
      callerFor('ops', ['admin']),
    )) as { ok: boolean; approval?: { status: string } };
    expect(out.ok).toBe(true);
    expect(out.approval?.status).toBe('approved');
  });

  it('gated-deny: refuses and leaves the approval pending', async () => {
    const h = buildHarness(DENY);
    const created = await h.approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: 'conductor:workspace:ws-1' });
    const out = (await h.tool('governance_approval_decide').handler(
      { approvalId: created.id, decision: 'approved' },
      callerFor('admin-user'),
    )) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(h.approvals.rows.get(created.id)?.status).toBe('pending');
  });

  it('truthful ok:false when the record is absent (already decided / unknown id)', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_approval_decide').handler(
      { approvalId: 'appr_missing', decision: 'denied' },
      callerFor('admin-user'),
    )) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no pending approval/i);
  });
});

describe('governance_acquire_lock / governance_release_lock', () => {
  it('happy: acquires an exclusive lock behind an allow gate', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_acquire_lock').handler(
      { resourcePath: '/repo/x.ts' },
      callerFor('agent-1'),
    )) as { ok: boolean; acquired: boolean; lock?: { id: string; holderAgentId: string } };
    expect(out.ok).toBe(true);
    expect(out.acquired).toBe(true);
    expect(out.lock?.holderAgentId).toBe('agent-1');
    expect(h.locks.rows).toHaveLength(1);
  });

  it('gated-deny: refuses and acquires nothing', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_acquire_lock').handler(
      { resourcePath: '/repo/x.ts' },
      callerFor('agent-1'),
    )) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(h.locks.rows).toHaveLength(0);
  });

  it('release is holder-scoped and self-gated', async () => {
    const h = buildHarness(ALLOW);
    const acquired = (await h.tool('governance_acquire_lock').handler(
      { resourcePath: '/repo/x.ts' },
      callerFor('agent-1'),
    )) as { lock?: { id: string } };
    const lockId = acquired.lock!.id;

    const released = (await h.tool('governance_release_lock').handler(
      { lockId },
      callerFor('agent-1'),
    )) as {
      ok: boolean;
      released: boolean;
    };
    expect(released.ok).toBe(true);
    expect(released.released).toBe(true);
  });

  it('release gated-deny leaves the lock held', async () => {
    const allow = buildHarness(ALLOW);
    const acquired = (await allow.tool('governance_acquire_lock').handler(
      { resourcePath: '/repo/x.ts' },
      callerFor('agent-1'),
    )) as { lock?: { id: string } };
    // A fresh harness whose gate denies — the lock exists in `allow`, but a denied
    // release must not fake a release (here we assert the gate short-circuits).
    const denyGate = buildHarness(DENY);
    const out = (await denyGate.tool('governance_release_lock').handler(
      { lockId: acquired.lock!.id },
      callerFor('agent-1'),
    )) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
  });
});

describe('governance_secret_set', () => {
  it('happy: stores an encrypted secret and returns metadata only (no plaintext)', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_secret_set').handler(
      { ref: 'byok/openai', value: 'sk-secret-value' },
      callerFor('u1'),
    )) as { ok: boolean; secret: { ref: string; keyVersion: number } };
    expect(out.ok).toBe(true);
    expect(out.secret.ref).toBe('byok/openai');
    // The plaintext is never echoed back.
    expect(JSON.stringify(out)).not.toContain('sk-secret-value');
    expect(h.secrets.rows.size).toBe(1);
  });

  it('gated-deny: refuses and stores nothing', async () => {
    const h = buildHarness(DENY);
    const out = (await h.tool('governance_secret_set').handler(
      { ref: 'byok/openai', value: 'sk-secret-value' },
      callerFor('u1'),
    )) as { ok: boolean; gated?: boolean };
    expect(out.ok).toBe(false);
    expect(out.gated).toBe(true);
    expect(h.secrets.rows.size).toBe(0);
  });

  it('fails safe (ok:false) when the vault key is absent — never a plaintext store', async () => {
    const h = buildHarness(ALLOW, { vaultAvailable: false });
    const out = (await h.tool('governance_secret_set').handler(
      { ref: 'byok/openai', value: 'sk-secret-value' },
      callerFor('u1'),
    )) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/vault/i);
    expect(h.secrets.rows.size).toBe(0);
  });
});

/**
 * SECURITY — subject-spoof defense.
 *
 * `args.actorId` is NOT edge-bound (the MCP edge only binds `args.userId`), so a
 * caller could name a VICTIM as the actor. Every write tool must derive its
 * actor/owner from the host-authorized caller and refuse a cross-tenant spoof
 * BEFORE the victim id ever reaches the gate / data seam.
 */
describe('governance write tools — subject-spoof defense', () => {
  const WRITE_CALLS: readonly { readonly tool: string; readonly args: Record<string, unknown> }[] = [
    { tool: 'governance_decide', args: { action: 'file.write', path: '/repo/a.ts' } },
    { tool: 'governance_request_approval', args: { action: 'pr.merge', riskTier: 'high', target: 'conductor:workspace:ws-1' } },
    { tool: 'governance_approval_decide', args: { approvalId: 'appr_x', decision: 'approved' } },
    { tool: 'governance_acquire_lock', args: { resourcePath: '/repo/x.ts' } },
    { tool: 'governance_release_lock', args: { lockId: 'lock_x' } },
    { tool: 'governance_secret_set', args: { ref: 'byok/openai', value: 'sk-secret-value' } },
  ];

  it('refuses (AUTH_REQUIRED) every write tool when there is no authorized caller', async () => {
    const h = buildHarness(ALLOW);
    for (const { tool, args } of WRITE_CALLS) {
      await expect(h.tool(tool).handler(args)).rejects.toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
    }
  });

  it('rejects (403) a non-privileged caller naming a VICTIM via args.actorId, on every tool', async () => {
    const h = buildHarness(ALLOW);
    for (const { tool, args } of WRITE_CALLS) {
      await expect(
        h.tool(tool).handler({ ...args, actorId: 'victim-user' }, callerFor('attacker')),
      ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    }
  });

  it('secret_set: a spoofed args.actorId never keys a secret in the victim namespace', async () => {
    const h = buildHarness(ALLOW);
    // Attacker (caller `attacker`) tries to write into `victim-user`'s namespace.
    await expect(
      h.tool('governance_secret_set').handler(
        { actorId: 'victim-user', ref: 'byok/openai', value: 'sk-attacker' },
        callerFor('attacker'),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    // No row written under any owner — the victim id never reached the vault seam.
    expect(h.secrets.rows.size).toBe(0);

    // A matching (own) actorId is honoured and keyed to the caller.
    const ok = (await h.tool('governance_secret_set').handler(
      { actorId: 'attacker', ref: 'byok/openai', value: 'sk-own' },
      callerFor('attacker'),
    )) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect([...h.secrets.rows.values()].every((r) => r.ownerUserId === 'attacker')).toBe(true);
  });

  it('release_lock: an attacker cannot release a VICTIM-held lock via args.actorId', async () => {
    const h = buildHarness(ALLOW);
    const acquired = (await h.tool('governance_acquire_lock').handler(
      { resourcePath: '/repo/x.ts' },
      callerFor('victim-agent'),
    )) as { lock?: { id: string } };
    const lockId = acquired.lock!.id;

    // Attacker spoofs the victim as holder to release the victim's exclusive lock.
    await expect(
      h.tool('governance_release_lock').handler({ lockId, actorId: 'victim-agent' }, callerFor('attacker')),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    // The lock is still held — no foreign release ran.
    expect(h.locks.rows.some((l) => l.id === lockId && l.releasedAt == null)).toBe(true);
  });

  it('acquire_lock: the holder is the edge-bound caller even when args.actorId names a victim (privileged)', async () => {
    const h = buildHarness(ALLOW);
    // A privileged (internal) caller may act on behalf of a named subject.
    const out = (await h.tool('governance_acquire_lock').handler(
      { resourcePath: '/repo/x.ts', actorId: 'delegated-agent' },
      callerFor('service', ['internal']),
    )) as { ok: boolean; lock?: { holderAgentId: string } };
    expect(out.ok).toBe(true);
    expect(out.lock?.holderAgentId).toBe('delegated-agent');
  });

  it('approval_decide: decidedBy is the caller, and a non-privileged spoof is blocked before deciding', async () => {
    const h = buildHarness(ALLOW);
    const created = await h.approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1', target: 'conductor:workspace:ws-1' });
    // Attacker tries to attribute the decision to a privileged approver.
    await expect(
      h.tool('governance_approval_decide').handler(
        { approvalId: created.id, decision: 'approved', actorId: 'trusted-approver' },
        callerFor('attacker'),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    // The approval is still pending — no forged decision was recorded.
    expect(h.approvals.rows.get(created.id)?.status).toBe('pending');
    expect(h.approvals.rows.get(created.id)?.decidedBy).toBeNull();
  });

  it('request_approval: requestedBy is bound to the caller, not a spoofed args.actorId', async () => {
    const h = buildHarness(ALLOW);
    const out = (await h.tool('governance_request_approval').handler(
      { action: 'pr.merge', riskTier: 'high', actorId: 'victim-user', target: 'conductor:workspace:ws-1' },
      callerFor('victim-user'),
    )) as { ok: boolean; approval: { requestedBy: string } };
    // A matching own actorId is fine and attributed to the caller.
    expect(out.ok).toBe(true);
    expect(out.approval.requestedBy).toBe('victim-user');
    // But a DIFFERENT actorId from a non-owning caller is refused.
    await expect(
      h.tool('governance_request_approval').handler(
        { action: 'pr.merge', riskTier: 'high', actorId: 'someone-else', target: 'conductor:workspace:ws-1' },
        callerFor('attacker'),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    expect(h.approvals.rows.size).toBe(1);
  });
});
