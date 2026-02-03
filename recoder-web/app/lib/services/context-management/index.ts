/**
 * Context Management System
 * Copied from Kilocode - Provides intelligent context management with
 * conversation condensation, token tracking, and sliding window truncation
 */

import { z } from 'zod';
import { atom, map, computed } from 'nanostores';

// =============================================================================
// Constants
// =============================================================================

export const TOKEN_BUFFER_PERCENTAGE = 0.10; // 10% buffer before hitting limit
export const DEFAULT_MAX_TOKENS = 128000; // Default context window size
export const CONDENSATION_TRIGGER_PERCENTAGE = 0.85; // Trigger at 85% usage
export const SUMMARY_MAX_TOKENS = 2000; // Max tokens for summary

// =============================================================================
// Schemas
// =============================================================================

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  tokenCount: z.number().optional(),
  timestamp: z.string(),
  truncated: z.boolean().optional(),
  truncationParent: z.string().optional(), // ID of the message this was truncated from
  isSummary: z.boolean().optional(),
  originalMessages: z.array(z.string()).optional(), // IDs of messages summarized
});

export const ContextStateSchema = z.object({
  messages: z.array(ConversationMessageSchema),
  totalTokens: z.number(),
  maxTokens: z.number(),
  truncationPoints: z.array(z.object({
    id: z.string(),
    messageIds: z.array(z.string()),
    truncatedAt: z.string(),
  })),
  condensationHistory: z.array(z.object({
    id: z.string(),
    originalTokens: z.number(),
    condensedTokens: z.number(),
    messageIds: z.array(z.string()),
    summaryId: z.string(),
    performedAt: z.string(),
  })),
});

export const FileContextSchema = z.object({
  path: z.string(),
  content: z.string(),
  tokenCount: z.number(),
  lastModified: z.string(),
  source: z.enum(['user', 'ai', 'system']),
  isStale: z.boolean(),
});

export const ContextConfigSchema = z.object({
  maxTokens: z.number().default(DEFAULT_MAX_TOKENS),
  bufferPercentage: z.number().default(TOKEN_BUFFER_PERCENTAGE),
  condensationTrigger: z.number().default(CONDENSATION_TRIGGER_PERCENTAGE),
  enableCondensation: z.boolean().default(true),
  enableTruncation: z.boolean().default(true),
  preserveSystemMessages: z.boolean().default(true),
});

// =============================================================================
// Types
// =============================================================================

export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ContextState = z.infer<typeof ContextStateSchema>;
export type FileContext = z.infer<typeof FileContextSchema>;
export type ContextConfig = z.infer<typeof ContextConfigSchema>;

// =============================================================================
// State
// =============================================================================

export const contextConfigStore = atom<ContextConfig>({
  maxTokens: DEFAULT_MAX_TOKENS,
  bufferPercentage: TOKEN_BUFFER_PERCENTAGE,
  condensationTrigger: CONDENSATION_TRIGGER_PERCENTAGE,
  enableCondensation: true,
  enableTruncation: true,
  preserveSystemMessages: true,
});

export const conversationMessagesStore = map<Record<string, ConversationMessage>>({});
export const fileContextStore = map<Record<string, FileContext>>({});
export const totalTokensStore = atom<number>(0);
export const isCondensing = atom<boolean>(false);

// =============================================================================
// Computed State
// =============================================================================

export const tokenUsagePercentage = computed(
  [totalTokensStore, contextConfigStore],
  (total, config) => (total / config.maxTokens) * 100
);

export const availableTokens = computed(
  [totalTokensStore, contextConfigStore],
  (total, config) => {
    const buffer = config.maxTokens * config.bufferPercentage;
    return Math.max(0, config.maxTokens - buffer - total);
  }
);

export const needsCondensation = computed(
  [totalTokensStore, contextConfigStore],
  (total, config) => {
    if (!config.enableCondensation) return false;
    return total >= config.maxTokens * config.condensationTrigger;
  }
);

export const sortedMessages = computed(conversationMessagesStore, (messages) => {
  return Object.values(messages)
    .filter(Boolean)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
});

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Estimate token count for text (rough estimation)
 * Uses ~4 characters per token as a general approximation
 */
export function estimateTokenCount(text: string): number {
  // More accurate estimation:
  // - Average English word is 4.5 characters
  // - Average token is ~4 characters
  // - Add overhead for special tokens and formatting
  const charCount = text.length;
  const wordCount = text.split(/\s+/).length;

  // Blend character and word-based estimates
  const charBasedEstimate = Math.ceil(charCount / 4);
  const wordBasedEstimate = Math.ceil(wordCount * 1.3);

  return Math.max(charBasedEstimate, wordBasedEstimate);
}

/**
 * Estimate tokens for a message including role overhead
 */
