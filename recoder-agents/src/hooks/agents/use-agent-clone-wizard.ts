'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getClonePreview,
  cloneAgentWizard,
  getCloneHistory,
  getCloneSuggestions,
  type ClonePreviewResponse,
  type CloneAgentWizardRequest,
  type CloneAgentWizardResponse,
  type CloneHistoryWizardResponse,
  type CloneSuggestion,
} from '@/lib/api/agent-clone-wizard';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const cloneWizardKeys = {
  all: ['clone-wizard'] as const,
  preview: (agentId: string) => [...cloneWizardKeys.all, 'preview', agentId] as const,
  history: () => [...cloneWizardKeys.all, 'history'] as const,
  suggestions: (agentId: string) => [...cloneWizardKeys.all, 'suggestions', agentId] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch clone preview for an agent (sections available with counts).
 */
export function useClonePreview(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<ClonePreviewResponse>({
    queryKey: cloneWizardKeys.preview(agentId),
    queryFn: () => getClonePreview(agentId),
    staleTime: 30_000,
    gcTime: 120_000,
    enabled: !!agentId && options?.enabled !== false,
  });
}

/**
 * Execute a wizard-style clone. Invalidates agents and clone history on success.
 */
export function useCloneAgent() {
  const queryClient = useQueryClient();

  return useMutation<
    CloneAgentWizardResponse,
    Error,
    { agentId: string; request: CloneAgentWizardRequest }
  >({
    mutationFn: ({ agentId, request }) => cloneAgentWizard(agentId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: cloneWizardKeys.history() });
    },
  });
}

/**
 * Fetch clone history for the current user.
 */
export function useCloneHistory(limit?: number, options?: { enabled?: boolean }) {
  return useQuery<CloneHistoryWizardResponse>({
    queryKey: cloneWizardKeys.history(),
    queryFn: () => getCloneHistory(limit),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch clone suggestions (name + tweaks) for an agent.
 */
export function useCloneSuggestions(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<CloneSuggestion>({
    queryKey: cloneWizardKeys.suggestions(agentId),
    queryFn: () => getCloneSuggestions(agentId),
    staleTime: 60_000,
    gcTime: 120_000,
    enabled: !!agentId && options?.enabled !== false,
  });
}
