/**
 * Provider Architecture
 * Extensible provider system for actions, queries, and data sources
 */

import type {
  ActionProvider,
  QueryProvider,
  DataQueryProvider,
  ExecutionContext,
  GenerationContext,
  GenerationOutput,
  ActionConfiguredState,
} from './types';

// ============================================================================
// Provider Base Types
// ============================================================================

/** Base provider interface */
export interface BaseProvider {
  /** Unique provider identifier */
  id: string;
  /** Display name */
  name: string;
  /** Provider description */
  description?: string;
  /** Provider version */
  version?: string;
  /** Whether the provider is enabled */
  enabled: boolean;
  /** Provider-specific configuration */
  config?: Record<string, unknown>;
}

/** Provider health status */
export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency?: number;
  lastCheck?: number;
  message?: string;
}

/** Provider initialization options */
export interface ProviderInitOptions {
  context: ExecutionContext;
  config?: Record<string, unknown>;
}

// ============================================================================
// Action Provider
// ============================================================================

/** Action provider definition */
export interface ActionProviderDefinition extends BaseProvider {
  type: 'action';
  /** Supported action types */
  actions: ActionDefinition[];
  /** Initialize the provider */
  initialize?: (options: ProviderInitOptions) => Promise<void>;
  /** Check provider health */
  checkHealth?: () => Promise<ProviderHealth>;
  /** Execute an action */
  execute: (params: ActionExecuteParams) => Promise<GenerationOutput[]>;
}

/** Individual action definition */
export interface ActionDefinition {
  id: string;
  name: string;
  description?: string;
  /** Input schema */
  inputs: ActionInputSchema[];
  /** Output schema */
  outputs: ActionOutputSchema[];
  /** Whether the action requires confirmation */
  requiresConfirmation?: boolean;
  /** Risk level of the action */
  riskLevel?: 'low' | 'medium' | 'high';
}

/** Action input schema */
export interface ActionInputSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: unknown;
  validation?: Record<string, unknown>;
}

/** Action output schema */
export interface ActionOutputSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
}

/** Action execution parameters */
export interface ActionExecuteParams {
  actionId: string;
  inputs: Record<string, unknown>;
  state: ActionConfiguredState;
  context: ExecutionContext;
  generationContext: GenerationContext;
}

// ============================================================================
// Query Provider
// ============================================================================

/** Query provider definition */
export interface QueryProviderDefinition extends BaseProvider {
  type: 'query';
  /** Supported query types */
  queryTypes: QueryTypeDefinition[];
  /** Initialize the provider */
  initialize?: (options: ProviderInitOptions) => Promise<void>;
  /** Check provider health */
  checkHealth?: () => Promise<ProviderHealth>;
  /** Execute a query */
  execute: (params: QueryExecuteParams) => Promise<QueryExecuteResult>;
}

/** Query type definition */
export interface QueryTypeDefinition {
  id: string;
  name: string;
  description?: string;
  /** Query parameters */
  parameters: QueryParameterSchema[];
}

/** Query parameter schema */
export interface QueryParameterSchema {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
  default?: unknown;
}

/** Query execution parameters */
export interface QueryExecuteParams {
  queryType: string;
  query: string;
  parameters: Record<string, unknown>;
  context: ExecutionContext;
  maxResults?: number;
  similarityThreshold?: number;
}

/** Query execution result */
export interface QueryExecuteResult {
  results: QueryResultItem[];
  totalCount?: number;
  hasMore?: boolean;
  metadata?: Record<string, unknown>;
}

/** Individual query result item */
export interface QueryResultItem {
  content: string;
  score: number;
  metadata: Record<string, string>;
  source?: string;
}

// ============================================================================
// Data Provider
// ============================================================================

/** Data provider definition */
export interface DataProviderDefinition extends BaseProvider {
  type: 'data';
  /** Supported data source types */
  dataSourceTypes: DataSourceTypeDefinition[];
  /** Initialize the provider */
  initialize?: (options: ProviderInitOptions) => Promise<void>;
  /** Check provider health */
  checkHealth?: () => Promise<ProviderHealth>;
  /** Connect to a data source */
  connect: (config: DataSourceConfig) => Promise<DataConnection>;
  /** Execute a data query */
  query: (connection: DataConnection, query: string) => Promise<DataQueryResult>;
}

/** Data source type definition */
export interface DataSourceTypeDefinition {
  id: string;
  name: string;
  description?: string;
  /** Configuration schema */
  configSchema: DataSourceConfigSchema[];
}

/** Data source configuration schema */
export interface DataSourceConfigSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  required: boolean;
  description?: string;
  default?: unknown;
}

/** Data source configuration */
export interface DataSourceConfig {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

/** Data connection handle */
export interface DataConnection {
  id: string;
  provider: string;
  connected: boolean;
  close: () => Promise<void>;
}

/** Data query result */
export interface DataQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  columns?: string[];
  duration?: number;
}

