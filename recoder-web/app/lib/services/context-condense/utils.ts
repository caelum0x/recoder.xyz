/**
 * Context Condense Utilities
 * Helper functions for token estimation, message processing, and content extraction
 */

import type {
  ApiMessage,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  ReasoningBlock,
  KeepMessagesResult,
  ModelConfig,
} from './types';
import { MODEL_CONFIGS, DEFAULT_MODEL_CONFIG, CHARS_PER_TOKEN } from './constants';

/**
 * Get the model configuration for a given model ID
 */
export function getModelConfig(model?: string): ModelConfig {
  if (!model) return DEFAULT_MODEL_CONFIG;

  // Try exact match first
  if (MODEL_CONFIGS[model]) {
    return MODEL_CONFIGS[model];
  }

  // Try partial match (model ID might be different format)
  const modelLower = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONFIGS)) {
    if (modelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(modelLower)) {
      return value;
    }
  }

  return DEFAULT_MODEL_CONFIG;
}

/**
 * Get context window size for a model
 */
export function getContextWindow(model?: string): number {
  return getModelConfig(model).contextWindow;
}

/**
 * Estimate tokens for a string (rough approximation)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for a content block
 */
export function estimateContentBlockTokens(block: ContentBlock): number {
  switch (block.type) {
    case 'text':
      return estimateTokens(block.text);
    case 'tool_use':
      return estimateTokens(JSON.stringify(block.input)) + estimateTokens(block.name) + 10;
    case 'tool_result':
      if (typeof block.content === 'string') {
        return estimateTokens(block.content);
      }
      return block.content.reduce((sum, b) => sum + estimateContentBlockTokens(b), 0);
    case 'reasoning':
      return estimateTokens(block.text);
    case 'image':
      // Images are typically counted as ~85 tokens for small, ~1500+ for larger
      return 500; // Conservative estimate
    default:
      return 0;
  }
}

/**
 * Estimate tokens for a message
 */
export function estimateMessageTokens(message: ApiMessage): number {
  if (!message.content) return 0;

  if (typeof message.content === 'string') {
    return estimateTokens(message.content);
  }

  // Array of content blocks
  return message.content.reduce((sum, block) => sum + estimateContentBlockTokens(block), 0);
}

/**
 * Estimate total tokens for a conversation
 */
export function estimateConversationTokens(messages: ApiMessage[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/**
 * Get string content from a message (handles both string and array content)
 */
export function getMessageText(message: ApiMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Check if a message contains tool_result blocks
 */
export function hasToolResultBlocks(message: ApiMessage): boolean {
  if (message.role !== 'user' || typeof message.content === 'string') {
    return false;
  }
  return message.content.some((block) => block.type === 'tool_result');
}

/**
 * Get tool_use blocks from a message
 */
export function getToolUseBlocks(message: ApiMessage): ToolUseBlock[] {
  if (message.role !== 'assistant' || typeof message.content === 'string') {
    return [];
  }
  return message.content.filter((block): block is ToolUseBlock => block.type === 'tool_use');
}

/**
 * Get reasoning blocks from a message
 */
export function getReasoningBlocks(message: ApiMessage): ReasoningBlock[] {
  if (message.role !== 'assistant' || typeof message.content === 'string') {
    return [];
  }
  return message.content.filter((block): block is ReasoningBlock => block.type === 'reasoning');
}

/**
 * Extract tool_use blocks that need to be preserved for tool_result pairing
 * When the first kept message is a user message with tool_result blocks,
 * we need to find the corresponding tool_use blocks from the preceding assistant message
 *
 * Also extracts reasoning blocks needed for DeepSeek/Z.ai interleaved thinking
 */
export function getKeepMessagesWithToolBlocks(
  messages: ApiMessage[],
  keepCount: number
): KeepMessagesResult {
  if (messages.length <= keepCount) {
    return { keepMessages: messages, toolUseBlocksToPreserve: [], reasoningBlocksToPreserve: [] };
  }

  const startIndex = messages.length - keepCount;
  const keepMessages = messages.slice(startIndex);

  // Check if first kept message is a user message with tool_result blocks
  if (keepMessages.length > 0 && hasToolResultBlocks(keepMessages[0])) {
    // Look for preceding assistant message with tool_use blocks
    const precedingIndex = startIndex - 1;
    if (precedingIndex >= 0) {
      const precedingMessage = messages[precedingIndex];
      const toolUseBlocks = getToolUseBlocks(precedingMessage);
      if (toolUseBlocks.length > 0) {
        // Also extract reasoning blocks for DeepSeek/Z.ai
        const reasoningBlocks = getReasoningBlocks(precedingMessage);
        return {
          keepMessages,
          toolUseBlocksToPreserve: toolUseBlocks,
          reasoningBlocksToPreserve: reasoningBlocks,
        };
      }
    }
  }

  return { keepMessages, toolUseBlocksToPreserve: [], reasoningBlocksToPreserve: [] };
}

/**
 * Check if a message has recoderAction tags (tool_use equivalent in recoder format)
 */
export function hasRecoderActionTags(content: string): boolean {
  return /<recoderAction[^>]*>/.test(content);
}

/**
 * Extract recoderAction tags from content
 */
export function extractRecoderActions(content: string): string[] {
  const actionRegex = /<recoderAction[^>]*>[\s\S]*?<\/recoderAction>/g;
  return content.match(actionRegex) || [];
}

/**
 * Extract file paths from recoderAction tags
 */
export function extractFilePathsFromActions(content: string): string[] {
  const actions = extractRecoderActions(content);
  const filePaths: Set<string> = new Set();

  for (const action of actions) {
    const filePathMatch = action.match(/filePath="([^"]+)"/);
    if (filePathMatch) {
      filePaths.add(filePathMatch[1]);
    }
  }

  return Array.from(filePaths);
}

/**
 * Remove image blocks from messages (for summarization to avoid token bloat)
 */
export function removeImageBlocks(messages: ApiMessage[]): ApiMessage[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return message;
    }

    const filteredContent = message.content.filter((block) => block.type !== 'image');

    // If all content was images, add a placeholder
    if (filteredContent.length === 0) {
      return {
        ...message,
        content: [{ type: 'text' as const, text: '[Image content removed for summarization]' }],
      };
    }

    return {
      ...message,
      content: filteredContent,
    };
  });
}

/**
 * Ensure message content is in array format
 */
export function normalizeMessageContent(message: ApiMessage): ApiMessage {
  if (typeof message.content === 'string') {
    return {
      ...message,
      content: [{ type: 'text' as const, text: message.content }],
    };
  }
  return message;
}

/**
 * Ensure message content is in string format
 */
export function stringifyMessageContent(message: ApiMessage): ApiMessage {
  if (typeof message.content === 'string') {
    return message;
  }
  return {
    ...message,
    content: getMessageText(message),
  };
}

/**
 * Generate a unique condense ID
 */
export function generateCondenseId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 11);
  return `condense_${timestamp}_${random}`;
}

/**
 * Generate a unique truncation ID
 */
export function generateTruncationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 11);
  return `truncation_${timestamp}_${random}`;
}

/**
 * Create a timestamp for a message that doesn't collide with existing messages
 */
export function createUniqueTimestamp(referenceTs: number, offset: number = -1): number {
  return referenceTs + offset;
}
