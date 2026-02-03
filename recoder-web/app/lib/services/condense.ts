/**
 * Context Condensation Service
 * Inspired by kilocode's conversation summarization
 *
 * Features:
 * - Automatic conversation summarization when approaching token limits
 * - Preserves recoderAction tags (tool_use equivalent)
 * - Configurable threshold (default: 80% of context window)
 * - Non-destructive - keeps original messages for potential recovery
 */

import type { Message } from '~/lib/hooks/useSimpleChat';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Condense');

// Configuration constants
export const N_MESSAGES_TO_KEEP = 4; // Keep last N messages after condensing
export const DEFAULT_THRESHOLD_PERCENT = 80; // Trigger condensing at 80% of context window
export const MIN_MESSAGES_TO_CONDENSE = 6; // Minimum messages required before condensing is possible

// Model context window sizes (tokens)
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenRouter models
  'anthropic/claude-sonnet-4': 200000,
  'anthropic/claude-3.5-sonnet': 200000,
  'anthropic/claude-3-opus': 200000,
  'anthropic/claude-3-haiku': 200000,
  'openai/gpt-4-turbo': 128000,
  'openai/gpt-4': 8192,
  'openai/gpt-4o': 128000,
  'openai/gpt-4o-mini': 128000,
  'google/gemini-pro-1.5': 1000000,
  'google/gemini-flash-1.5': 1000000,
  'x-ai/grok-beta': 131072,
  'x-ai/grok-code-fast-1': 131072,
  'meta-llama/llama-3.1-405b-instruct': 131072,
  'meta-llama/llama-3.1-70b-instruct': 131072,
  'mistralai/mistral-large': 128000,
  'deepseek/deepseek-chat': 64000,
  'deepseek/deepseek-coder': 64000,
  // Direct Anthropic models
  'claude-sonnet-4-5-20250929': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  // Direct OpenAI models
  'gpt-4-turbo-preview': 128000,
  'gpt-4-1106-preview': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  // Default
  default: 100000,
};

/**
 * Result of the condensation operation
 */
export interface CondenseResult {
  messages: Message[];
  summary: string;
  condensedCount: number;
  originalMessages: Message[]; // For recovery
  condenseId: string;
  error?: string;
}

/**
 * Information about whether condensation should be triggered
 */
export interface CondenseCheck {
  shouldCondense: boolean;
  currentTokens: number;
  maxTokens: number;
  thresholdTokens: number;
  percentUsed: number;
  reason?: string;
}

/**
 * Messages that have been condensed but preserved for recovery
 */
export interface CondensedMessage extends Message {
  condenseParent?: string; // ID of the summary that replaced this message
  isSummary?: boolean;
  condenseId?: string;
}

/**
 * Rough token estimation (4 chars per token average)
 * For more accurate counting, use the model's tokenizer
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a message
 */
export function estimateMessageTokens(message: Message): number {
  if (!message.content) return 0;
  return estimateTokens(message.content);
}

/**
 * Estimate total tokens for a conversation
 */
export function estimateConversationTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/**
 * Get the context window size for a model
 */
export function getContextWindow(model?: string): number {
  if (!model) return MODEL_CONTEXT_WINDOWS.default;

  // Try exact match first
  if (MODEL_CONTEXT_WINDOWS[model]) {
    return MODEL_CONTEXT_WINDOWS[model];
  }

  // Try partial match (model ID might be different format)
  const modelLower = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(modelLower)) {
      return value;
    }
  }

  return MODEL_CONTEXT_WINDOWS.default;
}

/**
 * Check if condensation should be triggered
 */
export function checkShouldCondense(
  messages: Message[],
  model?: string,
  thresholdPercent: number = DEFAULT_THRESHOLD_PERCENT
): CondenseCheck {
  const currentTokens = estimateConversationTokens(messages);
  const maxTokens = getContextWindow(model);
  const thresholdTokens = Math.floor(maxTokens * (thresholdPercent / 100));
  const percentUsed = Math.round((currentTokens / maxTokens) * 100);

  // Check if we have enough messages to condense
  if (messages.length < MIN_MESSAGES_TO_CONDENSE) {
    return {
      shouldCondense: false,
      currentTokens,
      maxTokens,
      thresholdTokens,
      percentUsed,
      reason: `Not enough messages (${messages.length}/${MIN_MESSAGES_TO_CONDENSE} required)`,
    };
  }

  // Check if we're approaching the threshold
  if (currentTokens < thresholdTokens) {
    return {
      shouldCondense: false,
      currentTokens,
      maxTokens,
      thresholdTokens,
      percentUsed,
      reason: `Below threshold (${percentUsed}% < ${thresholdPercent}%)`,
    };
  }

  return {
    shouldCondense: true,
    currentTokens,
    maxTokens,
    thresholdTokens,
    percentUsed,
    reason: `At or above threshold (${percentUsed}% >= ${thresholdPercent}%)`,
  };
}