// ============================================================================
// Provider Registry
// ============================================================================

/** All provider types */
export type ProviderDefinition =
  | ActionProviderDefinition
  | QueryProviderDefinition
  | DataProviderDefinition;

/** Provider registry */
class ProviderRegistry {
  private actionProviders = new Map<string, ActionProviderDefinition>();
  private queryProviders = new Map<string, QueryProviderDefinition>();
  private dataProviders = new Map<string, DataProviderDefinition>();
  private initialized = new Set<string>();

  /**
   * Register an action provider
   */
  registerAction(provider: ActionProviderDefinition): void {
    this.actionProviders.set(provider.id, provider);
  }

  /**
   * Register a query provider
   */
  registerQuery(provider: QueryProviderDefinition): void {
    this.queryProviders.set(provider.id, provider);
  }

  /**
   * Register a data provider
   */
  registerData(provider: DataProviderDefinition): void {
    this.dataProviders.set(provider.id, provider);
  }

  /**
   * Get an action provider
   */
  getActionProvider(id: string): ActionProviderDefinition | undefined {
    return this.actionProviders.get(id);
  }

  /**
   * Get a query provider
   */
  getQueryProvider(id: string): QueryProviderDefinition | undefined {
    return this.queryProviders.get(id);
  }

  /**
   * Get a data provider
   */
  getDataProvider(id: string): DataProviderDefinition | undefined {
    return this.dataProviders.get(id);
  }

  /**
   * Get all action providers
   */
  getAllActionProviders(): ActionProviderDefinition[] {
    return Array.from(this.actionProviders.values());
  }

  /**
   * Get all query providers
   */
  getAllQueryProviders(): QueryProviderDefinition[] {
    return Array.from(this.queryProviders.values());
  }

  /**
   * Get all data providers
   */
  getAllDataProviders(): DataProviderDefinition[] {
    return Array.from(this.dataProviders.values());
  }

  /**
   * Get enabled action providers
   */
  getEnabledActionProviders(): ActionProviderDefinition[] {
    return this.getAllActionProviders().filter(p => p.enabled);
  }

  /**
   * Get enabled query providers
   */
  getEnabledQueryProviders(): QueryProviderDefinition[] {
    return this.getAllQueryProviders().filter(p => p.enabled);
  }

  /**
   * Get enabled data providers
   */
  getEnabledDataProviders(): DataProviderDefinition[] {
    return this.getAllDataProviders().filter(p => p.enabled);
  }

  /**
   * Initialize a provider
   */
  async initializeProvider(id: string, options: ProviderInitOptions): Promise<void> {
    if (this.initialized.has(id)) {
      return;
    }

    const provider =
      this.actionProviders.get(id) ||
      this.queryProviders.get(id) ||
      this.dataProviders.get(id);

    if (provider?.initialize) {
      await provider.initialize(options);
    }

    this.initialized.add(id);
  }

  /**
   * Check provider health
   */
  async checkProviderHealth(id: string): Promise<ProviderHealth> {
    const provider =
      this.actionProviders.get(id) ||
      this.queryProviders.get(id) ||
      this.dataProviders.get(id);

    if (!provider) {
      return { status: 'unknown', message: 'Provider not found' };
    }

    if (!provider.checkHealth) {
      return { status: 'healthy', message: 'No health check available' };
    }

    try {
      return await provider.checkHealth();
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  /**
   * Check all providers health
   */
  async checkAllHealth(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    const allProviders: string[] = [];
    this.actionProviders.forEach((_, id) => allProviders.push(id));
    this.queryProviders.forEach((_, id) => allProviders.push(id));
    this.dataProviders.forEach((_, id) => allProviders.push(id));

    await Promise.all(
      allProviders.map(async (id) => {
        const health = await this.checkProviderHealth(id);
        results.set(id, health);
      })
    );

    return results;
  }

  /**
   * Unregister a provider
   */
  unregister(id: string): boolean {
    return (
      this.actionProviders.delete(id) ||
      this.queryProviders.delete(id) ||
      this.dataProviders.delete(id)
    );
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.actionProviders.clear();
    this.queryProviders.clear();
    this.dataProviders.clear();
    this.initialized.clear();
  }
}

/** Global provider registry instance */
export const providerRegistry = new ProviderRegistry();

// ============================================================================
// Provider Registration Helpers
// ============================================================================

/**
 * Register an action provider
 */
export function registerActionProvider(provider: ActionProviderDefinition): void {
  providerRegistry.registerAction(provider);
}

/**
 * Register a query provider
 */
export function registerQueryProvider(provider: QueryProviderDefinition): void {
  providerRegistry.registerQuery(provider);
}

/**
 * Register a data provider
 */
export function registerDataProvider(provider: DataProviderDefinition): void {
  providerRegistry.registerData(provider);
}

/**
 * Get a provider by type and ID
 */
export function getProvider(
  type: 'action' | 'query' | 'data',
  id: string
): ProviderDefinition | undefined {
  switch (type) {
    case 'action':
      return providerRegistry.getActionProvider(id);
    case 'query':
      return providerRegistry.getQueryProvider(id);
    case 'data':
      return providerRegistry.getDataProvider(id);
    default:
      return undefined;
  }
}

// ============================================================================
// Built-in Providers
// ============================================================================

// Shell action provider
registerActionProvider({
  id: 'shell',
  name: 'Shell',
  description: 'Execute shell commands',
  type: 'action',
  enabled: true,
  actions: [
    {
      id: 'run',
      name: 'Run Command',
      description: 'Execute a shell command',
      inputs: [
        { name: 'command', type: 'string', required: true, description: 'Command to execute' },
        { name: 'workDir', type: 'string', required: false, description: 'Working directory' },
        { name: 'timeout', type: 'number', required: false, description: 'Timeout in ms' },
      ],
      outputs: [
        { name: 'stdout', type: 'string', description: 'Standard output' },
        { name: 'stderr', type: 'string', description: 'Standard error' },
        { name: 'exitCode', type: 'number', description: 'Exit code' },
      ],
      requiresConfirmation: true,
      riskLevel: 'high',
    },
  ],
  execute: async (params) => {
    const response = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: params.inputs.command,
        cwd: params.inputs.workDir || params.context.workDir,
        timeout: params.inputs.timeout,
        projectId: params.context.projectId,
      }),
    });

