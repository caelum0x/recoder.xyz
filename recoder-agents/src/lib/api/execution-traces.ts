import { backendApi } from '@/lib/api-client';

export interface ExecutionTrace {
  id: string;
  user_id: string;
  agent_id: string;
  thread_id: string | null;
  trace_name: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_steps: number;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

export interface TraceStep {
  id: string;
  trace_id: string;
  user_id: string;
  step_index: number;
  step_name: string;
  step_type: 'action' | 'decision' | 'tool_call' | 'llm_call' | 'data_fetch' | 'output';
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  duration_ms: number;
  status: 'completed' | 'failed' | 'skipped';
  error_message: string | null;
  created_at: string;
}

export interface ExecutionTraceWithSteps extends ExecutionTrace {
  steps: TraceStep[];
}

export interface TraceStats {
  total: number;
  avg_duration_ms: number;
  by_status: {
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  by_agent: Record<string, number>;
  avg_steps_per_trace: number;
}

export interface CreateTraceData {
  agent_id: string;
  thread_id?: string;
  trace_name?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTraceData {
  status?: 'running' | 'completed' | 'failed' | 'cancelled';
  duration_ms?: number;
  completed_at?: string;
}

export interface AddStepData {
  step_index: number;
  step_name: string;
  step_type?: 'action' | 'decision' | 'tool_call' | 'llm_call' | 'data_fetch' | 'output';
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  duration_ms?: number;
  status?: 'completed' | 'failed' | 'skipped';
  error_message?: string;
}

export interface TraceFilters {
  agent_id?: string;
  status?: string;
  limit?: number;
}

export const listTraces = async (filters?: TraceFilters): Promise<ExecutionTrace[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<ExecutionTrace[]>(
    `/traces${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createTrace = async (data: CreateTraceData): Promise<ExecutionTrace> => {
  const response = await backendApi.post<ExecutionTrace>('/traces', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTrace = async (traceId: string): Promise<ExecutionTraceWithSteps> => {
  const response = await backendApi.get<ExecutionTraceWithSteps>(
    `/traces/${traceId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateTrace = async (
  traceId: string,
  data: UpdateTraceData
): Promise<ExecutionTrace> => {
  const response = await backendApi.patch<ExecutionTrace>(`/traces/${traceId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteTrace = async (traceId: string): Promise<void> => {
  const response = await backendApi.delete(`/traces/${traceId}`);
  if (response.error) throw new Error(response.error.message);
};

export const addTraceStep = async (
  traceId: string,
  data: AddStepData
): Promise<TraceStep> => {
  const response = await backendApi.post<TraceStep>(`/traces/${traceId}/steps`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTraceSteps = async (traceId: string): Promise<TraceStep[]> => {
  const response = await backendApi.get<TraceStep[]>(
    `/traces/${traceId}/steps`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTraceStats = async (): Promise<TraceStats> => {
  const response = await backendApi.get<TraceStats>('/traces/stats', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
