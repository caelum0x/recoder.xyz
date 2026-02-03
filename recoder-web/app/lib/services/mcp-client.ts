/**
 * MCP (Model Context Protocol) Client
 *
 * Manages connections to MCP servers and provides tool execution capabilities.
 * Inspired by kilocode's implementation with support for:
 * - Multiple transport types (stdio, SSE/HTTP stream)
 * - Tool discovery and registration
 * - Tool execution from AI responses
 * - Connection lifecycle management
 *
 * @see https://modelcontextprotocol.io/
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  Tool,
  CallToolResult,
  ListToolsResult,
  ListResourcesResult,
  ListPromptsResult,
} from '@modelcontextprotocol/sdk/types.js';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPClient');

// ============================================================================
// Types
// ============================================================================

/**
 * Transport configuration for connecting to MCP servers
 */
export type MCPTransportType = 'stdio' | 'sse' | 'streamable-http';

export interface StdioTransportConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface SSETransportConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface StreamableHTTPConfig {
  type: 'streamable-http';
  url: string;
  headers?: Record<string, string>;
}

export type MCPTransportConfig = StdioTransportConfig | SSETransportConfig | StreamableHTTPConfig;

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string;
  /** Display name */
  name: string;
  /** Server description */
  description?: string;
  /** Transport configuration */
  transport: MCPTransportConfig;
  /** Whether this server is enabled */
  enabled: boolean;
  /** Timeout for tool calls in milliseconds */
  timeout?: number;
  /** Auto-connect on initialization */
  autoConnect?: boolean;
  /** Environment variables to pass to stdio servers */
  env?: Record<string, string>;
}

/**
 * Connection status for an MCP server
 */
export type MCPConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

/**
 * MCP Tool with server information
 */
export interface MCPTool extends Tool {
  /** Server ID this tool belongs to */
  serverId: string;
  /** Server name for display */
  serverName: string;
}

/**
 * Tool execution request
 */
export interface ToolCallRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool execution result with metadata
 */
export interface ToolCallResponse {
  success: boolean;
  serverId: string;
  toolName: string;
  result?: CallToolResult;
  error?: string;
  duration: number;
  timestamp: number;
}

/**
 * Server connection state
 */
export interface MCPServerState {
  config: MCPServerConfig;
  status: MCPConnectionStatus;
  error?: string;
  tools: Tool[];
  lastConnected?: Date;
  reconnectAttempts: number;
}

/**
 * Event types for MCP client
 */
export type MCPClientEvent =
  | { type: 'server-connected'; serverId: string }
  | { type: 'server-disconnected'; serverId: string }
  | { type: 'server-error'; serverId: string; error: string }
  | { type: 'tools-updated'; serverId: string; tools: Tool[] }
  | { type: 'tool-call-start'; serverId: string; toolName: string }
  | { type: 'tool-call-complete'; serverId: string; toolName: string; success: boolean };

export type MCPEventListener = (event: MCPClientEvent) => void;

// ============================================================================
// MCP Client Implementation
// ============================================================================

/**
 * MCP Client Manager
 *
 * Manages connections to multiple MCP servers and provides a unified interface
 * for tool discovery and execution.
 */
