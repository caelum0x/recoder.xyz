import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../shared/logger.js';
import type { Principal } from '../domains/identity/types.js';
import { reconcileOnBoot, SYSTEM_RECONCILE_PRINCIPAL } from './conductor-reconcile-on-boot.js';

const noopLog = {
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {},
  child: () => noopLog,
} as unknown as Logger;

describe('conductor reconcile-on-boot (item #7 — surviving runs re-attach after restart)', () => {
  it('invokes the reconcile op exactly once, under an internal system principal', async () => {
    const reconcile = vi.fn(async (_p: Principal) => ({ ok: true }));
    await reconcileOnBoot({ conductor: { reconcile }, principal: SYSTEM_RECONCILE_PRINCIPAL, logger: noopLog });
    expect(reconcile).toHaveBeenCalledTimes(1);
    const passed = reconcile.mock.calls[0]![0];
    expect(passed.kind).toBe('internal');
    expect(passed.isAnonymous).toBe(false);
  });

  it('a THROWN reconcile error does NOT crash boot (degrade-safe, swallowed)', async () => {
    const reconcile = vi.fn(async () => {
      throw new Error('substrate scan blew up');
    });
    await expect(
      reconcileOnBoot({ conductor: { reconcile }, principal: SYSTEM_RECONCILE_PRINCIPAL, logger: noopLog }),
    ).resolves.toBeUndefined();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('a REJECTED reconcile promise is also swallowed', async () => {
    const reconcile = vi.fn(() => Promise.reject(new Error('gate denied')));
    await expect(
      reconcileOnBoot({ conductor: { reconcile }, principal: SYSTEM_RECONCILE_PRINCIPAL, logger: noopLog }),
    ).resolves.toBeUndefined();
  });

  it('the system principal carries write scope so the reconcile gate admits it', () => {
    expect(SYSTEM_RECONCILE_PRINCIPAL.scopes).toContain('write');
    expect(SYSTEM_RECONCILE_PRINCIPAL.scopes).toContain('internal');
  });
});
