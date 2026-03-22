'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  checkQuota,
  listAlertEvents,
  markEventRead,
  markAllEventsRead,
  getQuotaAlertStats,
  type QuotaAlertRule,
  type QuotaAlertEvent,
  type QuotaAlertStats,
  type CreateAlertRuleData,
  type CheckQuotaData,
  type CheckQuotaResult,
  type ListAlertEventsOptions,
} from '@/lib/api/quota-alerts';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const quotaAlertKeys = {
  all: ['quota-alerts'] as const,
  rules: () => [...quotaAlertKeys.all, 'rules'] as const,
  events: (options?: ListAlertEventsOptions) =>
    [...quotaAlertKeys.all, 'events', options] as const,
  stats: () => [...quotaAlertKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks — Rules
// ---------------------------------------------------------------------------

export function useAlertRules() {
  return useQuery<QuotaAlertRule[]>({
    queryKey: quotaAlertKeys.rules(),
    queryFn: listAlertRules,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation<QuotaAlertRule, Error, CreateAlertRuleData>({
    mutationFn: createAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.rules() });
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.stats() });
    },
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation<
    QuotaAlertRule,
    Error,
    { id: string; data: Partial<CreateAlertRuleData> & { is_active?: boolean } }
  >({
    mutationFn: ({ id, data }) => updateAlertRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.rules() });
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.stats() });
    },
  });
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.rules() });
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.stats() });
    },
  });
}

// ---------------------------------------------------------------------------
// Hook — Check
// ---------------------------------------------------------------------------

export function useCheckQuota() {
  return useMutation<CheckQuotaResult, Error, CheckQuotaData>({
    mutationFn: checkQuota,
  });
}

// ---------------------------------------------------------------------------
// Hooks — Events
// ---------------------------------------------------------------------------

export function useAlertEvents(options?: ListAlertEventsOptions) {
  return useQuery<QuotaAlertEvent[]>({
    queryKey: quotaAlertKeys.events(options),
    queryFn: () => listAlertEvents(options),
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
}

export function useMarkEventRead() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: markEventRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.events() });
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.stats() });
    },
  });
}

export function useMarkAllEventsRead() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => markAllEventsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.events() });
      queryClient.invalidateQueries({ queryKey: quotaAlertKeys.stats() });
    },
  });
}

// ---------------------------------------------------------------------------
// Hook — Stats
// ---------------------------------------------------------------------------

export function useQuotaAlertStats() {
  return useQuery<QuotaAlertStats>({
    queryKey: quotaAlertKeys.stats(),
    queryFn: getQuotaAlertStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: 'always',
  });
}

export type {
  QuotaAlertRule,
  QuotaAlertEvent,
  QuotaAlertStats,
  CreateAlertRuleData,
  CheckQuotaData,
  CheckQuotaResult,
  ListAlertEventsOptions,
};
