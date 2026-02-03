/**
 * Operations System
 * Provider-based architecture for executing actions, queries, and data operations
 *
 * This module provides a flexible, extensible system for:
 * - Action execution (shell commands, file operations, API calls, etc.)
 * - Query execution (vector store search, file search, code search)
 * - Data query execution (database queries)
 *
 * Based on the giselle operations system architecture.
 */

// ============================================================================
// Types
// ============================================================================

export {
  // ID Types
  type NodeId,
  type OutputId,
  type ActionId,
  type QueryId,
  type GenerationId,
  type TaskId,

  // ID Generators
  createNodeId,
  createOutputId,
  createActionId,
  createQueryId,
  createGenerationId,
  createTaskId,

  // Provider Types
  type ActionProvider,
  type QueryProvider,
  type DataQueryProvider,

  // Generation Types
  type GenerationStatus,
  type BaseGeneration,
  type CreatedGeneration,
  type QueuedGeneration,
  type RunningGeneration,
  type CompletedGeneration,
  type FailedGeneration,
  type CancelledGeneration,
  type Generation,

  // Type Guards
  isQueuedGeneration,
  isRunningGeneration,
  isCompletedGeneration,
  isFailedGeneration,

  // Context Types
  type GenerationContext,
  type GenerationOrigin,

  // Output Types
  type GenerationOutputType,
  type BaseGenerationOutput,
  type GeneratedTextOutput,
  type GeneratedFileOutput,
  type QueryResultOutput,
  type DataQueryResultOutput,
  type ActionResultOutput,
  type SourceOutput,
  type ErrorOutput,
  type GenerationOutput,

  // Node Types
  type OperationNodeType,
  type OperationNode,
  type OperationNodeContent,
  type ActionNodeContent,
  type QueryNodeContent,
  type DataQueryNodeContent,
  type TextGenerationNodeContent,
  type TriggerNodeContent,
  type CustomNodeContent,

  // Source Node Types
  type SourceNodeType,
  type SourceNode,
  type SourceNodeContent,
  type TextSourceContent,
  type FileSourceContent,
  type DataStoreSourceContent,
  type VectorStoreSourceContent,

  // Action Types
  type ActionCommand,
  type ActionState,
  type ActionUnconfiguredState,
  type ActionConfiguredState,

  // Connection Types
  type Connection,
  type NodeInput,
  type NodeOutput,

  // Message Types
  type InputMessage,
  type MessageContent,
  type TextMessageContent,
  type FileMessageContent,
  type ImageMessageContent,

  // Error Types
  type GenerationError,
  ActionExecutionError,
  QueryExecutionError,
  DataQueryError,

  // Query Result Types
  type QueryResult,
  type QueryRecord,
  type DataQueryResult,

  // Vector Store Types
  type VectorStoreSource,
  type FileVectorStoreSource,
  type DocumentVectorStoreSource,
  type VectorStoreState,
  type DocumentVectorStoreState,

  // Data Store Types
  type DataStoreState,

  // Source Reference Types
  type SourceReference,

  // Execution Types
  type ExecutionContext,
  type StorageAdapter,
  type ExecutionCallbacks,
  type ExecutionProgress,

  // Node Type Guards
  isActionNode,
  isQueryNode,
  isDataQueryNode,
  isTextNode,
  isDataStoreNode,
  isVectorStoreNode,
} from './types';

// ============================================================================
// Generation Executor
// ============================================================================

export {
  // Store Functions
  getGeneration,
  setGeneration,
  deleteGeneration,
  getNodeGenerations,
  clearGenerations,

  // Executor Types
  type ExecuteParams,
  type FinishGenerationParams,
  type AppEntryResolver,
  type MessagePart,
  type GenerationMetadata,

  // Core Executor
  useGenerationExecutor,

  // Helpers
  createQueuedGeneration,
  queueGeneration,
  queryResultToText,

  // Text Utilities
  isJsonContent,
  jsonContentToText,
  jsonContentToPlainText,
  stripCodeBlock,
} from './generation-executor';

// ============================================================================
// Execute Action
// ============================================================================

export {
  // Registry
  type ActionHandler,
  type ActionExecuteParams,
  registerAction,
  getAction,
  getAllActions,
  getActionsByProvider,

  // Execution
  executeAction,
} from './execute-action';

// ============================================================================
// Execute Data Query
// ============================================================================

export {
  // Data Store Registry
  type DataStoreConfig,
  registerDataStore,
  getDataStore,
  removeDataStore,
  getAllDataStores,

  // Query Executor
  type QueryExecutor,
  type QueryExecutionResult,
  type QueryField,
  registerQueryExecutor,
  getQueryExecutor,

  // Execution
  executeDataQuery,

  // Utilities
  formatQueryResult,
  queryResultToCsv,
  queryResultToJson,
} from './execute-data-query';

