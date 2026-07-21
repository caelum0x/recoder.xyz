import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuthMock = vi.fn();

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
}));

// The break-glass secret path returns before prisma is touched; still mock it
// so the module import never reaches for a real DB client.
vi.mock('@/lib/prisma', () => ({
  prisma: { users: { findFirst: vi.fn() } },
}));

import { ensureAdminAccess } from './admin-auth';

function makeRequest(headers: Record<string, string>): any {
  const map = new Map<string, string>();
  Object.entries(headers).forEach(([k, v]) => map.set(k.toLowerCase(), v));
  return {
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
    },
  };
}

describe('ensureAdminAccess break-glass secret compare', () => {
  const ORIGINAL = process.env.ADMIN_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'super-secret-break-glass-value';
    // Any fall-through to the session path fails, so a non-secret grant is observable.
    requireAuthMock.mockResolvedValue({
      error: true,
      response: { status: 401 },
    });
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = ORIGINAL;
  });

  it('grants admin via secret when the header matches exactly', async () => {
    const result = await ensureAdminAccess(
      makeRequest({ 'x-admin-secret': 'super-secret-break-glass-value' })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.admin.via).toBe('secret');
    expect(requireAuthMock).not.toHaveBeenCalled();
  });

  it('rejects a header that shares a long common prefix but differs', async () => {
    const result = await ensureAdminAccess(
      makeRequest({ 'x-admin-secret': 'super-secret-break-glass-valueX' })
    );
    expect(result.ok).toBe(false);
    // Fell through to the (failing) session path instead of granting via secret.
    expect(requireAuthMock).toHaveBeenCalledOnce();
  });

  it('rejects a header of a different length', async () => {
    const result = await ensureAdminAccess(
      makeRequest({ 'x-admin-secret': 'short' })
    );
    expect(result.ok).toBe(false);
    expect(requireAuthMock).toHaveBeenCalledOnce();
  });

  it('does not grant via secret when ADMIN_SECRET is unset', async () => {
    delete process.env.ADMIN_SECRET;
    const result = await ensureAdminAccess(
      makeRequest({ 'x-admin-secret': 'anything' })
    );
    expect(result.ok).toBe(false);
    expect(requireAuthMock).toHaveBeenCalledOnce();
  });
});
