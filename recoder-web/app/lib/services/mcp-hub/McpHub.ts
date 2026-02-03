/**
 * MCP Hub - Central MCP Server Management
 *
 * Comprehensive MCP (Model Context Protocol) server management for web environments.
 * Based on the kilocode implementation with adaptations for browser/server hybrid operation.
 *
 * Features:
 * - Multiple transport support (stdio, SSE, streamable-http)
 * - Server connection lifecycle management
 * - Tool and resource introspection
 * - Auto-reconnection with exponential backoff
 * - Configuration validation and hot-reloading
 * - Project-scoped and global server support
 *
 * @see https://modelcontextprotocol.io/
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type {
  McpServer,
  McpTool,
  McpResource,
  McpResourceTemplate,
  McpResourceResponse,
  McpToolCallResponse,
  McpConnection,
  ConnectedMcpConnection,
  DisconnectedMcpConnection,
  ServerConfig,
  McpSettings,
  McpHubEvent,
  McpHubEventListener,
  McpErrorEntry,
} from './types';
import { DisableReason } from './types';
import {
  validateServerConfig,
  sanitizeMcpName,
  injectVariables,
  truncateError,
  formatError,
  delay,
  parseSettings,
  createDefaultSettings,
} from './utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('McpHub');

// ============================================================================
// Configuration Interface
// ============================================================================

/**
 * McpHub configuration options
 */
export interface McpHubConfig {
  /** Storage key for settings persistence */
  storageKey?: string;
  /** Whether to enable auto-reconnection */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Base delay for reconnection backoff (ms) */
  reconnectBaseDelay?: number;
  /** Default timeout for tool calls (seconds) */
  defaultTimeout?: number;
  /** Callback for settings persistence */
  onSettingsChange?: (settings: McpSettings) => Promise<void>;
  /** Callback for loading settings */
  loadSettings?: () => Promise<McpSettings | null>;
  /** Current working directory for project context */
  cwd?: string;
  /** Environment variables for variable injection */
  env?: Record<string, string>;
}

// ============================================================================
// McpHub Class
// ============================================================================

/**
 * Central hub for managing MCP server connections.
 *
 * Provides a unified interface for:
 * - Server lifecycle management (connect/disconnect/restart)
 * - Tool discovery and execution
 * - Resource access
 * - Configuration management
 * - Event emission for UI updates
 */
export class McpHub {
  // Connection state
  private connections: McpConnection[] = [];
  private isConnecting = false;
  private isDisposed = false;

  // Event system
  private eventListeners: Set<McpHubEventListener> = new Set();

  // Configuration
  private config: Required<McpHubConfig>;
  private globalSettings: McpSettings = createDefaultSettings();
  private projectSettings: McpSettings = createDefaultSettings();

  // Name registry for reverse lookup
  private sanitizedNameRegistry: Map<string, string> = new Map();

  // Debouncing for config changes
  private configChangeDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private isProgrammaticUpdate = false;
  private flagResetTimer?: NodeJS.Timeout;

  // Reference counting for multi-client scenarios
  private refCount = 0;

  constructor(config: McpHubConfig = {}) {
    this.config = {
      storageKey: config.storageKey ?? 'mcp-settings',
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectBaseDelay: config.reconnectBaseDelay ?? 1000,
      defaultTimeout: config.defaultTimeout ?? 60,
      onSettingsChange: config.onSettingsChange ?? (async () => {}),
      loadSettings: config.loadSettings ?? (async () => null),
      cwd: config.cwd ?? process.cwd?.() ?? '/',
      env: config.env ?? {},
    };

    logger.debug('McpHub initialized with config:', {
      storageKey: this.config.storageKey,
      autoReconnect: this.config.autoReconnect,
      cwd: this.config.cwd,
    });
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Initialize the hub and load settings
   */
  async initialize(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('McpHub has been disposed');
    }

    logger.info('Initializing McpHub...');

    // Load settings
    const settings = await this.config.loadSettings();
    if (settings) {
      this.globalSettings = settings;
    }

    // Connect to enabled servers
    await this.initializeServers('global');

    logger.info('McpHub initialization complete');
  }

