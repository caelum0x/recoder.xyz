import { describe, it, expect } from 'vitest';
import { WorkLockService, DEFAULT_WORK_LOCK_TTL_MS } from '../services/work-lock.service.js';
import { AppError } from '../../../shared/errors.js';
import { InMemoryWorkLockRepository, silentLogger } from './_fakes.js';

function build() {
  const repo = new InMemoryWorkLockRepository();
  const service = new WorkLockService({ repo, logger: silentLogger });
  return { repo, service };
}

describe('WorkLockService — path conflict prevention', () => {
  it('acquires a lock on a free path', async () => {
    const { service } = build();
    const result = await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a1' });
    expect(result.acquired).toBe(true);
    expect(result.lock?.resourcePath).toBe('/repo/src');
    expect(result.lock?.mode).toBe('exclusive');
  });

  it('DENIES a conflicting exclusive acquire and surfaces the holder', async () => {
    const { service } = build();
    await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a1' });
    const second = await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a2' });

    expect(second.acquired).toBe(false);
    expect(second.lock?.holderAgentId).toBe('a1'); // the conflicting holder
    expect(second.conflictReason).toBeDefined();
  });

  it('reclaims a path once the prior lock has EXPIRED', async () => {
    const { repo, service } = build();
    // The service computes expiresAt from the real Date.now(); base the repo's
    // injectable clock on the same wall clock so advancing it crosses the TTL.
    let clock = Date.now();
    repo.now = () => clock;

    const first = await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a1', ttlMs: 1_000 });
    expect(first.acquired).toBe(true);

    // Still live: conflict.
    const blocked = await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a2' });
    expect(blocked.acquired).toBe(false);

    // Advance past the TTL — the stale lock no longer blocks.
    clock += 2_000;
    const reacquired = await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a2' });
    expect(reacquired.acquired).toBe(true);
    expect(reacquired.lock?.holderAgentId).toBe('a2');
  });

  it('release is holder-scoped (foreign release is a no-op false)', async () => {
    const { service } = build();
    const acquired = await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a1' });
    const lockId = acquired.lock!.id;

    expect(await service.release(lockId, 'intruder')).toBe(false);
    expect(await service.release(lockId, 'a1')).toBe(true);
    // Path is free again after a legitimate release.
    expect(await service.isLocked('/repo/src')).toBe(false);
  });

  it('check/isLocked reflect the active lock', async () => {
    const { service } = build();
    expect(await service.isLocked('/repo/src')).toBe(false);
    await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a1' });
    expect(await service.isLocked('/repo/src')).toBe(true);
    expect((await service.check('/repo/src'))?.holderAgentId).toBe('a1');
  });

  it('listActive can be scoped to a holder', async () => {
    const { service } = build();
    await service.acquire({ resourcePath: '/a', holderAgentId: 'a1' });
    await service.acquire({ resourcePath: '/b', holderAgentId: 'a2' });
    const forA1 = await service.listActive({ holderAgentId: 'a1' });
    expect(forA1).toHaveLength(1);
    expect(forA1[0]?.resourcePath).toBe('/a');
  });

  it('fails fast on empty resourcePath (validation at the boundary)', async () => {
    const { service } = build();
    await expect(service.acquire({ resourcePath: '  ', holderAgentId: 'a1' })).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a past explicit expiresAt', async () => {
    const { service } = build();
    const past = new Date(Date.now() - 1000).toISOString();
    await expect(
      service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a1', expiresAt: past }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('clamps an absurd TTL into the safe lease window', async () => {
    const { service } = build();
    const result = await service.acquire({ resourcePath: '/repo/src', holderAgentId: 'a1', ttlMs: Number.MAX_SAFE_INTEGER });
    const ttl = Date.parse(result.lock!.expiresAt) - Date.now();
    // Clamped to <= 24h, so far below the requested value.
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
    expect(ttl).toBeGreaterThan(0);
    expect(DEFAULT_WORK_LOCK_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});
