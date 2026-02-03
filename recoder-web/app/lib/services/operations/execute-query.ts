/**
 * Execute Query
 * Handles execution of query nodes (vector store and search queries)
 */

import {
  type QueuedGeneration,
  type GenerationOutput,
  type GenerationContext,
  type NodeId,
  type OutputId,
  type FailedGeneration,
  type ExecutionContext,
  type QueryResult,
  type QueryRecord,
  type SourceNode,
  isQueryNode,
  isTextNode,
  QueryExecutionError,
} from './types';
import {
  useGenerationExecutor,
  type AppEntryResolver,
  type GenerationMetadata,
  isJsonContent,
  jsonContentToText,
  getNodeGenerations,
} from './generation-executor';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum results for queries */
export const DEFAULT_MAX_RESULTS = 10;

/** Default similarity threshold for vector queries */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

/** Default embedding profile ID */
export const DEFAULT_EMBEDDING_PROFILE_ID = 'default';

// ============================================================================
// Vector Store Query Service Interface
// ============================================================================

/** Query context for vector store searches */
export interface VectorStoreQueryContext {
  provider: string;
  workspaceId?: string;
  embeddingProfileId?: string;
}

/** File-based query context */
export interface FileQueryContext extends VectorStoreQueryContext {
  provider: 'file';
  directory: string;
  patterns?: string[];
}

/** Document query context */
export interface DocumentQueryContext extends VectorStoreQueryContext {
  provider: 'document';
  documentVectorStoreId: string;
}

/** Code search query context */
export interface CodeSearchQueryContext extends VectorStoreQueryContext {
  provider: 'code-search';
  projectId: string;
  language?: string;
}

/** Search result from vector store */
export interface SearchResult {
  chunk: {
    content: string;
    index: number;
  };
  similarity: number;
  metadata?: Record<string, unknown>;
  additional?: unknown;
}

/** Vector store query service interface */
export interface VectorStoreQueryService {
  search(
    query: string,
    context: VectorStoreQueryContext,
    maxResults: number,
    similarityThreshold: number,
    onMetrics?: (metrics: EmbeddingMetrics) => Promise<void>,
    headers?: Record<string, string>
  ): Promise<SearchResult[]>;
}

/** Embedding metrics for tracking */
export interface EmbeddingMetrics {
  model: string;
  inputTokens: number;
  duration: number;
}

// ============================================================================
// Query Service Registry
// ============================================================================

/** Registry of query services */
const queryServices: Map<string, VectorStoreQueryService> = new Map();

/**
 * Register a query service
 */
export function registerQueryService(provider: string, service: VectorStoreQueryService): void {
  queryServices.set(provider, service);
}

/**
 * Get a query service
 */
export function getQueryService(provider: string): VectorStoreQueryService | undefined {
  return queryServices.get(provider);
}

/**
 * Get all registered query services
 */
export function getAllQueryServices(): Map<string, VectorStoreQueryService> {
  return new Map(queryServices);
}

// ============================================================================
// Main Execution Function
// ============================================================================

/**
 * Execute a query generation
 */
