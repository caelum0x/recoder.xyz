/**
 * MCP Manager
 *
 * Central manager for MCP server connections, tool discovery, and execution.
 * Supports multiple transport types (stdio, SSE, HTTP) and handles
 * connection lifecycle, tool caching, and consent integration.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  Tool,
  CallToolResult,
  ListToolsResult,
  ListResourcesResult,
  ListPromptsResult,
} from '@modelcontextprotocol/sdk/types.js';
import { createScopedLogger } from '~/utils/logger';

import type {
  McpServer,
  McpServerConfig,
  McpServerState,
  McpConnectionStatus,
  McpTool,
  McpToolWithServer,
  McpClientEvent,
  McpEventListener,
  ToolCallRequest,
  ToolCallResponse,
  McpTransportConfig,
} from './types';
import {
  loadServers,
  createServer,
  updateServer,
  deleteServer,
  toggleServerEnabled,
  getStoredConsent,
} from './storage';
import { requireMcpToolConsent } from './consent-manager';
import { buildMcpToolKey, parseMcpToolKey, sanitizeMcpName } from './tool-utils';

const logger = createScopedLogger('MCPManager');

// =============================================================================
// MCP Manager Class
// =============================================================================

/**
 * MCPManager handles all MCP server connections and tool operations
 */
export class MCPManager {
  private static _instance: MCPManager | null = null;

  private clients = new Map<string, Client>();
  private transports = new Map<string, Transport>();
  private serverStates = new Map<string, McpServerState>();
  private eventListeners = new Set<McpEventListener>();
  private isInitialized = false;
  private toolCache = new Map<string, McpTool[]>();
  private connectionPromises = new Map<string, Promise<void>>();

  private constructor() {
    logger.debug('MCPManager initialized');
  }

  /**
   * Get singleton instance
   */
  static get instance(): MCPManager {
    if (!this._instance) {
      this._instance = new MCPManager();
    }
    return this._instance;
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  static resetInstance(): void {
    if (this._instance) {
      this._instance.shutdown().catch(console.error);
      this._instance = null;
    }
  }

  // --------------------------------------------------------------------------
  // Event System
  // --------------------------------------------------------------------------

  /**
   * Subscribe to MCP events
   */
  addEventListener(listener: McpEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: McpEventListener): void {
    this.eventListeners.delete(listener);
  }

  private emit(event: McpClientEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        logger.error('Event listener error:', e);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize manager with stored server configurations
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Already initialized');
      return;
    }

    logger.info('Initializing MCP Manager');

    // Load servers from storage
    const servers = loadServers();
    logger.debug(`Loaded ${servers.length} servers from storage`);

    // Initialize server states
    for (const server of servers) {
      this.serverStates.set(server.id, {
        config: this.serverToConfig(server),
        status: 'disconnected',
        tools: [],
        reconnectAttempts: 0,
      });

      // Auto-connect enabled servers
      if (server.enabled) {
        this.connectServer(server.id).catch((err) => {
          logger.error(`Failed to auto-connect ${server.name}:`, err);
        });
      }
    }

    this.isInitialized = true;
    logger.info('MCP Manager initialized');
  }

  /**
   * Convert stored server to config format
   */
  private serverToConfig(server: McpServer): McpServerConfig {
    let transport: McpTransportConfig;

    switch (server.transport) {
      case 'stdio':
        transport = {
          type: 'stdio',
          command: server.command || '',
          args: server.args || [],
          env: server.envJson || undefined,
        };
        break;
      case 'sse':
        transport = {
          type: 'sse',
          url: server.url || '',
        };
        break;
      case 'http':
        transport = {
          type: 'http',
          url: server.url || '',
        };
        break;
      default:
        throw new Error(`Unknown transport type: ${server.transport}`);
    }

    return {
      id: server.id,
      name: server.name,
      transport,
      enabled: server.enabled,
      env: server.envJson || undefined,
    };
  }

  // --------------------------------------------------------------------------
  // Server Management
  // --------------------------------------------------------------------------

  /**
   * Add a new MCP server
   */
  async addServer(input: Parameters<typeof createServer>[0]): Promise<McpServer> {
    const server = createServer(input);

    this.serverStates.set(server.id, {
      config: this.serverToConfig(server),
      status: 'disconnected',
      tools: [],
      reconnectAttempts: 0,
    });

    if (server.enabled) {
      await this.connectServer(server.id);
    }

    logger.info(`Added server: ${server.name}`);
    return server;
  }

