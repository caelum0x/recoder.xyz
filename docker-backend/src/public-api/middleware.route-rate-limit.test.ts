import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckSlidingWindowLimit } = vi.hoisted(() => ({
  mockCheckSlidingWindowLimit: vi.fn(),
}));

vi.mock('./rate-limiter.js', async () => {
  const actual = await vi.importActual<any>('./rate-limiter.js');
  return {
    ...actual,
    checkSlidingWindowLimit: mockCheckSlidingWindowLimit,
  };
});

import { requireRouteRateLimit } from './middleware.js';

function createRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 200,
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status: vi.fn().mockImplementation(function status(this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(),
  } as any;
}

describe('requireRouteRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows request when under limit', () => {
    mockCheckSlidingWindowLimit.mockReturnValueOnce({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60000,
    });

    const req = {
      requestId: 'r1',
      apiKey: { id: 'k1', tier: 'free' },
    } as any;
    const res = createRes();
    const next = vi.fn();

    requireRouteRateLimit('projectPrompt')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['RateLimit-Limit']).toBe('20');
    expect(res.headers['RateLimit-Policy']).toBe('20;w=60');
  });

  it('rejects request when over limit', () => {
    mockCheckSlidingWindowLimit.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });

    const req = {
      requestId: 'r2',
      apiKey: { id: 'k1', tier: 'free' },
    } as any;
    const res = createRes();
    const next = vi.fn();

    requireRouteRateLimit('projectPrompt')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
