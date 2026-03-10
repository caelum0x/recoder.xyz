import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/runtime-urls', () => ({
  resolveBackendApiUrl: vi.fn(() => 'https://api.test.local'),
}));

const originalFetch = globalThis.fetch;

describe('GET /api/integrations/[provider]/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects invalid provider', async () => {
    const { GET } = await import(
      '@/app/api/integrations/[provider]/callback/route'
    );

    const request = new NextRequest(
      'http://localhost/api/integrations/github/callback?code=abc&state=xyz'
    );

    const response = await GET(request, {
      params: Promise.resolve({ provider: 'github' }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('github_error=invalid_provider');
  });

  it('redirects with error when OAuth error param is present', async () => {
    const { GET } = await import(
      '@/app/api/integrations/[provider]/callback/route'
    );

    const request = new NextRequest(
      'http://localhost/api/integrations/slack/callback?error=access_denied'
    );

    const response = await GET(request, {
      params: Promise.resolve({ provider: 'slack' }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('slack_error=access_denied');
  });

  it('redirects with error when code or state is missing', async () => {
    const { GET } = await import(
      '@/app/api/integrations/[provider]/callback/route'
    );

    const request = new NextRequest(
      'http://localhost/api/integrations/slack/callback?code=abc'
    );

    const response = await GET(request, {
      params: Promise.resolve({ provider: 'slack' }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('slack_error=missing_parameters');
  });

  it('forwards code and state to backend and redirects on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { GET } = await import(
      '@/app/api/integrations/[provider]/callback/route'
    );

    const request = new NextRequest(
      'http://localhost/api/integrations/discord/callback?code=test_code&state=test_state'
    );

    const response = await GET(request, {
      params: Promise.resolve({ provider: 'discord' }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('discord_success=true');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/integrations/discord/callback'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('redirects with backend_error when backend returns non-ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );

    const { GET } = await import(
      '@/app/api/integrations/[provider]/callback/route'
    );

    const request = new NextRequest(
      'http://localhost/api/integrations/teams/callback?code=abc&state=xyz'
    );

    const response = await GET(request, {
      params: Promise.resolve({ provider: 'teams' }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('teams_error=backend_error');
  });

  it('handles fetch failure gracefully', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const { GET } = await import(
      '@/app/api/integrations/[provider]/callback/route'
    );

    const request = new NextRequest(
      'http://localhost/api/integrations/slack/callback?code=abc&state=xyz'
    );

    const response = await GET(request, {
      params: Promise.resolve({ provider: 'slack' }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('slack_error=callback_failed');
  });
});
