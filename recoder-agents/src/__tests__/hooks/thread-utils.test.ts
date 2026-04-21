import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getThreadApiMock } = vi.hoisted(() => ({
  getThreadApiMock: vi.fn(),
}));

vi.mock('@/lib/api/threads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/threads')>(
    '@/lib/api/threads',
  );

  return {
    ...actual,
    getThread: getThreadApiMock,
  };
});

describe('thread utils getThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates thread lookup to the shared API helper', async () => {
    getThreadApiMock.mockResolvedValue({
      thread_id: 'thread-123',
      project_id: 'project-1',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      metadata: {},
    });

    const { getThread } = await import('@/hooks/threads/utils');
    const thread = await getThread('thread-123');

    expect(thread.thread_id).toBe('thread-123');
    expect(getThreadApiMock).toHaveBeenCalledWith('thread-123');
  });
});
