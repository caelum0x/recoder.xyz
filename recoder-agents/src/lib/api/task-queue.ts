import { backendApi } from '@/lib/api-client';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retrying';

export interface QueuedTask {
  id: string;
  user_id: string;
  agent_id: string | null;
  task_type: string;
  task_name: string;
  payload: Record<string, unknown>;
  priority: number;
  status: TaskStatus;
  max_retries: number;
  retry_count: number;
  retry_delay_seconds: number;
  result: Record<string, unknown>;
  error_message: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface TaskQueueStats {
  pending_count: number;
  running_count: number;
  completed_count: number;
  failed_count: number;
  cancelled_count: number;
  retrying_count: number;
  avg_wait_seconds: number;
  avg_run_seconds: number;
}

export interface EnqueueTaskData {
  task_type: string;
  task_name: string;
  agent_id?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  max_retries?: number;
  retry_delay_seconds?: number;
  scheduled_at?: string;
}

export interface TaskFilters {
  status?: TaskStatus;
  agent_id?: string;
  task_type?: string;
  limit?: number;
  offset?: number;
}

export const enqueueTask = async (data: EnqueueTaskData): Promise<QueuedTask> => {
  const response = await backendApi.post<QueuedTask>('/tasks/queue', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listTasks = async (filters?: TaskFilters): Promise<QueuedTask[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.task_type) params.set('task_type', filters.task_type);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  const response = await backendApi.get<QueuedTask[]>(
    `/tasks/queue${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTask = async (taskId: string): Promise<QueuedTask> => {
  const response = await backendApi.get<QueuedTask>(
    `/tasks/queue/${taskId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const cancelTask = async (taskId: string): Promise<QueuedTask> => {
  const response = await backendApi.post<QueuedTask>(`/tasks/queue/${taskId}/cancel`, {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const retryTask = async (taskId: string): Promise<QueuedTask> => {
  const response = await backendApi.post<QueuedTask>(`/tasks/queue/${taskId}/retry`, {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const completeTask = async (
  taskId: string,
  result?: Record<string, unknown>
): Promise<QueuedTask> => {
  const response = await backendApi.post<QueuedTask>(`/tasks/queue/${taskId}/complete`, {
    result: result ?? {},
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const failTask = async (
  taskId: string,
  errorMessage?: string
): Promise<QueuedTask> => {
  const response = await backendApi.post<QueuedTask>(`/tasks/queue/${taskId}/fail`, {
    error_message: errorMessage,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getQueueStats = async (): Promise<TaskQueueStats> => {
  const response = await backendApi.get<TaskQueueStats>(
    '/tasks/queue/stats',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteCompletedTasks = async (days: number = 7): Promise<{ deleted_count: number }> => {
  const response = await backendApi.delete(`/tasks/queue/completed?days=${days}`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted_count: number };
};
