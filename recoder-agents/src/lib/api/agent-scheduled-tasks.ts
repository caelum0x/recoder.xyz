import { backendApi } from '@/lib/api-client';

export interface ScheduledTask {
  id: string;
  user_id: string;
  agent_id: string;
  task_name: string;
  cron_expression: string;
  cron_human: string;
  input_payload: Record<string, unknown>;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  max_retries: number;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
  agent_name?: string;
}

export interface ScheduledTaskRun {
  id: string;
  task_id: string;
  user_id: string;
  agent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timed_out' | 'skipped';
  output: Record<string, unknown>;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface TaskRunsResponse {
  runs: ScheduledTaskRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateScheduledTaskData {
  task_name: string;
  cron_expression: string;
  input_payload?: Record<string, unknown>;
  max_retries?: number;
  timeout_seconds?: number;
}

export interface UpdateScheduledTaskData {
  task_name?: string;
  cron_expression?: string;
  input_payload?: Record<string, unknown>;
  is_active?: boolean;
  max_retries?: number;
  timeout_seconds?: number;
}

export const createScheduledTask = async (
  agentId: string,
  data: CreateScheduledTaskData
): Promise<ScheduledTask> => {
  const response = await backendApi.post<ScheduledTask>(
    `/agents/${agentId}/scheduled-tasks`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getScheduledTasks = async (
  agentId: string
): Promise<ScheduledTask[]> => {
  const response = await backendApi.get<ScheduledTask[]>(
    `/agents/${agentId}/scheduled-tasks`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateScheduledTask = async (
  agentId: string,
  taskId: string,
  data: UpdateScheduledTaskData
): Promise<ScheduledTask> => {
  const response = await backendApi.patch<ScheduledTask>(
    `/agents/${agentId}/scheduled-tasks/${taskId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteScheduledTask = async (
  agentId: string,
  taskId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/agents/${agentId}/scheduled-tasks/${taskId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const triggerScheduledTask = async (
  agentId: string,
  taskId: string
): Promise<ScheduledTaskRun> => {
  const response = await backendApi.post<ScheduledTaskRun>(
    `/agents/${agentId}/scheduled-tasks/${taskId}/trigger`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTaskRuns = async (
  agentId: string,
  taskId: string,
  options?: { limit?: number; offset?: number; status?: string }
): Promise<TaskRunsResponse> => {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.status) params.set('status', options.status);
  const qs = params.toString();
  const response = await backendApi.get<TaskRunsResponse>(
    `/agents/${agentId}/scheduled-tasks/${taskId}/runs${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getUpcomingRuns = async (): Promise<ScheduledTask[]> => {
  const response = await backendApi.get<ScheduledTask[]>(
    `/scheduled-tasks/upcoming`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