// ============================================================================
// Execute Query
// ============================================================================

export {
  // Constants
  DEFAULT_MAX_RESULTS,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_EMBEDDING_PROFILE_ID,

  // Query Context Types
  type VectorStoreQueryContext,
  type FileQueryContext,
  type DocumentQueryContext,
  type CodeSearchQueryContext,

  // Search Result Types
  type SearchResult,
  type VectorStoreQueryService,
  type EmbeddingMetrics,

  // Registry
  registerQueryService,
  getQueryService,
  getAllQueryServices,

  // Execution
  executeQuery,

  // Result Utilities
  queryResultToText as formatQueryResultToText,
  formatQueryResults,
  getTopResults,
  filterByScore,
  mergeResults,
} from './execute-query';

// ============================================================================
// Provider Architecture
// ============================================================================

export {
  // Base Types
  type BaseProvider,
  type ProviderHealth,
  type ProviderInitOptions,

  // Action Provider Types
  type ActionProviderDefinition,
  type ActionDefinition,
  type ActionInputSchema,
  type ActionOutputSchema,
  type ActionExecuteParams as ProviderActionExecuteParams,

  // Query Provider Types
  type QueryProviderDefinition,
  type QueryTypeDefinition,
  type QueryParameterSchema,
  type QueryExecuteParams as ProviderQueryExecuteParams,
  type QueryExecuteResult,
  type QueryResultItem,

  // Data Provider Types
  type DataProviderDefinition,
  type DataSourceTypeDefinition,
  type DataSourceConfigSchema,
  type DataSourceConfig,
  type DataConnection,
  type DataQueryResult as ProviderDataQueryResult,

  // Registry
  type ProviderDefinition,
  providerRegistry,
  registerActionProvider,
  registerQueryProvider,
  registerDataProvider,
  getProvider,
} from './providers';

// ============================================================================
// Convenience Functions
// ============================================================================

import { executeAction } from './execute-action';
import { executeDataQuery } from './execute-data-query';
import { executeQuery } from './execute-query';
import { providerRegistry } from './providers';
import type { QueuedGeneration, ExecutionContext, OperationNode } from './types';
import type { GenerationMetadata } from './generation-executor';

/**
 * Execute a generation based on its node type
 */
export async function executeGeneration(args: {
  context: ExecutionContext;
  generation: QueuedGeneration;
  metadata?: GenerationMetadata;
}) {
  const nodeType = args.generation.context.operationNode.content.type;

  switch (nodeType) {
    case 'action':
      return executeAction(args);
    case 'query':
      return executeQuery(args);
    case 'data-query':
      return executeDataQuery(args);
    default:
      throw new Error(`Unsupported node type: ${nodeType}`);
  }
}

/**
 * Execute a generation using a provider
 */
export async function executeWithProvider(args: {
  context: ExecutionContext;
  generation: QueuedGeneration;
  providerId: string;
  metadata?: GenerationMetadata;
}) {
  const nodeType = args.generation.context.operationNode.content.type;

  switch (nodeType) {
    case 'action': {
      const provider = providerRegistry.getActionProvider(args.providerId);
      if (!provider) {
        throw new Error(`Action provider not found: ${args.providerId}`);
      }
      return executeAction(args);
    }
    case 'query': {
      const provider = providerRegistry.getQueryProvider(args.providerId);
      if (!provider) {
        throw new Error(`Query provider not found: ${args.providerId}`);
      }
      return executeQuery(args);
    }
    case 'data-query': {
      const provider = providerRegistry.getDataProvider(args.providerId);
      if (!provider) {
        throw new Error(`Data provider not found: ${args.providerId}`);
      }
      return executeDataQuery(args);
    }
    default:
      throw new Error(`Unsupported node type: ${nodeType}`);
  }
}

/**
 * Get available providers for a node type
 */
export function getProvidersForNodeType(nodeType: string): string[] {
  switch (nodeType) {
    case 'action':
      return providerRegistry.getEnabledActionProviders().map(p => p.id);
    case 'query':
      return providerRegistry.getEnabledQueryProviders().map(p => p.id);
    case 'data-query':
      return providerRegistry.getEnabledDataProviders().map(p => p.id);
    default:
      return [];
  }
}

/**
 * Initialize all providers
 */
export async function initializeProviders(context: ExecutionContext): Promise<void> {
  const allProviders = [
    ...providerRegistry.getAllActionProviders(),
    ...providerRegistry.getAllQueryProviders(),
    ...providerRegistry.getAllDataProviders(),
  ];

  await Promise.all(
    allProviders.map(provider =>
      providerRegistry.initializeProvider(provider.id, { context })
    )
  );
}

/**
 * Check health of all providers
 */
export async function checkProvidersHealth(): Promise<Map<string, { status: string; message?: string }>> {
  return providerRegistry.checkAllHealth();
}
