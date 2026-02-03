/**
 * MCP (Model Context Protocol) Store
 *
 * Nanostores-based state management for MCP servers and tools.
 * Tracks:
 * - Available MCP servers and their configurations
 * - Connection status per server
 * - Discovered tools from connected servers
 * - Tool execution history
 */

import { atom, map, computed } from 'nanostores';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPConnectionStatus,
  MCPTool,
  ToolCallResponse,
  MCPClientEvent,
} from '~/lib/services/mcp-client';
import {
  getMCPClientManager,
  initializeMCP,
  shutdownMCP,
} from '~/lib/services/mcp-client';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPStore');

// ============================================================================
// Storage Keys
// ============================================================================

const MCP_CONFIG_STORAGE_KEY = 'recoder-mcp-servers';
const MCP_HISTORY_STORAGE_KEY = 'recoder-mcp-history';

// ============================================================================
// Types
// ============================================================================

export interface MCPToolExecution {
  id: string;
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  response: ToolCallResponse;
  timestamp: number;
}

export interface MCPStoreState {
  initialized: boolean;
  servers: Record<string, MCPServerState>;
  tools: MCPTool[];
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Core Stores
// ============================================================================

/**
 * Whether the MCP system has been initialized
 */
export const mcpInitializedStore = atom<boolean>(false);

/**
 * Loading state for MCP operations
 */
export const mcpLoadingStore = atom<boolean>(false);

/**
 * Global MCP error state
 */
export const mcpErrorStore = atom<string | null>(null);

/**
 * Server configurations (persisted)
 */
export const mcpServersStore = map<Record<string, MCPServerConfig>>({});

/**
 * Server connection states (runtime)
 */
export const mcpServerStatesStore = map<Record<string, MCPServerState>>({});

/**
 * All available tools from connected servers
 */
export const mcpToolsStore = atom<MCPTool[]>([]);

/**
 * Tool execution history
 */
export const mcpHistoryStore = atom<MCPToolExecution[]>([]);

/**
 * Maximum history entries to keep
 */
const MAX_HISTORY_ENTRIES = 100;

// ============================================================================
// Computed Stores
// ============================================================================

/**
 * Get all enabled server configs
 */
export const enabledServersStore = computed(mcpServersStore, (servers) =>
  Object.values(servers).filter((s) => s.enabled)
);

/**
 * Get all connected servers
 */
export const connectedServersStore = computed(mcpServerStatesStore, (states) =>
  Object.values(states).filter((s) => s.status === 'connected')
);

/**
 * Get servers with errors
 */
export const errorServersStore = computed(mcpServerStatesStore, (states) =>
  Object.values(states).filter((s) => s.status === 'error')
);

/**
 * Check if any servers are connecting
 */
export const isConnectingStore = computed(mcpServerStatesStore, (states) =>
  Object.values(states).some((s) => s.status === 'connecting' || s.status === 'reconnecting')
);

/**
 * Get total tool count
 */
export const toolCountStore = computed(mcpToolsStore, (tools) => tools.length);

/**
 * Get tools grouped by server
 */
export const toolsByServerStore = computed(mcpToolsStore, (tools) => {
  const grouped: Record<string, MCPTool[]> = {};
  for (const tool of tools) {
    if (!grouped[tool.serverId]) {
      grouped[tool.serverId] = [];
    }
    grouped[tool.serverId].push(tool);
  }
  return grouped;
});

/**
 * Recent tool executions (last 10)
 */
export const recentExecutionsStore = computed(mcpHistoryStore, (history) =>
  history.slice(-10).reverse()
);

// ============================================================================
// Persistence
// ============================================================================

/**
 * Load server configurations from localStorage
 */
function loadServersFromStorage(): MCPServerConfig[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(MCP_CONFIG_STORAGE_KEY);
    if (stored) {
      const configs = JSON.parse(stored) as MCPServerConfig[];
      logger.debug(`Loaded ${configs.length} MCP server configs from storage`);
      return configs;
    }
  } catch (err) {
    logger.error('Failed to load MCP configs from storage:', err);
  }

  return [];
}

/**
 * Save server configurations to localStorage
 */
function saveServersToStorage(servers: Record<string, MCPServerConfig>): void {
  if (typeof window === 'undefined') return;

  try {
    const configs = Object.values(servers);
    localStorage.setItem(MCP_CONFIG_STORAGE_KEY, JSON.stringify(configs));
    logger.debug(`Saved ${configs.length} MCP server configs to storage`);
  } catch (err) {
    logger.error('Failed to save MCP configs to storage:', err);
  }
}

/**
 * Load execution history from localStorage
 */
function loadHistoryFromStorage(): MCPToolExecution[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(MCP_HISTORY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as MCPToolExecution[];
    }
  } catch (err) {
    logger.error('Failed to load MCP history from storage:', err);
  }

  return [];
}

/**
 * Save execution history to localStorage
 */
