/**
 * Conductor / Agent OS React Query hooks (mobile monitor + approve).
 *
 * Read hooks poll the control plane; the approve/reject mutation invalidates the
 * approvals + workspaces queries so the UI reflects the new control-plane state.
 * Follows the same query-key / retry conventions as lib/a2a-tasks/hooks.ts.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { log } from '@/lib/logger';
import {
  approveApproval,
  fetchApprovals,
  fetchRuns,
  fetchWorkspaceEvents,
  fetchWorkspaces,
  rejectApproval,
} from './api';
import type {
  AgentOsApproval,
  AgentOsRun,
  ApprovalDecisionResult,
  ConductorRunEvent,
  ConductorWorkspace,
} from './types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const conductorKeys = {
  all: ['conductor'] as const,
  workspaces: () => [...conductorKeys.all, 'workspaces'] as const,
  runs: () => [...conductorKeys.all, 'runs'] as const,
  events: (workspaceId: string) =>
    [...conductorKeys.all, 'events', workspaceId] as const,
  approvals: () => [...conductorKeys.all, 'approvals'] as const,
};

function isNonRetryable(error: Error): boolean {
  return (
    error.message.includes('401') ||
    error.message.includes('403') ||
    error.message.includes('429')
  );
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export function useWorkspaces(
  options?: Omit<UseQueryOptions<ConductorWorkspace[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: conductorKeys.workspaces(),
    queryFn: fetchWorkspaces,
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000,
    retry: (failureCount, error) => (isNonRetryable(error) ? false : failureCount < 2),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Runs (canonical Agent OS TaskRun)
// ---------------------------------------------------------------------------

export function useRuns(
  options?: Omit<UseQueryOptions<AgentOsRun[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: conductorKeys.runs(),
    queryFn: fetchRuns,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
    retry: (failureCount, error) => (isNonRetryable(error) ? false : failureCount < 2),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// RunEvents
// ---------------------------------------------------------------------------

export function useWorkspaceEvents(
  workspaceId: string | undefined,
  options?: Omit<UseQueryOptions<ConductorRunEvent[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: conductorKeys.events(workspaceId || ''),
    queryFn: () => fetchWorkspaceEvents(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
    retry: (failureCount, error) => (isNonRetryable(error) ? false : failureCount < 2),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function useApprovals(
  options?: Omit<UseQueryOptions<AgentOsApproval[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: conductorKeys.approvals(),
    queryFn: fetchApprovals,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
    retry: (failureCount, error) => (isNonRetryable(error) ? false : failureCount < 2),
    ...options,
  });
}

type DecisionInput = { approvalId: string; reason?: string };

/**
 * Approve or reject a pending approval. `decision` selects the verb; on success
 * the approvals + workspaces queries are invalidated so the monitor reflects the
 * advanced control-plane state.
 */
export function useDecideApproval(decision: 'approve' | 'reject') {
  const queryClient = useQueryClient();

  return useMutation<ApprovalDecisionResult, Error, DecisionInput>({
    mutationFn: ({ approvalId, reason }) =>
      decision === 'approve'
        ? approveApproval(approvalId, reason)
        : rejectApproval(approvalId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conductorKeys.approvals() });
      queryClient.invalidateQueries({ queryKey: conductorKeys.workspaces() });
      queryClient.invalidateQueries({ queryKey: conductorKeys.runs() });
    },
    onError: (error) => {
      log.error(`[Conductor] approval ${decision} failed:`, error);
    },
  });
}
