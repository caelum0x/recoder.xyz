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
export { LSP_SERVER_CONFIGS, LSP_PORT_RANGE, LSP_CLIENT_CONFIG, JSON_RPC_ERRORS, LSP_MESSAGE_TYPES, getConfigForExtension, getConfigForLanguageId, getAllLSPPorts, isValidJsonRpcMessage, } from './config.js';
export type { LSPServerConfig } from './config.js';
export { TCPLSPClient, LSPClientPool, lspClientPool, } from './tcp-lsp-client.js';
export type { JsonRpcRequest, JsonRpcNotification, JsonRpcResponse, JsonRpcError, JsonRpcMessage, TCPLSPClientOptions, TCPLSPClientEvents, } from './tcp-lsp-client.js';
export { LSPServerManager, lspServerManager, } from './lsp-server-manager.js';
export type { LSPServerStatus, ManagedLSPServer, LSPServerManagerEvents, } from './lsp-server-manager.js';
export { LSPProxy, lspProxy, registerLSPWebSocket, handleLSPUpgrade, } from './lsp-proxy.js';
export type { LSPProxySession, LSPProxyConfig, } from './lsp-proxy.js';
import { lspServerManager } from './lsp-server-manager.js';
import { lspProxy } from './lsp-proxy.js';
import { lspClientPool } from './tcp-lsp-client.js';
/**
 * Initialize LSP support for the backend
 * Call this during server startup
 */
export declare function initializeLSP(): Promise<void>;
/**
 * Shutdown LSP support
 * Call this during server shutdown
 */
export declare function shutdownLSP(): Promise<void>;
/**
 * Get combined LSP statistics
 */
export declare function getLSPStats(): {
    servers: ReturnType<typeof lspServerManager.getStats>;
    proxy: ReturnType<typeof lspProxy.getStats>;
    clientPool: ReturnType<typeof lspClientPool.getStats>;
};
/**
 * Get detailed client statistics for a specific project/language
 */
export declare function getClientStats(projectId: string, languageId: string): ReturnType<typeof lspClientPool.getClientStats>;
/**
 * Manually disconnect a specific LSP client
 */
export declare function disconnectClient(projectId: string, languageId: string): Promise<void>;
/**
 * Check if LSP is ready for a specific language in a project
 */
export declare function isLSPReady(projectId: string, languageId: string): boolean;