export function executeQuery(args: {
  context: ExecutionContext;
  generation: QueuedGeneration;
  metadata?: GenerationMetadata;
}) {
  return useGenerationExecutor({
    context: args.context,
    generation: args.generation,
    metadata: args.metadata,
    execute: async ({
      runningGeneration,
      generationContext,
      finishGeneration,
      setGeneration,
    }) => {
      try {
        const operationNode = generationContext.operationNode;
        if (!isQueryNode(operationNode)) {
          throw new QueryExecutionError('Invalid generation type for executeQuery', 'INVALID_NODE_TYPE');
        }

        // Resolve the query with variable substitution
        const query = await resolveQuery(
          operationNode.content.query,
          runningGeneration,
          args.context
        );

        // Validate query is not empty
        if (query.trim().length === 0) {
          throw new QueryExecutionError('Query is empty', 'EMPTY_QUERY');
        }

        // Find vector store nodes connected to this query node
        const vectorStoreNodes = generationContext.sourceNodes.filter(
          (node) =>
            node.content.type === 'vectorStore' &&
            generationContext.connections.some(
              (connection) => connection.outputNode.id === node.id
            )
        );

        // Execute query against vector stores
        const queryResults = await queryVectorStores(
          query,
          args.context,
          generationContext,
          vectorStoreNodes,
          operationNode.content.maxResults ?? DEFAULT_MAX_RESULTS,
          operationNode.content.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
          args.metadata
        );

        // Find the output
        const outputId = generationContext.operationNode.outputs.find(
          (output) => output.accessor === 'result'
        )?.id;

        if (!outputId) {
          throw new QueryExecutionError('query-results output not found in operation node', 'OUTPUT_NOT_FOUND');
        }

        const outputs: GenerationOutput[] = [
          {
            type: 'query-result',
            content: queryResults,
            outputId,
          },
        ];

        await finishGeneration({
          inputMessages: [],
          outputs,
        });
      } catch (error) {
        const failedGeneration: FailedGeneration = {
          ...runningGeneration,
          status: 'failed',
          failedAt: Date.now(),
          error: {
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
            details: error,
          },
        };

        await setGeneration(failedGeneration);
        throw error;
      }
    },
  });
}

// ============================================================================
// Query Resolution
// ============================================================================

/**
 * Resolve a query with variable substitution
 */
async function resolveQuery(
  query: string,
  runningGeneration: { context: GenerationContext },
  executionContext: ExecutionContext
): Promise<string> {
  const generationContext = runningGeneration.context;

  // Content resolver for upstream generations
  async function generationContentResolver(
    nodeId: NodeId,
    outputId: OutputId
  ): Promise<string | undefined> {
    const nodeGenerations = getNodeGenerations(nodeId);

    if (!nodeGenerations || nodeGenerations.length === 0) {
      return undefined;
    }

    const completedGeneration = nodeGenerations
      .filter((g) => g.status === 'completed')
      .pop();

    if (!completedGeneration || completedGeneration.status !== 'completed') {
      return undefined;
    }

    const output = completedGeneration.outputs.find((o) => o.outputId === outputId);
    if (!output) {
      return undefined;
    }

    switch (output.type) {
      case 'generated-text':
        return output.content;
      case 'source':
        return JSON.stringify((output as any).sources);
      case 'query-result':
        return queryResultToText(output);
      case 'action-result':
        return JSON.stringify(output.content);
      default:
        return undefined;
    }
  }

  // Parse JSON content if needed
  let resolvedQuery = query;
  if (isJsonContent(query)) {
    resolvedQuery = jsonContentToText(JSON.parse(query));
  }

  // Find all references in the format {{nd-XXXX:otp-XXXX}}
  const pattern = /\{\{(nd-[a-zA-Z0-9-]+):(otp-[a-zA-Z0-9-]+)\}\}/g;
  const sourceKeywords: Array<{ nodeId: NodeId; outputId: OutputId }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(resolvedQuery)) !== null) {
    sourceKeywords.push({
      nodeId: match[1] as NodeId,
      outputId: match[2] as OutputId,
    });
  }

  for (const sourceKeyword of sourceKeywords) {
    const contextNode = generationContext.sourceNodes.find(
      (contextNode) => contextNode.id === sourceKeyword.nodeId
    );

    if (!contextNode) {
      continue;
    }

    const replaceKeyword = `{{${sourceKeyword.nodeId}:${sourceKeyword.outputId}}}`;
    const contentType = contextNode.content.type;

    if (contentType === 'text') {
      if (!isTextNode(contextNode)) {
        throw new QueryExecutionError(`Unexpected node data: ${contextNode.id}`, 'INVALID_NODE');
      }
      const jsonOrText = contextNode.content.text;
      const text = isJsonContent(jsonOrText)
        ? jsonContentToText(JSON.parse(jsonOrText))
        : jsonOrText;
      resolvedQuery = resolvedQuery.replace(replaceKeyword, text);
    } else if (contentType === 'textGeneration' || contentType === 'contentGeneration') {
      const result = await generationContentResolver(
        contextNode.id,
        sourceKeyword.outputId
      );
      resolvedQuery = resolvedQuery.replace(replaceKeyword, result ?? '');
    } else if (
      contentType === 'file' ||
      contentType === 'webPage' ||
      contentType === 'dataQuery' ||
      contentType === 'dataStore' ||
      contentType === 'github'
    ) {
      throw new QueryExecutionError(`Node type ${contentType} is not implemented for queries`, 'NOT_IMPLEMENTED');
    } else if (contentType === 'trigger' || contentType === 'action') {
      const result = await generationContentResolver(
        contextNode.id,
        sourceKeyword.outputId
      );
      resolvedQuery = resolvedQuery.replace(replaceKeyword, result ?? '');
    } else if (contentType === 'query' || contentType === 'vectorStore') {
      // These are handled by the query system
    } else {
      // Replace unknown types with empty string
      resolvedQuery = resolvedQuery.replace(replaceKeyword, '');
    }
  }

  return resolvedQuery;
}