  /**
   * Update an existing server
   */
  async updateServerConfig(
    input: Parameters<typeof updateServer>[0]
  ): Promise<McpServer> {
    const server = updateServer(input);
    const state = this.serverStates.get(server.id);

    if (state) {
      // Disconnect and reconnect if config changed
      await this.disconnectServer(server.id);
      state.config = this.serverToConfig(server);
      this.toolCache.delete(server.id);

      if (server.enabled) {
        await this.connectServer(server.id);
      }
    }

    logger.info(`Updated server: ${server.name}`);
    return server;
  }

  /**
   * Remove a server
   */
  async removeServer(serverId: string): Promise<boolean> {
    await this.disconnectServer(serverId);
    const success = deleteServer(serverId);

    if (success) {
      this.serverStates.delete(serverId);
      this.toolCache.delete(serverId);
      logger.info(`Removed server: ${serverId}`);
    }

    return success;
  }

  /**
   * Enable or disable a server
   */
  async setServerEnabled(serverId: string, enabled: boolean): Promise<McpServer | undefined> {
    const server = toggleServerEnabled(serverId, enabled);
    if (!server) return undefined;

    const state = this.serverStates.get(serverId);
    if (state) {
      state.config.enabled = enabled;

      if (enabled) {
        await this.connectServer(serverId);
      } else {
        await this.disconnectServer(serverId);
      }
    }

    return server;
  }

  /**
   * Get all servers
   */
  getServers(): McpServer[] {
    return loadServers();
  }

  /**
   * Get enabled servers
   */
  getEnabledServers(): McpServer[] {
    return loadServers().filter((s) => s.enabled);
  }

  /**
   * Get server state
   */
  getServerState(serverId: string): McpServerState | undefined {
    return this.serverStates.get(serverId);
  }

