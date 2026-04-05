import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  getPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  executePipeline,
  getPipelineRuns,
} from '@/lib/api/pipelines';
import type { Pipeline, PipelineRun } from '@/lib/api/pipelines';
import { connectTokenizedSSE, type TokenizedSSEConnection } from '@/lib/realtime/sse';
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

const API_URL = resolveBrowserBackendApiUrl();

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
    // Never retry 404s — the pipeline simply doesn't exist.
    // The global retry function already handles this via ApiRequestError.status,
    // but we add an explicit retry: false here for safety since this is a
    // common source of 404 loops.
    retry: (failureCount, error: any) => {
      if (error?.status === 404) return false;
      return failureCount < 2;
    },
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
    // Never retry on 404 (pipeline doesn't exist)
    retry: (failureCount, error: any) => {
      if (error?.status === 404) return false;
      return failureCount < 2;
    },
    // Auto-refetch every 5s when there's a running pipeline
    refetchInterval: (query) => {
      const data = query.state.data as PipelineRun[] | undefined;
      const hasRunning = data?.some((r) => r.status === 'running');
      return hasRunning ? 5_000 : false;
    },
  });
}

/**
 * Hook that streams real-time pipeline run progress via SSE.
 * Returns a live-updating PipelineRun object.
 */
export function usePipelineRunStream(
  pipelineId: string,
  runId: string | null,
) {
  const qc = useQueryClient();
  const sseRef = useRef<TokenizedSSEConnection | null>(null);
  const [liveRun, setLiveRun] = useState<Partial<PipelineRun> | null>(null);

  useEffect(() => {
    if (!pipelineId || !runId) return;

    const url = `${API_URL}/pipelines/${pipelineId}/runs/${runId}/stream`;

    sseRef.current = connectTokenizedSSE({
      url,
      events: {
        step_started: (event) => {
          try {
            const data = JSON.parse(event.data);
            setLiveRun((prev) => ({
              ...prev,
              id: runId,
              pipeline_id: pipelineId,
              status: 'running' as const,
              current_step: data.step - 1, // step is 1-indexed, current_step is 0-indexed in UI
              total_steps: data.total_steps,
            }));
          } catch {}
        },
        step_completed: (event) => {
          try {
            const data = JSON.parse(event.data);
            setLiveRun((prev) => ({
              ...prev,
              id: runId,
              pipeline_id: pipelineId,
              status: data.status === 'failed' ? 'failed' as const : 'running' as const,
              current_step: data.step,
              total_steps: data.total_steps,
            }));
          } catch {}
        },
        pipeline_completed: (event) => {
          try {
            const data = JSON.parse(event.data);
            setLiveRun((prev) => ({
              ...prev,
              id: runId,
              pipeline_id: pipelineId,
              status: data.status as PipelineRun['status'],
              current_step: data.steps_completed,
              total_steps: data.steps_total,
            }));
            // Invalidate queries to get final state from server
            qc.invalidateQueries({ queryKey: ['pipeline-runs', pipelineId] });
            qc.invalidateQueries({ queryKey: ['pipelines'] });
          } catch {}
        },
        status_poll: (event) => {
          try {
            const data = JSON.parse(event.data);
            setLiveRun((prev) => ({
              ...prev,
              id: runId,
              pipeline_id: pipelineId,
              status: data.status as PipelineRun['status'],
              current_step: data.current_step,
              total_steps: data.total_steps,
              error: data.error,
            }));
            if (['completed', 'failed', 'cancelled'].includes(data.status)) {
              qc.invalidateQueries({ queryKey: ['pipeline-runs', pipelineId] });
              qc.invalidateQueries({ queryKey: ['pipelines'] });
            }
          } catch {}
        },
      },
    });

    return () => {
      sseRef.current?.close();
      sseRef.current = null;
      setLiveRun(null);
    };
  }, [pipelineId, runId, qc]);

  return liveRun;
}
