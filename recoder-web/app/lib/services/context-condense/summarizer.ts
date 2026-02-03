/**
 * Conversation Summarizer
 * Builds summaries from conversation history for context condensation
 */

import type { ApiMessage, ContentBlock } from './types';
import {
  getMessageText,
  extractRecoderActions,
  extractFilePathsFromActions,
  estimateTokens,
} from './utils';
import { QUICK_SUMMARY_TEMPLATE } from './constants';

/**
 * Configuration for summary building
 */
export interface SummaryConfig {
  /** Maximum length for user request excerpts */
  maxUserRequestLength: number;
  /** Maximum length for assistant context excerpts */
  maxAssistantContextLength: number;
  /** Maximum number of action details to include */
  maxActionDetails: number;
  /** Whether to include code snippets */
  includeCodeSnippets: boolean;
  /** Maximum length for code snippets */
  maxCodeSnippetLength: number;
}

const DEFAULT_SUMMARY_CONFIG: SummaryConfig = {
  maxUserRequestLength: 500,
  maxAssistantContextLength: 1000,
  maxActionDetails: 10,
  includeCodeSnippets: true,
  maxCodeSnippetLength: 500,
};

/**
 * Build a quick summary from messages without using an LLM
 * Creates a structured summary preserving critical context
 */
export function buildQuickSummary(
  messages: ApiMessage[],
  config: Partial<SummaryConfig> = {}
): string {
  const cfg = { ...DEFAULT_SUMMARY_CONFIG, ...config };
  const summaryParts: string[] = [];

  // Separate messages by role
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  // Collect all file actions from assistant messages
  const allActions: string[] = [];
  const allFilePaths: Set<string> = new Set();

  for (const msg of assistantMessages) {
    const content = getMessageText(msg);
    const actions = extractRecoderActions(content);
    allActions.push(...actions);

    const filePaths = extractFilePathsFromActions(content);
    filePaths.forEach((path) => allFilePaths.add(path));
  }

  // Build summary header
  summaryParts.push(QUICK_SUMMARY_TEMPLATE.header);
  summaryParts.push('');

  // User Requests Section
  if (userMessages.length > 0) {
    summaryParts.push(QUICK_SUMMARY_TEMPLATE.sections.userRequests);
    summaryParts.push('');

    // First user request (original task)
    const firstContent = getMessageText(userMessages[0]);
    const truncatedFirst =
      firstContent.length > cfg.maxUserRequestLength
        ? firstContent.slice(0, cfg.maxUserRequestLength) + '...'
        : firstContent;
    summaryParts.push(`**Initial Request:** "${truncatedFirst}"`);
    summaryParts.push('');

    // Most recent user request (if different from first)
    if (userMessages.length > 1) {
      const lastContent = getMessageText(userMessages[userMessages.length - 1]);
      const truncatedLast =
        lastContent.length > cfg.maxUserRequestLength / 2
          ? lastContent.slice(0, cfg.maxUserRequestLength / 2) + '...'
          : lastContent;
      summaryParts.push(`**Most Recent Request:** "${truncatedLast}"`);
      summaryParts.push('');
    }

    // Intermediate requests summary (if many)
    if (userMessages.length > 3) {
      summaryParts.push(
        `**Additional Requests:** ${userMessages.length - 2} intermediate messages`
      );
      summaryParts.push('');
    }
  }

  // Files Modified/Created Section
  if (allFilePaths.size > 0) {
    summaryParts.push(QUICK_SUMMARY_TEMPLATE.sections.filesModified);
    summaryParts.push('');

    // Sort file paths for consistency
    const sortedPaths = Array.from(allFilePaths).sort();
    for (const filePath of sortedPaths) {
      summaryParts.push(`- \`${filePath}\``);
    }
    summaryParts.push('');
  }

  // Action Details Section (critical to preserve for context)
  if (allActions.length > 0) {
    summaryParts.push(QUICK_SUMMARY_TEMPLATE.sections.actionDetails);
    summaryParts.push('');
    summaryParts.push(`Total actions: ${allActions.length}`);
    summaryParts.push('');

    // Include representative actions
    const actionsToInclude: string[] = [];

    if (allActions.length <= cfg.maxActionDetails) {
      // Include all if within limit
      actionsToInclude.push(...allActions);
    } else {
      // Include first few and last few
      const halfLimit = Math.floor(cfg.maxActionDetails / 2);
      actionsToInclude.push(...allActions.slice(0, halfLimit));
      actionsToInclude.push(
        `\n<!-- ${allActions.length - cfg.maxActionDetails} additional actions omitted -->\n`
      );
      actionsToInclude.push(...allActions.slice(-halfLimit));
    }

    for (const action of actionsToInclude) {
      // Truncate very long actions
      if (action.length > cfg.maxCodeSnippetLength && cfg.includeCodeSnippets) {
        // Try to preserve the action structure
        const truncated = action.slice(0, cfg.maxCodeSnippetLength);
        // Find the last complete line
        const lastNewline = truncated.lastIndexOf('\n');
        if (lastNewline > cfg.maxCodeSnippetLength / 2) {
          summaryParts.push(truncated.slice(0, lastNewline) + '\n... [truncated] ...\n</recoderAction>');
        } else {
          summaryParts.push(truncated + '... [truncated] ...</recoderAction>');
        }
      } else {
        summaryParts.push(action);
      }
    }
    summaryParts.push('');
  }

  // Recent Assistant Context Section
  if (assistantMessages.length > 0) {
    summaryParts.push(QUICK_SUMMARY_TEMPLATE.sections.recentContext);
    summaryParts.push('');

    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    let lastContent = getMessageText(lastAssistant);

    // Remove action tags to get just explanatory text
    lastContent = lastContent.replace(/<recoderAction[\s\S]*?<\/recoderAction>/g, '').trim();
    lastContent = lastContent.replace(/<recoderArtifact[\s\S]*?<\/recoderArtifact>/g, '').trim();

    if (lastContent.length > 0) {
      const truncatedContent =
        lastContent.length > cfg.maxAssistantContextLength
          ? lastContent.slice(0, cfg.maxAssistantContextLength) + '...'
          : lastContent;
      summaryParts.push(truncatedContent);
    } else {
      summaryParts.push('[Assistant performed file operations without additional commentary]');
    }
    summaryParts.push('');
  }

  // Pending Tasks Section (extract from recent messages if possible)
  const pendingTasks = extractPendingTasks(messages);
  if (pendingTasks.length > 0) {
    summaryParts.push(QUICK_SUMMARY_TEMPLATE.sections.pendingTasks);
    summaryParts.push('');
    for (const task of pendingTasks) {
      summaryParts.push(`- ${task}`);
    }
    summaryParts.push('');
  }

  return summaryParts.join('\n');
}

