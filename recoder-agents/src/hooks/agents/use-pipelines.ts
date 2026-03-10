import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  executePipeline,
  getPipelineRuns,
} from '@/lib/api/pipelines';
import type { Pipeline, PipelineStep } from '@/lib/api/pipelines';

export function usePipelines() {
  return useQuery({
    queryKey: ['pipelines'],
    queryFn: getPipelines,
    staleTime: 30_000,
  });
}

export function usePipeline(id: string) {
  return useQuery({
    queryKey: ['pipeline', id],
    queryFn: () => getPipeline(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPipeline,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & Partial<
      Pick<Pipeline, 'name' | 'description' | 'steps' | 'is_active'>
    >) => updatePipeline(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePipeline,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export function useExecutePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: executePipeline,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['pipeline-runs'] }),
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
