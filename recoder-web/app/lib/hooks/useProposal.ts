/**
 * useProposal Hook
 *
 * Provides access to the proposal system for AI-generated code changes.
 * Inspired by dyad's useProposal hook.
 */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import type {
  CodeProposal,
  ProposalResult,
  ProposalStatus,
  ApproveProposalResult,
} from '~/lib/types/proposals';

// ============================================================================
// Hook Return Type
// ============================================================================

export interface UseProposalReturn {
  /** Whether proposal mode is enabled */
  proposalModeEnabled: boolean;
  /** Toggle proposal mode on/off */
  setProposalMode: (enabled: boolean) => void;
  /** All pending proposals */
  pendingProposals: ProposalResult[];
  /** Number of pending proposals */
  pendingCount: number;
  /** Whether there are any pending proposals */
  hasPending: boolean;
  /** Get a specific proposal by message ID */
  getProposal: (messageId: string) => ProposalResult | undefined;
  /** Approve a proposal (optionally with selected files for partial approval) */
  approveProposal: (messageId: string, selectedFiles?: string[]) => Promise<ApproveProposalResult>;
  /** Reject a proposal */
  rejectProposal: (messageId: string) => void;
  /** Approve all pending proposals */
  approveAll: () => Promise<void>;
  /** Reject all pending proposals */
  rejectAll: () => void;
  /** Clear all proposals */
  clearProposals: () => void;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useProposal(): UseProposalReturn {
  const proposalModeEnabled = useStore(workbenchStore.proposalModeEnabled);
  const pendingProposalsMap = useStore(workbenchStore.pendingProposals);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Convert Map to array of pending proposals
  const pendingProposals = Array.from(pendingProposalsMap.values())
    .filter(p => p.status === 'pending');

  const pendingCount = pendingProposals.length;
  const hasPending = pendingCount > 0;

  const setProposalMode = useCallback((enabled: boolean) => {
    workbenchStore.setProposalMode(enabled);
  }, []);

  const getProposal = useCallback((messageId: string): ProposalResult | undefined => {
    return workbenchStore.getProposal(messageId);
  }, []);

  const approveProposal = useCallback(async (
    messageId: string,
    selectedFiles?: string[]
  ): Promise<ApproveProposalResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await workbenchStore.approveProposal(messageId, selectedFiles);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to approve proposal');
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const rejectProposal = useCallback((messageId: string) => {
    workbenchStore.rejectProposal(messageId);
  }, []);

  const approveAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      for (const proposal of pendingProposals) {
        await workbenchStore.approveProposal(proposal.messageId);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to approve all proposals');
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [pendingProposals]);

  const rejectAll = useCallback(() => {
    for (const proposal of pendingProposals) {
      workbenchStore.rejectProposal(proposal.messageId);
    }
  }, [pendingProposals]);

  const clearProposals = useCallback(() => {
    workbenchStore.clearProposals();
  }, []);

  return {
    proposalModeEnabled,
    setProposalMode,
    pendingProposals,
    pendingCount,
    hasPending,
    getProposal,
    approveProposal,
    rejectProposal,
    approveAll,
    rejectAll,
    clearProposals,
    isLoading,
    error,
  };
}

// ============================================================================
// Hook for a specific proposal
// ============================================================================

export interface UseSpecificProposalReturn {
  /** The proposal result (or undefined if not found) */
  proposal: ProposalResult | undefined;
  /** The code proposal data */
  codeProposal: CodeProposal | undefined;
  /** Current status of the proposal */
  status: ProposalStatus | undefined;
  /** Whether this proposal is pending */
  isPending: boolean;
  /** Approve this proposal */
  approve: (selectedFiles?: string[]) => Promise<ApproveProposalResult>;
  /** Reject this proposal */
  reject: () => void;
  /** Loading state */
  isLoading: boolean;
}

export function useSpecificProposal(messageId: string): UseSpecificProposalReturn {
  const pendingProposalsMap = useStore(workbenchStore.pendingProposals);
  const [isLoading, setIsLoading] = useState(false);

  const proposal = pendingProposalsMap.get(messageId);
  const codeProposal = proposal?.proposal;
  const status = proposal?.status;
  const isPending = status === 'pending';

  const approve = useCallback(async (selectedFiles?: string[]): Promise<ApproveProposalResult> => {
    setIsLoading(true);
    try {
      return await workbenchStore.approveProposal(messageId, selectedFiles);
    } finally {
      setIsLoading(false);
    }
  }, [messageId]);

  const reject = useCallback(() => {
    workbenchStore.rejectProposal(messageId);
  }, [messageId]);

  return {
    proposal,
    codeProposal,
    status,
    isPending,
    approve,
    reject,
    isLoading,
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default useProposal;
