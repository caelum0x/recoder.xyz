/**
 * Execute Data Query
 * Handles execution of data query nodes (database queries)
 */

import {
  type QueuedGeneration,
  type GenerationOutput,
  type GenerationContext,
  type NodeId,
  type OutputId,
  type FailedGeneration,
  type ExecutionContext,
  type DataQueryResult,
  isDataQueryNode,
  isDataStoreNode,
  isTextNode,
  DataQueryError,
} from './types';
import {
  useGenerationExecutor,
  type AppEntryResolver,
  type GenerationMetadata,
  isJsonContent,
  jsonContentToPlainText,
  stripCodeBlock,
  getGeneration,
  getNodeGenerations,
} from './generation-executor';

// ============================================================================
// Data Store Registry
// ============================================================================

/** Data store connection configuration */
export interface DataStoreConfig {
  id: string;
  provider: 'sqlite' | 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'custom';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  options?: Record<string, unknown>;
}

/** Registry of data store connections */
const dataStoreRegistry = new Map<string, DataStoreConfig>();

/**
 * Register a data store connection
 */
export function registerDataStore(config: DataStoreConfig): void {
  dataStoreRegistry.set(config.id, config);
}

/**
 * Get a registered data store
 */
export function getDataStore(id: string): DataStoreConfig | undefined {
  return dataStoreRegistry.get(id);
}

/**
 * Remove a data store connection
 */
export function removeDataStore(id: string): boolean {
  return dataStoreRegistry.delete(id);
}

/**
 * Get all registered data stores
 */
export function getAllDataStores(): DataStoreConfig[] {
  return Array.from(dataStoreRegistry.values());
}

// ============================================================================
// Query Executor Interface
// ============================================================================

/** Query executor for a specific database type */
export interface QueryExecutor {
  provider: string;
  execute: (query: string, config: DataStoreConfig) => Promise<QueryExecutionResult>;
  validate?: (query: string) => boolean;
  sanitize?: (query: string) => string;
}

/** Result of query execution */
export interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields?: QueryField[];
  duration?: number;
}

/** Field metadata from query result */
export interface QueryField {
  name: string;
  type: string;
  nullable?: boolean;
}

/** Registry of query executors */
const queryExecutors = new Map<string, QueryExecutor>();

/**
 * Register a query executor
 */
export function registerQueryExecutor(executor: QueryExecutor): void {
  queryExecutors.set(executor.provider, executor);
}

/**
 * Get a query executor
 */
export function getQueryExecutor(provider: string): QueryExecutor | undefined {
  return queryExecutors.get(provider);
}

// ============================================================================
// Main Execution Function
// ============================================================================

/**
 * Execute a data query generation
 */
export function executeDataQuery(args: {
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
      appEntryResolver,
    }) => {
      try {
        const operationNode = generationContext.operationNode;
        if (!isDataQueryNode(operationNode)) {
          throw new DataQueryError('Invalid generation type for executeDataQuery', 'INVALID_NODE_TYPE');
        }

        // Resolve the query with variable substitution
        const query = await resolveQuery(
          operationNode.content.query,
          runningGeneration,
          args.context,
          appEntryResolver
        );

        // Find connected data store node
        const connectedDataStoreNode = generationContext.sourceNodes
          .filter(isDataStoreNode)
          .find((node) =>
            generationContext.connections.some(
              (connection) => connection.outputNode.id === node.id
            )
          );

        if (!connectedDataStoreNode) {
          throw new DataQueryError('No DataStore node connected to DataQuery node', 'NO_DATA_STORE');
        }

        if (connectedDataStoreNode.content.state.status !== 'configured') {
          throw new DataQueryError('DataStore node is not configured', 'NOT_CONFIGURED');
        }

        const dataStoreId = connectedDataStoreNode.content.state.dataStoreId!;
        const dataStore = getDataStore(dataStoreId);

        if (!dataStore) {
          throw new DataQueryError(`Data store not found: ${dataStoreId}`, 'DATA_STORE_NOT_FOUND');
        }

        // Execute the query
        const result = await executeQuery(query, dataStore);

        // Find the output
        const outputId = operationNode.outputs.find(
          (output) => output.accessor === 'result'
        )?.id;

        if (!outputId) {
          throw new DataQueryError('result output not found in operation node', 'OUTPUT_NOT_FOUND');
        }

        const outputs: GenerationOutput[] = [
          {
            type: 'data-query-result',
            outputId,
            content: {
              type: 'data-query',
              dataStoreId,
              rows: result.rows,
              rowCount: result.rowCount,
              query,
            },
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
  executionContext: ExecutionContext,
  appEntryResolver: AppEntryResolver
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
      case 'action-result':
        return JSON.stringify(output.content);
      case 'query-result':
        throw new DataQueryError('Query result is not supported for Data Query node', 'UNSUPPORTED_OUTPUT');
      case 'data-query-result':
        throw new DataQueryError('Data query result is not supported for Data Query node', 'UNSUPPORTED_OUTPUT');
      default:
        return undefined;
    }
  }

  // Parse JSON content if needed
  let resolvedQuery = isJsonContent(query)
    ? jsonContentToPlainText(JSON.parse(query))
    : query;

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
        throw new DataQueryError(`Unexpected node data: ${contextNode.id}`, 'INVALID_NODE');
      }
      const jsonOrText = contextNode.content.text;
      const text = isJsonContent(jsonOrText)
        ? jsonContentToPlainText(JSON.parse(jsonOrText))
        : jsonOrText;
      resolvedQuery = resolvedQuery.replace(replaceKeyword, text);
    } else if (contentType === 'textGeneration' || contentType === 'contentGeneration') {
      const result = await generationContentResolver(
        contextNode.id,
        sourceKeyword.outputId
      );
      // Strip code blocks (LLM often outputs SQL in markdown)
      const content = stripCodeBlock(result ?? '');
      resolvedQuery = resolvedQuery.replace(replaceKeyword, content);
    } else if (
      contentType === 'file' ||
      contentType === 'webPage' ||
      contentType === 'github' ||
      contentType === 'vectorStore' ||
      contentType === 'dataStore'
    ) {
      throw new DataQueryError(
        `Node type ${contentType} is not supported for data query`,
        'UNSUPPORTED_NODE_TYPE'
      );
    } else {
      // Replace with empty string for unknown types
      resolvedQuery = resolvedQuery.replace(replaceKeyword, '');
    }
  }

  return resolvedQuery;
}

