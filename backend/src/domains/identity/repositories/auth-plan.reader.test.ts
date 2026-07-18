/**
 * AuthPlanReader — the website plan-read seam (billing `resolveAuthPlan` half).
 *
 * Proves: an ACTIVE/TRIALING subscription returns its raw plan; a cancelled/past-
 * due/unknown status collapses to `null` (no elevation); an empty/blank plan or a
 * missing row is `null`; a blank subject id short-circuits without querying; and a
 * query fault is swallowed to `null` (never a thrown 500, never a fabricated tier).
 */
import { describe, it, expect, vi } from 'vitest';
import { createAuthPlanReader, type AuthPlanQuery, type AuthPlanRow } from './auth-plan.reader.js';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

/** A reader over a fixed row (or null) for the happy/degrade cases. */
function readerFor(row: AuthPlanRow | null): ReturnType<typeof createAuthPlanReader> {
  return createAuthPlanReader(async () => row, logger);
}

describe('AuthPlanReader.readPlan', () => {
  it('returns the plan for an active subscription', async () => {
    await expect(readerFor({ plan: 'pro', status: 'active' }).readPlan('user_1')).resolves.toBe('pro');
  });

  it('returns the plan for a trialing subscription', async () => {
    await expect(readerFor({ plan: 'team', status: 'trialing' }).readPlan('user_1')).resolves.toBe('team');
  });

  it('treats a null status as effective (website default is active)', async () => {
    await expect(readerFor({ plan: 'max', status: null }).readPlan('user_1')).resolves.toBe('max');
  });

  it('does NOT elevate on a cancelled/past-due status', async () => {
    for (const status of ['cancelled', 'canceled', 'past_due', 'incomplete', 'unpaid']) {
      await expect(readerFor({ plan: 'pro', status }).readPlan('user_1')).resolves.toBeNull();
    }
  });

  it('returns null for a blank/absent plan even when active', async () => {
    for (const plan of ['', '   ', null]) {
      await expect(readerFor({ plan, status: 'active' }).readPlan('user_1')).resolves.toBeNull();
    }
  });

  it('returns null when the subject has no row', async () => {
    await expect(readerFor(null).readPlan('user_1')).resolves.toBeNull();
  });

  it('short-circuits a blank subject id without querying', async () => {
    const query = vi.fn<AuthPlanQuery>(async () => ({ plan: 'pro', status: 'active' }));
    const r = createAuthPlanReader(query, logger);
    await expect(r.readPlan('   ')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('swallows a query fault to null (never throws, never fabricates a tier)', async () => {
    const r = createAuthPlanReader(async () => {
      throw new Error('auth DB unreachable');
    }, logger);
    await expect(r.readPlan('user_1')).resolves.toBeNull();
  });
});
