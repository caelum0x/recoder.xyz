/**
 * Context Condenser
 * Main condensation logic - intelligent message history compression
 */

import type {
  ApiMessage,
  ContentBlock,
  CondenseCheck,
  CondenseConfig,
  SummarizeResponse,
} from './types';
import { DEFAULT_CONFIG } from './constants';
import {
  estimateConversationTokens,
  getContextWindow,
  getKeepMessagesWithToolBlocks,
  hasToolResultBlocks,
  generateCondenseId,
  createUniqueTimestamp,
} from './utils';
import { buildQuickSummary, buildSummaryContent } from './summarizer';

/**
 * Check if condensation should be triggered
 */
export function checkShouldCondense(
  messages: ApiMessage[],
  model?: string,
  thresholdPercent: number = DEFAULT_CONFIG.thresholdPercent,
  minMessagesRequired: number = DEFAULT_CONFIG.minMessagesRequired
): CondenseCheck {
  const currentTokens = estimateConversationTokens(messages);
  const maxTokens = getContextWindow(model);
  const thresholdTokens = Math.floor(maxTokens * (thresholdPercent / 100));
  const percentUsed = Math.round((currentTokens / maxTokens) * 100);

  // Check if we have enough messages to condense
  if (messages.length < minMessagesRequired) {
    return {
      shouldCondense: false,
      currentTokens,
      maxTokens,
      thresholdTokens,
      percentUsed,
      reason: `Not enough messages (${messages.length}/${minMessagesRequired} required)`,
    };
  }

  // Check if there's a recent summary in the last few messages
  const recentMessages = messages.slice(-DEFAULT_CONFIG.messagesToKeep);
  const hasRecentSummary = recentMessages.some((msg) => msg.isSummary);

  if (hasRecentSummary) {
    return {
      shouldCondense: false,
      currentTokens,
      maxTokens,
      thresholdTokens,
      percentUsed,
      reason: 'Conversation was condensed recently',
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
 * Get messages since the last summary
 * Returns all messages if no summary exists
 */
export function getMessagesSinceLastSummary(messages: ApiMessage[]): ApiMessage[] {
  const lastSummaryIndexReverse = [...messages].reverse().findIndex((msg) => msg.isSummary);

  if (lastSummaryIndexReverse === -1) {
    return messages;
  }

  const lastSummaryIndex = messages.length - lastSummaryIndexReverse - 1;
  const messagesSinceSummary = messages.slice(lastSummaryIndex);

  // Ensure first message is a user message (for API compatibility)
  if (messagesSinceSummary.length > 0 && messagesSinceSummary[0].role !== 'user') {
    const originalFirstMessage = messages[0];
    if (originalFirstMessage && originalFirstMessage.role === 'user') {
      return [originalFirstMessage, ...messagesSinceSummary];
    } else {
      // Fallback: create a placeholder user message
      const placeholderMessage: ApiMessage = {
        role: 'user',
        content: 'Please continue from the following summary:',
        ts: messages[0]?.ts ? messages[0].ts - 1 : Date.now(),
      };
      return [placeholderMessage, ...messagesSinceSummary];
    }
  }

  return messagesSinceSummary;
}

/**
 * Filter API conversation history to get "effective" messages
 * Messages with condenseParent pointing to an existing summary are filtered out
 * This allows non-destructive condensing where messages are tagged but not deleted
 */
export function getEffectiveApiHistory(messages: ApiMessage[]): ApiMessage[] {
  // Collect existing summary IDs
  const existingSummaryIds = new Set<string>();
  // Collect existing truncation marker IDs
  const existingTruncationIds = new Set<string>();

  for (const msg of messages) {
    if (msg.isSummary && msg.condenseId) {
      existingSummaryIds.add(msg.condenseId);
    }
    if (msg.isTruncationMarker && msg.truncationId) {
      existingTruncationIds.add(msg.truncationId);
    }
  }

  // Filter out messages whose parent references exist
  return messages.filter((msg) => {
    // Filter out condensed messages if their summary exists
    if (msg.condenseParent && existingSummaryIds.has(msg.condenseParent)) {
      return false;
    }
    // Filter out truncated messages if their marker exists
    if (msg.truncationParent && existingTruncationIds.has(msg.truncationParent)) {
      return false;
    }
    return true;
  });
}

/**
 * Clean up orphaned parent references after truncation
 * When a summary/marker is deleted, messages that were tagged should be reactivated
 */
export function cleanupAfterTruncation(messages: ApiMessage[]): ApiMessage[] {
  // Collect existing summary and truncation IDs
  const existingSummaryIds = new Set<string>();
  const existingTruncationIds = new Set<string>();

  for (const msg of messages) {
    if (msg.isSummary && msg.condenseId) {
      existingSummaryIds.add(msg.condenseId);
    }
    if (msg.isTruncationMarker && msg.truncationId) {
      existingTruncationIds.add(msg.truncationId);
    }
  }

  // Clear orphaned parent references
  return messages.map((msg) => {
    let needsUpdate = false;

    // Check for orphaned condenseParent
    if (msg.condenseParent && !existingSummaryIds.has(msg.condenseParent)) {
      needsUpdate = true;
    }

    // Check for orphaned truncationParent
    if (msg.truncationParent && !existingTruncationIds.has(msg.truncationParent)) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      const { condenseParent, truncationParent, ...rest } = msg;
      const result: ApiMessage = rest as ApiMessage;

      // Keep condenseParent if its summary still exists
      if (condenseParent && existingSummaryIds.has(condenseParent)) {
        result.condenseParent = condenseParent;
      }

      // Keep truncationParent if its marker still exists
      if (truncationParent && existingTruncationIds.has(truncationParent)) {
        result.truncationParent = truncationParent;
      }

      return result;
    }

    return msg;
  });
}

/**
 * Condense conversation messages
 * Non-destructive: tags messages with condenseParent but doesn't delete them
 */
export function condenseConversation(
  messages: ApiMessage[],
  config: Partial<CondenseConfig> = {},
  customSummary?: string
): SummarizeResponse {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const condenseId = generateCondenseId();

  // Validation: enough messages?
  if (messages.length < cfg.minMessagesRequired) {
    return {
      messages,
      summary: '',
      cost: 0,
      error: `Not enough messages to condense (${messages.length}/${cfg.minMessagesRequired} required)`,
      condenseId,
      condensedCount: 0,
    };
  }

  // Validation: recent summary?
  const recentMessages = messages.slice(-cfg.messagesToKeep);
  const hasRecentSummary = recentMessages.some((msg) => msg.isSummary);

  if (hasRecentSummary) {
    return {
      messages,
      summary: '',
      cost: 0,
      error: 'Conversation was condensed recently',
      condenseId,
      condensedCount: 0,
    };
  }

  // Get keep messages with tool blocks if using native tools
  const { keepMessages, toolUseBlocksToPreserve, reasoningBlocksToPreserve } = cfg.useNativeTools
    ? getKeepMessagesWithToolBlocks(messages, cfg.messagesToKeep)
    : {
        keepMessages: messages.slice(-cfg.messagesToKeep),
        toolUseBlocksToPreserve: [],
        reasoningBlocksToPreserve: [],
      };

  const keepStartIndex = Math.max(messages.length - cfg.messagesToKeep, 0);

  // Determine if we need to include first kept message in summary (for tool pairing)
  const includeFirstKeptMessageInSummary = toolUseBlocksToPreserve.length > 0;
  const summarySliceEnd = includeFirstKeptMessageInSummary ? keepStartIndex + 1 : keepStartIndex;
  const messagesBeforeKeep = summarySliceEnd > 0 ? messages.slice(0, summarySliceEnd) : [];

  // Get messages to summarize (since last summary if exists)
  let messagesToSummarize = getMessagesSinceLastSummary(messagesBeforeKeep);

  // Discard trailing tool_use without result (incomplete tool call)
  const lastMessageContent = messagesToSummarize.at(-1)?.content;
  if (
    Array.isArray(lastMessageContent) &&
    lastMessageContent.some((item) => (item as any).type === 'tool_use')
  ) {
    messagesToSummarize = messagesToSummarize.slice(0, -1);
  }

  // Validation: enough messages after filtering?
  if (messagesToSummarize.length <= 1) {
    return {
      messages,
      summary: '',
      cost: 0,
      error:
        messages.length <= cfg.messagesToKeep + 1
          ? `Not enough messages to condense (need at least ${cfg.messagesToKeep + 2} messages)`
          : 'Conversation was condensed recently',
      condenseId,
      condensedCount: 0,
    };
  }

  // Build summary (use custom or generate quick summary)
  const summary = customSummary || buildQuickSummary(messagesToSummarize);

  if (!summary.trim()) {
    return {
      messages,
      summary: '',
      cost: 0,
      error: 'Failed to generate summary',
      condenseId,
      condensedCount: 0,
    };
  }

  // Build summary message content
  const summaryContent = buildSummaryContent(
    summary,
    toolUseBlocksToPreserve,
    reasoningBlocksToPreserve
  );

  // Get timestamp for summary (before first kept message)
  const firstKeptTs = keepMessages[0]?.ts ?? Date.now();

  // Create summary message
  const summaryMessage: ApiMessage = {
    id: `summary_${condenseId}`,
    role: 'assistant',
    content: summaryContent,
    ts: createUniqueTimestamp(firstKeptTs, -1),
    createdAt: new Date(),
    isSummary: true,
    condenseId,
  };

  // Tag middle messages with condenseParent (non-destructive)
  const newMessages: ApiMessage[] = messages.map((msg, index) => {
    // First message stays as-is (preserve original context)
    if (index === 0) {
      return msg;
    }
    // Messages in the "keep" range stay as-is
    if (index >= keepStartIndex) {
      return msg;
    }
    // Middle messages get tagged with condenseParent (unless already tagged)
    if (!msg.condenseParent) {
      return { ...msg, condenseParent: condenseId };
    }
    return msg;
  });

  // Insert summary message right before the keep messages
  newMessages.splice(keepStartIndex, 0, summaryMessage);

  // Calculate token savings
  const prevTokens = estimateConversationTokens(messages);
  const newTokens = estimateConversationTokens(getEffectiveApiHistory(newMessages));
  const tokensSaved = prevTokens - newTokens;

  // Verify we didn't grow the context
  if (newTokens >= prevTokens) {
    return {
      messages,
      summary: '',
      cost: 0,
      error: `Condensation would grow context (${prevTokens} -> ${newTokens} tokens)`,
      condenseId,
      condensedCount: 0,
    };
  }

  const condensedCount = messagesToSummarize.length - 1; // Exclude first message

  return {
    messages: newMessages,
    summary,
    cost: 0, // No cost for quick summary
    newContextTokens: newTokens,
    condenseId,
    condensedCount,
  };
}

/**
 * Restore condensed messages by removing the summary and untagging
 */
export function restoreCondensedMessages(messages: ApiMessage[], condenseId: string): ApiMessage[] {
  // Remove the summary message
  const withoutSummary = messages.filter(
    (msg) => !(msg.isSummary && msg.condenseId === condenseId)
  );

  // Untag messages that were condensed
  return withoutSummary.map((msg) => {
    if (msg.condenseParent === condenseId) {
      const { condenseParent, ...rest } = msg;
      return rest as ApiMessage;
    }
    return msg;
  });
}

/**
 * Get conversation statistics
 */
export function getConversationStats(messages: ApiMessage[], model?: string) {
  const currentTokens = estimateConversationTokens(messages);
  const maxTokens = getContextWindow(model);
  const percentUsed = Math.round((currentTokens / maxTokens) * 100);

  const effectiveMessages = getEffectiveApiHistory(messages);

  return {
    totalMessages: messages.length,
    effectiveMessages: effectiveMessages.length,
    condensedMessages: messages.length - effectiveMessages.length,
    currentTokens,
    maxTokens,
    percentUsed,
    hasSummary: messages.some((m) => m.isSummary),
  };
}

/**
 * Auto-condense if needed (checks threshold and performs condensation)
 */
export function autoCondenseIfNeeded(
  messages: ApiMessage[],
  model?: string,
  config: Partial<CondenseConfig> = {}
): SummarizeResponse {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Check if condensation is needed
  const check = checkShouldCondense(
    messages,
    model,
    cfg.thresholdPercent,
    cfg.minMessagesRequired
  );

  if (!check.shouldCondense) {
    return {
      messages,
      summary: '',
      cost: 0,
      condensedCount: 0,
      condenseId: '',
    };
  }

  // Perform condensation
  return condenseConversation(messages, cfg);
}
