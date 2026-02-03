/**
 * Proposal Store
 *
 * Manages proposal state using nanostores for reactive updates.
 * Provides stores for:
 * - Current proposals per chat
 * - Approval states
 * - Processing status
 */

import { atom, map, computed } from 'nanostores';
import type {
  Proposal,
  ProposalResult,
  ProposalState,
  ApprovalState,
  CodeProposal,
  ActionProposal,
  TipProposal,
} from './types';

// =============================================================================
// Core Stores
// =============================================================================

/** Map of chat ID to current proposal result */
export const proposalsStore = map<Record<string, ProposalResult | null>>({});

/** Map of message ID to approval state */
export const approvalStatesStore = map<Record<string, ProposalState>>({});

/** Whether a proposal is currently being processed */
export const isProcessingStore = atom<boolean>(false);

/** Current processing chat ID */
export const processingChatIdStore = atom<string | null>(null);

/** Current error if any */
export const errorStore = atom<string | null>(null);

// =============================================================================
// Computed Stores
// =============================================================================

/**
 * Get the current proposal for a specific chat.
 */
export function getProposalForChat(chatId: string): ProposalResult | null {
  return proposalsStore.get()[chatId] || null;
}

/**
 * Get the approval state for a specific message.
 */
export function getApprovalState(messageId: string): ProposalState | null {
  return approvalStatesStore.get()[messageId] || null;
}

/**
 * Check if a message has been approved.
 */
export function isMessageApproved(messageId: string): boolean {
  const state = approvalStatesStore.get()[messageId];
  return state?.state === 'approved';
}

/**
 * Check if a message has been rejected.
 */
export function isMessageRejected(messageId: string): boolean {
  const state = approvalStatesStore.get()[messageId];
  return state?.state === 'rejected';
}

/**
 * Check if a message is pending approval.
 */
export function isMessagePending(messageId: string): boolean {
  const state = approvalStatesStore.get()[messageId];
  return !state || state.state === 'pending';
}

// =============================================================================
// Actions
// =============================================================================

/**
 * Set the proposal for a chat.
 */
export function setProposal(chatId: string, proposal: ProposalResult | null) {
  proposalsStore.setKey(chatId, proposal);
}

/**
 * Clear the proposal for a chat.
 */
export function clearProposal(chatId: string) {
  proposalsStore.setKey(chatId, null);
}

/**
 * Clear all proposals.
 */
export function clearAllProposals() {
  proposalsStore.set({});
}

/**
 * Set the approval state for a message.
 */
export function setApprovalState(
  messageId: string,
  state: ApprovalState,
  userId?: string
) {
  approvalStatesStore.setKey(messageId, {
    state,
    updatedAt: new Date(),
    userId,
  });
}

/**
 * Mark a message as approved.
 */
export function approveMessage(messageId: string, userId?: string) {
  setApprovalState(messageId, 'approved', userId);
}

/**
 * Mark a message as rejected.
 */
export function rejectMessage(messageId: string, userId?: string) {
  setApprovalState(messageId, 'rejected', userId);
}

/**
 * Mark a message as pending.
 */
export function resetMessageState(messageId: string) {
  setApprovalState(messageId, 'pending');
}

/**
 * Clear approval state for a message.
 */
export function clearApprovalState(messageId: string) {
  const current = approvalStatesStore.get();
  const { [messageId]: _, ...rest } = current;
  approvalStatesStore.set(rest);
}

/**
 * Clear all approval states.
 */
export function clearAllApprovalStates() {
  approvalStatesStore.set({});
}

/**
 * Set processing state.
 */
export function setProcessing(isProcessing: boolean, chatId?: string) {
  isProcessingStore.set(isProcessing);
  processingChatIdStore.set(isProcessing ? chatId || null : null);
}

/**
 * Set error.
 */
export function setError(error: string | null) {
  errorStore.set(error);
}

/**
 * Clear error.
 */
export function clearError() {
  errorStore.set(null);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a proposal is a code proposal.
 */
export function isCodeProposal(proposal: Proposal): proposal is CodeProposal {
  return proposal.type === 'code-proposal';
}

/**
 * Check if a proposal is an action proposal.
 */
export function isActionProposal(proposal: Proposal): proposal is ActionProposal {
  return proposal.type === 'action-proposal';
}

/**
 * Check if a proposal is a tip proposal.
 */
export function isTipProposal(proposal: Proposal): proposal is TipProposal {
  return proposal.type === 'tip-proposal';
}

/**
 * Get the count of changes in a code proposal.
 */
export function getProposalChangesCount(proposal: CodeProposal): number {
  return (
    proposal.filesChanged.length +
    proposal.packagesAdded.length +
    proposal.sqlQueries.length
  );
}

/**
 * Get a summary of the proposal.
 */
export function getProposalSummary(proposal: Proposal): string {
  switch (proposal.type) {
    case 'code-proposal': {
      const parts: string[] = [];
      if (proposal.filesChanged.length > 0) {
        parts.push(
          `${proposal.filesChanged.length} file${proposal.filesChanged.length > 1 ? 's' : ''}`
        );
      }
      if (proposal.packagesAdded.length > 0) {
        parts.push(
          `${proposal.packagesAdded.length} package${proposal.packagesAdded.length > 1 ? 's' : ''}`
        );
      }
      if (proposal.sqlQueries.length > 0) {
        parts.push(
          `${proposal.sqlQueries.length} SQL quer${proposal.sqlQueries.length > 1 ? 'ies' : 'y'}`
        );
      }
      return parts.length > 0 ? parts.join(', ') : 'No changes';
    }
    case 'action-proposal':
      return `${proposal.actions.length} suggested action${proposal.actions.length > 1 ? 's' : ''}`;
    case 'tip-proposal':
      return proposal.title;
    default:
      return 'Unknown proposal';
  }
}

/**
 * Get all pending proposals.
 */
export function getPendingProposals(): ProposalResult[] {
  const proposals = proposalsStore.get();
  const approvalStates = approvalStatesStore.get();

  return Object.values(proposals).filter((proposal): proposal is ProposalResult => {
    if (!proposal) return false;
    const state = approvalStates[proposal.messageId];
    return !state || state.state === 'pending';
  });
}

/**
 * Get all code proposals with files to write.
 */
export function getCodeProposalsWithWrites(): Array<ProposalResult & { proposal: CodeProposal }> {
  const proposals = proposalsStore.get();

  return Object.values(proposals).filter(
    (p): p is ProposalResult & { proposal: CodeProposal } =>
      p !== null &&
      p.proposal.type === 'code-proposal' &&
      p.proposal.filesChanged.some((f) => f.type === 'write')
  );
}
