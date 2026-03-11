'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  runImpactAnalysis,
  getAgentImpactAnalyses,
  getImpactAnalysisDetail,
  updateImpactStatus,
  getImpactStats,
  type ImpactAnalysis,
  type RunImpactAnalysisRequest,
  type UpdateImpactStatusRequest,
  type ImpactStats,
} from '@/lib/api/change-impact';

export function useRunImpactAnalysis() {
  const queryClient = useQueryClient();

  return useMutation<
    ImpactAnalysis,
    Error,
    { agentId: string; body: RunImpactAnalysisRequest }
  >({
    mutationFn: ({ agentId, body }) => runImpactAnalysis(agentId, body),
    onSuccess: (_data, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['impact-analyses', agentId] });
      queryClient.invalidateQueries({ queryKey: ['impact-stats'] });
    },
  });
}

export function useAgentImpactAnalyses(agentId: string | null) {
  return useQuery<ImpactAnalysis[]>({
    queryKey: ['impact-analyses', agentId],
    queryFn: () => getAgentImpactAnalyses(agentId!),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useImpactAnalysisDetail(analysisId: string | null) {
  return useQuery<ImpactAnalysis>({
    queryKey: ['impact-analysis-detail', analysisId],
    queryFn: () => getImpactAnalysisDetail(analysisId!),
    enabled: !!analysisId,
    staleTime: 30_000,
  });
}

export function useUpdateImpactStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    ImpactAnalysis,
    Error,
    { analysisId: string; body: UpdateImpactStatusRequest; agentId: string }
  >({
    mutationFn: ({ analysisId, body }) => updateImpactStatus(analysisId, body),
    onSuccess: (_data, { agentId, analysisId }) => {
      queryClient.invalidateQueries({ queryKey: ['impact-analyses', agentId] });
      queryClient.invalidateQueries({ queryKey: ['impact-analysis-detail', analysisId] });
      queryClient.invalidateQueries({ queryKey: ['impact-stats'] });
    },
  });
}

export function useImpactStats() {
  return useQuery<ImpactStats>({
    queryKey: ['impact-stats'],
    queryFn: () => getImpactStats(),
    staleTime: 60_000,
  });
}
