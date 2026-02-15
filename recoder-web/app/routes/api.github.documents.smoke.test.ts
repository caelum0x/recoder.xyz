import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifySession } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

import { action } from './api.github.documents';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('api.github.documents smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 405 for non-POST requests', async () => {
    const request = { method: 'GET' } as any;
    const response = await action({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(405);
  });

  it('returns 401 when unauthenticated', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({}),
    } as any;
    const response = await action({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });
});
