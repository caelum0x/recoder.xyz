/**
 * Proposals System
 * Copied from Dyad - Provides code proposals with security risk assessment,
 * file changes tracking, and approval workflow
 */

import { z } from 'zod';
import { atom, map } from 'nanostores';

// =============================================================================
// Schemas
// =============================================================================

export const SecurityRiskSchema = z.object({
  type: z.enum(['warning', 'danger']),
  title: z.string(),
  description: z.string(),
});

export const FileChangeSchema = z.object({
  name: z.string(),
  path: z.string(),
  summary: z.string(),
  type: z.enum(['write', 'rename', 'delete']),
  isServerFunction: z.boolean(),
  // Extended fields
  content: z.string().optional(),
  originalContent: z.string().optional(),
  diff: z.string().optional(),
});

export const SqlQuerySchema = z.object({
  content: z.string(),
  description: z.string().optional(),
});

export const CodeProposalSchema = z.object({
  type: z.literal('code-proposal'),
  title: z.string(),
  securityRisks: z.array(SecurityRiskSchema),
  filesChanged: z.array(FileChangeSchema),
  packagesAdded: z.array(z.string()),
  sqlQueries: z.array(SqlQuerySchema),
});

// Action types
export const RestartAppActionSchema = z.object({ id: z.literal('restart-app') });
export const SummarizeInNewChatActionSchema = z.object({ id: z.literal('summarize-in-new-chat') });
export const WriteCodeProperlyActionSchema = z.object({ id: z.literal('write-code-properly') });
export const RefactorFileActionSchema = z.object({
  id: z.literal('refactor-file'),
  path: z.string(),
});
export const RebuildActionSchema = z.object({ id: z.literal('rebuild') });
export const RestartActionSchema = z.object({ id: z.literal('restart') });
export const RefreshActionSchema = z.object({ id: z.literal('refresh') });
export const KeepGoingActionSchema = z.object({ id: z.literal('keep-going') });
export const RunTestsActionSchema = z.object({ id: z.literal('run-tests') });
export const InstallDepsActionSchema = z.object({ id: z.literal('install-deps') });

export const SuggestedActionSchema = z.union([
  RestartAppActionSchema,
  SummarizeInNewChatActionSchema,
  RefactorFileActionSchema,
  WriteCodeProperlyActionSchema,
  RebuildActionSchema,
  RestartActionSchema,
  RefreshActionSchema,
  KeepGoingActionSchema,
  RunTestsActionSchema,
  InstallDepsActionSchema,
]);

export const ActionProposalSchema = z.object({
  type: z.literal('action-proposal'),
  actions: z.array(SuggestedActionSchema),
});

export const TipProposalSchema = z.object({
  type: z.literal('tip-proposal'),
  title: z.string(),
  description: z.string(),
});

export const ProposalSchema = z.union([
  CodeProposalSchema,
  ActionProposalSchema,
  TipProposalSchema,
]);

export const ProposalResultSchema = z
  .object({
    proposal: ProposalSchema,
    chatId: z.string(),
    messageId: z.string(),
    projectId: z.string(),
    createdAt: z.string(),
    status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  })
  .nullable();

export const ApproveProposalResultSchema = z.object({
  success: z.boolean(),
  commitHash: z.string().optional(),
  error: z.string().optional(),
  extraFiles: z.array(z.string()).optional(),
  extraFilesError: z.string().optional(),
  appliedAt: z.string().optional(),
});

// =============================================================================
// Types
// =============================================================================

export type SecurityRisk = z.infer<typeof SecurityRiskSchema>;
export type FileChange = z.infer<typeof FileChangeSchema>;
export type SqlQuery = z.infer<typeof SqlQuerySchema>;
export type CodeProposal = z.infer<typeof CodeProposalSchema>;
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;
export type ActionProposal = z.infer<typeof ActionProposalSchema>;
export type TipProposal = z.infer<typeof TipProposalSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalResult = z.infer<typeof ProposalResultSchema>;
export type ApproveProposalResult = z.infer<typeof ApproveProposalResultSchema>;

// =============================================================================
// State
// =============================================================================

export const proposalsStore = map<Record<string, ProposalResult>>({});
export const activeProposalId = atom<string | null>(null);
export const isProcessingProposal = atom(false);

// =============================================================================
// Proposal Helpers
// =============================================================================

/**
 * Create a unique proposal ID
 */