/**
 * Extract pending tasks from messages
 * Looks for common patterns indicating incomplete work
 */
function extractPendingTasks(messages: ApiMessage[]): string[] {
  const tasks: string[] = [];
  const taskPatterns = [
    /(?:next|then|after that|finally)[,:]?\s+(?:I'll|we'll|I will|we will|need to|should)\s+(.+?)(?:\.|$)/gi,
    /(?:TODO|FIXME|HACK):\s*(.+?)(?:\n|$)/gi,
    /(?:remaining|pending|left to do):\s*(.+?)(?:\n|$)/gi,
    /(?:step \d+|next step):\s*(.+?)(?:\n|$)/gi,
  ];

  // Check recent messages (last few)
  const recentMessages = messages.slice(-4);

  for (const message of recentMessages) {
    const content = getMessageText(message);

    for (const pattern of taskPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const task = match[1].trim();
        // Only add if it's a reasonable length and not duplicate
        if (task.length > 10 && task.length < 200 && !tasks.includes(task)) {
          tasks.push(task);
        }
      }
    }
  }

  return tasks.slice(0, 5); // Limit to top 5 tasks
}

/**
 * Build a detailed summary using an LLM (async)
 * This is for when you have access to an LLM for summarization
 */
export async function buildLLMSummary(
  messages: ApiMessage[],
  summaryPrompt: string,
  llmCall: (prompt: string, messages: Array<{ role: string; content: unknown }>) => Promise<string>
): Promise<string> {
  // Prepare messages for summarization
  const messagesForSummary = messages.map(({ role, content }) => ({ role, content }));

  // Add the summarization request
  messagesForSummary.push({
    role: 'user',
    content: 'Summarize the conversation so far, as described in the prompt instructions.',
  });

  try {
    const summary = await llmCall(summaryPrompt, messagesForSummary);
    return summary.trim();
  } catch (error) {
    console.error('LLM summarization failed:', error);
    // Fall back to quick summary
    return buildQuickSummary(messages);
  }
}

/**
 * Create a synthetic reasoning block for DeepSeek-reasoner compatibility
 * DeepSeek-reasoner requires reasoning_content on ALL assistant messages
 */
export function createSyntheticReasoningBlock(): ContentBlock {
  return {
    type: 'reasoning',
    text: 'Condensing conversation context. The summary below captures the key information from the prior conversation.',
  } as ContentBlock;
}

/**
 * Build summary message content with proper structure
 * Includes synthetic reasoning for DeepSeek compatibility
 */
export function buildSummaryContent(
  summary: string,
  toolUseBlocksToPreserve: ContentBlock[] = [],
  reasoningBlocksToPreserve: ContentBlock[] = []
): ContentBlock[] {
  const content: ContentBlock[] = [];

  // Always add synthetic reasoning first (for DeepSeek-reasoner compatibility)
  content.push(createSyntheticReasoningBlock());

  // Add preserved reasoning blocks (if any from condensed message)
  if (reasoningBlocksToPreserve.length > 0) {
    content.push(...reasoningBlocksToPreserve);
  }

  // Add the summary text
  content.push({
    type: 'text',
    text: summary,
  });

  // Add preserved tool_use blocks (for tool_result pairing)
  if (toolUseBlocksToPreserve.length > 0) {
    content.push(...toolUseBlocksToPreserve);
  }

  return content;
}
