/**
 * LSP Module Exports
 * TCP-based Language Server Protocol implementation for Recoder.xyz
 *
 * Architecture:
 * - LSP servers run as persistent TCP processes inside containers
 * - Each language has its own port (TypeScript: 9001, Python: 9002, Go: 9003, Rust: 9004)
 * - docker-backend acts as WebSocket-to-TCP proxy for browser connections
 * - Proper JSON-RPC 2.0 protocol handling with validation
 *
 * Usage:
 * 1. When a container starts, call lspServerManager.autoStartForContainer()
 * 2. Browser connects via WebSocket to /ws/lsp/:projectId/:languageId
 * 3. LSP proxy bridges WebSocket to TCP connection
 * 4. When container stops, call lspServerManager.stopAllForProject()
 */

// Configuration
export {
  LSP_SERVER_CONFIGS,
  LSP_PORT_RANGE,
  LSP_CLIENT_CONFIG,
  JSON_RPC_ERRORS,
  LSP_MESSAGE_TYPES,
  getConfigForExtension,
  getConfigForLanguageId,
  getAllLSPPorts,
  isValidJsonRpcMessage,
} from './config.js';

export type { LSPServerConfig } from './config.js';

// TCP Client
export {
  TCPLSPClient,
  LSPClientPool,
  lspClientPool,
} from './tcp-lsp-client.js';

export type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcError,
  JsonRpcMessage,
  TCPLSPClientOptions,
  TCPLSPClientEvents,
} from './tcp-lsp-client.js';

// Server Manager
export {
  LSPServerManager,
  lspServerManager,
} from './lsp-server-manager.js';

export type {
  LSPServerStatus,
  ManagedLSPServer,
  LSPServerManagerEvents,
} from './lsp-server-manager.js';

// WebSocket Proxy
export {
  LSPProxy,
  lspProxy,
  registerLSPWebSocket,
  handleLSPUpgrade,
} from './lsp-proxy.js';

export type {
  LSPProxySession,
  LSPProxyConfig,
} from './lsp-proxy.js';

// ==================== Quick Start Helper ====================

import { lspServerManager } from './lsp-server-manager.js';
import { lspProxy } from './lsp-proxy.js';
import { lspClientPool } from './tcp-lsp-client.js';

/**
 * Initialize LSP support for the backend
 * Call this during server startup
 */
export async function initializeLSP(): Promise<void> {
  console.log('[LSP] Initializing LSP support...');

  // Set up event listeners for logging
  lspServerManager.on('server-started', (projectId, languageId) => {
    console.log(`[LSP] Server started: ${languageId} for ${projectId}`);
  });

  lspServerManager.on('server-stopped', (projectId, languageId) => {
    console.log(`[LSP] Server stopped: ${languageId} for ${projectId}`);
  });

  lspServerManager.on('server-error', (projectId, languageId, error) => {
    console.error(`[LSP] Server error: ${languageId} for ${projectId}:`, error.message);
  });

  lspServerManager.on('server-restarted', (projectId, languageId) => {
    console.log(`[LSP] Server restarted: ${languageId} for ${projectId}`);
  });

  console.log('[LSP] LSP support initialized');
}

/**
 * Shutdown LSP support
 * Call this during server shutdown
 */
export async function shutdownLSP(): Promise<void> {
  console.log('[LSP] Shutting down LSP support...');
  lspProxy.shutdown();
  await lspServerManager.shutdown();
  console.log('[LSP] LSP support shutdown complete');
}

/**
 * Get combined LSP statistics
 */
export function getLSPStats(): {
  servers: ReturnType<typeof lspServerManager.getStats>;
  proxy: ReturnType<typeof lspProxy.getStats>;
  clientPool: ReturnType<typeof lspClientPool.getStats>;
} {
  return {
    servers: lspServerManager.getStats(),
    proxy: lspProxy.getStats(),
    clientPool: lspClientPool.getStats(),
  };
}

/**
 * Get detailed client statistics for a specific project/language
 */
export function getClientStats(projectId: string, languageId: string): ReturnType<typeof lspClientPool.getClientStats> {
  return lspClientPool.getClientStats(projectId, languageId);
}

/**
 * Manually disconnect a specific LSP client
 */
export async function disconnectClient(projectId: string, languageId: string): Promise<void> {
  await lspClientPool.removeClient(projectId, languageId);
}

/**
 * Check if LSP is ready for a specific language in a project
 */
export function isLSPReady(projectId: string, languageId: string): boolean {
  const serverStatus = lspServerManager.getServerStatus(projectId, languageId);
  const client = lspClientPool.getExistingClient(projectId, languageId);
  return !!serverStatus?.running && !!client?.isInitialized();
}
