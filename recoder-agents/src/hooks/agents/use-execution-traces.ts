'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTraces,
  createTrace,
  getTrace,
  updateTrace,
  deleteTrace,
  addTraceStep,
  getTraceSteps,
  getTraceStats,
  type ExecutionTrace,
  type ExecutionTraceWithSteps,
  type TraceStep,
  type TraceStats,
  type CreateTraceData,
  type UpdateTraceData,
  type AddStepData,
  type TraceFilters,
} from '@/lib/api/execution-traces';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const traceKeys = {
  all: ['execution-traces'] as const,
  list: (filters?: TraceFilters) => [...traceKeys.all, 'list', filters] as const,
  detail: (id: string) => [...traceKeys.all, 'detail', id] as const,
  steps: (id: string) => [...traceKeys.all, 'steps', id] as const,
  stats: () => [...traceKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks — Queries
// ---------------------------------------------------------------------------

export function useTraces(filters?: TraceFilters) {
  return useQuery<ExecutionTrace[]>({
    queryKey: traceKeys.list(filters),
    queryFn: () => listTraces(filters),
    staleTime: 20_000,
    refetchOnMount: 'always',
  });
}

export function useTraceStats() {
  return useQuery<TraceStats>({
    queryKey: traceKeys.stats(),
    queryFn: getTraceStats,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useTraceDetail(traceId: string | null) {
  return useQuery<ExecutionTraceWithSteps>({
    queryKey: traceKeys.detail(traceId ?? ''),
    queryFn: () => getTrace(traceId!),
    enabled: Boolean(traceId),
    staleTime: 20_000,
  });
}

export function useTraceSteps(traceId: string | null) {
  return useQuery<TraceStep[]>({
    queryKey: traceKeys.steps(traceId ?? ''),
    queryFn: () => getTraceSteps(traceId!),
    enabled: Boolean(traceId),
    staleTime: 20_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Mutations
// ---------------------------------------------------------------------------

export function useCreateTrace() {
  const queryClient = useQueryClient();
  return useMutation<ExecutionTrace, Error, CreateTraceData>({
    mutationFn: createTrace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traceKeys.all });
    },
  });
}

export function useUpdateTrace() {
  const queryClient = useQueryClient();
  return useMutation<ExecutionTrace, Error, { traceId: string; data: UpdateTraceData }>({
    mutationFn: ({ traceId, data }) => updateTrace(traceId, data),
    onSuccess: (_, { traceId }) => {
      queryClient.invalidateQueries({ queryKey: traceKeys.list() });
      queryClient.invalidateQueries({ queryKey: traceKeys.detail(traceId) });
      queryClient.invalidateQueries({ queryKey: traceKeys.stats() });
    },
  });
}

export function useDeleteTrace() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteTrace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traceKeys.all });
    },
  });
}

export function useAddTraceStep() {
  const queryClient = useQueryClient();
  return useMutation<TraceStep, Error, { traceId: string; data: AddStepData }>({
    mutationFn: ({ traceId, data }) => addTraceStep(traceId, data),
    onSuccess: (_, { traceId }) => {
      queryClient.invalidateQueries({ queryKey: traceKeys.detail(traceId) });
      queryClient.invalidateQueries({ queryKey: traceKeys.steps(traceId) });
      queryClient.invalidateQueries({ queryKey: traceKeys.list() });
    },
  });
}

export type {
  ExecutionTrace,
  ExecutionTraceWithSteps,
  TraceStep,
  TraceStats,
  CreateTraceData,
  UpdateTraceData,
  AddStepData,
  TraceFilters,
};
