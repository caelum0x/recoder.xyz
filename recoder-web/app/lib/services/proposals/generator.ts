/**
 * Proposal Generator
 *
 * Generates proposals from AI response content by parsing tags
 * and analyzing the changes.
 */

import type {
  Proposal,
  ProposalResult,
  CodeProposal,
  ActionProposal,
  TipProposal,
  FileChange,
  SuggestedAction,
} from './types';
import {
  parseAllTags,
  getWriteTags,
  getRenameTags,
  getDeleteTags,
  getDependencyTags,
  getSqlTags,
  getSummaryTag,
  getCommandTags,
  getSearchReplaceTags,
  isServerFunction,
  countLines,
  hasActionableTags,
  type CommandType,
} from './tag-parser';
import { assessProposalSecurity } from './security';

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Get the basename of a path.
 */
function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
}

// =============================================================================
// File Change Generation
// =============================================================================

/**
 * Generate FileChange objects from parsed tags.
 */
export function generateFileChanges(
  writes: ReturnType<typeof getWriteTags>,
  renames: ReturnType<typeof getRenameTags>,
  deletes: string[],
  searchReplaces: ReturnType<typeof getSearchReplaceTags>
): FileChange[] {
  const changes: FileChange[] = [];

  // Add writes
  for (const write of writes) {
    changes.push({
      name: basename(write.path),
      path: write.path,
      summary: write.description || '(no change summary found)',
      type: 'write',
      isServerFunction: isServerFunction(write.path),
    });
  }

  // Add search-replace edits (treated as writes)
  for (const edit of searchReplaces) {
    // Avoid duplicates if same file is also written
    if (!changes.some((c) => c.path === edit.path)) {
      changes.push({
        name: basename(edit.path),
        path: edit.path,
        summary: edit.description || 'Search and replace edit',
        type: 'write',
        isServerFunction: isServerFunction(edit.path),
      });
    }
  }

  // Add renames
  for (const rename of renames) {
    changes.push({
      name: basename(rename.to),
      path: rename.to,
      summary: `Rename from ${rename.from} to ${rename.to}`,
      type: 'rename',
      isServerFunction: isServerFunction(rename.to),
    });
  }

  // Add deletes
  for (const deletePath of deletes) {
    changes.push({
      name: basename(deletePath),
      path: deletePath,
      summary: 'Delete file',
      type: 'delete',
      isServerFunction: isServerFunction(deletePath),
    });
  }

  return changes;
}

// =============================================================================
// Action Generation
// =============================================================================

/**
 * Map command types to suggested actions.
 */
function commandToAction(command: CommandType): SuggestedAction {
  switch (command) {
    case 'rebuild':
      return { id: 'rebuild' };
    case 'restart':
      return { id: 'restart' };
    case 'refresh':
      return { id: 'refresh' };
    case 'install':
      return { id: 'install-dependencies', packages: [] };
    default:
      return { id: 'keep-going' };
  }
}

/**
 * Generate suggested actions based on content analysis.
 */
export function generateSuggestedActions(
  content: string,
  writes: ReturnType<typeof getWriteTags>,
  messageCount: number,
  estimatedTokens: number
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const commands = getCommandTags(content);

  // Add command-based actions
  for (const command of commands) {
    actions.push(commandToAction(command));
  }

  // Check for large files that might need refactoring
  for (const write of writes) {
    const lineCount = countLines(write.content);
    if (lineCount > 500) {
      // Don't duplicate if already suggested
      if (!actions.some((a) => a.id === 'refactor-file')) {
        actions.push({ id: 'refactor-file', path: write.path });
      }
    }
  }

  // Suggest writing code properly if there are code blocks but no write tags
  if (writes.length === 0 && content.includes('```')) {
    actions.push({ id: 'write-code-properly' });
  }

  // Suggest summarizing if conversation is long or token usage is high
  const CONTEXT_WINDOW = 128000; // Typical context window
  if (messageCount > 10 || estimatedTokens > CONTEXT_WINDOW * 0.8) {
    actions.push({ id: 'summarize-in-new-chat' });
  }

  // Always add keep-going as an option
  actions.push({ id: 'keep-going' });

  return actions;
}

// =============================================================================
// Code Proposal Generation
// =============================================================================

/**
 * Generate a code proposal from parsed tags.
 */
