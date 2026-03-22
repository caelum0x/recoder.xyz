'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listBenchmarkSuites,
  createBenchmarkSuite,
  getBenchmarkSuite,
  updateBenchmarkSuite,
  deleteBenchmarkSuite,
  runBenchmark,
  listBenchmarkRuns,
  getBenchmarkRun,
  getBenchmarkLeaderboard,
  type BenchmarkSuite,
  type BenchmarkRun,
  type BenchmarkLeaderboard,
  type CreateBenchmarkSuiteData,
  type BenchmarkRunFilters,
} from '@/lib/api/agent-benchmark-suites';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const benchmarkSuiteKeys = {
  all: ['benchmark-suites'] as const,
  suites: () => [...benchmarkSuiteKeys.all, 'suites'] as const,
  suite: (id: string) => [...benchmarkSuiteKeys.all, 'suite', id] as const,
  runs: (filters?: BenchmarkRunFilters) =>
    [...benchmarkSuiteKeys.all, 'runs', filters] as const,
  run: (id: string) => [...benchmarkSuiteKeys.all, 'run', id] as const,
  leaderboard: (suiteId: string) =>
    [...benchmarkSuiteKeys.all, 'leaderboard', suiteId] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks — Suites
// ---------------------------------------------------------------------------

export function useBenchmarkSuites() {
  return useQuery<BenchmarkSuite[]>({
    queryKey: benchmarkSuiteKeys.suites(),
    queryFn: listBenchmarkSuites,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useCreateBenchmarkSuite() {
  const queryClient = useQueryClient();
  return useMutation<BenchmarkSuite, Error, CreateBenchmarkSuiteData>({
    mutationFn: createBenchmarkSuite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSuiteKeys.suites() });
    },
  });
}

export function useBenchmarkSuite(suiteId: string) {
  return useQuery<BenchmarkSuite>({
    queryKey: benchmarkSuiteKeys.suite(suiteId),
    queryFn: () => getBenchmarkSuite(suiteId),
    enabled: Boolean(suiteId),
    staleTime: 30_000,
  });
}

export function useUpdateBenchmarkSuite() {
  const queryClient = useQueryClient();
  return useMutation<
    BenchmarkSuite,
    Error,
    { suiteId: string; data: Partial<CreateBenchmarkSuiteData> }
  >({
    mutationFn: ({ suiteId, data }) => updateBenchmarkSuite(suiteId, data),
    onSuccess: (_, { suiteId }) => {
      queryClient.invalidateQueries({ queryKey: benchmarkSuiteKeys.suites() });
      queryClient.invalidateQueries({ queryKey: benchmarkSuiteKeys.suite(suiteId) });
    },
  });
}

export function useDeleteBenchmarkSuite() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteBenchmarkSuite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: benchmarkSuiteKeys.suites() });
      queryClient.invalidateQueries({ queryKey: benchmarkSuiteKeys.runs() });
    },
  });
}

// ---------------------------------------------------------------------------
// Hook — Run
// ---------------------------------------------------------------------------

export function useRunBenchmark() {
  const queryClient = useQueryClient();
  return useMutation<BenchmarkRun, Error, { suiteId: string; agentId: string }>({
    mutationFn: ({ suiteId, agentId }) => runBenchmark(suiteId, agentId),
    onSuccess: (_, { suiteId }) => {
      queryClient.invalidateQueries({ queryKey: benchmarkSuiteKeys.runs() });
      queryClient.invalidateQueries({ queryKey: benchmarkSuiteKeys.leaderboard(suiteId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Hooks — Runs
// ---------------------------------------------------------------------------

export function useBenchmarkRuns(filters?: BenchmarkRunFilters) {
  return useQuery<BenchmarkRun[]>({
    queryKey: benchmarkSuiteKeys.runs(filters),
    queryFn: () => listBenchmarkRuns(filters),
    staleTime: 20_000,
    refetchOnMount: 'always',
  });
}

export function useBenchmarkRun(runId: string | null) {
  return useQuery<BenchmarkRun>({
    queryKey: benchmarkSuiteKeys.run(runId ?? ''),
    queryFn: () => getBenchmarkRun(runId!),
    enabled: Boolean(runId),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Hook — Leaderboard
// ---------------------------------------------------------------------------

export function useBenchmarkLeaderboard(suiteId: string | null) {
  return useQuery<BenchmarkLeaderboard>({
    queryKey: benchmarkSuiteKeys.leaderboard(suiteId ?? ''),
    queryFn: () => getBenchmarkLeaderboard(suiteId!),
    enabled: Boolean(suiteId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export type {
  BenchmarkSuite,
  BenchmarkRun,
  BenchmarkLeaderboard,
  CreateBenchmarkSuiteData,
  BenchmarkRunFilters,
};
