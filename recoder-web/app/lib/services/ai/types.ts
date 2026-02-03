/**
 * AI Types
 * Type definitions for AI generation system
 * Adapted from Libra's AI types
 */

// ============================================================================
// Type Definitions for AI Generation
// ============================================================================

/**
 * Image data for multimodal AI requests
 */
export interface ImageData {
  data: ArrayBuffer;
  contentType: string;
}

/**
 * Attachment data reference
 */
export interface AttachmentData {
  key: string;
  name: string;
  type: string;
}

/**
 * Selected item for context (e.g., UI element, code selection)
 */
export interface SelectedItem {
  [key: string]: any;
}

/**
 * Text content in a message
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content in a message
 */
export interface ImageContent {
  type: 'image';
  image: Uint8Array;
  mimeType: string;
}

/**
 * Union type for message content
 */
export type MessageContent = TextContent | ImageContent;

/**
 * Message for AI generation
 */
export interface GenerationMessage {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent[];
}

/**
 * Configuration for AI generation
 */
export interface GenerationConfig {
  /** Whether this is a file edit operation */
  isFileEdit: boolean;
  /** Target filename for file edit operations */
  targetFilename?: string;
  /** Quota type for usage tracking */
  quotaType: 'ai' | 'enhance';
  /** Optional specific model ID to use */
  modelId?: string;
  /** Maximum tokens for output */
  maxTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Enable/disable thinking mode for supported models */
  thinking?: boolean;
}

/**
 * Project data for context building
 */
export interface ProjectData {
  id: string;
  organizationId?: string;
  messageHistory?: string | null;
  knowledge?: string | null;
  name?: string;
  framework?: string;
}

/**
 * Generation context with all necessary data
 */
export interface GenerationContext {
  projectData: ProjectData;
  userPlan: string;
  fileMap: Record<string, FileInfo>;
  xmlFiles: string;
}

/**
 * File information in context
 */
export interface FileInfo {
  content: string;
  path?: string;
  type?: string;
  size?: number;
  lastModified?: number;
}

// ============================================================================
// Chunk Types for Streaming
// ============================================================================

/**
 * Description chunk during streaming
 */
export type DescriptionChunkType = {
  type: 'description' | 'description_complete';
  planId: string;
  data: { content: string };
};

/**
 * Thinking chunk during streaming
 */
export type ThinkingChunkType = {
  type: 'thinking' | 'thinking_complete';
  planId: string;
  data: { content: string };
};

/**
 * File action data in a plan
 */
export type FileActionChunkType = {
  type: 'file';
  description: string;
  modified: string;
  original: string | null;
  basename: string;
  dirname: string;
  path: string;
  isNew?: boolean;
};

/**
 * Command action data in a plan
 */
export type CommandActionChunkType = {
  type: 'command';
  description: string;
  command: 'npm install' | 'bun install' | string;
  packages: string[];
};

/**
 * Delete action data in a plan
 */
export type DeleteActionChunkType = {
  type: 'delete';
  description: string;
  path: string;
};

/**
 * Action chunk in streaming
 */
export type ActionChunkType = {
  type: 'action';
  planId: string;
  data: FileActionChunkType | CommandActionChunkType | DeleteActionChunkType;
};

/**
 * Error chunk in streaming
 */
export type ErrorChunkType = {
  type: 'error';
  data: { content: string };
};

/**
 * Union of all stream chunk types
 */
export type StreamChunk =
  | ThinkingChunkType
  | DescriptionChunkType
  | ActionChunkType
  | ErrorChunkType;

// ============================================================================
// Plan Types
// ============================================================================

/**
 * File action in a plan
 */
export interface FileAction {
  type: 'file';
  dirname: string;
  basename: string;
  path: string;
  modified: string;
  original: string | null;
  description: string;
  isNew: boolean;
}

/**
 * Delete file action
 */
export interface DeleteFileAction {
  type: 'delete';
  path: string;
  description: string;
}

/**
 * NPM/Bun install command
 */
export interface NpmInstallCommand {
  type: 'command';
  command: 'npm install' | 'bun install';
  packages: string[];
  description: string;
}

/**
 * Shell command action
 */
export interface ShellCommand {
  type: 'shell';
  command: string;
  description: string;
}

/**
 * Union of all plan action types
 */
export type PlanAction = FileAction | DeleteFileAction | NpmInstallCommand | ShellCommand;

/**
 * Complete plan structure
 */
export interface Plan {
  id: string;
  query: string;
  description: string;
  thinking?: string;
  actions: PlanAction[];
}

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * AI model definition
 */
export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  supportsThinking?: boolean;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
  requiredPlan?: string;
}

/**
 * Supported AI providers
 */
export type AIProvider =
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'azure'
  | 'google'
  | 'groq'
  | 'xai';

/**
 * Provider options for model configuration
 */
export interface ProviderOptions {
  anthropic?: {
    thinking?: { type: 'enabled' | 'disabled'; budgetTokens?: number };
  };
  openai?: {
    reasoningEffort?: 'low' | 'medium' | 'high';
  };
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result for generation requests
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}

// ============================================================================
// Event Types for Streaming
// ============================================================================

/**
 * Stream event handlers
 */
export interface StreamEventHandlers {
  onThinking?: (content: string, isComplete: boolean) => void;
  onDescription?: (content: string, isComplete: boolean) => void;
  onAction?: (action: FileActionChunkType | CommandActionChunkType | DeleteActionChunkType) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Stream processing options
 */
export interface StreamOptions {
  /** Unique identifier for this stream session */
  planId: string;
  /** File map for original content lookup */
  fileMap?: Record<string, FileInfo>;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Event handlers */
  handlers?: StreamEventHandlers;
}