export function estimateMessageTokens(message: Pick<ConversationMessage, 'role' | 'content'>): number {
  // Role tokens: approximately 4 tokens for role marker
  const roleOverhead = 4;
  const contentTokens = estimateTokenCount(message.content);
  return roleOverhead + contentTokens;
}

// =============================================================================
// Message Management
// =============================================================================

/**
 * Create a unique message ID
 */
export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Add a message to the conversation
 */
export function addMessage(
  role: MessageRole,
  content: string,
  options: Partial<Omit<ConversationMessage, 'id' | 'role' | 'content' | 'timestamp'>> = {}
): ConversationMessage {
  const id = createMessageId();
  const tokenCount = options.tokenCount ?? estimateMessageTokens({ role, content });

  const message: ConversationMessage = {
    id,
    role,
    content,
    tokenCount,
    timestamp: new Date().toISOString(),
    ...options,
  };

  conversationMessagesStore.setKey(id, message);
  totalTokensStore.set(totalTokensStore.get() + tokenCount);

  return message;
}

/**
 * Update a message
 */
export function updateMessage(id: string, updates: Partial<ConversationMessage>): void {
  const message = conversationMessagesStore.get()[id];
  if (!message) return;

  // Recalculate tokens if content changed
  if (updates.content && updates.content !== message.content) {
    const oldTokens = message.tokenCount || 0;
    const newTokens = estimateMessageTokens({ role: message.role, content: updates.content });
    totalTokensStore.set(totalTokensStore.get() - oldTokens + newTokens);
    updates.tokenCount = newTokens;
  }

  conversationMessagesStore.setKey(id, { ...message, ...updates });
}

/**
 * Remove a message
 */
export function removeMessage(id: string): void {
  const message = conversationMessagesStore.get()[id];
  if (!message) return;

  totalTokensStore.set(totalTokensStore.get() - (message.tokenCount || 0));

  const messages = { ...conversationMessagesStore.get() };
  delete messages[id];
  conversationMessagesStore.set(messages);
}

/**
 * Get all messages as array (sorted by timestamp)
 */
export function getMessages(): ConversationMessage[] {
  return sortedMessages.get();
}

/**
 * Get visible messages (excluding truncated ones)
 */
export function getVisibleMessages(): ConversationMessage[] {
  return getMessages().filter(m => !m.truncated);
}

// =============================================================================
// Truncation (Non-Destructive)
// =============================================================================

/**
 * Truncate old messages without deleting them
 * Returns the truncation point ID for potential restoration
 */
