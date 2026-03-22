import { backendApi } from '../api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface DataPipeline {
  id: string;
  user_id: string;
  pipeline_name: string;
  description: string | null;
  source_type: 'api' | 'database' | 'file' | 'webhook' | 'stream';
  destination_type: 'database' | 'file' | 'api' | 'webhook';
  transform_steps: Array<{ name: string; type: string; config?: Record<string, any> }>;
  schedule_cron: string | null;
  is_active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineExecution {
  id: string;
  pipeline_id: string;
  user_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  records_processed: number;
  records_failed: number;
  error_message: string | null;
  execution_log: any[];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface CreatePipelineData {
  pipeline_name: string;
  description?: string;
  source_type?: 'api' | 'database' | 'file' | 'webhook' | 'stream';
  destination_type?: 'database' | 'file' | 'api' | 'webhook';
  transform_steps?: Array<{ name: string; type: string; config?: Record<string, any> }>;
  schedule_cron?: string;
  is_active?: boolean;
}

export interface UpdatePipelineData {
  pipeline_name?: string;
  description?: string;
  source_type?: 'api' | 'database' | 'file' | 'webhook' | 'stream';
  destination_type?: 'database' | 'file' | 'api' | 'webhook';
  transform_steps?: Array<{ name: string; type: string; config?: Record<string, any> }>;
  schedule_cron?: string;
  is_active?: boolean;
}

export interface PipelineStats {
  total: number;
  active: number;
  total_executions: number;
  success_rate: number;
  total_records_processed: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const listPipelines = async (): Promise<DataPipeline[]> => {
  const response = await backendApi.get<DataPipeline[]>('/data-pipelines', {
    showErrors: true,
    cache: 'no-store',
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createPipeline = async (data: CreatePipelineData): Promise<DataPipeline> => {
  const response = await backendApi.post<DataPipeline>('/data-pipelines', data, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipeline = async (id: string): Promise<DataPipeline> => {
  const response = await backendApi.get<DataPipeline>(`/data-pipelines/${id}`, {
    showErrors: true,
    cache: 'no-store',
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePipeline = async (id: string, data: UpdatePipelineData): Promise<DataPipeline> => {
  const response = await backendApi.patch<DataPipeline>(`/data-pipelines/${id}`, data, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePipeline = async (id: string): Promise<{ deleted: boolean; id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; id: string }>(
    `/data-pipelines/${id}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const runPipeline = async (id: string): Promise<PipelineExecution> => {
  const response = await backendApi.post<PipelineExecution>(
    `/data-pipelines/${id}/run`,
    {},
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipelineExecutions = async (
  pipelineId: string,
  limit = 20
): Promise<PipelineExecution[]> => {
  const response = await backendApi.get<PipelineExecution[]>(
    `/data-pipelines/${pipelineId}/executions?limit=${limit}`,
    { showErrors: true, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getExecution = async (executionId: string): Promise<PipelineExecution> => {
  const response = await backendApi.get<PipelineExecution>(
    `/pipeline-executions/${executionId}`,
    { showErrors: true, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const cancelExecution = async (executionId: string): Promise<PipelineExecution> => {
  const response = await backendApi.post<PipelineExecution>(
    `/pipeline-executions/${executionId}/cancel`,
    {},
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipelineStats = async (): Promise<PipelineStats> => {
  const response = await backendApi.get<PipelineStats>('/data-pipelines/stats', {
    showErrors: true,
    cache: 'no-store',
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
