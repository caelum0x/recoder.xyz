/**
 * Proposals System - Type Definitions
 *
 * This module defines the types for the code proposals system, which handles:
 * - Code change proposals with security risk assessment
 * - File changes tracking (write, rename, delete)
 * - Package additions detection
 * - SQL queries tracking
 * - Action proposals (restart, rebuild, refactor)
 * - Tip proposals for user guidance
 * - Approval/rejection workflow
 */

// =============================================================================
// Security Risk Types
// =============================================================================

export type SecurityRiskLevel = 'warning' | 'danger';

export interface SecurityRisk {
  type: SecurityRiskLevel;
  title: string;
  description: string;
}

// =============================================================================
// File Change Types
// =============================================================================

export type FileChangeType = 'write' | 'rename' | 'delete';

export interface FileChange {
  /** File basename */
  name: string;
  /** Full relative path */
  path: string;
  /** Human-readable summary of the change */
  summary: string;
  /** Type of file operation */
  type: FileChangeType;
  /** Whether this is a server-side function (e.g., API route, edge function) */
  isServerFunction: boolean;
}

// =============================================================================
// SQL Query Types
// =============================================================================

export interface SqlQuery {
  /** The SQL query content */
  content: string;
  /** Optional description of what the query does */
  description?: string;
}

// =============================================================================
// Code Proposal Types
// =============================================================================

export interface CodeProposal {
  type: 'code-proposal';
  /** Summary title for the proposal */
  title: string;
  /** Security risks identified in the proposed changes */
  securityRisks: SecurityRisk[];
  /** Files that will be changed */
  filesChanged: FileChange[];
  /** npm packages that will be added */
  packagesAdded: string[];
  /** SQL queries that will be executed */
  sqlQueries: SqlQuery[];
}

// =============================================================================
// Action Proposal Types
// =============================================================================

export interface RestartAppAction {
  id: 'restart-app';
}

export interface SummarizeInNewChatAction {
  id: 'summarize-in-new-chat';
}

export interface WriteCodeProperlyAction {
  id: 'write-code-properly';
}

export interface RefactorFileAction {
  id: 'refactor-file';
  path: string;
}

export interface RebuildAction {
  id: 'rebuild';
}

export interface RestartAction {
  id: 'restart';
}

export interface RefreshAction {
  id: 'refresh';
}

export interface KeepGoingAction {
  id: 'keep-going';
}

export interface InstallDependenciesAction {
  id: 'install-dependencies';
  packages: string[];
}

export interface RunCommandAction {
  id: 'run-command';
  command: string;
}

export type SuggestedAction =
  | RestartAppAction
  | SummarizeInNewChatAction
  | RefactorFileAction
  | WriteCodeProperlyAction
  | RebuildAction
  | RestartAction
  | RefreshAction
  | KeepGoingAction
  | InstallDependenciesAction
  | RunCommandAction;

export interface ActionProposal {
  type: 'action-proposal';
  actions: SuggestedAction[];
}

// =============================================================================
// Tip Proposal Types
// =============================================================================

export interface TipProposal {
  type: 'tip-proposal';
  title: string;
  description: string;
}

// =============================================================================
// Combined Proposal Types
// =============================================================================

export type Proposal = CodeProposal | ActionProposal | TipProposal;

export interface ProposalResult {
  proposal: Proposal;
  chatId: string;
  messageId: string;
}

// =============================================================================
// Approval Result Types
// =============================================================================

export interface ApproveProposalResult {
  success: boolean;
  /** Git commit hash if changes were committed */
  commitHash?: string;
  /** Error message if approval failed */
  error?: string;
  /** Additional files that were modified outside of the proposal */
  extraFiles?: string[];
  /** Error related to extra files */
  extraFilesError?: string;
}

// =============================================================================
// Proposal State Types
// =============================================================================

export type ApprovalState = 'pending' | 'approved' | 'rejected';

export interface ProposalState {
  /** Current approval state */
  state: ApprovalState;
  /** When the state was last updated */
  updatedAt: Date;
  /** ID of the user who approved/rejected (if applicable) */
  userId?: string;
}

// =============================================================================
// Proposal Store Types
// =============================================================================

export interface ProposalStoreState {
  /** Map of chat ID to current proposal */
  proposals: Map<string, ProposalResult>;
  /** Map of message ID to approval state */
  approvalStates: Map<string, ProposalState>;
  /** Whether proposal is currently being processed */
  isProcessing: boolean;
  /** Current error if any */
  error: string | null;
}

// =============================================================================
// Action Callback Types
// =============================================================================

export type ActionHandler<T extends SuggestedAction = SuggestedAction> = (
  action: T,
  context: ActionContext
) => Promise<ActionResult>;

export interface ActionContext {
  chatId: string;
  messageId: string;
  projectId?: string;
  files?: Map<string, string>;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

// =============================================================================
// Security Assessment Types
// =============================================================================

export interface SecurityAssessment {
  risks: SecurityRisk[];
  overallRisk: 'none' | 'low' | 'medium' | 'high';
  requiresReview: boolean;
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  level: SecurityRiskLevel;
  check: (change: FileChange | SqlQuery | string) => boolean;
}
