/**
 * Proposal Types for AI-generated code changes
 * Inspired by dyad's implementation
 *
 * This system allows users to preview AI changes before they are applied.
 */

// ============================================================================
// File Change Types
// ============================================================================

export type FileChangeType = 'create' | 'update' | 'delete';

export interface FileChange {
  /** File name (just the name, not the full path) */
  name: string;
  /** Full file path */
  path: string;
  /** Human-readable summary of what's changing */
  summary: string;
  /** Type of change */
  type: FileChangeType;
  /** Whether this file contains server-side code */
  isServerFunction?: boolean;
  /** Old content (for updates) */
  oldContent?: string;
  /** New content (for creates and updates) */
  newContent?: string;
  /** Line count of changes (additions - deletions) */
  linesDelta?: number;
}

// ============================================================================
// Security Risk Types
// ============================================================================

export type SecurityRiskLevel = 'warning' | 'danger';

export interface SecurityRisk {
  type: SecurityRiskLevel;
  title: string;
  description: string;
}

// ============================================================================
// Package Types
// ============================================================================

export interface PackageInfo {
  name: string;
  version?: string;
  isDev?: boolean;
}

// ============================================================================
// Code Proposal
// ============================================================================

export interface CodeProposal {
  type: 'code-proposal';
  /** Title describing the overall change */
  title: string;
  /** Detected security risks */
  securityRisks: SecurityRisk[];
  /** All file changes in this proposal */
  filesChanged: FileChange[];
  /** Packages being added */
  packagesAdded: string[];
  /** Shell commands being run */
  shellCommands?: string[];
  /** Timestamp when the proposal was created */
  timestamp: Date;
  /** Unique ID for this proposal */
  id: string;
}

// ============================================================================
// Action Summary
// ============================================================================

export interface ActionSummary {
  /** Human-readable summary of what the AI is about to do */
  summary: string;
  /** Number of files being created */
  filesCreated: number;
  /** Number of files being modified */
  filesModified: number;
  /** Number of files being deleted */
  filesDeleted: number;
  /** Total lines added */
  linesAdded: number;
  /** Total lines removed */
  linesRemoved: number;
  /** Packages being installed */
  packages: PackageInfo[];
  /** Shell commands being executed */
  commands: string[];
  /** Estimated time to complete (ms) */
  estimatedTime?: number;
}

// ============================================================================
// Proposal Status
// ============================================================================

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'partial' | 'expired';

// ============================================================================
// Proposal Result (returned from store)
// ============================================================================

export interface ProposalResult {
  proposal: CodeProposal;
  status: ProposalStatus;
  /** Message ID this proposal is associated with */
  messageId: string;
  /** Chat/conversation ID */
  chatId?: string;
  /** Which file changes were approved (for partial approval) */
  approvedChanges?: string[];
  /** Which file changes were rejected (for partial approval) */
  rejectedChanges?: string[];
}

// ============================================================================
// Approval Result
// ============================================================================

export interface ApproveProposalResult {
  success: boolean;
  /** Any error message */
  error?: string;
  /** Files that were actually modified */
  appliedFiles?: string[];
  /** Files that failed to apply */
  failedFiles?: string[];
}

// ============================================================================
// Suggested Actions
// ============================================================================

export type SuggestedActionId =
  | 'restart-app'
  | 'rebuild'
  | 'refresh'
  | 'keep-going'
  | 'refactor-file';

export interface SuggestedAction {
  id: SuggestedActionId;
  /** For refactor-file action */
  path?: string;
}

// ============================================================================
// Action Proposal (for suggesting follow-up actions)
// ============================================================================

export interface ActionProposal {
  type: 'action-proposal';
  actions: SuggestedAction[];
}

// ============================================================================
// Tip Proposal (for showing tips/hints)
// ============================================================================

export interface TipProposal {
  type: 'tip-proposal';
  title: string;
  description: string;
}

// ============================================================================
// Union Type for All Proposals
// ============================================================================

export type Proposal = CodeProposal | ActionProposal | TipProposal;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new code proposal from file changes
 */
export function createCodeProposal(
  title: string,
  filesChanged: FileChange[],
  options: {
    packagesAdded?: string[];
    shellCommands?: string[];
    securityRisks?: SecurityRisk[];
  } = {}
): CodeProposal {
  return {
    type: 'code-proposal',
    id: `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    filesChanged,
    packagesAdded: options.packagesAdded || [],
    shellCommands: options.shellCommands || [],
    securityRisks: options.securityRisks || [],
    timestamp: new Date(),
  };
}

/**
 * Create an action summary from a code proposal
 */
export function createActionSummary(proposal: CodeProposal): ActionSummary {
  const filesCreated = proposal.filesChanged.filter(f => f.type === 'create').length;
  const filesModified = proposal.filesChanged.filter(f => f.type === 'update').length;
  const filesDeleted = proposal.filesChanged.filter(f => f.type === 'delete').length;

  let linesAdded = 0;
  let linesRemoved = 0;

  for (const file of proposal.filesChanged) {
    if (file.type === 'create' && file.newContent) {
      linesAdded += (file.newContent.match(/\n/g) || []).length + 1;
    } else if (file.type === 'delete' && file.oldContent) {
      linesRemoved += (file.oldContent.match(/\n/g) || []).length + 1;
    } else if (file.linesDelta) {
      if (file.linesDelta > 0) {
        linesAdded += file.linesDelta;
      } else {
        linesRemoved += Math.abs(file.linesDelta);
      }
    }
  }

  const packages: PackageInfo[] = proposal.packagesAdded.map(name => ({ name }));

  return {
    summary: proposal.title,
    filesCreated,
    filesModified,
    filesDeleted,
    linesAdded,
    linesRemoved,
    packages,
    commands: proposal.shellCommands || [],
    estimatedTime: (filesCreated + filesModified + filesDeleted) * 500 + packages.length * 2000,
  };
}

/**
 * Check if a proposal has security risks
 */
export function hasSecurityRisks(proposal: CodeProposal): boolean {
  return proposal.securityRisks.length > 0;
}

/**
 * Get the highest severity security risk
 */
export function getHighestRisk(proposal: CodeProposal): SecurityRiskLevel | null {
  if (proposal.securityRisks.some(r => r.type === 'danger')) {
    return 'danger';
  }
  if (proposal.securityRisks.some(r => r.type === 'warning')) {
    return 'warning';
  }
  return null;
}

/**
 * Get a color class based on file change type
 */
export function getFileChangeColor(type: FileChangeType): string {
  switch (type) {
    case 'create':
      return 'text-green-400';
    case 'update':
      return 'text-blue-400';
    case 'delete':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

/**
 * Get an icon name based on file change type
 */
export function getFileChangeIcon(type: FileChangeType): string {
  switch (type) {
    case 'create':
      return 'plus';
    case 'update':
      return 'pencil';
    case 'delete':
      return 'trash';
    default:
      return 'file';
  }
}
