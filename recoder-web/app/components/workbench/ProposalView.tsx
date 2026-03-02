/**
 * ProposalView — Container component that connects ProposalPanel to the workbench store.
 * Shows proposal mode toggle, pending proposals list, and handles approve/reject.
 */

import { useCallback, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { ProposalPanel, ProposalList } from './ProposalPanel';
import { toast } from 'react-toastify';
import type { ProposalResult } from '~/lib/types/proposals';

export function ProposalView() {
  const pendingProposals = useStore(workbenchStore.pendingProposals);
  const proposalMode = useStore(workbenchStore.proposalModeEnabled);

  const proposals = useMemo(() => {
    return Array.from(pendingProposals.values());
  }, [pendingProposals]);

  const pendingCount = useMemo(() => {
    return proposals.filter(p => p.status === 'pending').length;
  }, [proposals]);

  const handleApprove = useCallback(async (messageId: string, selectedFiles?: string[]) => {
    const result = await workbenchStore.approveProposal(messageId, selectedFiles);
    if (result.success) {
      toast.success(`Applied ${result.appliedFiles?.length || 0} file(s)`);
    } else {
      toast.error(result.error || 'Failed to apply changes');
    }
  }, []);

  const handleReject = useCallback((messageId: string) => {
    workbenchStore.rejectProposal(messageId);
    toast.info('Changes discarded');
  }, []);

  const handlePartialApprove = useCallback(async (messageId: string, selectedFiles: string[]) => {
    const result = await workbenchStore.approveProposal(messageId, selectedFiles);
    if (result.success) {
      toast.success(`Applied ${result.appliedFiles?.length || 0} of ${selectedFiles.length} file(s)`);
    } else {
      toast.error(result.error || 'Failed to apply changes');
    }
  }, []);

  // Not connected state
  if (!proposalMode && proposals.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-6">
        <div className="i-ph:git-diff text-4xl text-recoder-elements-textTertiary mb-3" />
        <p className="text-sm text-recoder-elements-textSecondary text-center mb-1">
          Proposal Mode
        </p>
        <p className="text-xs text-recoder-elements-textTertiary text-center mb-4 max-w-[220px]">
          Review AI code changes before they are applied to your project.
        </p>
        <button
          onClick={() => workbenchStore.setProposalMode(true)}
          className="px-4 py-2 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-500 transition-colors"
        >
          Enable Proposal Mode
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-recoder-elements-borderColor">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-recoder-elements-textPrimary flex items-center gap-2">
              Proposals
              {pendingCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                  {pendingCount} pending
                </span>
              )}
            </h3>
            <p className="text-xs text-recoder-elements-textSecondary mt-0.5">
              {proposalMode ? 'Reviewing changes before apply' : 'Proposal mode disabled'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {proposals.length > 0 && (
              <button
                onClick={() => workbenchStore.clearProposals()}
                className="text-xs text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => workbenchStore.setProposalMode(!proposalMode)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                proposalMode ? 'bg-purple-600' : 'bg-recoder-elements-borderColor'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                proposalMode ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="i-ph:checks text-3xl text-recoder-elements-textTertiary mb-2" />
            <p className="text-xs text-recoder-elements-textTertiary text-center">
              No pending proposals
            </p>
            <p className="text-[10px] text-recoder-elements-textTertiary text-center mt-1">
              AI changes will appear here for review
            </p>
          </div>
        ) : (
          <div className="p-3">
            <ProposalList
              proposals={proposals.map(p => ({
                proposal: p.proposal,
                status: p.status,
                messageId: p.messageId,
              }))}
              onApprove={handleApprove}
              onReject={handleReject}
              onPartialApprove={handlePartialApprove}
            />
          </div>
        )}
      </div>
    </div>
  );
}
