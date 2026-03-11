import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createComparison,
  getComparisons,
  getComparisonDetail,
  deleteComparison,
  submitEvaluation,
  getComparisonEvaluations,
  getComparisonStats,
  type CreateComparisonData,
  type SubmitEvaluationData,
} from '@/lib/api/thread-comparisons';

export function useThreadComparisons(limit = 50) {
  return useQuery({
    queryKey: ['thread-comparisons', limit],
    queryFn: () => getComparisons(limit),
    staleTime: 30_000,
  });
}

export function useComparisonDetail(comparisonId: string) {
  return useQuery({
    queryKey: ['thread-comparison', comparisonId],
    queryFn: () => getComparisonDetail(comparisonId),
    enabled: !!comparisonId,
    staleTime: 15_000,
  });
}

export function useCreateComparison() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateComparisonData) => createComparison(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-comparisons'] });
      qc.invalidateQueries({ queryKey: ['comparison-stats'] });
    },
  });
}

export function useDeleteComparison() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comparisonId: string) => deleteComparison(comparisonId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-comparisons'] });
      qc.invalidateQueries({ queryKey: ['comparison-stats'] });
    },
  });
}

export function useSubmitEvaluation(comparisonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SubmitEvaluationData) =>
      submitEvaluation(comparisonId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-comparison', comparisonId] });
      qc.invalidateQueries({
        queryKey: ['comparison-evaluations', comparisonId],
      });
      qc.invalidateQueries({ queryKey: ['thread-comparisons'] });
      qc.invalidateQueries({ queryKey: ['comparison-stats'] });
    },
  });
}

export function useComparisonEvaluations(comparisonId: string) {
  return useQuery({
    queryKey: ['comparison-evaluations', comparisonId],
    queryFn: () => getComparisonEvaluations(comparisonId),
    enabled: !!comparisonId,
    staleTime: 15_000,
  });
}

export function useComparisonStats() {
  return useQuery({
    queryKey: ['comparison-stats'],
    queryFn: getComparisonStats,
    staleTime: 30_000,
  });
}
