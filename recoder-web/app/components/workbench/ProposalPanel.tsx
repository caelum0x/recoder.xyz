/**
 * ProposalPanel Component
 *
 * Displays a preview of AI-generated code changes before they are applied.
 * Shows:
 * - List of file changes (create/update/delete)
 * - Package additions
 * - Security warnings
 * - Diff preview for each file
 * - Approve/Reject controls
 *
 * Inspired by dyad's proposal system.
 */

import { memo, useState, useCallback, useMemo } from 'react';
import type {
  CodeProposal,
  FileChange,
  ActionSummary,
  SecurityRisk,
  ProposalStatus,
} from '~/lib/types/proposals';
import {
  createActionSummary,
  getFileChangeColor,
  hasSecurityRisks,
  getHighestRisk,
} from '~/lib/types/proposals';
import { DiffPreview } from './DiffPreview';
import { generateDiff, type FileDiff } from '~/lib/services/diff-preview';

// ============================================================================
// FILE CHANGE BADGE
// ============================================================================

interface FileChangeBadgeProps {
  type: FileChange['type'];
}

const FileChangeBadge = memo(function FileChangeBadge({ type }: FileChangeBadgeProps) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    create: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'New' },
    update: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Modified' },
    delete: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Delete' },
  };

  const { bg, text, label } = config[type] || config.update;

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${bg} ${text}`}>
      {label}
    </span>
  );
});

// ============================================================================
// FILE CHANGE ICON
// ============================================================================

interface FileChangeIconProps {
  type: FileChange['type'];
  className?: string;
}

const FileChangeIcon = memo(function FileChangeIcon({ type, className = 'w-4 h-4' }: FileChangeIconProps) {
  switch (type) {
    case 'create':
      return (
        <svg className={`${className} text-green-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      );
    case 'update':
      return (
        <svg className={`${className} text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    case 'delete':
      return (
        <svg className={`${className} text-red-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    default:
      return (
        <svg className={`${className} text-bolt-elements-textTertiary`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
  }
});

// ============================================================================
// SECURITY WARNING
// ============================================================================

interface SecurityWarningProps {
  risks: SecurityRisk[];
}

const SecurityWarning = memo(function SecurityWarning({ risks }: SecurityWarningProps) {
  if (risks.length === 0) return null;

  const hasDanger = risks.some(r => r.type === 'danger');

  return (
    <div className={`p-3 rounded-lg border ${hasDanger ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
      <div className="flex items-center gap-2 mb-2">
        <svg
          className={`w-5 h-5 ${hasDanger ? 'text-red-400' : 'text-yellow-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className={`text-sm font-medium ${hasDanger ? 'text-red-400' : 'text-yellow-400'}`}>
          {hasDanger ? 'Security Warnings' : 'Warnings'}
        </span>
      </div>
      <ul className="space-y-2">
        {risks.map((risk, index) => (
          <li key={index} className="text-sm">
            <span className={`font-medium ${risk.type === 'danger' ? 'text-red-300' : 'text-yellow-300'}`}>
              {risk.title}:
            </span>{' '}
            <span className="text-bolt-elements-textTertiary">{risk.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

// ============================================================================
// ACTION SUMMARY DISPLAY
// ============================================================================

interface ActionSummaryDisplayProps {
  summary: ActionSummary;
}

const ActionSummaryDisplay = memo(function ActionSummaryDisplay({ summary }: ActionSummaryDisplayProps) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {summary.filesCreated > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-bolt-elements-textTertiary">
            {summary.filesCreated} new {summary.filesCreated === 1 ? 'file' : 'files'}
          </span>
        </div>
      )}
      {summary.filesModified > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-bolt-elements-textTertiary">
            {summary.filesModified} modified
          </span>
        </div>
      )}
      {summary.filesDeleted > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-bolt-elements-textTertiary">
            {summary.filesDeleted} deleted
          </span>
        </div>
      )}
      {summary.linesAdded > 0 && (
        <span className="text-green-400">+{summary.linesAdded}</span>
      )}
      {summary.linesRemoved > 0 && (
        <span className="text-red-400">-{summary.linesRemoved}</span>
      )}
      {summary.packages.length > 0 && (
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span className="text-bolt-elements-textTertiary">
            {summary.packages.length} {summary.packages.length === 1 ? 'package' : 'packages'}
          </span>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// FILE CHANGE ITEM
// ============================================================================

interface FileChangeItemProps {
  file: FileChange;
  selected: boolean;
  onToggle: () => void;
  onShowDiff: () => void;
  showCheckbox: boolean;
}

const FileChangeItem = memo(function FileChangeItem({
  file,
  selected,
  onToggle,
  onShowDiff,
  showCheckbox,
}: FileChangeItemProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColorActive'
          : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive'
      }`}
      onClick={onShowDiff}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="w-4 h-4 rounded border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-blue-500 focus:ring-blue-500"
        />
      )}

      <FileChangeIcon type={file.type} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-bolt-elements-textPrimary truncate">
            {file.path}
          </span>
          <FileChangeBadge type={file.type} />
          {file.isServerFunction && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">
              Server
            </span>
          )}
        </div>
        {file.summary && (
          <p className="text-xs text-bolt-elements-textTertiary mt-1 truncate">
            {file.summary}
          </p>
        )}
      </div>

      {file.type === 'update' && file.oldContent && file.newContent && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowDiff();
          }}
          className="px-2 py-1 text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
        >
          View Diff
        </button>
      )}
    </div>
  );
});

// ============================================================================
// PACKAGES SECTION
// ============================================================================

interface PackagesSectionProps {
  packages: string[];
}

const PackagesSection = memo(function PackagesSection({ packages }: PackagesSectionProps) {
  if (packages.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        Packages to Install
      </h4>
      <div className="flex flex-wrap gap-2">
        {packages.map((pkg, index) => (
          <span
            key={index}
            className="px-2 py-1 text-xs font-mono bg-purple-500/10 text-purple-400 rounded"
          >
            {pkg}
          </span>
        ))}
      </div>
    </div>
  );
});

// ============================================================================
// DIFF MODAL
// ============================================================================

interface DiffModalProps {
  file: FileChange;
  onClose: () => void;
}

const DiffModal = memo(function DiffModal({ file, onClose }: DiffModalProps) {
  const diff = useMemo(() => {
    if (file.oldContent !== undefined && file.newContent !== undefined) {
      return generateDiff(file.path, file.oldContent, file.newContent);
    }
    return null;
  }, [file]);

  if (!diff) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-4xl max-h-[80vh] bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="flex items-center gap-3">
            <FileChangeIcon type={file.type} />
            <span className="font-mono text-sm text-bolt-elements-textPrimary">{file.path}</span>
            <FileChangeBadge type={file.type} />
          </div>
          <button
            onClick={onClose}
            className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto p-4">
          <DiffPreview
            diff={diff}
            onAccept={onClose}
            onReject={onClose}
          />
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// MAIN PROPOSAL PANEL
// ============================================================================

export interface ProposalPanelProps {
  proposal: CodeProposal;
  onApprove: (selectedFiles?: string[]) => void;
  onReject: () => void;
  onPartialApprove?: (selectedFiles: string[]) => void;
  status?: ProposalStatus;
  isLoading?: boolean;
  allowPartialApproval?: boolean;
}

export const ProposalPanel = memo(function ProposalPanel({
  proposal,
  onApprove,
  onReject,
  onPartialApprove,
  status = 'pending',
  isLoading = false,
  allowPartialApproval = true,
}: ProposalPanelProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(
    new Set(proposal.filesChanged.map(f => f.path))
  );
  const [diffFile, setDiffFile] = useState<FileChange | null>(null);
  const [expanded, setExpanded] = useState(true);

  const summary = useMemo(() => createActionSummary(proposal), [proposal]);
  const highestRisk = useMemo(() => getHighestRisk(proposal), [proposal]);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleApprove = useCallback(() => {
    if (allowPartialApproval && selectedFiles.size < proposal.filesChanged.length) {
      onPartialApprove?.(Array.from(selectedFiles));
    } else {
      onApprove();
    }
  }, [allowPartialApproval, selectedFiles, proposal.filesChanged.length, onPartialApprove, onApprove]);

  const selectAll = useCallback(() => {
    setSelectedFiles(new Set(proposal.filesChanged.map(f => f.path)));
  }, [proposal.filesChanged]);

  const selectNone = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isPartial = status === 'partial';
  const isResolved = isApproved || isRejected || isPartial;

  return (
    <div className={`bg-bolt-elements-background-depth-1 rounded-lg border overflow-hidden ${
      highestRisk === 'danger' ? 'border-red-500/50' :
      highestRisk === 'warning' ? 'border-yellow-500/50' :
      'border-bolt-elements-borderColor'
    }`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-bolt-elements-background-depth-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-5 h-5 text-bolt-elements-textTertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">
              {proposal.title}
            </h3>
            {!expanded && (
              <ActionSummaryDisplay summary={summary} />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isResolved ? (
            <span className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              isApproved ? 'bg-green-500/20 text-green-400' :
              isRejected ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Partially Applied'}
            </span>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleApprove();
                }}
                disabled={isLoading || selectedFiles.size === 0}
                className="px-3 py-1.5 text-xs font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading && (
                  <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                )}
                {allowPartialApproval && selectedFiles.size < proposal.filesChanged.length
                  ? `Approve Selected (${selectedFiles.size}/${proposal.filesChanged.length})`
                  : 'Approve All'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Summary */}
          <ActionSummaryDisplay summary={summary} />

          {/* Security Warnings */}
          {hasSecurityRisks(proposal) && (
            <SecurityWarning risks={proposal.securityRisks} />
          )}

          {/* Selection controls */}
          {allowPartialApproval && !isResolved && proposal.filesChanged.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={selectAll}
                className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
              >
                Select all
              </button>
              <span className="text-bolt-elements-textTertiary">|</span>
              <button
                onClick={selectNone}
                className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
              >
                Select none
              </button>
              <span className="text-bolt-elements-textTertiary ml-auto">
                {selectedFiles.size} of {proposal.filesChanged.length} selected
              </span>
            </div>
          )}

          {/* File Changes */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
              File Changes
            </h4>
            <div className="space-y-2">
              {proposal.filesChanged.map((file) => (
                <FileChangeItem
                  key={file.path}
                  file={file}
                  selected={selectedFiles.has(file.path)}
                  onToggle={() => toggleFile(file.path)}
                  onShowDiff={() => setDiffFile(file)}
                  showCheckbox={allowPartialApproval && !isResolved}
                />
              ))}
            </div>
          </div>

          {/* Packages */}
          <PackagesSection packages={proposal.packagesAdded} />

          {/* Shell Commands */}
          {proposal.shellCommands && proposal.shellCommands.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Shell Commands
              </h4>
              <div className="space-y-1">
                {proposal.shellCommands.map((cmd, index) => (
                  <div
                    key={index}
                    className="px-3 py-2 font-mono text-xs bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary rounded"
                  >
                    $ {cmd}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diff Modal */}
      {diffFile && (
        <DiffModal
          file={diffFile}
          onClose={() => setDiffFile(null)}
        />
      )}
    </div>
  );
});

// ============================================================================
// COMPACT PROPOSAL INDICATOR
// ============================================================================

export interface CompactProposalIndicatorProps {
  proposal: CodeProposal;
  status: ProposalStatus;
  onClick?: () => void;
}

export const CompactProposalIndicator = memo(function CompactProposalIndicator({
  proposal,
  status,
  onClick,
}: CompactProposalIndicatorProps) {
  const summary = useMemo(() => createActionSummary(proposal), [proposal]);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-colors"
    >
      {status === 'pending' ? (
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
      ) : status === 'approved' ? (
        <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      )}

      <span className="text-sm text-bolt-elements-textPrimary">
        {summary.filesCreated + summary.filesModified + summary.filesDeleted} files
      </span>

      {status === 'pending' && (
        <span className="text-xs text-yellow-400">Review changes</span>
      )}
    </button>
  );
});

// ============================================================================
// PROPOSAL LIST
// ============================================================================

export interface ProposalListProps {
  proposals: Array<{ proposal: CodeProposal; status: ProposalStatus; messageId: string }>;
  onApprove: (messageId: string, selectedFiles?: string[]) => void;
  onReject: (messageId: string) => void;
  onPartialApprove?: (messageId: string, selectedFiles: string[]) => void;
}

export const ProposalList = memo(function ProposalList({
  proposals,
  onApprove,
  onReject,
  onPartialApprove,
}: ProposalListProps) {
  if (proposals.length === 0) {
    return null;
  }

  const pendingProposals = proposals.filter(p => p.status === 'pending');

  return (
    <div className="space-y-4">
      {pendingProposals.length > 0 && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">
            Pending Proposals ({pendingProposals.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => pendingProposals.forEach(p => onReject(p.messageId))}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Reject all
            </button>
            <button
              onClick={() => pendingProposals.forEach(p => onApprove(p.messageId))}
              className="text-xs text-green-400 hover:text-green-300"
            >
              Approve all
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {proposals.map(({ proposal, status, messageId }) => (
          <ProposalPanel
            key={proposal.id}
            proposal={proposal}
            status={status}
            onApprove={(selectedFiles) => onApprove(messageId, selectedFiles)}
            onReject={() => onReject(messageId)}
            onPartialApprove={(selectedFiles) => onPartialApprove?.(messageId, selectedFiles)}
          />
        ))}
      </div>
    </div>
  );
});

export default ProposalPanel;
