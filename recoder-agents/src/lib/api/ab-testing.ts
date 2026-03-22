import { backendApi } from '@/lib/api-client';

export interface ABExperiment {
  id: string;
  user_id: string;
  experiment_name: string;
  description: string | null;
  agent_id: string;
  variant_a_config: Record<string, unknown>;
  variant_b_config: Record<string, unknown>;
  traffic_split_pct: number;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  winner: 'a' | 'b' | 'tie' | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface ABResult {
  id: string;
  experiment_id: string;
  user_id: string;
  variant: 'a' | 'b';
  metric_name: string;
  metric_value: number;
  sample_size: number;
  recorded_at: string;
}

export interface ABAggregatedResult {
  variant: string;
  metric_name: string;
  avg_value: number;
  total_samples: number;
}

export interface ABSummary {
  metric_name: string;
  variant_a_avg: number;
  variant_b_avg: number;
  pct_diff: number;
  suggested_winner: 'a' | 'b' | 'tie';
}

export interface CreateExperimentData {
  experiment_name: string;
  description?: string;
  agent_id: string;
  variant_a_config?: Record<string, unknown>;
  variant_b_config?: Record<string, unknown>;
  traffic_split_pct?: number;
}

export interface UpdateExperimentData {
  experiment_name?: string;
  description?: string;
  agent_id?: string;
  variant_a_config?: Record<string, unknown>;
  variant_b_config?: Record<string, unknown>;
  traffic_split_pct?: number;
  status?: string;
  winner?: string;
}

export interface RecordResultData {
  variant: 'a' | 'b';
  metric_name: string;
  metric_value: number;
  sample_size?: number;
}

export interface ExperimentFilters {
  agent_id?: string;
  status?: string;
}

export const listExperiments = async (filters?: ExperimentFilters): Promise<ABExperiment[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const response = await backendApi.get<ABExperiment[]>(
    `/experiments${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createExperiment = async (data: CreateExperimentData): Promise<ABExperiment> => {
  const response = await backendApi.post<ABExperiment>('/experiments', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getExperiment = async (id: string): Promise<ABExperiment> => {
  const response = await backendApi.get<ABExperiment>(`/experiments/${id}`, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateExperiment = async (
  id: string,
  data: UpdateExperimentData
): Promise<ABExperiment> => {
  const response = await backendApi.patch<ABExperiment>(`/experiments/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteExperiment = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/experiments/${id}`);
  if (response.error) throw new Error(response.error.message);
};

export const startExperiment = async (id: string): Promise<ABExperiment> => {
  const response = await backendApi.post<ABExperiment>(`/experiments/${id}/start`, {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const stopExperiment = async (
  id: string,
  winner?: 'a' | 'b' | 'tie'
): Promise<ABExperiment> => {
  const response = await backendApi.post<ABExperiment>(`/experiments/${id}/stop`, { winner });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const recordResult = async (
  id: string,
  data: RecordResultData
): Promise<ABResult> => {
  const response = await backendApi.post<ABResult>(`/experiments/${id}/results`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getResults = async (id: string): Promise<ABAggregatedResult[]> => {
  const response = await backendApi.get<ABAggregatedResult[]>(
    `/experiments/${id}/results`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getExperimentSummary = async (id: string): Promise<ABSummary[]> => {
  const response = await backendApi.get<ABSummary[]>(
    `/experiments/${id}/summary`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
