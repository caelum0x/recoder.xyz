/**
 * Generations Module
 * Content and image generation system with streaming support
 *
 * This module provides a complete generation system including:
 * - Content generation using AI providers (OpenAI, Anthropic, Google)
 * - Image generation using FAL AI, OpenAI DALL-E, and Google Imagen
 * - Generation state management (created -> queued -> running -> completed/failed/cancelled)
 * - Message chunk streaming for real-time output
 * - Persistent storage with in-memory, localStorage, and API backends
 *
 * @example
 * ```typescript
 * import {
 *   createAndStartGeneration,
 *   InMemoryStorage,
 *   GenerationIdGenerator,
 *   NodeIdGenerator,
 * } from './generations';
 *
 * // Create a generation context
 * const context = {
 *   storage: new InMemoryStorage(),
 *   logger: console,
 * };
 *
 * // Create and start a generation
 * const generation = await createAndStartGeneration({
 *   context,
 *   generation: {
 *     id: GenerationIdGenerator.generate(),
 *     context: {
 *       origin: {
 *         type: 'studio',
 *         workspaceId: 'ws_123' as WorkspaceId,
 *       },
 *       operationNode: {
 *         id: NodeIdGenerator.generate(),
 *         type: 'operation',
 *         outputs: [{ id: OutputIdGenerator.generate(), accessor: 'generated-text' }],
 *         content: {
 *           type: 'textGeneration',
 *           prompt: 'Write a poem about coding',
 *           llm: {
 *             id: 'gpt-4',
 *             provider: 'openai',
 *             configurations: { temperature: 0.7 },
 *           },
 *         },
 *       },
 *       sourceNodes: [],
 *     },
 *   },
 *   onComplete: ({ generation }) => {
 *     console.log('Generation completed:', generation.outputs);
 *   },
 * });
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // ID Types
  GenerationId,
  NodeId,
  OutputId,
  TaskId,
  WorkspaceId,
  FileId,
  ImageId,
  SecretId,

  // Generation Status
  GenerationStatus,

  // Error and Usage
  GenerationError,
  GenerationUsage,
  GenerationOutput,
  Image,

  // Message Types
  MessagePart,
  Message,
  ModelMessage,

  // Context Types
  GenerationOriginType,
  GenerationOrigin,
  NodeOutput,
  Node,
  NodeContentType,
  NodeContent,
  FileData,
  WebPageData,

  // Language Model Types
  LLMProvider,
  LanguageModelData,
  ContentLanguageModel,
  ToolConfiguration,

  // Generation Context
  GenerationContext,
  GenerationInput,
  ParameterItem,

  // Generation State Types
  BaseGeneration,
  CreatedGeneration,
  QueuedGeneration,
  RunningGeneration,
  CompletedGeneration,
  FailedGeneration,
  CancelledGeneration,
  Generation,

  // Index Types
  NodeGenerationIndex,

  // Callback Types
  GenerationMetadata,
  OnGenerationCompleteEvent,
  OnGenerationErrorEvent,
  OnGenerationComplete,
  OnGenerationError,
  OutputFileBlob,

  // Storage Types
  GenerationStorage,

  // Context Config Types
  GenerationLogger,
  GenerationContextConfig,
  UsageLimits,

  // Tool Types
  PreparedToolSet,
  DataContent,
  FilePart,
  ImagePart,
  TextPart,
  AppEntryResolver,
  FileResolver,
  GenerationContentResolver,
  ImageGenerationResolver,
} from './types';

// Type Guards
export {
  isQueuedGeneration,
  isRunningGeneration,
  isCompletedGeneration,
  isFailedGeneration,
  isCancelledGeneration,
  isTextGenerationNode,
  isContentGenerationNode,
  isImageGenerationNode,
} from './types';

// ID Generators
export {
  GenerationIdGenerator,
  NodeIdGenerator,
  OutputIdGenerator,
  TaskIdGenerator,
  ImageIdGenerator,
} from './types';

// =============================================================================
// Storage
// =============================================================================

export {
  // Storage implementations
  InMemoryStorage,
  LocalStorageStorage,
  ApiStorage,

  // Path utilities
  generationPath,
  nodeGenerationIndexPath,
  taskGenerationIndexesPath,
  generationUiMessageChunksPath,
  generatedImagePath,

  // Storage operations
  getGeneration as getGenerationFromStorage,
  setGeneration as setGenerationToStorage,
  getNodeGenerationIndexes,
  setNodeGenerationIndexes,
  getTaskGenerationIndexes,
  setTaskGenerationIndexes,
  getGeneratedImage as getGeneratedImageFromStorage,
  setGeneratedImage as setGeneratedImageToStorage,
} from './storage';

// =============================================================================
// Utilities
// =============================================================================

export {
  buildMessageObject,
  detectImageType,
  sanitizeGenerationUsage,
  batchWriter,
  type BatchWriterOptions,
} from './utils';

// =============================================================================
// Generation Operations
// =============================================================================

// Cancel Generation
export { cancelGeneration, isCancellationRequested, cancelGenerations } from './cancel-generation';

// Generate Content
export { generateContent, type GenerateContentResult, type GenerateContentParams } from './generate-content';

// Generate Image
export {
  generateImage,
  generateSingleImage,
  type GenerateImageParams,
  type GeneratedImageData,
} from './generate-image';

// Start Content Generation
export {
  startContentGeneration,
  queueGeneration,
  createAndStartGeneration,
  type StartContentGenerationParams,
} from './start-content-generation';

// Get Generation
export {
  getGeneration,
  getNodeGenerations,
  getLatestNodeGeneration,
  getTaskGenerationIndexesWithDetails,
  getLatestCompletedGeneration,
  getGenerationStatus,
  waitForGeneration,
} from './get-generation';

// Get Generated Image
export {
  getGeneratedImage,
  getGeneratedImageBlob,
  getGeneratedImageDataUrl,
  getAllGeneratedImages,
  generatedImageExists,
} from './get-generated-image';

// Get Generation Message Chunks
export {
  getGenerationMessageChunks,
  parseMessageChunks,
  streamMessageChunks,
  getAllMessageChunks,
  extractTextFromChunks,
  type MessageChunk,
  type MessageChunksResult,
} from './get-generation-message-chunks';

// Set Generation
export {
  setGeneration,
  createGeneration,
  queueExistingGeneration,
  createAndQueueGeneration,
  batchCreateGenerations,
  updateGenerationContext,
  type CreateGenerationParams,
} from './set-generation';

// =============================================================================
// Internal Exports (for advanced usage)
// =============================================================================

export { internalSetGeneration } from './internal/set-generation';

export {
  useGenerationExecutor,
  UsageLimitError,
  type ExecutorUtils,
  type FinishGeneration,
  type FinishGenerationArgs,
  type UseGenerationExecutorArgs,
} from './internal/use-generation-executor';

export {
  updateTaskGenerationIndexes,
  flushGenerationIndexQueue,
  cleanupGenerationIndexQueue,
  getQueueSize,
  applyPatches,
  upsert,
  remove,
  type GenerationIndexPatch,
} from './internal/task-generation-index-queue';
