import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { hasSessionCookieMock, extractSessionTokenMock } = vi.hoisted(() => ({
  hasSessionCookieMock: vi.fn(),
  extractSessionTokenMock: vi.fn(),
}));

vi.mock('@recoder/auth/edge', () => ({
  hasSessionCookie: hasSessionCookieMock,
  extractSessionToken: extractSessionTokenMock,
}));

describe('middleware /v1 bypass', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hasSessionCookieMock.mockReturnValue(false);
    extractSessionTokenMock.mockReturnValue(null);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('does not redirect proxied /v1 requests to auth', async () => {
    const { middleware } = await import('@/middleware');
    const request = new NextRequest('https://agents.recoder.xyz/v1/health', {
      headers: new Headers(),
    });

    const response = await middleware(request);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });
});
