'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgentChangelog,
  createChangelogEntry,
  getChangelogSummary,
  getChangelogDiff,
  type ChangelogListResponse,
  type ChangelogCreateRequest,
  type ChangelogSummaryResponse,
  type ChangelogEntry,
} from '@/lib/api/agent-changelog';

export const changelogKeys = {
  all: ['agent-changelog'] as const,
  list: (agentId: string, changeType?: string, page?: number) =>
    [...changelogKeys.all, 'list', agentId, changeType, page] as const,
  summary: (agentId: string, days?: number) =>
    [...changelogKeys.all, 'summary', agentId, days] as const,
  diff: (agentId: string, changeId: string) =>
    [...changelogKeys.all, 'diff', agentId, changeId] as const,
};

export function useAgentChangelog(
  agentId: string,
  options?: { changeType?: string; page?: number; pageSize?: number; enabled?: boolean }
) {
  return useQuery<ChangelogListResponse>({
    queryKey: changelogKeys.list(agentId, options?.changeType, options?.page),
    queryFn: () =>
      getAgentChangelog(agentId, {
        changeType: options?.changeType,
        page: options?.page,
        pageSize: options?.pageSize,
      }),
    enabled: options?.enabled !== false && !!agentId,
    staleTime: 30_000,
  });
}

export function useChangelogSummary(
  agentId: string,
  days: number = 30,
  options?: { enabled?: boolean }
) {
  return useQuery<ChangelogSummaryResponse>({
    queryKey: changelogKeys.summary(agentId, days),
    queryFn: () => getChangelogSummary(agentId, days),
    enabled: options?.enabled !== false && !!agentId,
    staleTime: 60_000,
  });
}

export function useChangelogDiff(
  agentId: string,
  changeId: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ChangelogEntry>({
    queryKey: changelogKeys.diff(agentId, changeId),
    queryFn: () => getChangelogDiff(agentId, changeId),
    enabled: options?.enabled !== false && !!agentId && !!changeId,
    staleTime: 5 * 60_000,
  });
}

export function useCreateChangelogEntry(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChangelogCreateRequest) =>
      createChangelogEntry(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: changelogKeys.all,
      });
    },
  });
}
