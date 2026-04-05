import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/session-token', () => ({
  getSessionAccessToken: vi.fn().mockResolvedValue('session-token'),
}));

import { connectTokenizedSSE } from '@/lib/realtime/sse';

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('connectTokenizedSSE', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shares a cooldown across repeated failures for the same endpoint', async () => {
    const states: string[] = [];

    const first = connectTokenizedSSE({
      url: 'https://agents.recoder.xyz/v1/notifications/stream',
      reconnectDelayMs: 10,
      maxReconnectDelayMs: 10,
      maxReconnectAttempts: 1,
      circuitBreakerCooldownMs: 1000,
      onStateChange: (state) => states.push(state),
    });

    await flushAsync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10);
    await flushAsync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(states).toContain('error');

    const second = connectTokenizedSSE({
      url: 'https://agents.recoder.xyz/v1/notifications/stream',
      reconnectDelayMs: 10,
      maxReconnectDelayMs: 10,
      maxReconnectAttempts: 1,
      circuitBreakerCooldownMs: 1000,
    });

    await flushAsync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(999);
    await flushAsync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await flushAsync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);

    first.close();
    second.close();
  });
});
