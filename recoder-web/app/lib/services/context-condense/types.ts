/**
 * Context Condense Types
 * Type definitions for intelligent message history compression
 */

/**
 * API Message format for conversation history
 * Compatible with both OpenAI and Anthropic formats
 */
export interface ApiMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  createdAt?: Date;
  ts?: number; // Timestamp for ordering

  // Condensation tracking (non-destructive)
  isSummary?: boolean; // Is this a summary message
  condenseId?: string; // Unique ID for this summary
  condenseParent?: string; // ID of summary that replaced this message

  // Truncation tracking (for sliding window)
  isTruncationMarker?: boolean;
  truncationId?: string;
  truncationParent?: string;
}

/**
 * Content block types (Anthropic-style)
 */
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ReasoningBlock
  | ImageBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface ReasoningBlock {
  type: 'reasoning';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
}

/**
 * Result of getKeepMessagesWithToolBlocks
 */
export interface KeepMessagesResult {
  keepMessages: ApiMessage[];
  toolUseBlocksToPreserve: ToolUseBlock[];
  reasoningBlocksToPreserve: ContentBlock[];
}

/**
 * Result of summarization operation
 */
export interface SummarizeResponse {
  /** The messages after summarization */
  messages: ApiMessage[];
  /** The summary text; empty string for no summary */
  summary: string;
  /** The cost of the summarization operation (if using LLM) */
  cost: number;
  /** Number of tokens in context for next API request */
  newContextTokens?: number;
  /** Error message if operation fails */
  error?: string;
  /** Unique ID of the created Summary message */
  condenseId?: string;
  /** Number of messages that were condensed */
  condensedCount?: number;
}

/**
 * Check result for whether condensation should occur
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
 * Configuration for condensation
 */
export interface CondenseConfig {
  /** Number of recent messages to keep */
  messagesToKeep: number;
  /** Minimum number of messages before condensation is possible */
  minMessagesRequired: number;
  /** Percentage threshold (0-100) to trigger condensation */
  thresholdPercent: number;
  /** Whether to use native tools protocol (preserves tool_use/tool_result pairing) */
  useNativeTools: boolean;
  /** Custom summary prompt */
  customPrompt?: string;
}

/**
 * Handler interface for LLM operations (used for LLM-based summarization)
 */
export interface LLMHandler {
  /** Create a message stream */
  createMessage(
    prompt: string,
    messages: Array<{ role: string; content: unknown }>
  ): AsyncIterable<LLMStreamChunk>;

  /** Count tokens in content */
  countTokens(content: ContentBlock[]): Promise<number>;

  /** Get model info */
  getModel(): {
    id: string;
    info: {
      contextWindow: number;
      maxTokens: number;
    };
  };
}

export interface LLMStreamChunk {
  type: 'text' | 'usage' | 'error';
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalCost?: number;
  error?: string;
}

/**
 * Model context window configurations
 */
export interface ModelConfig {
  contextWindow: number;
  maxOutputTokens: number;
  supportsImages?: boolean;
  supportsTools?: boolean;
}
