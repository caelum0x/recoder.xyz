/**
 * Governance READ MCP tools — cross-tenant subject-binding defense.
 *
 * `governance_locks_list` serves tenant-owned rows (a lock's `holderAgentId` +
 * `resourcePath` + `taskId` reveal what an agent is working on) and its
 * `holderAgentId` filter is caller-supplied. The MCP host gate admits the READ but
 * does not scope WHICH holder's rows come back, so the handler must derive the
 * holder scope from the HOST-AUTHORIZED caller (2nd handler param) — NEVER from a
 * free-form arg. These tests prove a non-privileged caller cannot enumerate a
 * VICTIM's locks (nor list every tenant's via an absent filter), while an
 * admin/internal caller may target an arbitrary holder.
 *
 * `governance_kernel_status` and `governance_audit_verify` expose only GLOBAL,
 * non-tenant introspection, so they carry no subject and stay caller-agnostic.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGovernanceReadTools,
  type GovernanceReadSurface,
} from '../mcp/governance-engine.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import { createWorkLockService } from '../services/work-lock.service.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { ErrorCode } from '../../../shared/errors.js';
import type { WorkLock } from '../types.js';
import {
  InMemoryAuditRepository,
  InMemoryWorkLockRepository,
  fakeKernel,
  silentLogger,
} from './_fakes.js';

/** The host-authorized, edge-bound caller a real MCP call threads to the handler. */
function callerFor(userId: string, scopes: readonly string[] = ['read']): McpToolCaller {
  return { userId, scopes };
}

interface Harness {
  readonly tools: readonly McpToolRegistration[];
  readonly locks: InMemoryWorkLockRepository;
  tool(name: string): McpToolRegistration;
}

/** Seed one active exclusive lock under a given holder + task. */
async function seedLock(
  repo: InMemoryWorkLockRepository,
  holderAgentId: string,
  resourcePath: string,
  taskId: string,
): Promise<void> {
  await repo.acquire({
    resourcePath,
    holderAgentId,
    taskId,
    mode: 'exclusive',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
}

function buildHarness(): Harness {
  const lockRepo = new InMemoryWorkLockRepository();
  const auditRepo = new InMemoryAuditRepository();
  const surface: GovernanceReadSurface = {
    kernel: () => fakeKernel(),
    audit: () => new AuditChainService(auditRepo),
    workLocks: () => createWorkLockService({ repo: lockRepo, logger: silentLogger }),
  };
  const tools = buildGovernanceReadTools(surface);
  return {
    tools,
    locks: lockRepo,
    tool: (name) => {
      const t = tools.find((x) => x.name === name);
      if (!t) throw new Error(`tool ${name} not registered`);
      return t;
    },
  };
}

describe('governance read MCP tools — surface', () => {
  it('registers the three read-only introspection tools', () => {
    const { tools } = buildHarness();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'governance_audit_verify',
      'governance_kernel_status',
      'governance_locks_list',
    ]);
  });

  it('kernel_status / audit_verify are global (non-tenant) and caller-agnostic', async () => {
    const h = buildHarness();
    const status = (await h.tool('governance_kernel_status').handler({})) as { engine: string };
    expect(status.engine).toBe('ts');
    const verify = (await h.tool('governance_audit_verify').handler({})) as { ok: boolean };
    expect(verify.ok).toBe(true);
  });
});

describe('governance_locks_list — cross-tenant subject-binding defense', () => {
  it('refuses (AUTH_REQUIRED) when there is no authorized caller (no global leak)', async () => {
    const h = buildHarness();
    await seedLock(h.locks, 'victim-agent', '/repo/secret.ts', 't-victim');
    await expect(h.tool('governance_locks_list').handler({})).rejects.toMatchObject({
      code: ErrorCode.AUTH_REQUIRED,
    });
  });

  it('a non-privileged caller sees ONLY its own locks even with no filter (no cross-tenant disclosure)', async () => {
    const h = buildHarness();
    await seedLock(h.locks, 'victim-agent', '/repo/victim.ts', 't-victim');
    await seedLock(h.locks, 'attacker', '/repo/own.ts', 't-own');

    const out = (await h.tool('governance_locks_list').handler({}, callerFor('attacker'))) as {
      locks: readonly WorkLock[];
    };
    expect(out.locks).toHaveLength(1);
    expect(out.locks[0]!.holderAgentId).toBe('attacker');
    // The victim's lock (and its resourcePath) never reached the caller.
    expect(out.locks.some((l) => l.holderAgentId === 'victim-agent')).toBe(false);
    expect(JSON.stringify(out)).not.toContain('victim.ts');
  });

  it('rejects (403) a non-privileged caller naming a VICTIM via args.holderAgentId', async () => {
    const h = buildHarness();
    await seedLock(h.locks, 'victim-agent', '/repo/victim.ts', 't-victim');
    await expect(
      h.tool('governance_locks_list').handler({ holderAgentId: 'victim-agent' }, callerFor('attacker')),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
  });

  it('a spoofed taskId filter cannot cross the holder boundary (still scoped to the caller)', async () => {
    const h = buildHarness();
    // Victim holds a lock under task `t-victim`; attacker names that same task.
    await seedLock(h.locks, 'victim-agent', '/repo/victim.ts', 't-victim');
    const out = (await h.tool('governance_locks_list').handler(
      { taskId: 't-victim' },
      callerFor('attacker'),
    )) as { locks: readonly WorkLock[] };
    // Holder is forced to the caller; the victim's task rows are invisible.
    expect(out.locks).toHaveLength(0);
  });

  it('an admin/internal caller may target an arbitrary holder', async () => {
    const h = buildHarness();
    await seedLock(h.locks, 'victim-agent', '/repo/victim.ts', 't-victim');
    const out = (await h.tool('governance_locks_list').handler(
      { holderAgentId: 'victim-agent' },
      callerFor('service', ['internal']),
    )) as { locks: readonly WorkLock[] };
    expect(out.locks).toHaveLength(1);
    expect(out.locks[0]!.holderAgentId).toBe('victim-agent');
  });

  it('an admin caller with no filter may list ALL holders (cross-tenant conflict visibility)', async () => {
    const h = buildHarness();
    await seedLock(h.locks, 'agent-a', '/repo/a.ts', 't-a');
    await seedLock(h.locks, 'agent-b', '/repo/b.ts', 't-b');
    const out = (await h.tool('governance_locks_list').handler({}, callerFor('ops', ['admin']))) as {
      locks: readonly WorkLock[];
    };
    expect(out.locks).toHaveLength(2);
  });
});