export function createProposalId(): string {
  return `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a code proposal from AI response
 */
export function createCodeProposal(params: {
  title: string;
  filesChanged: FileChange[];
  packagesAdded?: string[];
  sqlQueries?: SqlQuery[];
  securityRisks?: SecurityRisk[];
}): CodeProposal {
  return {
    type: 'code-proposal',
    title: params.title,
    filesChanged: params.filesChanged,
    packagesAdded: params.packagesAdded || [],
    sqlQueries: params.sqlQueries || [],
    securityRisks: params.securityRisks || [],
  };
}

/**
 * Create an action proposal
 */
export function createActionProposal(actions: SuggestedAction[]): ActionProposal {
  return {
    type: 'action-proposal',
    actions,
  };
}

/**
 * Create a tip proposal
 */
export function createTipProposal(title: string, description: string): TipProposal {
  return {
    type: 'tip-proposal',
    title,
    description,
  };
}

/**
 * Create a full proposal result
 */
export function createProposalResult(
  proposal: Proposal,
  chatId: string,
  messageId: string,
  projectId: string
): NonNullable<ProposalResult> {
  return {
    proposal,
    chatId,
    messageId,
    projectId,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

// =============================================================================
// Proposal Actions
// =============================================================================

/**
 * Add a proposal to the store
 */
export function addProposal(proposalResult: NonNullable<ProposalResult>): string {
  const id = createProposalId();
  proposalsStore.setKey(id, proposalResult);
  activeProposalId.set(id);
  return id;
}

/**
 * Get a proposal by ID
 */
export function getProposal(id: string): ProposalResult | undefined {
  return proposalsStore.get()[id];
}

/**
 * Get the active proposal
 */
export function getActiveProposal(): ProposalResult | null {
  const id = activeProposalId.get();
  if (!id) return null;
  return proposalsStore.get()[id] || null;
}

/**
 * Get all pending proposals for a project
 */
export function getPendingProposals(projectId: string): Array<{ id: string; proposal: ProposalResult }> {
  const all = proposalsStore.get();
  return Object.entries(all)
    .filter(([_, p]) => p?.projectId === projectId && p?.status === 'pending')
    .map(([id, proposal]) => ({ id, proposal: proposal! }));
}

/**
 * Update proposal status
 */
export function updateProposalStatus(
  id: string,
  status: 'pending' | 'approved' | 'rejected' | 'expired'
): void {
  const proposal = proposalsStore.get()[id];
  if (proposal) {
    proposalsStore.setKey(id, { ...proposal, status });
  }
}

/**
 * Approve a proposal
 */
export async function approveProposal(
  id: string,
  applyFn: (proposal: ProposalResult) => Promise<ApproveProposalResult>
): Promise<ApproveProposalResult> {
  const proposal = getProposal(id);
  if (!proposal) {
    return { success: false, error: 'Proposal not found' };
  }

  if (proposal.status !== 'pending') {
    return { success: false, error: `Proposal is already ${proposal.status}` };
  }

  isProcessingProposal.set(true);
  try {
    const result = await applyFn(proposal);
    if (result.success) {
      updateProposalStatus(id, 'approved');
    }
    return {
      ...result,
      appliedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    isProcessingProposal.set(false);
  }
}

/**
 * Reject a proposal
 */
export function rejectProposal(id: string): void {
  updateProposalStatus(id, 'rejected');
  if (activeProposalId.get() === id) {
    activeProposalId.set(null);
  }
}

/**
 * Clear all proposals for a project
 */
export function clearProjectProposals(projectId: string): void {
  const all = proposalsStore.get();
  const newStore: Record<string, ProposalResult> = {};
  for (const [id, proposal] of Object.entries(all)) {
    if (proposal?.projectId !== projectId) {
      newStore[id] = proposal;
    }
  }
  proposalsStore.set(newStore);
}

/**
 * Expire old proposals (older than given hours)
 */
export function expireOldProposals(hoursOld: number = 24): void {
  const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;
  const all = proposalsStore.get();

  for (const [id, proposal] of Object.entries(all)) {
    if (proposal && proposal.status === 'pending') {
      const createdAt = new Date(proposal.createdAt).getTime();
      if (createdAt < cutoff) {
        updateProposalStatus(id, 'expired');
      }
    }
  }
}

// =============================================================================
// Security Risk Detection
// =============================================================================

/**
 * Analyze file changes for security risks
 */
export function analyzeSecurityRisks(filesChanged: FileChange[]): SecurityRisk[] {
  const risks: SecurityRisk[] = [];

  for (const file of filesChanged) {
    const content = file.content || '';
    const path = file.path.toLowerCase();

    // Check for exposed secrets
    if (
      content.includes('API_KEY') ||
      content.includes('SECRET') ||
      content.includes('PASSWORD')
    ) {
      if (
        path.includes('client') ||
        path.includes('frontend') ||
        path.endsWith('.tsx') ||
        path.endsWith('.jsx')
      ) {
        risks.push({
          type: 'danger',
          title: 'Potential secret exposure',
          description: `File ${file.path} may expose secrets in client-side code`,
        });
      }
    }

    // Check for SQL injection risks
    if (content.includes('query(') && content.includes('${')) {
      risks.push({
        type: 'danger',
        title: 'Potential SQL injection',
        description: `File ${file.path} uses string interpolation in queries`,
      });
    }

    // Check for XSS risks
    if (content.includes('dangerouslySetInnerHTML') || content.includes('innerHTML')) {
      risks.push({
        type: 'warning',
        title: 'Potential XSS vulnerability',
        description: `File ${file.path} uses innerHTML which could allow XSS`,
      });
    }

    // Check for eval usage
    if (content.includes('eval(') || content.includes('Function(')) {
      risks.push({
        type: 'danger',
        title: 'Code execution risk',
        description: `File ${file.path} uses eval() or Function() which is dangerous`,
      });
    }

    // Check for server-side files with exposed endpoints
    if (file.isServerFunction && !content.includes('auth')) {
      risks.push({
        type: 'warning',
        title: 'Missing authentication check',
        description: `Server function ${file.path} may not have authentication`,
      });
    }
  }

  return risks;
}

/**
 * Get risk level color
 */
export function getRiskColor(type: SecurityRisk['type']): string {
  return type === 'danger' ? 'red' : 'yellow';
}

/**
 * Get risk level icon
 */
export function getRiskIcon(type: SecurityRisk['type']): string {
  return type === 'danger' ? 'i-ph:warning-octagon' : 'i-ph:warning';
}

// =============================================================================
// Action Helpers
// =============================================================================

/**
 * Get display text for an action
 */
export function getActionDisplayText(action: SuggestedAction): string {
  switch (action.id) {
    case 'restart-app':
      return 'Restart App';
    case 'summarize-in-new-chat':
      return 'Start New Chat with Summary';
    case 'write-code-properly':
      return 'Rewrite Code';
    case 'refactor-file':
      return `Refactor ${(action as { id: 'refactor-file'; path: string }).path}`;
    case 'rebuild':
      return 'Rebuild Project';
    case 'restart':
      return 'Restart Dev Server';
    case 'refresh':
      return 'Refresh Preview';
    case 'keep-going':
      return 'Continue';
    case 'run-tests':
      return 'Run Tests';
    case 'install-deps':
      return 'Install Dependencies';
    default:
      return 'Unknown Action';
  }
}

/**
 * Get action icon
 */
export function getActionIcon(action: SuggestedAction): string {
  switch (action.id) {
    case 'restart-app':
      return 'i-ph:power';
    case 'summarize-in-new-chat':
      return 'i-ph:chat-dots';
    case 'write-code-properly':
      return 'i-ph:pencil-simple';
    case 'refactor-file':
      return 'i-ph:wrench';
    case 'rebuild':
      return 'i-ph:hammer';
    case 'restart':
      return 'i-ph:arrow-clockwise';
    case 'refresh':
      return 'i-ph:arrow-counter-clockwise';
    case 'keep-going':
      return 'i-ph:play';
    case 'run-tests':
      return 'i-ph:test-tube';
    case 'install-deps':
      return 'i-ph:package';
    default:
      return 'i-ph:question';
  }
}

// =============================================================================
// Type Guards
// =============================================================================

export function isCodeProposal(proposal: Proposal): proposal is CodeProposal {
  return proposal.type === 'code-proposal';
}

export function isActionProposal(proposal: Proposal): proposal is ActionProposal {
  return proposal.type === 'action-proposal';
}

export function isTipProposal(proposal: Proposal): proposal is TipProposal {
  return proposal.type === 'tip-proposal';
}