export function truncateConversation(
  keepRecentCount: number = 10
): string | null {
  const config = contextConfigStore.get();
  if (!config.enableTruncation) return null;

  const messages = getMessages();
  const systemMessages = config.preserveSystemMessages
    ? messages.filter(m => m.role === 'system')
    : [];

  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  if (nonSystemMessages.length <= keepRecentCount) {
    return null; // Nothing to truncate
  }

  const truncationId = `trunc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const messagesToTruncate = nonSystemMessages.slice(0, -keepRecentCount);
  const truncatedIds: string[] = [];

  let tokensReclaimed = 0;

  for (const message of messagesToTruncate) {
    if (!message.truncated) {
      updateMessage(message.id, {
        truncated: true,
        truncationParent: truncationId,
      });
      truncatedIds.push(message.id);
      tokensReclaimed += message.tokenCount || 0;
    }
  }

  // Update total tokens (truncated messages don't count toward limit)
  totalTokensStore.set(totalTokensStore.get() - tokensReclaimed);

  return truncationId;
}

/**
 * Restore messages from a truncation point
 */
export function restoreTruncation(truncationId: string): number {
  const messages = Object.values(conversationMessagesStore.get());
  let restoredCount = 0;
  let tokensRestored = 0;

  for (const message of messages) {
    if (message?.truncationParent === truncationId && message.truncated) {
      updateMessage(message.id, {
        truncated: false,
        truncationParent: undefined,
      });
      restoredCount++;
      tokensRestored += message.tokenCount || 0;
    }
  }

  totalTokensStore.set(totalTokensStore.get() + tokensRestored);

  return restoredCount;
}

// =============================================================================
// Condensation (Summarization)
// =============================================================================

/**
 * Generate a condensation prompt for summarizing messages
 */
export function generateCondensationPrompt(messages: ConversationMessage[]): string {
  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `Summarize the following conversation, preserving:
- Key decisions and conclusions
- Important code changes or file modifications mentioned
- Specific technical details that might be referenced later
- Any unresolved questions or pending tasks

Be concise but comprehensive. Focus on information that would be needed to continue the conversation effectively.

CONVERSATION:
${conversationText}

SUMMARY:`;
}

/**
 * Condense messages into a summary
 * This should be called with an AI-generated summary
 */
export function applyCondensation(
  messageIds: string[],
  summary: string
): ConversationMessage {
  const messages = messageIds
    .map(id => conversationMessagesStore.get()[id])
    .filter(Boolean) as ConversationMessage[];

  if (messages.length === 0) {
    throw new Error('No messages to condense');
  }

  const originalTokens = messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

  // Create summary message
  const summaryMessage = addMessage('system', `[Conversation Summary]\n${summary}`, {
    isSummary: true,
    originalMessages: messageIds,
  });

  // Mark original messages as truncated
  for (const message of messages) {
    updateMessage(message.id, { truncated: true });
  }

  // Update token count
  const savedTokens = originalTokens - (summaryMessage.tokenCount || 0);
  totalTokensStore.set(totalTokensStore.get() - savedTokens);

  isCondensing.set(false);

  return summaryMessage;
}

/**
 * Check if condensation is needed and return messages to condense
 */
export function getMessagesToCondense(): ConversationMessage[] | null {
  if (!needsCondensation.get()) return null;

  const messages = getVisibleMessages();
  const config = contextConfigStore.get();

  // Keep system messages and recent messages
  const systemMessages = messages.filter(m => m.role === 'system' && !m.isSummary);
  const nonSystemMessages = messages.filter(m => m.role !== 'system' || m.isSummary);

  // Condense older half of conversation
  const midpoint = Math.floor(nonSystemMessages.length / 2);
  const messagesToCondense = nonSystemMessages.slice(0, midpoint);

  if (messagesToCondense.length < 2) return null; // Not enough to condense

  return messagesToCondense;
}

// =============================================================================
// File Context Management
// =============================================================================

/**
 * Add or update file context
 */
export function setFileContext(
  path: string,
  content: string,
  source: FileContext['source'] = 'user'
): void {
  const existing = fileContextStore.get()[path];
  const tokenCount = estimateTokenCount(content);

  // Update total tokens
  if (existing) {
    totalTokensStore.set(totalTokensStore.get() - existing.tokenCount + tokenCount);
  } else {
    totalTokensStore.set(totalTokensStore.get() + tokenCount);
  }

  fileContextStore.setKey(path, {
    path,
    content,
    tokenCount,
    lastModified: new Date().toISOString(),
    source,
    isStale: false,
  });
}

/**
 * Mark file context as stale (e.g., when user edits externally)
 */
export function markFileContextStale(path: string): void {
  const file = fileContextStore.get()[path];
  if (file) {
    fileContextStore.setKey(path, { ...file, isStale: true });
  }
}

/**
 * Remove file context
 */
export function removeFileContext(path: string): void {
  const file = fileContextStore.get()[path];
  if (file) {
    totalTokensStore.set(totalTokensStore.get() - file.tokenCount);

    const files = { ...fileContextStore.get() };
    delete files[path];
    fileContextStore.set(files);
  }
}

/**
 * Get all file contexts
 */
export function getFileContexts(): FileContext[] {
  return Object.values(fileContextStore.get()).filter(Boolean) as FileContext[];
}

/**
 * Get stale file contexts
 */
export function getStaleFileContexts(): FileContext[] {
  return getFileContexts().filter(f => f.isStale);
}

// =============================================================================
// Context Reset
// =============================================================================

/**
 * Clear all context
 */
export function clearContext(): void {
  conversationMessagesStore.set({});
  fileContextStore.set({});
  totalTokensStore.set(0);
  isCondensing.set(false);
}

/**
 * Reset to initial state with optional system message
 */
export function resetContext(systemPrompt?: string): void {
  clearContext();

  if (systemPrompt) {
    addMessage('system', systemPrompt);
  }
}

// =============================================================================
// Context Statistics
// =============================================================================

/**
 * Get context statistics
 */
export function getContextStats(): {
  totalTokens: number;
  maxTokens: number;
  usagePercentage: number;
  availableTokens: number;
  messageCount: number;
  visibleMessageCount: number;
  truncatedMessageCount: number;
  fileContextCount: number;
  staleFileCount: number;
} {
  const messages = getMessages();
  const visibleMessages = getVisibleMessages();
  const fileContexts = getFileContexts();
  const config = contextConfigStore.get();

  return {
    totalTokens: totalTokensStore.get(),
    maxTokens: config.maxTokens,
    usagePercentage: tokenUsagePercentage.get(),
    availableTokens: availableTokens.get(),
    messageCount: messages.length,
    visibleMessageCount: visibleMessages.length,
    truncatedMessageCount: messages.length - visibleMessages.length,
    fileContextCount: fileContexts.length,
    staleFileCount: fileContexts.filter(f => f.isStale).length,
  };
}

/**
 * Format context stats for display
 */
export function formatContextStats(): string {
  const stats = getContextStats();
  return `Tokens: ${stats.totalTokens.toLocaleString()} / ${stats.maxTokens.toLocaleString()} (${stats.usagePercentage.toFixed(1)}%)
Messages: ${stats.visibleMessageCount} visible, ${stats.truncatedMessageCount} truncated
Files: ${stats.fileContextCount} tracked, ${stats.staleFileCount} stale`;
}