// ============================================================================
// Query Execution
// ============================================================================

/**
 * Execute a query against a data store
 */
async function executeQuery(
  query: string,
  dataStore: DataStoreConfig
): Promise<QueryExecutionResult> {
  const executor = getQueryExecutor(dataStore.provider);

  if (executor) {
    // Validate query if validator exists
    if (executor.validate && !executor.validate(query)) {
      throw new DataQueryError('Invalid query syntax', 'INVALID_QUERY');
    }

    // Sanitize query if sanitizer exists
    const sanitizedQuery = executor.sanitize ? executor.sanitize(query) : query;

    return executor.execute(sanitizedQuery, dataStore);
  }

  // Fallback: Execute via API endpoint
  return executeQueryViaApi(query, dataStore);
}

/**
 * Execute query via API endpoint (fallback)
 */
async function executeQueryViaApi(
  query: string,
  dataStore: DataStoreConfig
): Promise<QueryExecutionResult> {
  try {
    const response = await fetch('/api/database/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataStoreId: dataStore.id,
        query,
        provider: dataStore.provider,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new DataQueryError(error.message || 'Query execution failed', 'QUERY_FAILED');
    }

    const result = await response.json() as { rows?: Record<string, unknown>[]; rowCount?: number; fields?: QueryField[]; duration?: number };

    return {
      rows: result.rows || [],
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
      fields: result.fields,
      duration: result.duration,
    };
  } catch (error) {
    if (error instanceof DataQueryError) {
      throw error;
    }
    throw new DataQueryError(
      error instanceof Error ? error.message : 'Query execution failed',
      'QUERY_ERROR',
      error
    );
  }
}

// ============================================================================
// Built-in Query Executors
// ============================================================================

// SQLite executor (in-browser using sql.js)
registerQueryExecutor({
  provider: 'sqlite',
  validate: (query) => {
    // Basic SQL validation
    const trimmed = query.trim().toLowerCase();
    return (
      trimmed.startsWith('select') ||
      trimmed.startsWith('insert') ||
      trimmed.startsWith('update') ||
      trimmed.startsWith('delete') ||
      trimmed.startsWith('create') ||
      trimmed.startsWith('alter') ||
      trimmed.startsWith('drop') ||
      trimmed.startsWith('pragma')
    );
  },
  sanitize: (query) => {
    // Remove trailing semicolons that might cause issues
    return query.trim().replace(/;+$/, '');
  },
  execute: async (query, config) => {
    // Execute via API since sql.js requires WebAssembly
    const response = await fetch('/api/database/sqlite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: config.database,
        query,
      }),
    });

    if (!response.ok) {
      throw new DataQueryError('SQLite query failed', 'SQLITE_ERROR');
    }

    return response.json();
  },
});

// PostgreSQL executor
registerQueryExecutor({
  provider: 'postgres',
  validate: (query) => {
    const trimmed = query.trim().toLowerCase();
    return trimmed.length > 0 && !trimmed.includes('--'); // Basic comment injection check
  },
  execute: async (query, config) => {
    const response = await fetch('/api/database/postgres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionString: config.connectionString,
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        query,
      }),
    });

    if (!response.ok) {
      throw new DataQueryError('PostgreSQL query failed', 'POSTGRES_ERROR');
    }

    return response.json();
  },
});

// MySQL executor
registerQueryExecutor({
  provider: 'mysql',
  validate: (query) => {
    const trimmed = query.trim().toLowerCase();
    return trimmed.length > 0;
  },
  execute: async (query, config) => {
    const response = await fetch('/api/database/mysql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        query,
      }),
    });

    if (!response.ok) {
      throw new DataQueryError('MySQL query failed', 'MYSQL_ERROR');
    }

    return response.json();
  },
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format query result as a table string
 */
export function formatQueryResult(result: QueryExecutionResult): string {
  if (result.rows.length === 0) {
    return 'No results';
  }

  const columns = Object.keys(result.rows[0]);
  const widths = columns.map((col) => {
    const maxDataWidth = Math.max(
      ...result.rows.map((row) => String(row[col] ?? '').length)
    );
    return Math.max(col.length, maxDataWidth);
  });

  const header = columns.map((col, i) => col.padEnd(widths[i])).join(' | ');
  const separator = widths.map((w) => '-'.repeat(w)).join('-+-');
  const rows = result.rows.map((row) =>
    columns.map((col, i) => String(row[col] ?? '').padEnd(widths[i])).join(' | ')
  );

  return [header, separator, ...rows].join('\n');
}

/**
 * Convert query result to CSV format
 */
export function queryResultToCsv(result: QueryExecutionResult): string {
  if (result.rows.length === 0) {
    return '';
  }

  const columns = Object.keys(result.rows[0]);
  const header = columns.map(escapeCsvValue).join(',');
  const rows = result.rows.map((row) =>
    columns.map((col) => escapeCsvValue(String(row[col] ?? ''))).join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Escape a value for CSV format
 */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert query result to JSON format
 */
export function queryResultToJson(result: QueryExecutionResult): string {
  return JSON.stringify(result.rows, null, 2);
}
