'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPipelines,
  createPipeline,
  getPipeline,
  updatePipeline,
  deletePipeline,
  runPipeline,
  getPipelineExecutions,
  getExecution,
  cancelExecution,
  getPipelineStats,
  type DataPipeline,
  type PipelineExecution,
  type CreatePipelineData,
  type UpdatePipelineData,
  type PipelineStats,
} from '@/lib/api/data-pipelines';

// ============================================================================
// Query keys
// ============================================================================

export const pipelineKeys = {
  all: ['data-pipelines'] as const,
  list: () => [...pipelineKeys.all, 'list'] as const,
  detail: (id: string) => [...pipelineKeys.all, 'detail', id] as const,
  stats: () => [...pipelineKeys.all, 'stats'] as const,
  executions: (pipelineId: string) => [...pipelineKeys.all, 'executions', pipelineId] as const,
  execution: (id: string) => [...pipelineKeys.all, 'execution', id] as const,
} as const;

// ============================================================================
// Query Hooks
// ============================================================================

export function usePipelines() {
  return useQuery<DataPipeline[]>({
    queryKey: pipelineKeys.list(),
    queryFn: listPipelines,
    staleTime: 20_000,
    refetchOnMount: 'always',
  });
}

export function usePipelineStats() {
  return useQuery<PipelineStats>({
    queryKey: pipelineKeys.stats(),
    queryFn: getPipelineStats,
    staleTime: 20_000,
    refetchOnMount: 'always',
  });
}

export function usePipelineExecutions(pipelineId: string | null) {
  return useQuery<PipelineExecution[]>({
    queryKey: pipelineKeys.executions(pipelineId ?? ''),
    queryFn: () => getPipelineExecutions(pipelineId!),
    enabled: Boolean(pipelineId),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
}

export function useExecutionDetail(executionId: string | null) {
  return useQuery<PipelineExecution>({
    queryKey: pipelineKeys.execution(executionId ?? ''),
    queryFn: () => getExecution(executionId!),
    enabled: Boolean(executionId),
    staleTime: 15_000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreatePipeline() {
  const queryClient = useQueryClient();
  return useMutation<DataPipeline, Error, CreatePipelineData>({
    mutationFn: createPipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.list() });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.stats() });
    },
  });
}

export function useUpdatePipeline() {
  const queryClient = useQueryClient();
  return useMutation<DataPipeline, Error, { id: string; data: UpdatePipelineData }>({
    mutationFn: ({ id, data }) => updatePipeline(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.list() });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(id) });
    },
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: boolean; id: string }, Error, string>({
    mutationFn: deletePipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });
}

export function useRunPipeline() {
  const queryClient = useQueryClient();
  return useMutation<PipelineExecution, Error, string>({
    mutationFn: runPipeline,
    onSuccess: (_, pipelineId) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.list() });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.stats() });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.executions(pipelineId) });
    },
  });
}

export function useCancelExecution() {
  const queryClient = useQueryClient();
  return useMutation<PipelineExecution, Error, string>({
    mutationFn: cancelExecution,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.executions(result.pipeline_id) });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.execution(result.id) });
    },
  });
}

export type {
  DataPipeline,
  PipelineExecution,
  CreatePipelineData,
  UpdatePipelineData,
  PipelineStats,
};