// ============================================================================
// Vector Store Query
// ============================================================================

/**
 * Query multiple vector stores
 */
async function queryVectorStores(
  query: string,
  executionContext: ExecutionContext,
  generationContext: GenerationContext,
  vectorStoreNodes: SourceNode[],
  maxResults: number,
  similarityThreshold: number,
  metadata?: GenerationMetadata
): Promise<QueryResult[]> {
  if (vectorStoreNodes.length === 0) {
    // If no vector stores, try file-based search
    return executeFileSearch(query, executionContext, maxResults);
  }

  const results = await Promise.all(
    vectorStoreNodes.map(async (vectorStoreNode) => {
      const { content } = vectorStoreNode;

      if (content.type !== 'vectorStore') {
        return null;
      }

      const source = (content as any).source;
      if (!source || source.state?.status !== 'configured') {
        return null;
      }

      const provider = source.provider;
      const state = source.state;

      const queryService = getQueryService(provider);
      if (!queryService) {
        // Fallback to API-based search
        return executeApiSearch(query, provider, state, maxResults, similarityThreshold);
      }

      try {
        const queryContext: VectorStoreQueryContext = {
          provider,
          workspaceId: metadata?.projectId,
          embeddingProfileId: state.embeddingProfileId ?? DEFAULT_EMBEDDING_PROFILE_ID,
        };

        const searchResults = await queryService.search(
          query,
          queryContext,
          maxResults,
          similarityThreshold
        );

        return {
          type: 'vector-store' as const,
          source,
          records: searchResults.map((result) => ({
            chunkContent: result.chunk.content,
            chunkIndex: result.chunk.index,
            score: result.similarity,
            metadata: Object.fromEntries(
              Object.entries(result.metadata ?? {}).map(([k, v]) => [k, String(v)])
            ),
            additional: result.additional,
          })),
        };
      } catch (error) {
        console.error(`Vector store query failed for ${provider}:`, error);
        return null;
      }
    })
  );

  return results.filter((r): r is QueryResult => r !== null);
}

/**
 * Execute file-based search (fallback when no vector stores)
 */
