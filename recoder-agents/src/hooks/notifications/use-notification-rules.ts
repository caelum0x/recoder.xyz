'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  notificationRulesApi,
  type NotificationRule,
  type NotificationRuleDetail,
  type CreateNotificationRuleRequest,
  type UpdateNotificationRuleRequest,
  type RuleLogListResponse,
  type TestRuleResult,
} from '@/lib/api/notification-rules';

// ============================================================================
// Query Keys
// ============================================================================

export const notificationRuleKeys = {
  all: ['notification-rules'] as const,
  list: () => [...notificationRuleKeys.all, 'list'] as const,
  detail: (ruleId: string) => [...notificationRuleKeys.all, 'detail', ruleId] as const,
  log: (ruleId?: string) => [...notificationRuleKeys.all, 'log', ruleId ?? 'all'] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

export function useNotificationRules() {
  return useQuery<NotificationRule[]>({
    queryKey: notificationRuleKeys.list(),
    queryFn: () => notificationRulesApi.getRules(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useNotificationRule(ruleId: string | undefined) {
  return useQuery<NotificationRuleDetail>({
    queryKey: notificationRuleKeys.detail(ruleId ?? ''),
    queryFn: () => notificationRulesApi.getRule(ruleId!),
    enabled: !!ruleId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useNotificationRuleLog(ruleId?: string) {
  return useQuery<RuleLogListResponse>({
    queryKey: notificationRuleKeys.log(ruleId),
    queryFn: () => notificationRulesApi.getRuleLog(ruleId),
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateNotificationRuleRequest) =>
      notificationRulesApi.createRule(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationRuleKeys.list() });
      toast.success('Notification rule created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create notification rule');
    },
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ruleId, ...request }: UpdateNotificationRuleRequest & { ruleId: string }) =>
      notificationRulesApi.updateRule(ruleId, request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: notificationRuleKeys.list() });
      queryClient.invalidateQueries({
        queryKey: notificationRuleKeys.detail(variables.ruleId),
      });
      toast.success('Notification rule updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update notification rule');
    },
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => notificationRulesApi.deleteRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationRuleKeys.list() });
      toast.success('Notification rule deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete notification rule');
    },
  });
}

export function useTestRule() {
  return useMutation<TestRuleResult, Error, string>({
    mutationFn: (ruleId: string) => notificationRulesApi.testRule(ruleId),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to test notification rule');
    },
  });
}
