import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;

describe('getSessionAccessToken', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.resetModules();
  });

  it('deduplicates concurrent token requests', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { accessToken: 'shared-token' } }), { status: 200 })
    );

    const { getSessionAccessToken } = await import('@/lib/auth/session-token');

    const [first, second] = await Promise.all([
      getSessionAccessToken(),
      getSessionAccessToken(),
    ]);

    expect(first).toBe('shared-token');
    expect(second).toBe('shared-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('caches failed fetches briefly to avoid repeated 502 storms', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

    const { getSessionAccessToken } = await import('@/lib/auth/session-token');

    await expect(getSessionAccessToken()).resolves.toBeNull();
    await expect(getSessionAccessToken()).resolves.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9_999);
    await expect(getSessionAccessToken()).resolves.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(getSessionAccessToken()).resolves.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