async function executeFileSearch(
  query: string,
  executionContext: ExecutionContext,
  maxResults: number
): Promise<QueryResult[]> {
  try {
    const response = await fetch('/api/search/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        projectId: executionContext.projectId,
        maxResults,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const results = (await response.json()) as any[];

    return [
      {
        type: 'vector-store',
        source: { provider: 'file', state: { status: 'configured' } },
        records: results.map((result: any, index: number) => ({
          chunkContent: result.content || result.match,
          chunkIndex: index,
          score: result.score || 1,
          metadata: {
            path: result.path || '',
            line: String(result.line || 0),
          },
        })),
      },
    ];
  } catch (error) {
    console.error('File search failed:', error);
    return [];
  }
}

/**
 * Execute API-based search (fallback when no query service)
 */
async function executeApiSearch(
  query: string,
  provider: string,
  state: any,
  maxResults: number,
  similarityThreshold: number
): Promise<QueryResult | null> {
  try {
    const response = await fetch('/api/search/vector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        provider,
        state,
        maxResults,
        similarityThreshold,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const results = (await response.json()) as any[];

    return {
      type: 'vector-store',
      source: { provider: provider as 'file' | 'document', state } as any,
      records: results.map((result: any) => ({
        chunkContent: result.content,
        chunkIndex: result.index || 0,
        score: result.score || result.similarity,
        metadata: result.metadata || {},
        additional: result.additional,
      })),
    };
  } catch (error) {
    console.error(`API search failed for ${provider}:`, error);
    return null;
  }
}

// ============================================================================
// Result Formatting
// ============================================================================

/**
 * Convert query result output to text format
 */
export function queryResultToText(output: { content: unknown }): string {
  const results = output.content;
  if (!Array.isArray(results) || results.length === 0) {
    return '';
  }

  return results
    .map((result: QueryResult) => {
      if (result.records && Array.isArray(result.records)) {
        return result.records
          .map((record: QueryRecord) => {
            const header = record.metadata?.path
              ? `## ${record.metadata.path}\n\n`
              : '';
            return header + record.chunkContent;
          })
          .join('\n\n');
      }
      return JSON.stringify(result);
    })
    .join('\n\n---\n\n');
}

/**
 * Format query results for display
 */
export function formatQueryResults(results: QueryResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  const formatted: string[] = [];

  for (const result of results) {
    const source = result.source?.provider || 'Unknown';
    formatted.push(`### Source: ${source}\n`);

    for (const record of result.records) {
      const score = (record.score * 100).toFixed(1);
      const path = record.metadata?.path || 'Unknown location';

      formatted.push(`**Match (${score}% confidence)** - ${path}`);
      formatted.push('```');
      formatted.push(record.chunkContent.trim());
      formatted.push('```\n');
    }
  }

  return formatted.join('\n');
}

/**
 * Get top results across all query results
 */
export function getTopResults(
  results: QueryResult[],
  count: number = 5
): QueryRecord[] {
  const allRecords: QueryRecord[] = [];

  for (const result of results) {
    allRecords.push(...result.records);
  }

  // Sort by score descending
  allRecords.sort((a, b) => b.score - a.score);

  return allRecords.slice(0, count);
}

/**
 * Filter results by minimum score
 */
export function filterByScore(
  results: QueryResult[],
  minScore: number
): QueryResult[] {
  return results.map((result) => ({
    ...result,
    records: result.records.filter((record) => record.score >= minScore),
  })).filter((result) => result.records.length > 0);
}

/**
 * Merge duplicate results
 */
export function mergeResults(results: QueryResult[]): QueryRecord[] {
  const merged = new Map<string, QueryRecord>();

  for (const result of results) {
    for (const record of result.records) {
      const key = record.chunkContent.trim();
      const existing = merged.get(key);

      if (!existing || record.score > existing.score) {
        merged.set(key, record);
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

// ============================================================================
// Built-in Query Services
// ============================================================================

// File search service (grep-based)
registerQueryService('file', {
  async search(query, context, maxResults, similarityThreshold) {
    const response = await fetch('/api/search/grep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        directory: (context as FileQueryContext).directory,
        patterns: (context as FileQueryContext).patterns,
        maxResults,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const results = (await response.json()) as any[];

    return results.map((r: any, i: number) => ({
      chunk: { content: r.content, index: i },
      similarity: 1, // Exact matches have similarity 1
      metadata: { path: r.path, line: r.line },
    }));
  },
});

// Code search service (semantic code search)
registerQueryService('code-search', {
  async search(query, context, maxResults, similarityThreshold) {
    const codeContext = context as CodeSearchQueryContext;

    const response = await fetch('/api/search/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        projectId: codeContext.projectId,
        language: codeContext.language,
        maxResults,
        minScore: similarityThreshold,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const results = (await response.json()) as any[];

    return results.map((r: any) => ({
      chunk: { content: r.code, index: r.index || 0 },
      similarity: r.score,
      metadata: {
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        language: r.language,
      },
    }));
  },
});