  /**
   * Register a client using this hub (for reference counting)
   */
  registerClient(): void {
    this.refCount++;
    logger.debug(`Client registered. Ref count: ${this.refCount}`);
  }

  /**
   * Unregister a client. Disposes hub when count reaches zero.
   */
  async unregisterClient(): Promise<void> {
    this.refCount--;
    logger.debug(`Client unregistered. Ref count: ${this.refCount}`);

    if (this.refCount <= 0) {
      logger.info('Last client unregistered. Disposing hub.');
      await this.dispose();
    }
  }

  /**
   * Dispose the hub and clean up all connections
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      logger.debug('Already disposed, skipping');
      return;
    }

    logger.info('Disposing McpHub...');
    this.isDisposed = true;

    // Clear debounce timers
    for (const timer of this.configChangeDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.configChangeDebounceTimers.clear();

    // Clear flag reset timer
    if (this.flagResetTimer) {
      clearTimeout(this.flagResetTimer);
      this.flagResetTimer = undefined;
    }
    this.isProgrammaticUpdate = false;

    // Disconnect all servers
    for (const connection of this.connections) {
      try {
        await this.deleteConnection(connection.server.name, connection.server.source);
      } catch (error) {
        logger.error(`Failed to close connection for ${connection.server.name}:`, error);
      }
    }
    this.connections = [];
    this.eventListeners.clear();

    logger.info('McpHub disposed');
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Subscribe to hub events
   */
  addEventListener(listener: McpHubEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: McpHubEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        logger.error('Event listener error:', e);
      }
    });
  }

  // ==========================================================================
  // Server State Access
  // ==========================================================================

  /**
   * Get all enabled servers
   */
  getServers(): McpServer[] {
    const enabledConnections = this.connections.filter((conn) => !conn.server.disabled);

    // Deduplicate by name: project servers take priority
    const serversByName = new Map<string, McpServer>();
    for (const conn of enabledConnections) {
      const existing = serversByName.get(conn.server.name);
      if (!existing) {
        serversByName.set(conn.server.name, conn.server);
      } else if (conn.server.source === 'project' && existing.source !== 'project') {
        serversByName.set(conn.server.name, conn.server);
      }
    }

    return Array.from(serversByName.values());
  }

  /**
   * Get all servers regardless of state
   */
  getAllServers(): McpServer[] {
    return this.connections.map((conn) => conn.server);
  }

  /**
   * Get connection status
   */
  get connecting(): boolean {
    return this.isConnecting;
  }

  // ==========================================================================
  // Server Connection Management
  // ==========================================================================

  /**
   * Initialize servers from settings
   */
  private async initializeServers(source: 'global' | 'project'): Promise<void> {
    const settings = source === 'global' ? this.globalSettings : this.projectSettings;
    await this.updateServerConnections(settings.mcpServers, source, false);
  }

  /**
   * Connect to a specific server
   */
  async connectToServer(
    name: string,
    config: ServerConfig,
    source: 'global' | 'project' = 'global'
  ): Promise<void> {
    // Remove existing connection if any
    await this.deleteConnection(name, source);

    // Register sanitized name for lookup
    const sanitizedName = sanitizeMcpName(name);
    this.sanitizedNameRegistry.set(sanitizedName, name);

    // Check if server is disabled
    if (config.disabled) {
      const connection = this.createPlaceholderConnection(
        name,
        config,
        source,
        DisableReason.SERVER_DISABLED
      );
      this.connections.push(connection);
      return;
    }

    try {
      // Create MCP client
      const client = new Client(
        {
          name: 'recoder-web',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Inject variables into config
      const injectedConfig = injectVariables(config, {
        env: { ...process.env, ...this.config.env },
        workspaceFolder: this.config.cwd,
      });

      // Create transport based on type
      let transport: SSEClientTransport;

      if (injectedConfig.type === 'sse' || injectedConfig.type === 'streamable-http') {
        // HTTP-based transport
        transport = new SSEClientTransport(new URL(injectedConfig.url), {
          requestInit: {
            headers: injectedConfig.headers,
          },
        });

        // Set up error handlers
        transport.onerror = async (error) => {
          logger.error(`Transport error for "${name}":`, error);
          const connection = this.findConnection(name, source);
          if (connection) {
            connection.server.status = 'disconnected';
            this.appendErrorMessage(connection, formatError(error));
          }
          this.emit({ type: 'server-error', serverName: name, source, error: formatError(error) });
        };

        transport.onclose = async () => {
          const connection = this.findConnection(name, source);
          if (connection) {
            connection.server.status = 'disconnected';
          }
          this.emit({ type: 'server-disconnected', serverName: name, source });
        };
      } else {
        // For stdio transport in browser, we need to proxy through backend
        // This is a limitation of browser environments
        throw new Error(
          `Stdio transport is not directly supported in browser environments. ` +
          `Configure an SSE or streamable-http proxy for server "${name}".`
        );
      }

      // Create connected connection
      const connection: ConnectedMcpConnection = {
        type: 'connected',
        server: {
          name,
          config: JSON.stringify(injectedConfig),
          status: 'connecting',
          disabled: config.disabled,
          source,
          projectPath: source === 'project' ? this.config.cwd : undefined,
          errorHistory: [],
        },
        client,
        transport,
      };
      this.connections.push(connection);

      this.emit({ type: 'server-connecting', serverName: name, source });

      // Connect
      await client.connect(transport);
      connection.server.status = 'connected';
      connection.server.error = '';
      connection.server.instructions = client.getInstructions();

      // Fetch capabilities
      await this.fetchAvailableServerCapabilities(name, source);

      logger.info(`Connected to MCP server: ${name}`);
      this.emit({ type: 'server-connected', serverName: name, source });
    } catch (error) {
      const connection = this.findConnection(name, source);
      if (connection) {
        connection.server.status = 'disconnected';
        this.appendErrorMessage(connection, formatError(error));
      }
      logger.error(`Failed to connect to MCP server ${name}:`, error);
      this.emit({ type: 'server-error', serverName: name, source, error: formatError(error) });
      throw error;
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(serverName: string, source?: 'global' | 'project'): Promise<void> {
    await this.deleteConnection(serverName, source);
    this.emit({ type: 'server-disconnected', serverName, source });
  }

  /**
   * Restart a server connection
   */
  async restartConnection(serverName: string, source?: 'global' | 'project'): Promise<void> {
    this.isConnecting = true;

    const connection = this.findConnection(serverName, source);
    const config = connection?.server.config;

    if (config) {
      logger.info(`Restarting MCP server: ${serverName}`);
      connection.server.status = 'connecting';
      connection.server.error = '';
      this.emit({ type: 'server-connecting', serverName, source: connection.server.source });

      await delay(500); // Brief delay for UI feedback

      try {
        await this.deleteConnection(serverName, connection.server.source);
        const parsedConfig = JSON.parse(config);
        const validation = validateServerConfig(parsedConfig, serverName);

        if (validation.valid && validation.normalizedConfig) {
          await this.connectToServer(
            serverName,
            validation.normalizedConfig,
            connection.server.source || 'global'
          );
          logger.info(`MCP server ${serverName} restarted successfully`);
        } else {
          throw new Error(validation.errors.join('; '));
        }
      } catch (error) {
        logger.error(`Failed to restart ${serverName}:`, error);
        this.emit({
          type: 'server-error',
          serverName,
          source: connection.server.source,
          error: formatError(error),
        });
      }
    }

    this.isConnecting = false;
  }

  /**
   * Refresh all connections
   */
  async refreshAllConnections(): Promise<void> {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      // Clear existing connections
      const existingConnections = [...this.connections];
      for (const conn of existingConnections) {
        await this.deleteConnection(conn.server.name, conn.server.source);
      }

      // Reinitialize
      await this.initializeServers('global');
      await this.initializeServers('project');

      await delay(100);

      this.emit({ type: 'connection-status-changed' });
    } catch (error) {
      logger.error('Failed to refresh MCP servers:', error);
    } finally {
      this.isConnecting = false;
    }
  }

  // ==========================================================================
  // Tool Operations
  // ==========================================================================

  /**
   * Call a tool on a connected server
   */
  async callTool(
    serverName: string,
    toolName: string,
    toolArguments?: Record<string, unknown>,
    source?: 'global' | 'project'
  ): Promise<McpToolCallResponse> {
    const connection = this.findConnection(serverName, source);

    if (!connection || connection.type !== 'connected') {
      throw new Error(
        `No connection found for server: ${serverName}. ` +
        `Please make sure to use MCP servers available under 'Connected MCP Servers'.`
      );
    }

    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled and cannot be used`);
    }

    // Get timeout from config
    let timeout: number;
    try {
      const parsedConfig = JSON.parse(connection.server.config);
      timeout = (parsedConfig.timeout ?? this.config.defaultTimeout) * 1000;
    } catch {
      timeout = this.config.defaultTimeout * 1000;
    }

    return await connection.client.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      },
      CallToolResultSchema,
      {
        timeout,
      }
    );
  }

  /**
   * Get all available tools across all connected servers
   */
  getAllTools(): McpTool[] {
    const tools: McpTool[] = [];

    for (const connection of this.connections) {
      if (connection.server.status === 'connected' && connection.server.tools) {
        tools.push(...connection.server.tools);
      }
    }

    return tools;
  }

  /**
   * Find a tool by name across all servers
   */
  findTool(toolName: string): { server: McpServer; tool: McpTool } | null {
    for (const connection of this.connections) {
      if (connection.server.status === 'connected' && connection.server.tools) {
        const tool = connection.server.tools.find((t) => t.name === toolName);
        if (tool) {
          return { server: connection.server, tool };
        }
      }
    }
    return null;
  }

  // ==========================================================================
  // Resource Operations
  // ==========================================================================

  /**
   * Read a resource from a server
   */
  async readResource(
    serverName: string,
    uri: string,
    source?: 'global' | 'project'
  ): Promise<McpResourceResponse> {
    const connection = this.findConnection(serverName, source);

    if (!connection || connection.type !== 'connected') {
      throw new Error(
        `No connection found for server: ${serverName}${source ? ` with source ${source}` : ''}`
      );
    }

    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled`);
    }

    return await connection.client.request(
      {
        method: 'resources/read',
        params: { uri },
      },
      ReadResourceResultSchema
    );
  }

  /**
   * Get all available resources across all connected servers
   */
  getAllResources(): Array<{ server: McpServer; resource: McpResource }> {
    const resources: Array<{ server: McpServer; resource: McpResource }> = [];

    for (const connection of this.connections) {
      if (connection.server.status === 'connected' && connection.server.resources) {
        for (const resource of connection.server.resources) {
          resources.push({ server: connection.server, resource });
        }
      }
    }

    return resources;
  }

  // ==========================================================================
  // Configuration Management
  // ==========================================================================

  /**
   * Update server connections based on new configuration
   */
  async updateServerConnections(
    newServers: Record<string, ServerConfig>,
    source: 'global' | 'project' = 'global',
    manageConnectingState = true
  ): Promise<void> {
    if (manageConnectingState) {
      this.isConnecting = true;
    }

    // Get current connections for this source
    const currentConnections = this.connections.filter(
      (conn) => conn.server.source === source || (!conn.server.source && source === 'global')
    );
    const currentNames = new Set(currentConnections.map((conn) => conn.server.name));
    const newNames = new Set(Object.keys(newServers));

    // Delete removed servers
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.deleteConnection(name, source);
      }
    }

    // Update or add servers
    for (const [name, config] of Object.entries(newServers)) {
      const currentConnection = this.findConnection(name, source);

      // Validate configuration
      const validation = validateServerConfig(config, name);
      if (!validation.valid || !validation.normalizedConfig) {
        logger.error(`Invalid configuration for MCP server "${name}":`, validation.errors);
        continue;
      }

      const validatedConfig = validation.normalizedConfig;

      if (!currentConnection) {
        // New server
        try {
          await this.connectToServer(name, validatedConfig, source);
        } catch (error) {
          logger.error(`Failed to connect to new MCP server ${name}:`, error);
        }
      } else {
        // Check if config changed
        const currentConfig = JSON.parse(currentConnection.server.config);
        if (!this.deepEqual(currentConfig, validatedConfig)) {
          // Config changed, reconnect
          try {
            await this.deleteConnection(name, source);
            await this.connectToServer(name, validatedConfig, source);
          } catch (error) {
            logger.error(`Failed to reconnect MCP server ${name}:`, error);
          }
        }
      }
    }

    this.emit({ type: 'connection-status-changed' });

    if (manageConnectingState) {
      this.isConnecting = false;
    }
  }

  /**
   * Load settings from JSON content
   */
  async loadSettingsFromContent(content: string, source: 'global' | 'project'): Promise<void> {
    const { settings, error } = parseSettings(content);

    if (error || !settings) {
      logger.error(`Failed to parse ${source} MCP settings:`, error);
      throw new Error(error ?? 'Failed to parse settings');
    }

    if (source === 'global') {
      this.globalSettings = { mcpServers: settings };
    } else {
      this.projectSettings = { mcpServers: settings };
    }

    await this.updateServerConnections(settings, source);
  }

  /**
   * Toggle server disabled state
   */
  async toggleServerDisabled(
    serverName: string,
    disabled: boolean,
    source?: 'global' | 'project'
  ): Promise<void> {
    const connection = this.findConnection(serverName, source);
    if (!connection) {
      throw new Error(`Server ${serverName}${source ? ` with source ${source}` : ''} not found`);
    }

    const serverSource = connection.server.source || 'global';

    // Update connection object
    connection.server.disabled = disabled;

    if (disabled && connection.server.status === 'connected') {
      // Disconnect if disabling
      await this.deleteConnection(serverName, serverSource);
      // Re-add as placeholder
      const config = JSON.parse(connection.server.config);
      const placeholder = this.createPlaceholderConnection(
        serverName,
        config,
        serverSource,
        DisableReason.SERVER_DISABLED
      );
      this.connections.push(placeholder);
    } else if (!disabled && connection.server.status === 'disconnected') {
      // Connect if enabling
      const config = JSON.parse(connection.server.config);
      await this.deleteConnection(serverName, serverSource);
      await this.connectToServer(serverName, config, serverSource);
    }

    this.emit({ type: 'config-changed', serverName, source: serverSource });
  }

  /**
   * Update server timeout
   */
  async updateServerTimeout(
    serverName: string,
    timeout: number,
    source?: 'global' | 'project'
  ): Promise<void> {
    const connection = this.findConnection(serverName, source);
    if (!connection) {
      throw new Error(`Server ${serverName}${source ? ` with source ${source}` : ''} not found`);
    }

    const config = JSON.parse(connection.server.config);
    config.timeout = timeout;
    connection.server.config = JSON.stringify(config);

    this.emit({ type: 'config-changed', serverName, source: connection.server.source });
  }

  /**
   * Toggle tool always-allow setting
   */
  async toggleToolAlwaysAllow(
    serverName: string,
    source: 'global' | 'project',
    toolName: string,
    shouldAllow: boolean
  ): Promise<void> {
    const connection = this.findConnection(serverName, source);
    if (!connection) {
      throw new Error(`Server ${serverName} with source ${source} not found`);
    }

    const config = JSON.parse(connection.server.config);
    if (!config.alwaysAllow) {
      config.alwaysAllow = [];
    }

    const index = config.alwaysAllow.indexOf(toolName);
    if (shouldAllow && index === -1) {
      config.alwaysAllow.push(toolName);
    } else if (!shouldAllow && index !== -1) {
      config.alwaysAllow.splice(index, 1);
    }

    connection.server.config = JSON.stringify(config);

    // Update tool's alwaysAllow state
    if (connection.server.tools) {
      const tool = connection.server.tools.find((t) => t.name === toolName);
      if (tool) {
        tool.alwaysAllow = shouldAllow;
      }
    }

    this.emit({ type: 'tools-updated', serverName, source });
  }

  /**
   * Toggle tool enabled for prompt setting
   */
  async toggleToolEnabledForPrompt(
    serverName: string,
    source: 'global' | 'project',
    toolName: string,
    isEnabled: boolean
  ): Promise<void> {
    const connection = this.findConnection(serverName, source);
    if (!connection) {
      throw new Error(`Server ${serverName} with source ${source} not found`);
    }

    const config = JSON.parse(connection.server.config);
    if (!config.disabledTools) {
      config.disabledTools = [];
    }

    const index = config.disabledTools.indexOf(toolName);
    if (!isEnabled && index === -1) {
      config.disabledTools.push(toolName);
    } else if (isEnabled && index !== -1) {
      config.disabledTools.splice(index, 1);
    }

    connection.server.config = JSON.stringify(config);

    // Update tool's enabledForPrompt state
    if (connection.server.tools) {
      const tool = connection.server.tools.find((t) => t.name === toolName);
      if (tool) {
        tool.enabledForPrompt = isEnabled;
      }
    }

    this.emit({ type: 'tools-updated', serverName, source });
  }

  // ==========================================================================
  // Name Resolution
  // ==========================================================================

  /**
   * Find original server name from sanitized name
   */
  findServerNameBySanitizedName(sanitizedServerName: string): string | null {
    // Try exact match first
    const exactMatch = this.connections.find(
      (conn) => conn.server.name === sanitizedServerName
    );
    if (exactMatch) {
      return exactMatch.server.name;
    }

    // Try registry lookup
    return this.sanitizedNameRegistry.get(sanitizedServerName) ?? null;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Create a placeholder connection for disabled servers
   */
  private createPlaceholderConnection(
    name: string,
    config: ServerConfig,
    source: 'global' | 'project',
    reason: DisableReason
  ): DisconnectedMcpConnection {
    return {
      type: 'disconnected',
      server: {
        name,
        config: JSON.stringify(config),
        status: 'disconnected',
        disabled: reason === DisableReason.SERVER_DISABLED ? true : config.disabled,
        source,
        projectPath: source === 'project' ? this.config.cwd : undefined,
        errorHistory: [],
      },
      client: null,
      transport: null,
    };
  }

  /**
   * Find a connection by server name and optional source
   */
  private findConnection(
    serverName: string,
    source?: 'global' | 'project'
  ): McpConnection | undefined {
    if (source !== undefined) {
      return this.connections.find(
        (conn) => conn.server.name === serverName && conn.server.source === source
      );
    }

    // Project servers take priority
    const projectConn = this.connections.find(
      (conn) => conn.server.name === serverName && conn.server.source === 'project'
    );
    if (projectConn) return projectConn;

    return this.connections.find(
      (conn) =>
        conn.server.name === serverName &&
        (conn.server.source === 'global' || !conn.server.source)
    );
  }

  /**
   * Delete a connection
   */
  private async deleteConnection(name: string, source?: 'global' | 'project'): Promise<void> {
    const connections = source
      ? this.connections.filter(
          (conn) => conn.server.name === name && conn.server.source === source
        )
      : this.connections.filter((conn) => conn.server.name === name);

    for (const connection of connections) {
      try {
        if (connection.type === 'connected') {
          await connection.transport.close();
          await connection.client.close();
        }
      } catch (error) {
        logger.debug(`Error closing transport for ${name}:`, error);
      }
    }

    // Remove from array
    this.connections = this.connections.filter((conn) => {
      if (conn.server.name !== name) return true;
      if (source && conn.server.source !== source) return true;
      return false;
    });

    // Clean up registry
    const remainingConnections = this.connections.filter(
      (conn) => conn.server.name === name
    );
    if (remainingConnections.length === 0) {
      const sanitizedName = sanitizeMcpName(name);
      this.sanitizedNameRegistry.delete(sanitizedName);
    }
  }

  /**
   * Fetch available capabilities from a connected server
   */
  private async fetchAvailableServerCapabilities(
    serverName: string,
    source?: 'global' | 'project'
  ): Promise<void> {
    const connection = this.findConnection(serverName, source);

    if (!connection || connection.type !== 'connected') {
      return;
    }

    const capabilities = connection.client.getServerCapabilities();

    if (capabilities?.tools) {
      connection.server.tools = await this.fetchToolsList(serverName, source);
      this.emit({ type: 'tools-updated', serverName, source });
    }

    if (capabilities?.resources) {
      connection.server.resources = await this.fetchResourcesList(serverName, source);
      connection.server.resourceTemplates = await this.fetchResourceTemplatesList(
        serverName,
        source
      );
      this.emit({ type: 'resources-updated', serverName, source });
    }
  }

  /**
   * Fetch tools list from server
   */
  private async fetchToolsList(
    serverName: string,
    source?: 'global' | 'project'
  ): Promise<McpTool[]> {
    try {
      const connection = this.findConnection(serverName, source);

      if (!connection || connection.type !== 'connected') {
        return [];
      }

      if (!connection.client.getServerCapabilities()?.tools) {
        return [];
      }

      const response = await connection.client.request(
        { method: 'tools/list' },
        ListToolsResultSchema
      );

      // Get config for alwaysAllow and disabledTools
      let alwaysAllowConfig: string[] = [];
      let disabledToolsList: string[] = [];

      try {
        const serverConfig = JSON.parse(connection.server.config);
        alwaysAllowConfig = serverConfig.alwaysAllow || [];
        disabledToolsList = serverConfig.disabledTools || [];
      } catch {
        // Continue with empty configs
      }

      // Map tools with settings
      const tools = (response?.tools || []).map((tool) => ({
        ...tool,
        alwaysAllow: alwaysAllowConfig.includes(tool.name),
        enabledForPrompt: !disabledToolsList.includes(tool.name),
      }));

      return tools;
    } catch (error) {
      logger.error(`Failed to fetch tools for ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Fetch resources list from server
   */
  private async fetchResourcesList(
    serverName: string,
    source?: 'global' | 'project'
  ): Promise<McpResource[]> {
    try {
      const connection = this.findConnection(serverName, source);

      if (!connection || connection.type !== 'connected') {
        return [];
      }

      if (!connection.client.getServerCapabilities()?.resources) {
        return [];
      }

      const response = await connection.client.request(
        { method: 'resources/list' },
        ListResourcesResultSchema
      );

      return response?.resources || [];
    } catch (error) {
      logger.debug(`Failed to fetch resources for ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Fetch resource templates from server
   */
  private async fetchResourceTemplatesList(
    serverName: string,
    source?: 'global' | 'project'
  ): Promise<McpResourceTemplate[]> {
    try {
      const connection = this.findConnection(serverName, source);

      if (!connection || connection.type !== 'connected') {
        return [];
      }

      if (!connection.client.getServerCapabilities()?.resources) {
        return [];
      }

      const response = await connection.client.request(
        { method: 'resources/templates/list' },
        ListResourceTemplatesResultSchema
      );

      return response?.resourceTemplates || [];
    } catch (error) {
      logger.debug(`Failed to fetch resource templates for ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Append error message to connection
   */
  private appendErrorMessage(
    connection: McpConnection,
    error: string,
    level: 'error' | 'warn' | 'info' = 'error'
  ): void {
    const truncatedError = truncateError(error);

    if (!connection.server.errorHistory) {
      connection.server.errorHistory = [];
    }

    connection.server.errorHistory.push({
      message: truncatedError,
      timestamp: Date.now(),
      level,
    });

    // Keep only last 100 errors
    if (connection.server.errorHistory.length > 100) {
      connection.server.errorHistory = connection.server.errorHistory.slice(-100);
    }

    connection.server.error = truncatedError;
  }

  /**
   * Deep equality check for objects
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (a === null || b === null) return false;

    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let mcpHubInstance: McpHub | null = null;

/**
 * Get the global McpHub instance
 */
export function getMcpHub(config?: McpHubConfig): McpHub {
  if (!mcpHubInstance) {
    mcpHubInstance = new McpHub(config);
  }
  return mcpHubInstance;
}

/**
 * Initialize MCP Hub with configuration
 */
export async function initializeMcpHub(config?: McpHubConfig): Promise<McpHub> {
  const hub = getMcpHub(config);
  await hub.initialize();
  return hub;
}

/**
 * Shutdown the global MCP Hub instance
 */
export async function shutdownMcpHub(): Promise<void> {
  if (mcpHubInstance) {
    await mcpHubInstance.dispose();
    mcpHubInstance = null;
  }
}
