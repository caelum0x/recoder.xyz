import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/session-token', () => ({
  getSessionAccessToken: vi.fn().mockResolvedValue(null),
  requireSessionAccessToken: vi.fn(),
}));

vi.mock('@/lib/runtime-urls', () => ({
  resolveBrowserBackendApiUrl: vi.fn(() => 'https://agents.recoder.xyz/v1'),
}));

const { getThreadsPaginatedMock } = vi.hoisted(() => ({
  getThreadsPaginatedMock: vi.fn(),
}));

vi.mock('@/lib/api/threads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/threads')>(
    '@/lib/api/threads',
  );

  return {
    ...actual,
    getThreadsPaginated: getThreadsPaginatedMock,
  };
});

describe('thread utils getThread', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls back to the thread list when direct thread lookup returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Thread not found', { status: 404 }),
    );

    getThreadsPaginatedMock.mockResolvedValue({
      threads: [
        {
          thread_id: 'thread-123',
          project_id: 'project-1',
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
          metadata: {},
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 },
    });

    const { getThread } = await import('@/hooks/threads/utils');
    const thread = await getThread('thread-123');

    expect(thread.thread_id).toBe('thread-123');
    expect(getThreadsPaginatedMock).toHaveBeenCalledWith(undefined, 1, 100);
  });
});
