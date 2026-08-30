import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(async () => ({
    error: false,
    session: { user: { id: 'owner-1' } },
  })),
}));

import { proxyRemoteContinuity } from '@/lib/remote-continuity-proxy';

describe('remote continuity origin boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RECODER_REMOTE_ALLOWED_ORIGINS', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          success: true,
          data: { session: { sessionId: 'session-1' } },
        })
      )
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('forwards a signed-in request only to a Recoder-owned tunnel origin', async () => {
    const request = new NextRequest(
      'https://recoder.xyz/api/remote/sessions/session-1?api=https%3A%2F%2Fmac-1.remote.recoder.xyz',
      { headers: { cookie: 'better-auth.session_token=fixture' } }
    );
    const response = await proxyRemoteContinuity(
      request,
      '/remote/sessions/session-1'
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://mac-1.remote.recoder.xyz/api/conductor/remote/sessions/session-1',
      expect.objectContaining({ redirect: 'manual' })
    );
    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
      .headers as Headers;
    expect(headers.get('cookie')).toBe('better-auth.session_token=fixture');
  });

  it('rejects arbitrary and quick-tunnel origins in production before forwarding credentials', async () => {
    for (const origin of [
      'https://attacker.example',
      'https://random.trycloudflare.com',
      'http://127.0.0.1:3100',
    ]) {
      const request = new NextRequest(
        `https://recoder.xyz/api/remote/sessions/session-1?api=${encodeURIComponent(origin)}`,
        { headers: { cookie: 'better-auth.session_token=fixture' } }
      );
      const response = await proxyRemoteContinuity(
        request,
        '/remote/sessions/session-1'
      );
      expect(response.status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
