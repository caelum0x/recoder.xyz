import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/session-token', () => ({
  getSessionAccessToken: vi.fn().mockResolvedValue(null),
  requireSessionAccessToken: vi.fn(),
}));

vi.mock('@/lib/runtime-urls', () => ({
  resolveBrowserBackendApiUrl: vi.fn(() => 'https://agents.recoder.xyz/v1'),
}));

const { backendApiGetMock } = vi.hoisted(() => ({
  backendApiGetMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  backendApi: {
    get: backendApiGetMock,
  },
}));

describe('thread collection APIs', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns an empty message list when the thread messages endpoint returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Not found', { status: 404 }),
    );

    const { getMessages } = await import('@/lib/api/threads');
    const messages = await getMessages('missing-thread');

    expect(messages).toEqual([]);
  });

  it('falls back to the paginated thread list when direct thread lookup returns 404', async () => {
    backendApiGetMock
      .mockResolvedValueOnce({
        error: {
          status: 404,
          message: 'Not found',
        },
      })
      .mockResolvedValueOnce({
        data: {
          threads: [
            {
              thread_id: 'missing-thread',
              project_id: 'project-1',
              created_at: '2026-04-01T00:00:00Z',
              updated_at: '2026-04-01T00:00:00Z',
              metadata: {},
            },
          ],
          pagination: {
            page: 1,
            limit: 100,
            total: 1,
            pages: 1,
          },
        },
      });

    const { getThread } = await import('@/lib/api/threads');
    const thread = await getThread('missing-thread');

    expect(thread.thread_id).toBe('missing-thread');
    expect(backendApiGetMock).toHaveBeenNthCalledWith(
      1,
      '/threads/missing-thread',
      { showErrors: false },
    );
    expect(backendApiGetMock).toHaveBeenNthCalledWith(
      2,
      '/threads?page=1&limit=100',
      { showErrors: true },
    );
  });

  it('returns an empty agent run list when the thread agent-runs endpoint returns 404', async () => {
    backendApiGetMock.mockResolvedValue({
      error: {
        status: 404,
        message: 'Not found',
      },
    });

    const { getAgentRuns } = await import('@/lib/api/agents');
    const agentRuns = await getAgentRuns('missing-thread');

    expect(agentRuns).toEqual([]);
    expect(backendApiGetMock).toHaveBeenCalledWith(
      '/thread/missing-thread/agent-runs',
      { showErrors: false, cache: 'no-store' },
    );
  });
});
