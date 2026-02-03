/**
 * AI Services Index
 * Unified AI generation system adapted from Libra
 *
 * Features:
 * - Multi-provider support (OpenRouter, Anthropic, OpenAI, Google, Groq, xAI)
 * - Streaming and non-streaming generation
 * - Context building from project files
 * - XML-based response parsing
 * - Model selection and configuration
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Core types
  ImageData,
  AttachmentData,
  SelectedItem,
  TextContent,
  ImageContent,
  MessageContent,
  GenerationMessage,
  GenerationConfig,
  ProjectData,
  GenerationContext,
  FileInfo,

  // Streaming chunk types
  DescriptionChunkType,
  ThinkingChunkType,
  FileActionChunkType,
  CommandActionChunkType,
  DeleteActionChunkType,
  ActionChunkType,
  ErrorChunkType,
  StreamChunk,

  // Plan types
  FileAction,
  DeleteFileAction,
  NpmInstallCommand,
  ShellCommand,
  PlanAction,
  Plan,

  // Model types
  AIModel,
  AIProvider,
  ProviderOptions,

  // Event types
  StreamEventHandlers,
  StreamOptions,

  // Validation types
  ValidationResult,
  RateLimitInfo,
} from './types';

// ============================================================================
// Generation Functions
// ============================================================================

export {
  // Core generation
  generateStreamResponse,
  streamGenerateApp,
  streamGenerateAppForFileEdit,
  generateComplete,

  // Stream helpers
  consumeStreamWithHandlers,
  asyncIterableToStream,
  collectStream,
} from './generate';

// ============================================================================
// Context Building
// ============================================================================

export {
  // Context building
  buildGenerationContext,
  buildFileMapWithHistory,
  parseMessageHistory,

  // Quota (no-op for recoder)
  checkQuota,
  getQuotaInfo,

  // Context size management
  getContextLimit,
  estimateContextSize,
  contextFitsModel,

  // Context filtering
  filterFilesForContext,
  reduceContextToFit,

  // Knowledge
  buildKnowledgeSection,
  extractRelevantKnowledge,

  // Types
  type HistoryEntry,
  type QuotaInfo,
} from './context';

// ============================================================================
// File Handling
// ============================================================================

export {
  // File map building
  buildFileMap,
  type FileContentMap,
  type FileStructure,

  // XML building
  buildFilesToXml,
  buildSingleFileXml,

  // File operations
  mergeFileChanges,
  getFileContent,
  fileExists,
  getFilePaths,
  filterByExtension,
  filterByPath,

  // File tree
  buildFileTree,
  getFileStats,

  // Context helpers
  buildMinimalContext,
  buildFocusedContext,
} from './files';

// ============================================================================
// Models
// ============================================================================

export {
  // Model list
  AI_MODELS,
  MODEL_MAPPING,
  DEFAULT_MODELS,

  // Model queries
  getModelById,
  getModelsByProvider,
  getModelsWithFeature,

  // Model access
  canAccessModel,
  getDefaultModelForPlan,
  selectModel,

  // Provider options
  buildProviderOptions,

  // Cost estimation
  estimateCost,
  formatCost,

  // Model selection helpers
  getBestModelForTask,
  getPopularModels,
} from './models';

// ============================================================================
// Providers
// ============================================================================

export {
  // Provider definitions
  PROVIDERS,
  PROVIDER_ENV_VARS,
  type ProviderConfig,
  type ProviderDefinition,

  // Provider configuration
  getProviderApiKey,
  hasProviderApiKey,
  buildProviderConfig,
  getAuthHeaders,

  // Model to provider mapping
  getProviderFromModelId,
  getActualModelId,

  // Provider health
  checkProviderHealth,
  type ProviderHealth,

  // Provider utilities
  getAvailableProviders,
  getProviderDisplayName,
  validateApiKeyFormat,
} from './providers';

// ============================================================================
// Utilities
// ============================================================================

export {
  // Language detection
  containsChinese,
  detectLanguage,

  // Prompt building
  buildUserPrompt,
  buildSelectedElementsInfo,
  buildMessageContent,

  // Validation
  validateAbortSignal,
  isValidJson,

  // String processing
  truncateText,
  stripCDATA,
  wrapInCDATA,
  escapeXml,
  unescapeXml,

  // Path utilities
  dirname,
  basename,
  normalizePath,

  // Error handling
  tryCatch,
  tryCatchSync,

  // Token estimation
  estimateTokens,

  // Formatting
  formatFileSize,
  formatDuration,

  // UUID generation
  generateUUID,
  generateShortId,
} from './utils';

// ============================================================================
// Prompts
// ============================================================================

export {
  // System prompts
  systemPrompt,
  getSystemPrompt,
  getSystemPromptWithAdditions,
  getSystemPromptForMode,

  // Enhanced prompts
  getEnhancedSystemPrompt,
  getEnhancedSystemPromptWithAdditions,
  SystemPromptEnhanced,
} from './prompts';