    const result = await response.json();

    const outputId = params.generationContext.operationNode.outputs.find(
      (o) => o.accessor === 'action-result'
    )?.id;

    return outputId
      ? [{ type: 'action-result', outputId, content: result }]
      : [];
  },
});

// File action provider
registerActionProvider({
  id: 'file',
  name: 'File System',
  description: 'File system operations',
  type: 'action',
  enabled: true,
  actions: [
    {
      id: 'read',
      name: 'Read File',
      inputs: [{ name: 'path', type: 'string', required: true }],
      outputs: [{ name: 'content', type: 'string' }],
      riskLevel: 'low',
    },
    {
      id: 'write',
      name: 'Write File',
      inputs: [
        { name: 'path', type: 'string', required: true },
        { name: 'content', type: 'string', required: true },
      ],
      outputs: [{ name: 'success', type: 'boolean' }],
      requiresConfirmation: true,
      riskLevel: 'medium',
    },
    {
      id: 'delete',
      name: 'Delete File',
      inputs: [{ name: 'path', type: 'string', required: true }],
      outputs: [{ name: 'success', type: 'boolean' }],
      requiresConfirmation: true,
      riskLevel: 'high',
    },
  ],
  execute: async (params) => {
    const { actionId, inputs, context, generationContext } = params;

    let result: unknown;

    switch (actionId) {
      case 'read':
        const readRes = await fetch(
          `/api/files?path=${encodeURIComponent(inputs.path as string)}&projectId=${context.projectId}`
        );
        result = await readRes.json();
        break;

      case 'write':
        const writeRes = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: inputs.path,
            content: inputs.content,
            projectId: context.projectId,
          }),
        });
        result = await writeRes.json();
        break;

      case 'delete':
        const deleteRes = await fetch('/api/files', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: inputs.path,
            projectId: context.projectId,
          }),
        });
        result = await deleteRes.json();
        break;

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }

    const outputId = generationContext.operationNode.outputs.find(
      (o) => o.accessor === 'action-result'
    )?.id;

    return outputId
      ? [{ type: 'action-result', outputId, content: result }]
      : [];
  },
});

// File search query provider
registerQueryProvider({
  id: 'file-search',
  name: 'File Search',
  description: 'Search files by content',
  type: 'query',
  enabled: true,
  queryTypes: [
    {
      id: 'grep',
      name: 'Grep Search',
      description: 'Search file contents using patterns',
      parameters: [
        { name: 'pattern', type: 'string', required: true },
        { name: 'directory', type: 'string', required: false },
        { name: 'fileTypes', type: 'string', required: false },
      ],
    },
    {
      id: 'glob',
      name: 'File Pattern',
      description: 'Find files by name pattern',
      parameters: [
        { name: 'pattern', type: 'string', required: true },
        { name: 'directory', type: 'string', required: false },
      ],
    },
  ],
  execute: async (params) => {
    const response = await fetch('/api/search/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        queryType: params.queryType,
        parameters: params.parameters,
        projectId: params.context.projectId,
        maxResults: params.maxResults,
      }),
    });

    if (!response.ok) {
      return { results: [] };
    }

    const data = (await response.json()) as Record<string, any>;

    return {
      results: data.results?.map((r: any) => ({
        content: r.content || r.match,
        score: r.score || 1,
        metadata: {
          path: r.path || '',
          line: String(r.line || 0),
        },
        source: 'file-search',
      })) || [],
      totalCount: data.totalCount,
      hasMore: data.hasMore,
    };
  },
});
