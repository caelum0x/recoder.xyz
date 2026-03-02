/**
 * A2A Task API Client
 *
 * Fetches delegated tasks from the SFA-003 task lifecycle API.
 * Base URL is configurable via EXPO_PUBLIC_A2A_API_URL env var,
 * falling back to the standard backend URL.
 */

import { API_URL, getAuthHeaders } from '@/api/config';
import { log } from '@/lib/logger';
import type {
  DelegatedTask,
  TaskListResponse,
  TaskDetailResponse,
  TaskApproval,
  TaskListParams,
  TaskState,
} from './types';

const A2A_BASE_URL =
  process.env.EXPO_PUBLIC_A2A_API_URL?.replace(/\/+$/, '') ||
  API_URL;

function a2aUrl(path: string): string {
  return `${A2A_BASE_URL}/api/a2a${path}`;
}

/**
 * Safely normalise a raw task object from the API into our DelegatedTask shape.
 * Gracefully handles missing or unexpected fields.
 */
function normaliseDelegatedTask(raw: Record<string, unknown>): DelegatedTask {
  const validStates = new Set<TaskState>([
    'submitted',
    'working',
    'input-required',
    'completed',
    'failed',
    'cancelled',
  ]);

  const rawState = typeof raw.state === 'string' ? raw.state : typeof raw.status === 'string' ? raw.status : 'submitted';
  const state: TaskState = validStates.has(rawState as TaskState)
    ? (rawState as TaskState)
    : 'submitted';

  return {
    id: String(raw.id ?? raw.taskId ?? ''),
    title: typeof raw.title === 'string' ? raw.title : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    state,
    agentId: typeof raw.agentId === 'string' ? raw.agentId : typeof raw.agent_id === 'string' ? raw.agent_id : undefined,
    agentName: typeof raw.agentName === 'string' ? raw.agentName : typeof raw.agent_name === 'string' ? raw.agent_name : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : typeof raw.updated_at === 'string' ? raw.updated_at : new Date().toISOString(),
    stateHistory: Array.isArray(raw.stateHistory ?? raw.state_history)
      ? (raw.stateHistory ?? raw.state_history) as DelegatedTask['stateHistory']
      : undefined,
    artifacts: Array.isArray(raw.artifacts) ? raw.artifacts as DelegatedTask['artifacts'] : undefined,
    metadata: typeof raw.metadata === 'object' && raw.metadata !== null
      ? raw.metadata as Record<string, unknown>
      : undefined,
  };
}

/**
 * List delegated tasks
 * GET /api/a2a/tasks
 */
export async function fetchDelegatedTasks(
  params: TaskListParams = {},
): Promise<TaskListResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams();
  if (params.page) query.append('page', String(params.page));
  if (params.limit) query.append('limit', String(params.limit));
  if (params.state) query.append('state', params.state);

  const url = a2aUrl(`/tasks${query.toString() ? `?${query}` : ''}`);
  log.log('[A2A] Fetching tasks:', url);

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    log.error('[A2A] Failed to fetch tasks:', res.status, errorText);
    throw new Error(`Failed to fetch delegated tasks: ${res.status}`);
  }

  const data = await res.json();

  // Handle both { tasks: [...] } and direct array responses
  const rawTasks: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.tasks)
      ? data.tasks
      : [];

  const tasks: DelegatedTask[] = rawTasks
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map(normaliseDelegatedTask);

  log.log('[A2A] Loaded tasks:', tasks.length);

  return {
    tasks,
    total: typeof data?.total === 'number' ? data.total : tasks.length,
    page: typeof data?.page === 'number' ? data.page : params.page,
    limit: typeof data?.limit === 'number' ? data.limit : params.limit,
  };
}

/**
 * Get a single task by ID
 * GET /api/a2a/tasks/:taskId
 */
export async function fetchDelegatedTask(taskId: string): Promise<TaskDetailResponse> {
  const headers = await getAuthHeaders();
  const url = a2aUrl(`/tasks/${encodeURIComponent(taskId)}`);
  log.log('[A2A] Fetching task:', taskId);

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`Failed to fetch task ${taskId}: ${res.status}`);
  }

  const data = await res.json();
  return normaliseDelegatedTask(data as Record<string, unknown>);
}

/**
 * Get approval status for a task
 * GET /api/a2a/approvals/:taskId
 */
export async function fetchTaskApproval(taskId: string): Promise<TaskApproval | null> {
  const headers = await getAuthHeaders();
  const url = a2aUrl(`/approvals/${encodeURIComponent(taskId)}`);

  try {
    const res = await fetch(url, { headers });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch approval for task ${taskId}: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    log.warn('[A2A] Failed to fetch approval:', error);
    return null;
  }
}