/**
 * Check if a message contains recoderAction tags (tool_use equivalent)
 */
function hasRecoderActionTags(content: string): boolean {
  return /<recoderAction[^>]*>/.test(content);
}

/**
 * Extract recoderAction tags from content for preservation
 */
function extractRecoderActions(content: string): string[] {
  const actionRegex = /<recoderAction[^>]*>[\s\S]*?<\/recoderAction>/g;
  return content.match(actionRegex) || [];
}

/**
 * Check if a message has a recent summary
 */
function hasRecentSummary(messages: Message[], keepCount: number): boolean {
  const recentMessages = messages.slice(-keepCount);
  return recentMessages.some((msg) => (msg as CondensedMessage).isSummary);
}

/**
 * Get messages since the last summary
 */
export function getMessagesSinceLastSummary(messages: Message[]): Message[] {
  const condensedMessages = messages as CondensedMessage[];
  const lastSummaryIndex = [...condensedMessages].reverse().findIndex((msg) => msg.isSummary);

  if (lastSummaryIndex === -1) {
    return messages;
  }

  const actualIndex = messages.length - lastSummaryIndex - 1;
  const messagesSinceSummary = messages.slice(actualIndex);

  // Ensure first message is a user message (for API compatibility)
  if (messagesSinceSummary.length > 0 && messagesSinceSummary[0].role !== 'user') {
    const originalFirst = messages[0];
    if (originalFirst && originalFirst.role === 'user') {
      return [originalFirst, ...messagesSinceSummary];
    }
  }

  return messagesSinceSummary;
}

/**
 * Filter out condensed messages, returning only effective messages for API calls
 */
export function getEffectiveApiHistory(messages: Message[]): Message[] {
  const condensedMessages = messages as CondensedMessage[];

  // Collect existing summary IDs
  const existingSummaryIds = new Set<string>();
  for (const msg of condensedMessages) {
    if (msg.isSummary && msg.condenseId) {
      existingSummaryIds.add(msg.condenseId);
    }
  }

  // Filter out messages whose condenseParent points to an existing summary
  return condensedMessages.filter((msg) => {
    if (msg.condenseParent && existingSummaryIds.has(msg.condenseParent)) {
      return false;
    }
    return true;
  });
}

/**
 * Generate the summary prompt for condensation
 */
const SUMMARY_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.

This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing with the conversation.

Your summary should include:
1. **Previous Conversation**: High level details about what was discussed
2. **Current Work**: What was being worked on most recently
3. **Key Technical Concepts**: Important technical concepts, frameworks, and patterns
4. **Relevant Files and Code**: Specific files examined, modified, or created
5. **Problem Solving**: Problems solved and ongoing troubleshooting
6. **Pending Tasks**: Outstanding tasks and next steps with specific details

CRITICAL: Preserve ALL recoderAction information - list every file action with its path and purpose.

