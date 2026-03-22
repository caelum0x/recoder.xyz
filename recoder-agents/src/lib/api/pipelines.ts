import { backendApi } from '@/lib/api-client';

export interface PipelineStep {
  agent_id: string;
  agent_name?: string;
  input_mapping?: string;
  condition?: string;
}

export interface Pipeline {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  is_active: boolean;
  run_count?: number;
  last_run_status?: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineRun {
  id: string;
  pipeline_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  current_step: number;
  total_steps: number;
  step_results: any[];
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export const createPipeline = async (data: {
  name: string;
  description?: string;
  steps: PipelineStep[];
}): Promise<Pipeline> => {
  const response = await backendApi.post<Pipeline>('/pipelines', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipelines = async (): Promise<Pipeline[]> => {
  const response = await backendApi.get<Pipeline[]>('/pipelines', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipeline = async (id: string): Promise<Pipeline> => {
  const response = await backendApi.get<Pipeline>(`/pipelines/${id}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePipeline = async (
  id: string,
  data: Partial<Pick<Pipeline, 'name' | 'description' | 'steps' | 'is_active'>>,
): Promise<Pipeline> => {
  const response = await backendApi.patch<Pipeline>(`/pipelines/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePipeline = async (id: string) => {
  const response = await backendApi.delete(`/pipelines/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const executePipeline = async (
  id: string,
): Promise<{ run_id: string; status: string; total_steps: number }> => {
  const response = await backendApi.post<{
    run_id: string;
    status: string;
    total_steps: number;
  }>(`/pipelines/${id}/execute`, {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipelineRuns = async (
  id: string,
): Promise<PipelineRun[]> => {
  const response = await backendApi.get<PipelineRun[]>(
    `/pipelines/${id}/runs`,
    { showErrors: true },
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
