import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  evaluateRouting,
  getRoutingStats,
  type CreateRoutingRuleData,
  type UpdateRoutingRuleData,
} from '@/lib/api/model-routing';

export function useRoutingRules(agentId: string) {
  return useQuery({
    queryKey: ['routing-rules', agentId],
    queryFn: () => listRoutingRules(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useCreateRoutingRule(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRoutingRuleData) =>
      createRoutingRule(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-rules', agentId] });
      qc.invalidateQueries({ queryKey: ['routing-stats', agentId] });
    },
  });
}

export function useUpdateRoutingRule(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: UpdateRoutingRuleData }) =>
      updateRoutingRule(agentId, ruleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-rules', agentId] });
      qc.invalidateQueries({ queryKey: ['routing-stats', agentId] });
    },
  });
}

export function useDeleteRoutingRule(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => deleteRoutingRule(agentId, ruleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routing-rules', agentId] });
      qc.invalidateQueries({ queryKey: ['routing-stats', agentId] });
    },
  });
}

export function useEvaluateRouting(agentId: string) {
  return useMutation({
    mutationFn: (message: string) => evaluateRouting(agentId, message),
  });
}

export function useRoutingStats(agentId: string) {
  return useQuery({
    queryKey: ['routing-stats', agentId],
    queryFn: () => getRoutingStats(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}