Output only the summary without additional commentary.`;

/**
 * Build a summary from messages (without LLM - for immediate use)
 * This creates a structured summary from the message content
 */
export function buildQuickSummary(messages: Message[]): string {
  const summaryParts: string[] = [];

  // Extract key information from messages
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  // Collect all file actions
  const allActions: string[] = [];
  for (const msg of assistantMessages) {
    const actions = extractRecoderActions(msg.content);
    allActions.push(...actions);
  }

  // Build summary
  summaryParts.push('## Conversation Summary\n');

  // User requests
  if (userMessages.length > 0) {
    summaryParts.push('### User Requests:');
    const firstRequest = userMessages[0]?.content?.slice(0, 500);
    summaryParts.push(`- Initial: "${firstRequest}${firstRequest && firstRequest.length >= 500 ? '...' : ''}"`);

    if (userMessages.length > 1) {
      const lastRequest = userMessages[userMessages.length - 1]?.content?.slice(0, 300);
      summaryParts.push(
        `- Most Recent: "${lastRequest}${lastRequest && lastRequest.length >= 300 ? '...' : ''}"`
      );
    }
    summaryParts.push('');
  }

  // File actions (critical to preserve)
  if (allActions.length > 0) {
    summaryParts.push('### Files Modified/Created:');
    const uniqueFiles = new Set<string>();

    for (const action of allActions) {
      // Extract file path from action
      const filePathMatch = action.match(/filePath="([^"]+)"/);
      if (filePathMatch) {
        uniqueFiles.add(filePathMatch[1]);
      }
    }

    for (const file of uniqueFiles) {
      summaryParts.push(`- ${file}`);
    }
    summaryParts.push('');

    // Include the actual actions for context
    summaryParts.push('### Action Details (for context):');
    // Only include first 5 and last 5 actions to keep summary manageable
    const actionsToInclude =
      allActions.length <= 10 ? allActions : [...allActions.slice(0, 5), '...', ...allActions.slice(-5)];

    for (const action of actionsToInclude) {
      if (action === '...') {
        summaryParts.push('  [... additional actions ...]');
      } else {
        // Truncate action content but preserve structure
        const truncatedAction = action.length > 500 ? action.slice(0, 500) + '...</recoderAction>' : action;
        summaryParts.push(truncatedAction);
      }
    }
    summaryParts.push('');
  }

  // Recent context
  if (assistantMessages.length > 0) {
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    // Get non-action content from last message
    let lastContent = lastAssistant.content;
    // Remove action tags to get just the text
    lastContent = lastContent.replace(/<recoderAction[\s\S]*?<\/recoderAction>/g, '').trim();
    lastContent = lastContent.replace(/<recoderArtifact[\s\S]*?<\/recoderArtifact>/g, '').trim();

    if (lastContent.length > 0) {
      summaryParts.push('### Recent Assistant Context:');
      const truncated = lastContent.slice(0, 1000);
      summaryParts.push(truncated + (lastContent.length > 1000 ? '...' : ''));
    }
  }

  return summaryParts.join('\n');
}

/**
 * Condense conversation messages
 * Non-destructive - tags messages with condenseParent but doesn't delete them
 */
export function condenseConversation(
  messages: Message[],
  customSummary?: string
): CondenseResult {
  const condenseId = `condense_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Keep original messages for recovery
  const originalMessages = [...messages];

  // Check if we have enough messages
  if (messages.length < MIN_MESSAGES_TO_CONDENSE) {
    return {
      messages,
      summary: '',
      condensedCount: 0,
      originalMessages,
      condenseId,
      error: `Not enough messages to condense (${messages.length}/${MIN_MESSAGES_TO_CONDENSE} required)`,
    };
  }

  // Check for recent summary
  if (hasRecentSummary(messages, N_MESSAGES_TO_KEEP)) {
    return {
      messages,
      summary: '',
      condensedCount: 0,
      originalMessages,
      condenseId,
      error: 'Conversation was condensed recently',
    };
  }

  // Calculate what to keep
  const keepStartIndex = Math.max(messages.length - N_MESSAGES_TO_KEEP, 1); // Always keep first message
  const messagesToCondense = messages.slice(1, keepStartIndex); // Skip first message
  const keepMessages = messages.slice(keepStartIndex);

  // Build summary (use custom or generate quick summary)
  const summary = customSummary || buildQuickSummary(messagesToCondense);

  if (!summary.trim()) {
    return {
      messages,
      summary: '',
      condensedCount: 0,
      originalMessages,
      condenseId,
      error: 'Failed to generate summary',
    };
  }

  // Create summary message
  const summaryMessage: CondensedMessage = {
    id: `summary_${condenseId}`,
    role: 'assistant',
    content: summary,
    createdAt: new Date(),
    isSummary: true,
    condenseId,
  };

  // Tag condensed messages with condenseParent (non-destructive)
  const taggedMessages: CondensedMessage[] = messages.map((msg, index) => {
    // First message stays as-is
    if (index === 0) {
      return msg as CondensedMessage;
    }
    // Messages in the "keep" range stay as-is
    if (index >= keepStartIndex) {
      return msg as CondensedMessage;
    }
    // Middle messages get tagged with condenseParent
    const condensed = msg as CondensedMessage;
    if (!condensed.condenseParent) {
      return { ...msg, condenseParent: condenseId } as CondensedMessage;
    }
    return condensed;
  });

  // Insert summary message before keep messages
  taggedMessages.splice(keepStartIndex, 0, summaryMessage);

  logger.info(`Condensed ${messagesToCondense.length} messages into summary (${summary.length} chars)`);

  return {
    messages: taggedMessages,
    summary,
    condensedCount: messagesToCondense.length,
    originalMessages,
    condenseId,
  };
}

/**
 * Restore condensed messages by removing the summary and untagging
 */
export function restoreCondensedMessages(
  messages: Message[],
  condenseId: string
): Message[] {
  const condensedMessages = messages as CondensedMessage[];

  // Remove the summary message
  const withoutSummary = condensedMessages.filter(
    (msg) => !(msg.isSummary && msg.condenseId === condenseId)
  );

  // Untag messages that were condensed
  return withoutSummary.map((msg) => {
    if (msg.condenseParent === condenseId) {
      const { condenseParent, ...rest } = msg;
      return rest;
    }
    return msg;
  });
}

/**
 * Get statistics about conversation tokens
 */
export function getConversationStats(messages: Message[], model?: string) {
  const currentTokens = estimateConversationTokens(messages);
  const maxTokens = getContextWindow(model);
  const percentUsed = Math.round((currentTokens / maxTokens) * 100);

  // Count condensed vs active messages
  const condensedMessages = messages as CondensedMessage[];
  const effectiveMessages = getEffectiveApiHistory(condensedMessages);

  return {
    totalMessages: messages.length,
    effectiveMessages: effectiveMessages.length,
    condensedMessages: messages.length - effectiveMessages.length,
    currentTokens,
    maxTokens,
    percentUsed,
    hasSummary: condensedMessages.some((m) => m.isSummary),
  };
}