function saveHistoryToStorage(history: MCPToolExecution[]): void {
  if (typeof window === 'undefined') return;

  try {
    // Only keep recent entries
    const trimmed = history.slice(-MAX_HISTORY_ENTRIES);
    localStorage.setItem(MCP_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    logger.error('Failed to save MCP history to storage:', err);
  }
}

// ============================================================================
// Event Handler
// ============================================================================

/**
 * Handle MCP client events and update stores
 */
function handleMCPEvent(event: MCPClientEvent): void {
  const manager = getMCPClientManager();

  switch (event.type) {
    case 'server-connected':
    case 'server-disconnected':
    case 'server-error': {
      // Update server state
      const state = manager.getServerState(event.serverId);
      if (state) {
        mcpServerStatesStore.setKey(event.serverId, { ...state });
      }

      // Update tools list
      const allTools = manager.getAllTools();
      mcpToolsStore.set(allTools);

      // Clear error on successful connection
      if (event.type === 'server-connected') {
        mcpErrorStore.set(null);
      }

      // Set error for server errors
      if (event.type === 'server-error') {
        logger.error(`Server ${event.serverId} error:`, event.error);
      }
      break;
    }

    case 'tools-updated': {
      // Update tools list
      const allTools = manager.getAllTools();
      mcpToolsStore.set(allTools);
      break;
    }

    case 'tool-call-start':
      // Could add pending state tracking here
      break;

    case 'tool-call-complete':
      // Handled by addToolExecution
      break;
  }
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Initialize the MCP store and connect to configured servers
 */
export async function initMCPStore(): Promise<void> {
  if (mcpInitializedStore.get()) {
    logger.debug('MCP store already initialized');
    return;
  }

  mcpLoadingStore.set(true);
  mcpErrorStore.set(null);

  try {
    // Load configs from storage
    const configs = loadServersFromStorage();

    // Populate servers store
    const serversMap: Record<string, MCPServerConfig> = {};
    for (const config of configs) {
      serversMap[config.id] = config;
    }
    mcpServersStore.set(serversMap);

    // Load history
    const history = loadHistoryFromStorage();
    mcpHistoryStore.set(history);

    // Initialize MCP client manager
    const manager = await initializeMCP(configs);

    // Subscribe to events
    manager.addEventListener(handleMCPEvent);

    // Sync initial states
    const states = manager.getServerStates();
    const statesMap: Record<string, MCPServerState> = {};
    for (const [id, state] of states) {
      statesMap[id] = state;
    }
    mcpServerStatesStore.set(statesMap);

    // Update tools
    const tools = manager.getAllTools();
    mcpToolsStore.set(tools);

    mcpInitializedStore.set(true);
    logger.info('MCP store initialized');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    mcpErrorStore.set(errorMessage);
    logger.error('Failed to initialize MCP store:', err);
  } finally {
    mcpLoadingStore.set(false);
  }
}

/**
 * Add a new MCP server
 */
export async function addMCPServer(config: MCPServerConfig): Promise<void> {
  const manager = getMCPClientManager();

  try {
    await manager.addServer(config);

    // Update stores
    mcpServersStore.setKey(config.id, config);

    const state = manager.getServerState(config.id);
    if (state) {
      mcpServerStatesStore.setKey(config.id, state);
    }

    // Persist
    saveServersToStorage(mcpServersStore.get());

    logger.info(`Added MCP server: ${config.name}`);
  } catch (err) {
    logger.error(`Failed to add MCP server ${config.name}:`, err);
    throw err;
  }
}

/**
 * Remove an MCP server
 */
export async function removeMCPServer(serverId: string): Promise<void> {
  const manager = getMCPClientManager();

  try {
    await manager.removeServer(serverId);

    // Update stores
    const servers = { ...mcpServersStore.get() };
    delete servers[serverId];
    mcpServersStore.set(servers);

    const states = { ...mcpServerStatesStore.get() };
    delete states[serverId];
    mcpServerStatesStore.set(states);

    // Update tools
    const tools = manager.getAllTools();
    mcpToolsStore.set(tools);

    // Persist
    saveServersToStorage(servers);

    logger.info(`Removed MCP server: ${serverId}`);
  } catch (err) {
    logger.error(`Failed to remove MCP server ${serverId}:`, err);
    throw err;
  }
}

/**
 * Update an MCP server configuration
 */
export async function updateMCPServer(
  serverId: string,
  updates: Partial<MCPServerConfig>
): Promise<void> {
  const manager = getMCPClientManager();

  try {
    await manager.updateServer(serverId, updates);

    // Update stores
    const currentConfig = mcpServersStore.get()[serverId];
    if (currentConfig) {
      mcpServersStore.setKey(serverId, { ...currentConfig, ...updates });
    }

    const state = manager.getServerState(serverId);
    if (state) {
      mcpServerStatesStore.setKey(serverId, state);
    }

    // Update tools if connection changed
    const tools = manager.getAllTools();
    mcpToolsStore.set(tools);

    // Persist
    saveServersToStorage(mcpServersStore.get());

    logger.info(`Updated MCP server: ${serverId}`);
  } catch (err) {
    logger.error(`Failed to update MCP server ${serverId}:`, err);
    throw err;
  }
}

/**
 * Toggle a server's enabled state
 */
export async function toggleMCPServer(serverId: string): Promise<void> {
  const config = mcpServersStore.get()[serverId];
  if (!config) {
    throw new Error(`Server ${serverId} not found`);
  }

  await updateMCPServer(serverId, { enabled: !config.enabled });
}

/**
 * Connect to a specific server
 */
export async function connectMCPServer(serverId: string): Promise<void> {
  const manager = getMCPClientManager();

  try {
    await manager.connectServer(serverId);

    const state = manager.getServerState(serverId);
    if (state) {
      mcpServerStatesStore.setKey(serverId, state);
    }

    const tools = manager.getAllTools();
    mcpToolsStore.set(tools);
  } catch (err) {
    logger.error(`Failed to connect to MCP server ${serverId}:`, err);
    throw err;
  }
}

/**
 * Disconnect from a specific server
 */
export async function disconnectMCPServer(serverId: string): Promise<void> {
  const manager = getMCPClientManager();

  try {
    await manager.disconnectServer(serverId);

    const state = manager.getServerState(serverId);
    if (state) {
      mcpServerStatesStore.setKey(serverId, state);
    }

    const tools = manager.getAllTools();
    mcpToolsStore.set(tools);
  } catch (err) {
    logger.error(`Failed to disconnect from MCP server ${serverId}:`, err);
    throw err;
  }
}

/**
 * Reconnect to a specific server
 */
export async function reconnectMCPServer(serverId: string): Promise<void> {
  const manager = getMCPClientManager();

  try {
    await manager.reconnectServer(serverId);

    const state = manager.getServerState(serverId);
    if (state) {
      mcpServerStatesStore.setKey(serverId, state);
    }

    const tools = manager.getAllTools();
    mcpToolsStore.set(tools);
  } catch (err) {
    logger.error(`Failed to reconnect to MCP server ${serverId}:`, err);
    throw err;
  }
}

/**
 * Call a tool and track the execution
 */
export async function callMCPTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResponse> {
  const manager = getMCPClientManager();

  const response = await manager.callTool({
    serverId,
    toolName,
    arguments: args,
  });

  // Add to history
  const execution: MCPToolExecution = {
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    serverId,
    toolName,
    arguments: args,
    response,
    timestamp: Date.now(),
  };

  addToolExecution(execution);

  return response;
}

/**
 * Call a tool by name (auto-discovers server)
 */
export async function callMCPToolByName(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResponse> {
  const manager = getMCPClientManager();

  const response = await manager.callToolByName(toolName, args);

  // Add to history
  const execution: MCPToolExecution = {
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    serverId: response.serverId,
    toolName,
    arguments: args,
    response,
    timestamp: Date.now(),
  };

  addToolExecution(execution);

  return response;
}

/**
 * Add a tool execution to history
 */
function addToolExecution(execution: MCPToolExecution): void {
  const history = [...mcpHistoryStore.get(), execution];

  // Trim if too large
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.splice(0, history.length - MAX_HISTORY_ENTRIES);
  }

  mcpHistoryStore.set(history);
  saveHistoryToStorage(history);
}

/**
 * Clear execution history
 */
export function clearMCPHistory(): void {
  mcpHistoryStore.set([]);
  saveHistoryToStorage([]);
}

/**
 * Get a tool by name
 */
export function getMCPTool(toolName: string): MCPTool | undefined {
  return mcpToolsStore.get().find((t) => t.name === toolName);
}

/**
 * Get server status
 */
export function getMCPServerStatus(serverId: string): MCPConnectionStatus {
  return mcpServerStatesStore.get()[serverId]?.status || 'disconnected';
}

/**
 * Check if MCP has any available tools
 */
export function hasMCPTools(): boolean {
  return mcpToolsStore.get().length > 0;
}

/**
 * Shutdown MCP and clean up
 */
export async function shutdownMCPStore(): Promise<void> {
  await shutdownMCP();

  mcpInitializedStore.set(false);
  mcpServerStatesStore.set({});
  mcpToolsStore.set([]);
  mcpErrorStore.set(null);

  logger.info('MCP store shutdown complete');
}

// ============================================================================
// React Hooks (for convenience with @nanostores/react)
// ============================================================================

// These will be used with useStore() from @nanostores/react
// Example: const servers = useStore(mcpServersStore);

export {
  mcpInitializedStore as $mcpInitialized,
  mcpLoadingStore as $mcpLoading,
  mcpErrorStore as $mcpError,
  mcpServersStore as $mcpServers,
  mcpServerStatesStore as $mcpServerStates,
  mcpToolsStore as $mcpTools,
  mcpHistoryStore as $mcpHistory,
  enabledServersStore as $enabledServers,
  connectedServersStore as $connectedServers,
  errorServersStore as $errorServers,
  isConnectingStore as $isConnecting,
  toolCountStore as $toolCount,
  toolsByServerStore as $toolsByServer,
  recentExecutionsStore as $recentExecutions,
};
