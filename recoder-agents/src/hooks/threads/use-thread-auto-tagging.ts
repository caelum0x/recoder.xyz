import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAutoTagRules,
  createAutoTagRule,
  updateAutoTagRule,
  deleteAutoTagRule,
  applyAutoTags,
  applyAllAutoTags,
  getThreadAutoTags,
  getAutoTagStats,
  type CreateAutoTagRuleData,
  type UpdateAutoTagRuleData,
} from '@/lib/api/thread-auto-tagging';

const autoTagKeys = {
  all: ['auto-tags'] as const,
  rules: () => [...autoTagKeys.all, 'rules'] as const,
  threadTags: (threadId: string) => [...autoTagKeys.all, 'thread', threadId] as const,
  stats: () => [...autoTagKeys.all, 'stats'] as const,
};

export function useAutoTagRules() {
  return useQuery({
    queryKey: autoTagKeys.rules(),
    queryFn: getAutoTagRules,
    staleTime: 60_000,
  });
}

export function useCreateAutoTagRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAutoTagRuleData) => createAutoTagRule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: autoTagKeys.rules() });
    },
  });
}

export function useUpdateAutoTagRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: UpdateAutoTagRuleData }) =>
      updateAutoTagRule(ruleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: autoTagKeys.rules() });
    },
  });
}

export function useDeleteAutoTagRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => deleteAutoTagRule(ruleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: autoTagKeys.all });
    },
  });
}

export function useApplyAutoTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => applyAutoTags(threadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: autoTagKeys.all });
    },
  });
}

export function useApplyAllAutoTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => applyAllAutoTags(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: autoTagKeys.all });
    },
  });
}

export function useThreadAutoTags(threadId: string) {
  return useQuery({
    queryKey: autoTagKeys.threadTags(threadId),
    queryFn: () => getThreadAutoTags(threadId),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useAutoTagStats() {
  return useQuery({
    queryKey: autoTagKeys.stats(),
    queryFn: getAutoTagStats,
    staleTime: 60_000,
  });
}
