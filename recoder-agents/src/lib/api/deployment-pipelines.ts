import { backendApi } from '@/lib/api-client';

export interface PipelineStage {
  name: string;
  type: 'test' | 'build' | 'deploy' | 'validate';
  config: Record<string, unknown>;
}

export interface DeploymentPipeline {
  id: string;
  user_id: string;
  pipeline_name: string;
  agent_id: string;
  stages: PipelineStage[];
  is_active: boolean;
  auto_promote: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineRun {
  id: string;
  pipeline_id: string;
  user_id: string;
  agent_id: string;
  current_stage_index: number;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  stage_results: StageResult[];
  started_at: string;
  completed_at: string | null;
}

export interface StageResult {
  stage_index: number;
  result: Record<string, unknown>;
  advanced_at: string;
}

export interface PipelineGate {
  id: string;
  pipeline_id: string;
  user_id: string;
  stage_index: number;
  gate_type: 'manual' | 'auto' | 'approval';
  conditions: Record<string, unknown>;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  evaluated_at: string | null;
}

export interface CreatePipelineData {
  pipeline_name: string;
  agent_id: string;
  stages?: PipelineStage[];
  is_active?: boolean;
  auto_promote?: boolean;
}

export interface UpdatePipelineData {
  pipeline_name?: string;
  stages?: PipelineStage[];
  is_active?: boolean;
  auto_promote?: boolean;
}

// ============================================================================
// Pipeline CRUD
// ============================================================================

export const createPipeline = async (data: CreatePipelineData): Promise<DeploymentPipeline> => {
  const response = await backendApi.post<DeploymentPipeline>('/deployment/pipelines', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipelines = async (agentId?: string): Promise<DeploymentPipeline[]> => {
  const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const response = await backendApi.get<DeploymentPipeline[]>(
    `/deployment/pipelines${qs}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipeline = async (pipelineId: string): Promise<DeploymentPipeline> => {
  const response = await backendApi.get<DeploymentPipeline>(
    `/deployment/pipelines/${pipelineId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePipeline = async (
  pipelineId: string,
  data: UpdatePipelineData
): Promise<DeploymentPipeline> => {
  const response = await backendApi.patch<DeploymentPipeline>(
    `/deployment/pipelines/${pipelineId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePipeline = async (pipelineId: string): Promise<void> => {
  const response = await backendApi.delete(`/deployment/pipelines/${pipelineId}`);
  if (response.error) throw new Error(response.error.message);
};

// ============================================================================
// Pipeline Runs
// ============================================================================

export const startPipelineRun = async (pipelineId: string): Promise<PipelineRun> => {
  const response = await backendApi.post<PipelineRun>(
    `/deployment/pipelines/${pipelineId}/run`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipelineRuns = async (
  pipelineId: string,
  limit = 20
): Promise<PipelineRun[]> => {
  const response = await backendApi.get<PipelineRun[]>(
    `/deployment/pipelines/${pipelineId}/runs?limit=${limit}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPipelineRunDetail = async (runId: string): Promise<PipelineRun> => {
  const response = await backendApi.get<PipelineRun>(
    `/deployment/runs/${runId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const advancePipelineRun = async (
  runId: string,
  stageResult: Record<string, unknown> = {}
): Promise<PipelineRun> => {
  const response = await backendApi.post<PipelineRun>(`/deployment/runs/${runId}/advance`, {
    stage_result: stageResult,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const cancelPipelineRun = async (runId: string): Promise<PipelineRun> => {
  const response = await backendApi.post<PipelineRun>(`/deployment/runs/${runId}/cancel`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ============================================================================
// Pipeline Gates
// ============================================================================

export const getPipelineGates = async (pipelineId: string): Promise<PipelineGate[]> => {
  const response = await backendApi.get<PipelineGate[]>(
    `/deployment/pipelines/${pipelineId}/gates`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const passGate = async (gateId: string): Promise<PipelineGate> => {
  const response = await backendApi.post<PipelineGate>(`/deployment/gates/${gateId}/pass`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const failGate = async (gateId: string): Promise<PipelineGate> => {
  const response = await backendApi.post<PipelineGate>(`/deployment/gates/${gateId}/fail`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
