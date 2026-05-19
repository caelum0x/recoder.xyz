import { NextRequest, NextResponse } from 'next/server';

const { intlHandler, hasSessionCookie } = vi.hoisted(() => ({
  intlHandler: vi.fn(() => new Response(null, { status: 200 })),
  hasSessionCookie: vi.fn(() => false),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => intlHandler,
}));

vi.mock('@recoder/auth/edge', () => ({
  hasSessionCookie,
}));

import middleware from '@/middleware';

describe('app middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intlHandler.mockImplementation(() => NextResponse.next());
    hasSessionCookie.mockReturnValue(false);
  });

  it('redirects the www host to the apex host', async () => {
    const request = new NextRequest('https://www.recoder.xyz/pricing?utm_source=test');
    const response = await middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://recoder.xyz/pricing?utm_source=test');
    expect(intlHandler).not.toHaveBeenCalled();
  });

  it('allows the apex host to continue through the app middleware chain', async () => {
    const request = new NextRequest('https://recoder.xyz/pricing');
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(intlHandler).toHaveBeenCalledTimes(1);
  });
});
