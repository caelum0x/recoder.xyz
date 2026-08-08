import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitConfigs: { auth: {} },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/verification-store', () => ({
  findValidVerificationByIdentifierAndHashedValue: vi.fn(async () => null),
  consumeVerification: vi.fn(),
}));

import { findValidVerificationByIdentifierAndHashedValue } from '@/lib/auth/verification-store';
import { POST, GET } from '../route';

const postReq = (body: unknown) =>
  new Request('http://localhost/api/auth/verify-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
const getReq = (qs: string) => new Request(`http://localhost/api/auth/verify-code?${qs}`) as never;

describe('POST/GET /api/auth/verify-code — a code is scoped to its email (recoder-hdu7)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST without email → 400 and never looks up a verification (no cross-account match)', async () => {
    const res = await POST(postReq({ code: '123456' }));
    expect(res.status).toBe(400);
    expect(findValidVerificationByIdentifierAndHashedValue).not.toHaveBeenCalled();
  });

  it('POST with email scopes the lookup to email-code:<email> (not a prefix match)', async () => {
    await POST(postReq({ code: '123456', email: 'a@b.com' }));
    expect(findValidVerificationByIdentifierAndHashedValue).toHaveBeenCalledWith('email-code:a@b.com', expect.any(String));
  });

  it('GET status check without email → 400 (no cross-account existence oracle)', async () => {
    const res = await GET(getReq('code=123456'));
    expect(res.status).toBe(400);
  });
});
