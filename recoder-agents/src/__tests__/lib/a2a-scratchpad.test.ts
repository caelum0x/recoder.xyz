import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dockerBackendGetMock } = vi.hoisted(() => ({
  dockerBackendGetMock: vi.fn(),
}));

vi.mock('@/lib/docker-backend-api', () => ({
  dockerBackendApi: {
    get: dockerBackendGetMock,
  },
}));

describe('a2a scratchpad api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only mirrored todo-board scratchpad entries', async () => {
    dockerBackendGetMock.mockResolvedValue({
      success: true,
      data: [
        {
          key: 'todo-board:codex',
          sessionId: 'shared-session-1',
          agentId: 'codex',
          createdAt: '2026-04-12T00:00:00Z',
          updatedAt: '2026-04-12T00:00:00Z',
          value: {
            type: 'todo_board',
            agentId: 'codex',
            localSessionId: 'local-1',
            updatedAt: '2026-04-12T00:00:00Z',
            todos: [
              {
                id: 'todo-1',
                content: 'Ship task board',
                status: 'in_progress',
              },
            ],
          },
        },
        {
          key: 'search-cache:abc',
          sessionId: 'shared-session-1',
          agentId: 'search-proxy',
          createdAt: '2026-04-12T00:00:00Z',
          updatedAt: '2026-04-12T00:00:00Z',
          value: {
            type: 'search_results',
          },
        },
      ],
    });

    const { listMirroredTodoBoards } = await import('@/lib/api/a2a-scratchpad');
    const boards = await listMirroredTodoBoards('shared-session-1');

    expect(dockerBackendGetMock).toHaveBeenCalledWith(
      '/api/a2a/scratchpad/list?sessionId=shared-session-1',
    );
    expect(boards).toHaveLength(1);
    expect(boards[0].key).toBe('todo-board:codex');
    expect(boards[0].value.todos[0].content).toBe('Ship task board');
  });
});