export function generateCodeProposal(
  content: string
): CodeProposal | null {
  const writes = getWriteTags(content);
  const renames = getRenameTags(content);
  const deletes = getDeleteTags(content);
  const searchReplaces = getSearchReplaceTags(content);
  const packages = getDependencyTags(content);
  const sqlQueries = getSqlTags(content);
  const summary = getSummaryTag(content);

  const filesChanged = generateFileChanges(writes, renames, deletes, searchReplaces);

  // Only create a code proposal if there are actual changes
  if (
    filesChanged.length === 0 &&
    packages.length === 0 &&
    sqlQueries.length === 0
  ) {
    return null;
  }

  // Assess security risks
  const security = assessProposalSecurity(filesChanged, sqlQueries);

  return {
    type: 'code-proposal',
    title: summary || 'Proposed File Changes',
    securityRisks: security.risks,
    filesChanged,
    packagesAdded: packages,
    sqlQueries,
  };
}

// =============================================================================
// Action Proposal Generation
// =============================================================================

/**
 * Generate an action proposal.
 */
export function generateActionProposal(
  content: string,
  messageCount: number = 1,
  estimatedTokens: number = 0
): ActionProposal {
  const writes = getWriteTags(content);
  const actions = generateSuggestedActions(
    content,
    writes,
    messageCount,
    estimatedTokens
  );

  return {
    type: 'action-proposal',
    actions,
  };
}

// =============================================================================
// Tip Proposal Generation
// =============================================================================

/**
 * Generate a tip proposal.
 */
export function generateTipProposal(
  title: string,
  description: string
): TipProposal {
  return {
    type: 'tip-proposal',
    title,
    description,
  };
}

// =============================================================================
// Main Proposal Generation
// =============================================================================

export interface GenerateProposalOptions {
  chatId: string;
  messageId: string;
  content: string;
  messageCount?: number;
  estimatedTokens?: number;
  /** If true, skip approval state check */
  force?: boolean;
}

/**
 * Generate a proposal from AI response content.
 *
 * This is the main entry point for proposal generation.
 * It analyzes the content and generates the appropriate proposal type.
 */
export function generateProposal(
  options: GenerateProposalOptions
): ProposalResult | null {
  const {
    chatId,
    messageId,
    content,
    messageCount = 1,
    estimatedTokens = 0,
  } = options;

  // Check if content has any actionable tags
  if (!hasActionableTags(content)) {
    // Generate an action proposal with suggestions
    const actionProposal = generateActionProposal(
      content,
      messageCount,
      estimatedTokens
    );

    // Only return if there are meaningful actions
    if (actionProposal.actions.length > 0) {
      return {
        proposal: actionProposal,
        chatId,
        messageId,
      };
    }

    return null;
  }

  // Try to generate a code proposal first
  const codeProposal = generateCodeProposal(content);
  if (codeProposal) {
    return {
      proposal: codeProposal,
      chatId,
      messageId,
    };
  }

  // Fall back to action proposal
  const actionProposal = generateActionProposal(
    content,
    messageCount,
    estimatedTokens
  );

  if (actionProposal.actions.length > 0) {
    return {
      proposal: actionProposal,
      chatId,
      messageId,
    };
  }

  return null;
}

/**
 * Check if content would generate a code proposal.
 */
export function wouldGenerateCodeProposal(content: string): boolean {
  if (!hasActionableTags(content)) return false;

  const writes = getWriteTags(content);
  const renames = getRenameTags(content);
  const deletes = getDeleteTags(content);
  const searchReplaces = getSearchReplaceTags(content);
  const packages = getDependencyTags(content);
  const sqlQueries = getSqlTags(content);

  return (
    writes.length > 0 ||
    renames.length > 0 ||
    deletes.length > 0 ||
    searchReplaces.length > 0 ||
    packages.length > 0 ||
    sqlQueries.length > 0
  );
}

/**
 * Get a quick summary of what changes would be made.
 */
export function getChangesSummary(content: string): string {
  const writes = getWriteTags(content);
  const renames = getRenameTags(content);
  const deletes = getDeleteTags(content);
  const searchReplaces = getSearchReplaceTags(content);
  const packages = getDependencyTags(content);
  const sqlQueries = getSqlTags(content);

  const totalWrites = writes.length + searchReplaces.length;
  const parts: string[] = [];

  if (totalWrites > 0) {
    parts.push(`${totalWrites} file${totalWrites > 1 ? 's' : ''} to write`);
  }
  if (renames.length > 0) {
    parts.push(`${renames.length} file${renames.length > 1 ? 's' : ''} to rename`);
  }
  if (deletes.length > 0) {
    parts.push(`${deletes.length} file${deletes.length > 1 ? 's' : ''} to delete`);
  }
  if (packages.length > 0) {
    parts.push(
      `${packages.length} package${packages.length > 1 ? 's' : ''} to install`
    );
  }
  if (sqlQueries.length > 0) {
    parts.push(
      `${sqlQueries.length} SQL quer${sqlQueries.length > 1 ? 'ies' : 'y'} to run`
    );
  }

  return parts.length > 0 ? parts.join(', ') : 'No changes';
}
