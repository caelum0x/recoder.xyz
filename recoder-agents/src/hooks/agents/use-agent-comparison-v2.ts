import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listComparisons,
  getComparison,
  createComparison,
  updateComparison,
  deleteComparison,
  recordComparisonMetric,
  getComparisonSummary,
} from '@/lib/api/agent-comparison-v2';

export function useComparisons() {
  return useQuery({
    queryKey: ['agent-comparisons-v2'],
    queryFn: listComparisons,
  });
}

export function useComparison(id: string) {
  return useQuery({
    queryKey: ['agent-comparisons-v2', id],
    queryFn: () => getComparison(id),
    enabled: !!id,
  });
}

export function useComparisonSummary(id: string) {
  return useQuery({
    queryKey: ['agent-comparisons-v2', id, 'summary'],
    queryFn: () => getComparisonSummary(id),
    enabled: !!id,
  });
}

export function useCreateComparison() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createComparison,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-comparisons-v2'] }),
  });
}

export function useUpdateComparison() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof updateComparison>[1];
    }) => updateComparison(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-comparisons-v2'] }),
  });
}

export function useDeleteComparison() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteComparison,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-comparisons-v2'] }),
  });
}

export function useRecordComparisonMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      comparisonId,
      data,
    }: {
      comparisonId: string;
      data: Parameters<typeof recordComparisonMetric>[1];
    }) => recordComparisonMetric(comparisonId, data),
    onSuccess: (_data, { comparisonId }) =>
      qc.invalidateQueries({ queryKey: ['agent-comparisons-v2', comparisonId] }),
  });
}
