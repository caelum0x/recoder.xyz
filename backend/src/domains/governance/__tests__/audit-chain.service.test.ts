import { describe, it, expect, vi } from 'vitest';
import { AuditChainService } from '../services/audit-chain.service.js';
import { AUDIT_GENESIS_HASH } from '../types.js';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { AuditEntryInput } from '../types.js';
import { InMemoryAuditRepository } from './_fakes.js';

function makeEntry(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    actorId: 'u1',
    action: 'file.write',
    resource: '/repo/a.ts',
    effect: 'allow',
    riskTier: 'medium',
    degraded: false,
    payload: { k: 'v' },
    ...overrides,
  };
}

describe('AuditChainService — tamper-evident Merkle chain', () => {
  it('seals the first entry from the genesis tip and returns a record', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(repo);

    const rec = await svc.append(makeEntry());
    expect(rec.seq).toBe(1);
    expect(rec.prevHash).toBe(AUDIT_GENESIS_HASH);
    expect(rec.entryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Merkle-links each appended entry to the previous tip', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(repo);

    const first = await svc.append(makeEntry({ resource: '/a' }));
    const second = await svc.append(makeEntry({ resource: '/b' }));

    expect(second.prevHash).toBe(first.entryHash);
    expect((await svc.tip())?.entryHash).toBe(second.entryHash);
  });

  it('verify() passes on an untampered chain', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(repo);
    await svc.append(makeEntry({ resource: '/a', effect: 'allow' }));
    await svc.append(makeEntry({ resource: '/b', effect: 'deny' }));

    const v = await svc.verify();
    expect(v.ok).toBe(true);
    expect(v.entries).toBe(2);
    expect(v.tipHash).toBe((await svc.tip())?.entryHash);
  });

  it('verify() DETECTS a mutated record (in-place tamper breaks the hash)', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(repo);
    await svc.append(makeEntry({ resource: '/a', effect: 'allow' }));
    await svc.append(makeEntry({ resource: '/b', effect: 'deny' }));
    expect((await svc.verify()).ok).toBe(true);

    // Tamper: flip the first record's effect allow -> deny. The stored entryHash
    // is now stale; a re-walk must catch it.
    const row = repo.rows[0]!;
    repo.rows[0] = { ...row, effect: 'deny' };

    const v = await svc.verify();
    expect(v.ok).toBe(false);
    expect(v.brokenAtSeq).toBe(1);
  });

  it('verify() detects a payload mutation too', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(repo);
    await svc.append(makeEntry());
    const row = repo.rows[0]!;
    repo.rows[0] = { ...row, payload: { k: 'tampered' } };

    expect((await svc.verify()).ok).toBe(false);
  });

  it('range() scopes the durable chain by workspaceId (per-workspace trail)', async () => {
    const repo = new InMemoryAuditRepository();
    const svc = new AuditChainService(repo);
    await svc.append(makeEntry({ action: 'workspace.merge', payload: { workspaceId: 'ws_a' } }));
    await svc.append(makeEntry({ action: 'workspace.pr', payload: { workspaceId: 'ws_b' } }));
    await svc.append(makeEntry({ action: 'workspace.advance', payload: { workspaceId: 'ws_a' } }));

    const trail = await svc.range({ workspaceId: 'ws_a' });
    expect(trail.map((r) => r.action)).toEqual(['workspace.merge', 'workspace.advance']);
    expect((await svc.range({ workspaceId: 'ws_none' })).length).toBe(0);
  });

  it('cross-checks the kernel tip and reports a match', async () => {
    const repo = new InMemoryAuditRepository();
    const dbTipHolder = { tip: '' };
    const kernel = {
      auditTip: vi.fn(async () => dbTipHolder.tip),
    } as unknown as GovernanceKernelPort;
    const svc = new AuditChainService(repo, kernel);

    await svc.append(makeEntry());
    dbTipHolder.tip = (await svc.tip())!.entryHash;

    const v = await svc.verify();
    expect(v.ok).toBe(true);
    expect(v.kernelTipMatches).toBe(true);
  });

  it('surfaces a kernel/DB tip divergence rather than hiding it', async () => {
    const repo = new InMemoryAuditRepository();
    const kernel = {
      auditTip: vi.fn(async () => 'a-different-tip'),
    } as unknown as GovernanceKernelPort;
    const svc = new AuditChainService(repo, kernel);
    await svc.append(makeEntry());

    const v = await svc.verify();
    expect(v.ok).toBe(true); // DB chain intact
    expect(v.kernelTipMatches).toBe(false); // but divergence flagged
  });

  it('does not fail the DB verdict when the kernel tip probe throws', async () => {
    const repo = new InMemoryAuditRepository();
    const kernel = {
      auditTip: vi.fn(async () => {
        throw new Error('kernel down');
      }),
    } as unknown as GovernanceKernelPort;
    const svc = new AuditChainService(repo, kernel);
    await svc.append(makeEntry());

    const v = await svc.verify();
    expect(v.ok).toBe(true);
    expect(v.kernelTipMatches).toBeUndefined();
  });
});
