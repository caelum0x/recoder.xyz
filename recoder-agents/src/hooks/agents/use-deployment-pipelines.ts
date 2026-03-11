import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createPipeline,
  getPipelines,
  getPipeline,
  updatePipeline,
  deletePipeline,
  startPipelineRun,
  getPipelineRuns,
  getPipelineRunDetail,
  advancePipelineRun,
  cancelPipelineRun,
  getPipelineGates,
  passGate,
  failGate,
  type CreatePipelineData,
  type UpdatePipelineData,
} from '@/lib/api/deployment-pipelines';

// ============================================================================
// Pipeline Hooks
// ============================================================================

export function useDeploymentPipelines(agentId?: string) {
  return useQuery({
    queryKey: ['deployment-pipelines', agentId ?? null],
    queryFn: () => getPipelines(agentId),
    enabled: true,
    staleTime: 30_000,
  });
}

export function usePipelineDetail(pipelineId: string) {
  return useQuery({
    queryKey: ['deployment-pipeline', pipelineId],
    queryFn: () => getPipeline(pipelineId),
    enabled: !!pipelineId,
    staleTime: 30_000,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePipelineData) => createPipeline(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['deployment-pipelines'] });
      qc.invalidateQueries({ queryKey: ['deployment-pipelines', variables.agent_id] });
    },
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pipelineId,
      data,
    }: {
      pipelineId: string;
      data: UpdatePipelineData;
    }) => updatePipeline(pipelineId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['deployment-pipelines'] });
      qc.invalidateQueries({ queryKey: ['deployment-pipeline', variables.pipelineId] });
    },
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) => deletePipeline(pipelineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-pipelines'] });
    },
  });
}

// ============================================================================
// Pipeline Run Hooks
// ============================================================================

export function useStartPipelineRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) => startPipelineRun(pipelineId),
    onSuccess: (_data, pipelineId) => {
      qc.invalidateQueries({ queryKey: ['pipeline-runs', pipelineId] });
    },
  });
}

export function usePipelineRuns(pipelineId: string) {
  return useQuery({
    queryKey: ['pipeline-runs', pipelineId],
    queryFn: () => getPipelineRuns(pipelineId),
    enabled: !!pipelineId,
    staleTime: 15_000,
  });
}

export function usePipelineRunDetail(runId: string) {
  return useQuery({
    queryKey: ['pipeline-run-detail', runId],
    queryFn: () => getPipelineRunDetail(runId),
    enabled: !!runId,
    staleTime: 10_000,
  });
}

export function useAdvanceRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      runId,
      stageResult,
    }: {
      runId: string;
      stageResult?: Record<string, unknown>;
    }) => advancePipelineRun(runId, stageResult),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pipeline-run-detail', data.id] });
      qc.invalidateQueries({ queryKey: ['pipeline-runs', data.pipeline_id] });
    },
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => cancelPipelineRun(runId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pipeline-run-detail', data.id] });
      qc.invalidateQueries({ queryKey: ['pipeline-runs', data.pipeline_id] });
    },
  });
}

// ============================================================================
// Gate Hooks
// ============================================================================

export function usePipelineGates(pipelineId: string) {
  return useQuery({
    queryKey: ['pipeline-gates', pipelineId],
    queryFn: () => getPipelineGates(pipelineId),
    enabled: !!pipelineId,
    staleTime: 20_000,
  });
}

export function usePassGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gateId: string) => passGate(gateId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pipeline-gates', data.pipeline_id] });
    },
  });
}

export function useFailGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gateId: string) => failGate(gateId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pipeline-gates', data.pipeline_id] });
    },
  });
}
