import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getAgentBenchmarksV2,
  createBenchmarkV2,
  deleteBenchmarkV2,
  runBenchmarkV2,
  getBenchmarkResultsV2,
  getBenchmarkSummaryV2,
  type BenchmarkListResponse,
  type BenchmarkDefinition,
  type BenchmarkResult,
  type BenchmarkResultsResponse,
  type BenchmarkSummaryResponse,
} from '@/lib/api/agent-benchmarks-v2';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const benchmarkV2Keys = {
  all: ['benchmarks-v2'] as const,
  lists: () => [...benchmarkV2Keys.all, 'list'] as const,
  list: (agentId: string) =>
    [...benchmarkV2Keys.lists(), agentId] as const,
  results: (benchmarkId: string) =>
    [...benchmarkV2Keys.all, 'results', benchmarkId] as const,
  summary: (agentId: string) =>
    [...benchmarkV2Keys.all, 'summary', agentId] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useAgentBenchmarksV2 = (agentId: string) => {
  return useQuery<BenchmarkListResponse>({
    queryKey: benchmarkV2Keys.list(agentId),
    queryFn: () => getAgentBenchmarksV2(agentId),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useCreateBenchmarkV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<
    BenchmarkDefinition,
    Error,
    { agentId: string; benchmark_name: string; benchmark_type?: string; config?: Record<string, any> }
  >({
    mutationFn: ({ agentId, ...data }) => createBenchmarkV2(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: benchmarkV2Keys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: benchmarkV2Keys.summary(agentId) });
      toast.success('Benchmark created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create benchmark');
    },
  });
};

export const useDeleteBenchmarkV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { agentId: string; benchmarkId: string }>({
    mutationFn: ({ agentId, benchmarkId }) => deleteBenchmarkV2(agentId, benchmarkId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: benchmarkV2Keys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: benchmarkV2Keys.summary(agentId) });
      toast.success('Benchmark deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete benchmark');
    },
  });
};

export const useRunBenchmarkV2 = () => {
  const queryClient = useQueryClient();

  return useMutation<
    BenchmarkResult,
    Error,
    { agentId: string; benchmarkId: string }
  >({
    mutationFn: ({ agentId, benchmarkId }) => runBenchmarkV2(agentId, benchmarkId),
    onSuccess: (_, { agentId, benchmarkId }) => {
      queryClient.invalidateQueries({ queryKey: benchmarkV2Keys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: benchmarkV2Keys.results(benchmarkId) });
      queryClient.invalidateQueries({ queryKey: benchmarkV2Keys.summary(agentId) });
      toast.success('Benchmark run completed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to run benchmark');
    },
  });
};

export const useBenchmarkResultsV2 = (agentId: string, benchmarkId: string) => {
  return useQuery<BenchmarkResultsResponse>({
    queryKey: benchmarkV2Keys.results(benchmarkId),
    queryFn: () => getBenchmarkResultsV2(agentId, benchmarkId),
    enabled: !!benchmarkId && !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const useBenchmarkSummaryV2 = (agentId: string) => {
  return useQuery<BenchmarkSummaryResponse>({
    queryKey: benchmarkV2Keys.summary(agentId),
    queryFn: () => getBenchmarkSummaryV2(agentId),
    enabled: !!agentId,
    staleTime: 60000,
    refetchOnMount: 'always',
  });
};

export type {
  BenchmarkDefinition,
  BenchmarkResult,
  BenchmarkListResponse,
  BenchmarkResultsResponse,
  BenchmarkSummaryResponse,
};