export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, Transport> = new Map();
  private serverStates: Map<string, MCPServerState> = new Map();
  private eventListeners: Set<MCPEventListener> = new Set();
  private isInitialized = false;

  constructor() {
    logger.debug('MCPClientManager initialized');
  }

  // --------------------------------------------------------------------------
  // Event System
  // --------------------------------------------------------------------------

  /**
   * Subscribe to MCP events
   */
  addEventListener(listener: MCPEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(event: MCPClientEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        logger.error('Event listener error:', e);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Server Management
  // --------------------------------------------------------------------------

  /**
   * Initialize the client manager with server configurations
   */
  async initialize(configs: MCPServerConfig[]): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Already initialized, skipping');
      return;
    }

    logger.debug(`Initializing with ${configs.length} server configs`);

    for (const config of configs) {
      this.serverStates.set(config.id, {
        config,
        status: 'disconnected',
        tools: [],
        reconnectAttempts: 0,
      });

      if (config.enabled && config.autoConnect !== false) {
        // Connect asynchronously
        this.connectServer(config.id).catch((err) => {
          logger.error(`Failed to auto-connect to ${config.name}:`, err);
        });
      }
    }

    this.isInitialized = true;
  }

  /**
   * Add a new server configuration
   */
  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.serverStates.has(config.id)) {
      throw new Error(`Server with ID ${config.id} already exists`);
    }

    this.serverStates.set(config.id, {
      config,
      status: 'disconnected',
      tools: [],
      reconnectAttempts: 0,
    });

    if (config.enabled && config.autoConnect !== false) {
      await this.connectServer(config.id);
    }
  }

  /**
   * Remove a server
   */
  async removeServer(serverId: string): Promise<void> {
    await this.disconnectServer(serverId);
    this.serverStates.delete(serverId);
  }

  /**
   * Update server configuration
   */
  async updateServer(serverId: string, updates: Partial<MCPServerConfig>): Promise<void> {
    const state = this.serverStates.get(serverId);
    if (!state) {
      throw new Error(`Server ${serverId} not found`);
    }

    const needsReconnect =
      updates.transport !== undefined ||
      (updates.enabled !== undefined && updates.enabled !== state.config.enabled);

    state.config = { ...state.config, ...updates };

    if (needsReconnect) {
      await this.disconnectServer(serverId);
      if (state.config.enabled) {
        await this.connectServer(serverId);
      }
    }
  }

  /**
   * Connect to an MCP server
   */
  async connectServer(serverId: string): Promise<void> {
    const state = this.serverStates.get(serverId);
    if (!state) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (state.status === 'connected' || state.status === 'connecting') {
      logger.debug(`Server ${serverId} already ${state.status}`);
      return;
    }

    state.status = 'connecting';
    logger.info(`Connecting to MCP server: ${state.config.name}`);

    try {
      const transport = await this.createTransport(state.config);
      this.transports.set(serverId, transport);

      const client = new Client({
        name: 'recoder-web',
        version: '1.0.0',
      });

      await client.connect(transport);
      this.clients.set(serverId, client);

      // Discover tools
      await this.discoverTools(serverId);

      state.status = 'connected';
      state.lastConnected = new Date();
      state.reconnectAttempts = 0;
      state.error = undefined;

      logger.info(`Connected to MCP server: ${state.config.name}`);
      this.emit({ type: 'server-connected', serverId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      state.status = 'error';
      state.error = errorMessage;
      state.reconnectAttempts++;

      logger.error(`Failed to connect to ${state.config.name}:`, err);
      this.emit({ type: 'server-error', serverId, error: errorMessage });

      // Clean up failed connection
      this.clients.delete(serverId);
      this.transports.delete(serverId);
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);
    const state = this.serverStates.get(serverId);

    if (client) {
      try {
        await client.close();
      } catch (e) {
        logger.debug(`Error closing client for ${serverId}:`, e);
      }
      this.clients.delete(serverId);
    }

    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        logger.debug(`Error closing transport for ${serverId}:`, e);
      }
      this.transports.delete(serverId);
    }

    if (state) {
      state.status = 'disconnected';
      state.tools = [];
    }

    logger.info(`Disconnected from MCP server: ${serverId}`);
    this.emit({ type: 'server-disconnected', serverId });
  }

  /**
   * Reconnect to a server
   */
  async reconnectServer(serverId: string): Promise<void> {
    await this.disconnectServer(serverId);
    await this.connectServer(serverId);
  }

  /**
   * Create transport based on configuration
   */
  private async createTransport(config: MCPServerConfig): Promise<Transport> {
    const { transport } = config;

    switch (transport.type) {
      case 'stdio': {
        // Note: StdioClientTransport requires Node.js environment
        // In browser, this would need to be proxied through a backend
        if (typeof window !== 'undefined') {
          throw new Error('Stdio transport is not available in browser environment');
        }

        return new StdioClientTransport({
          command: transport.command,
          args: transport.args,
          env: { ...process.env, ...config.env, ...transport.env } as Record<string, string>,
          cwd: transport.cwd,
        });
      }

      case 'sse': {
        return new SSEClientTransport(new URL(transport.url), {
          requestInit: {
            headers: transport.headers,
          },
        });
      }

      case 'streamable-http': {
        // SSE transport can be used for streamable HTTP as well
        // The SDK handles the protocol negotiation
        return new SSEClientTransport(new URL(transport.url), {
          requestInit: {
            headers: transport.headers,
          },
        });
      }

      default:
        throw new Error(`Unknown transport type: ${(transport as any).type}`);
    }
  }

  // --------------------------------------------------------------------------
  // Tool Discovery & Execution
  // --------------------------------------------------------------------------

  /**
   * Discover tools from a connected server
   */
  private async discoverTools(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const state = this.serverStates.get(serverId);

    if (!client || !state) {
      return;
    }

    try {
      const result: ListToolsResult = await client.listTools();
      state.tools = result.tools || [];

      logger.debug(`Discovered ${state.tools.length} tools from ${state.config.name}`);
      this.emit({ type: 'tools-updated', serverId, tools: state.tools });
    } catch (err) {
      logger.error(`Failed to discover tools from ${serverId}:`, err);
      state.tools = [];
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];

    for (const [serverId, state] of this.serverStates) {
      if (state.status === 'connected') {
        for (const tool of state.tools) {
          tools.push({
            ...tool,
            serverId,
            serverName: state.config.name,
          });
        }
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): Tool[] {
    return this.serverStates.get(serverId)?.tools || [];
  }

  /**
   * Find a tool by name across all servers
   */
  findTool(toolName: string): MCPTool | undefined {
    for (const [serverId, state] of this.serverStates) {
      if (state.status === 'connected') {
        const tool = state.tools.find((t) => t.name === toolName);
        if (tool) {
          return {
            ...tool,
            serverId,
            serverName: state.config.name,
          };
        }
      }
    }
    return undefined;
  }

  /**
   * Execute a tool call
   */
  async callTool(request: ToolCallRequest): Promise<ToolCallResponse> {
    const { serverId, toolName, arguments: args } = request;
    const startTime = Date.now();

    this.emit({ type: 'tool-call-start', serverId, toolName });

    const client = this.clients.get(serverId);
    const state = this.serverStates.get(serverId);

    if (!client || !state || state.status !== 'connected') {
      const error = `Server ${serverId} is not connected`;
      this.emit({ type: 'tool-call-complete', serverId, toolName, success: false });
      return {
        success: false,
        serverId,
        toolName,
        error,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    try {
      const timeout = state.config.timeout || 30000;
      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: args }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool call timed out after ${timeout}ms`)), timeout)
        ),
      ]);

      const duration = Date.now() - startTime;
      logger.debug(`Tool ${toolName} executed in ${duration}ms`);

      this.emit({ type: 'tool-call-complete', serverId, toolName, success: true });
      return {
        success: true,
        serverId,
        toolName,
        result: result as CallToolResult,
        duration,
        timestamp: Date.now(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Tool ${toolName} execution failed:`, err);

      this.emit({ type: 'tool-call-complete', serverId, toolName, success: false });
      return {
        success: false,
        serverId,
        toolName,
        error: errorMessage,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Execute a tool by name (auto-discovers server)
   */
  async callToolByName(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResponse> {
    const tool = this.findTool(toolName);
    if (!tool) {
      return {
        success: false,
        serverId: '',
        toolName,
        error: `Tool ${toolName} not found`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    return this.callTool({
      serverId: tool.serverId,
      toolName,
      arguments: args,
    });
  }

  // --------------------------------------------------------------------------
  // Resources & Prompts (Optional MCP Features)
  // --------------------------------------------------------------------------

  /**
   * List resources from a server
   */
  async listResources(serverId: string): Promise<ListResourcesResult | null> {
    const client = this.clients.get(serverId);
    if (!client) return null;

    try {
      return await client.listResources();
    } catch (err) {
      logger.debug(`Server ${serverId} does not support resources:`, err);
      return null;
    }
  }

  /**
   * List prompts from a server
   */
  async listPrompts(serverId: string): Promise<ListPromptsResult | null> {
    const client = this.clients.get(serverId);
    if (!client) return null;

    try {
      return await client.listPrompts();
    } catch (err) {
      logger.debug(`Server ${serverId} does not support prompts:`, err);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // State & Status
  // --------------------------------------------------------------------------

  /**
   * Get all server states
   */
  getServerStates(): Map<string, MCPServerState> {
    return new Map(this.serverStates);
  }

  /**
   * Get state for a specific server
   */
  getServerState(serverId: string): MCPServerState | undefined {
    return this.serverStates.get(serverId);
  }

  /**
   * Get all server configurations
   */
  getServerConfigs(): MCPServerConfig[] {
    return Array.from(this.serverStates.values()).map((s) => s.config);
  }

  /**
   * Check if any server is connected
   */
  hasConnectedServers(): boolean {
    for (const state of this.serverStates.values()) {
      if (state.status === 'connected') return true;
    }
    return false;
  }

  /**
   * Get connection status for a server
   */
  getConnectionStatus(serverId: string): MCPConnectionStatus {
    return this.serverStates.get(serverId)?.status || 'disconnected';
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Disconnect all servers and clean up
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP client manager');

    const disconnectPromises = Array.from(this.serverStates.keys()).map((id) =>
      this.disconnectServer(id).catch((e) => logger.debug(`Shutdown error for ${id}:`, e))
    );

    await Promise.all(disconnectPromises);

    this.clients.clear();
    this.transports.clear();
    this.serverStates.clear();
    this.eventListeners.clear();
    this.isInitialized = false;
  }
}

// ============================================================================
// Singleton Instance & Helper Functions
// ============================================================================

let mcpClientManager: MCPClientManager | null = null;

/**
 * Get the global MCP client manager instance
 */
export function getMCPClientManager(): MCPClientManager {
  if (!mcpClientManager) {
    mcpClientManager = new MCPClientManager();
  }
  return mcpClientManager;
}

/**
 * Initialize MCP with server configurations
 */
export async function initializeMCP(configs: MCPServerConfig[]): Promise<MCPClientManager> {
  const manager = getMCPClientManager();
  await manager.initialize(configs);
  return manager;
}

/**
 * Shutdown MCP client manager
 */
export async function shutdownMCP(): Promise<void> {
  if (mcpClientManager) {
    await mcpClientManager.shutdown();
    mcpClientManager = null;
  }
}

// ============================================================================
// Tool Schema Helpers
// ============================================================================

/**
 * Convert MCP tool to OpenAI-style function schema
 */
export function mcpToolToFunctionSchema(tool: MCPTool): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  };
}

/**
 * Get all MCP tools as OpenAI function schemas
 */
export function getMCPToolsAsSchema(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  const manager = getMCPClientManager();
  return manager.getAllTools().map(mcpToolToFunctionSchema);
}

/**
 * Format MCP tools for AI context prompt
 */
export function getMCPToolsForPrompt(): string {
  const manager = getMCPClientManager();
  const tools = manager.getAllTools();

  if (tools.length === 0) {
    return '';
  }

  const toolDescriptions = tools.map((tool) => {
    const params = tool.inputSchema
      ? JSON.stringify(tool.inputSchema, null, 2)
      : '{}';
    return `- **${tool.name}** (from ${tool.serverName}): ${tool.description || 'No description'}
  Parameters: \`${params}\``;
  });

  return `
## Available MCP Tools
The following tools are available from connected MCP servers:

${toolDescriptions.join('\n\n')}

To use an MCP tool, call it by name with the appropriate arguments.
`;
}

// ============================================================================
// Default Server Configurations
// ============================================================================

/**
 * Common MCP server presets
 */
export const MCP_SERVER_PRESETS: Record<string, Omit<MCPServerConfig, 'id' | 'enabled'>> = {
  filesystem: {
    name: 'Filesystem',
    description: 'Read and write files, list directories',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/'],
    },
  },
  git: {
    name: 'Git',
    description: 'Git operations - status, diff, commit, branch',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git'],
    },
  },
  github: {
    name: 'GitHub',
    description: 'GitHub API - issues, PRs, repos',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
    env: {
      GITHUB_TOKEN: '', // Must be provided
    },
  },
  memory: {
    name: 'Memory',
    description: 'Persistent memory storage',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  fetch: {
    name: 'Fetch',
    description: 'HTTP requests to external URLs',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  },
  postgres: {
    name: 'PostgreSQL',
    description: 'PostgreSQL database operations',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
    },
    env: {
      POSTGRES_CONNECTION_STRING: '', // Must be provided
    },
  },
  sqlite: {
    name: 'SQLite',
    description: 'SQLite database operations',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite'],
    },
  },
  puppeteer: {
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
  },
  brave: {
    name: 'Brave Search',
    description: 'Web search via Brave Search API',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
    },
    env: {
      BRAVE_API_KEY: '', // Must be provided
    },
  },
};

/**
 * Create a server config from a preset
 */
export function createServerFromPreset(
  presetKey: keyof typeof MCP_SERVER_PRESETS,
  overrides?: Partial<MCPServerConfig>
): MCPServerConfig {
  const preset = MCP_SERVER_PRESETS[presetKey];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetKey}`);
  }

  return {
    id: overrides?.id || `mcp-${presetKey}-${Date.now()}`,
    enabled: true,
    ...preset,
    ...overrides,
    env: { ...preset.env, ...overrides?.env },
  };
}
