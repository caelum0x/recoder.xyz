import { dockerBackendApi } from '@/lib/docker-backend-api';

export type ScratchpadEntry<T = unknown> = {
  key: string;
  value: T;
  sessionId: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
};

export type MirroredTodoStatus = 'pending' | 'in_progress' | 'completed';

export type MirroredTodoItem = {
  id: string;
  content: string;
  status: MirroredTodoStatus;
};

export type MirroredTodoBoard = {
  type: 'todo_board';
  agentId: string;
  localSessionId: string;
  todos: MirroredTodoItem[];
  updatedAt: string;
};

const TODO_BOARD_PREFIX = 'todo-board:';

export async function listScratchpadEntries(
  sessionId: string,
): Promise<ScratchpadEntry[]> {
  const response = await dockerBackendApi.get<ScratchpadEntry[]>(
    `/api/a2a/scratchpad/list?sessionId=${encodeURIComponent(sessionId)}`,
  );

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Failed to load scratchpad entries');
  }

  return response.data;
}

export async function listMirroredTodoBoards(
  sessionId: string,
): Promise<ScratchpadEntry<MirroredTodoBoard>[]> {
  const entries = await listScratchpadEntries(sessionId);

  return entries.filter((entry): entry is ScratchpadEntry<MirroredTodoBoard> => {
    if (!entry.key.startsWith(TODO_BOARD_PREFIX)) {
      return false;
    }

    const value = entry.value as Partial<MirroredTodoBoard> | null;
    return value?.type === 'todo_board' && Array.isArray(value.todos);
  });
}
