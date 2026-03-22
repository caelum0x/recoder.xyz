'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listExperiments,
  createExperiment,
  getExperiment,
  updateExperiment,
  deleteExperiment,
  startExperiment,
  stopExperiment,
  recordResult,
  getResults,
  getExperimentSummary,
  type ABExperiment,
  type ABResult,
  type ABAggregatedResult,
  type ABSummary,
  type CreateExperimentData,
  type UpdateExperimentData,
  type RecordResultData,
  type ExperimentFilters,
} from '@/lib/api/ab-testing';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const experimentKeys = {
  all: ['ab-experiments'] as const,
  list: (filters?: ExperimentFilters) => [...experimentKeys.all, 'list', filters] as const,
  detail: (id: string) => [...experimentKeys.all, 'detail', id] as const,
  results: (id: string) => [...experimentKeys.all, 'results', id] as const,
  summary: (id: string) => [...experimentKeys.all, 'summary', id] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks — Queries
// ---------------------------------------------------------------------------

export function useExperiments(filters?: ExperimentFilters) {
  return useQuery<ABExperiment[]>({
    queryKey: experimentKeys.list(filters),
    queryFn: () => listExperiments(filters),
    staleTime: 20_000,
    refetchOnMount: 'always',
  });
}

export function useExperimentResults(id: string | null) {
  return useQuery<ABAggregatedResult[]>({
    queryKey: experimentKeys.results(id ?? ''),
    queryFn: () => getResults(id!),
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}

export function useExperimentSummary(id: string | null) {
  return useQuery<ABSummary[]>({
    queryKey: experimentKeys.summary(id ?? ''),
    queryFn: () => getExperimentSummary(id!),
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Mutations
// ---------------------------------------------------------------------------

export function useCreateExperiment() {
  const queryClient = useQueryClient();
  return useMutation<ABExperiment, Error, CreateExperimentData>({
    mutationFn: createExperiment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: experimentKeys.list() });
    },
  });
}

export function useUpdateExperiment() {
  const queryClient = useQueryClient();
  return useMutation<ABExperiment, Error, { id: string; data: UpdateExperimentData }>({
    mutationFn: ({ id, data }) => updateExperiment(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: experimentKeys.list() });
      queryClient.invalidateQueries({ queryKey: experimentKeys.detail(id) });
    },
  });
}

export function useDeleteExperiment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteExperiment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: experimentKeys.all });
    },
  });
}

export function useStartExperiment() {
  const queryClient = useQueryClient();
  return useMutation<ABExperiment, Error, string>({
    mutationFn: startExperiment,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: experimentKeys.list() });
      queryClient.invalidateQueries({ queryKey: experimentKeys.detail(id) });
    },
  });
}

export function useStopExperiment() {
  const queryClient = useQueryClient();
  return useMutation<ABExperiment, Error, { id: string; winner?: 'a' | 'b' | 'tie' }>({
    mutationFn: ({ id, winner }) => stopExperiment(id, winner),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: experimentKeys.list() });
      queryClient.invalidateQueries({ queryKey: experimentKeys.detail(id) });
    },
  });
}

export function useRecordResult() {
  const queryClient = useQueryClient();
  return useMutation<ABResult, Error, { id: string; data: RecordResultData }>({
    mutationFn: ({ id, data }) => recordResult(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: experimentKeys.results(id) });
      queryClient.invalidateQueries({ queryKey: experimentKeys.summary(id) });
    },
  });
}

export type {
  ABExperiment,
  ABResult,
  ABAggregatedResult,
  ABSummary,
  CreateExperimentData,
  UpdateExperimentData,
  RecordResultData,
  ExperimentFilters,
};
