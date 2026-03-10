import { backendApi } from '@/lib/api-client';

export interface AgentSchedule {
  id: string;
  user_id: string;
  agent_id: string;
  name: string;
  cron_expression: string;
  cron_human: string;
  timezone: string;
  input_message: string | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  max_runs: number | null;
  created_at: string;
  updated_at: string;
  agent_name?: string;
}

export interface ScheduleExecution {
  id: string;
  schedule_id: string;
  user_id: string;
  agent_id: string;
  thread_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string;
  completed_at: string | null;
  error: string | null;
  output_summary: string | null;
}

export interface ScheduleExecutionsResponse {
  executions: ScheduleExecution[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateScheduleData {
  name: string;
  cron_expression: string;
  timezone?: string;
  input_message?: string;
  max_runs?: number;
}

export interface UpdateScheduleData {
  name?: string;
  cron_expression?: string;
  timezone?: string;
  input_message?: string;
  is_active?: boolean;
  max_runs?: number | null;
}

export const createSchedule = async (
  agentId: string,
  data: CreateScheduleData
): Promise<AgentSchedule> => {
  const response = await backendApi.post<AgentSchedule>(
    `/agents/${agentId}/schedules`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAgentSchedules = async (
  agentId: string
): Promise<AgentSchedule[]> => {
  const response = await backendApi.get<AgentSchedule[]>(
    `/agents/${agentId}/schedules`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAllSchedules = async (): Promise<AgentSchedule[]> => {
  const response = await backendApi.get<AgentSchedule[]>(
    `/schedules`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateSchedule = async (
  scheduleId: string,
  data: UpdateScheduleData
): Promise<AgentSchedule> => {
  const response = await backendApi.patch<AgentSchedule>(
    `/schedules/${scheduleId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteSchedule = async (scheduleId: string) => {
  const response = await backendApi.delete(`/schedules/${scheduleId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const triggerSchedule = async (
  scheduleId: string
): Promise<ScheduleExecution> => {
  const response = await backendApi.post<ScheduleExecution>(
    `/schedules/${scheduleId}/trigger`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getScheduleExecutions = async (
  scheduleId: string,
  options?: { limit?: number; offset?: number; status?: string }
): Promise<ScheduleExecutionsResponse> => {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.status) params.set('status', options.status);
  const qs = params.toString();
  const response = await backendApi.get<ScheduleExecutionsResponse>(
    `/schedules/${scheduleId}/executions${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