  /**
   * Get all server states
   */
  getAllServerStates(): Map<string, McpServerState> {
    return new Map(this.serverStates);
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  /**
   * Connect to an MCP server
   */
  async connectServer(serverId: string): Promise<void> {
    const state = this.serverStates.get(serverId);
    if (!state) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Prevent concurrent connection attempts
    const existingPromise = this.connectionPromises.get(serverId);
    if (existingPromise) {
      return existingPromise;
    }

    if (state.status === 'connected') {
      logger.debug(`Server ${serverId} already connected`);
      return;
    }

    const connectionPromise = this.doConnect(serverId, state);
    this.connectionPromises.set(serverId, connectionPromise);

    try {
      await connectionPromise;
    } finally {
      this.connectionPromises.delete(serverId);
    }
  }

  private async doConnect(serverId: string, state: McpServerState): Promise<void> {
    state.status = 'connecting';
    logger.info(`Connecting to server: ${state.config.name}`);

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

      logger.info(`Connected to server: ${state.config.name}`);
      this.emit({ type: 'server-connected', serverId });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      state.status = 'error';
      state.error = errorMessage;
      state.reconnectAttempts++;

      logger.error(`Failed to connect to ${state.config.name}:`, err);
      this.emit({ type: 'server-error', serverId, error: errorMessage });

      // Cleanup
      this.clients.delete(serverId);
      this.transports.delete(serverId);

      throw err;
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

    this.toolCache.delete(serverId);
    logger.info(`Disconnected from server: ${serverId}`);
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
   * Get connection status
   */
  getConnectionStatus(serverId: string): McpConnectionStatus {
    return this.serverStates.get(serverId)?.status || 'disconnected';
  }

  /**
   * Check if any servers are connected
   */
  hasConnectedServers(): boolean {
    for (const state of this.serverStates.values()) {
      if (state.status === 'connected') return true;
    }
    return false;
  }

  /**
   * Create transport for connection
   */
  private async createTransport(config: McpServerConfig): Promise<Transport> {
    const { transport } = config;

    switch (transport.type) {
      case 'stdio': {
        // Stdio transport is not available in browser
        // Would need a backend proxy
        throw new Error(
          'Stdio transport is not available in browser. Use SSE or HTTP transport, or configure a backend proxy.'
        );
      }

      case 'sse': {
        return new SSEClientTransport(new URL(transport.url), {
          requestInit: {
            headers: transport.headers,
          },
        });
      }

      case 'http': {
        return new StreamableHTTPClientTransport(new URL(transport.url), {
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
  // Tool Discovery
  // --------------------------------------------------------------------------

  /**
   * Discover tools from a connected server
   */
  private async discoverTools(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const state = this.serverStates.get(serverId);

    if (!client || !state) return;

    try {
      const result: ListToolsResult = await client.listTools();
      const tools: McpTool[] = (result.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || null,
        inputSchema: tool.inputSchema,
        consent: getStoredConsent(serverId, tool.name),
      }));

      state.tools = tools;
      this.toolCache.set(serverId, tools);

      logger.debug(`Discovered ${tools.length} tools from ${state.config.name}`);
      this.emit({ type: 'tools-updated', serverId, tools });
    } catch (err) {
      logger.error(`Failed to discover tools from ${serverId}:`, err);
      state.tools = [];
    }
  }

  /**
   * Refresh tools for a server
   */
  async refreshTools(serverId: string): Promise<McpTool[]> {
    await this.discoverTools(serverId);
    return this.serverStates.get(serverId)?.tools || [];
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): McpTool[] {
    return this.serverStates.get(serverId)?.tools || [];
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): McpToolWithServer[] {
    const tools: McpToolWithServer[] = [];

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
   * Find a tool by name across all servers
   */
  findTool(toolName: string): McpToolWithServer | undefined {
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
   * Find a tool by its composite key
   */
  findToolByKey(toolKey: string): McpToolWithServer | undefined {
    const { serverName, toolName } = parseMcpToolKey(toolKey);

    for (const [serverId, state] of this.serverStates) {
      if (
        state.status === 'connected' &&
        sanitizeMcpName(state.config.name) === serverName
      ) {
        const tool = state.tools.find((t) => sanitizeMcpName(t.name) === toolName);
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

  // --------------------------------------------------------------------------
  // Tool Execution
  // --------------------------------------------------------------------------

  /**
   * Get MCP client for a server
   */
  getClient(serverId: string): Client | undefined {
    return this.clients.get(serverId);
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
        result: result as any,
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
   * Execute a tool by its composite key
   */
  async callToolByKey(
    toolKey: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResponse> {
    const tool = this.findToolByKey(toolKey);
    if (!tool) {
      return {
        success: false,
        serverId: '',
        toolName: toolKey,
        error: `Tool ${toolKey} not found`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    return this.callTool({
      serverId: tool.serverId,
      toolName: tool.name,
      arguments: args,
    });
  }

  /**
   * Execute a tool with consent check
   */
  async callToolWithConsent(request: ToolCallRequest): Promise<ToolCallResponse> {
    const { serverId, toolName, arguments: args } = request;
    const state = this.serverStates.get(serverId);

    if (!state) {
      return {
        success: false,
        serverId,
        toolName,
        error: `Server ${serverId} not found`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    const tool = state.tools.find((t) => t.name === toolName);

    // Request consent
    const inputPreview =
      typeof args === 'string'
        ? args
        : Array.isArray(args)
        ? (args as string[]).join(' ')
        : JSON.stringify(args).slice(0, 500);

    const hasConsent = await requireMcpToolConsent({
      serverId,
      serverName: state.config.name,
      toolName,
      toolDescription: tool?.description,
      inputPreview,
    });

    if (!hasConsent) {
      return {
        success: false,
        serverId,
        toolName,
        error: `User declined running tool ${toolName}`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    return this.callTool(request);
  }

  // --------------------------------------------------------------------------
  // Resources & Prompts
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
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP Manager');

    const disconnectPromises = Array.from(this.serverStates.keys()).map((id) =>
      this.disconnectServer(id).catch((e) => logger.debug(`Shutdown error for ${id}:`, e))
    );

    await Promise.all(disconnectPromises);

    this.clients.clear();
    this.transports.clear();
    this.serverStates.clear();
    this.eventListeners.clear();
    this.toolCache.clear();
    this.connectionPromises.clear();
    this.isInitialized = false;

    logger.info('MCP Manager shutdown complete');
  }

  /**
   * Dispose a single server's client
   */
  dispose(serverId: string): void {
    const client = this.clients.get(serverId);
    if (client) {
      client.close().catch(console.error);
      this.clients.delete(serverId);
    }
    this.transports.delete(serverId);
    this.toolCache.delete(serverId);
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Global MCP manager instance
 */
export const mcpManager = MCPManager.instance;

/**
 * Get MCP manager instance
 */
export function getMcpManager(): MCPManager {
  return MCPManager.instance;
}

/**
 * Initialize MCP manager
 */
export async function initializeMcpManager(): Promise<MCPManager> {
  const manager = getMcpManager();
  await manager.initialize();
  return manager;
}
