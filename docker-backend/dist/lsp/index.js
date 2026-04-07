"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLSPUpgrade = exports.registerLSPWebSocket = exports.lspProxy = exports.LSPProxy = exports.lspServerManager = exports.LSPServerManager = exports.lspClientPool = exports.LSPClientPool = exports.TCPLSPClient = exports.isValidJsonRpcMessage = exports.getAllLSPPorts = exports.getConfigForLanguageId = exports.getConfigForExtension = exports.LSP_MESSAGE_TYPES = exports.JSON_RPC_ERRORS = exports.LSP_CLIENT_CONFIG = exports.LSP_PORT_RANGE = exports.LSP_SERVER_CONFIGS = void 0;
exports.initializeLSP = initializeLSP;
exports.shutdownLSP = shutdownLSP;
exports.getLSPStats = getLSPStats;
exports.getClientStats = getClientStats;
exports.disconnectClient = disconnectClient;
exports.isLSPReady = isLSPReady;
// Configuration
var config_js_1 = require("./config.js");
Object.defineProperty(exports, "LSP_SERVER_CONFIGS", { enumerable: true, get: function () { return config_js_1.LSP_SERVER_CONFIGS; } });
Object.defineProperty(exports, "LSP_PORT_RANGE", { enumerable: true, get: function () { return config_js_1.LSP_PORT_RANGE; } });
Object.defineProperty(exports, "LSP_CLIENT_CONFIG", { enumerable: true, get: function () { return config_js_1.LSP_CLIENT_CONFIG; } });
Object.defineProperty(exports, "JSON_RPC_ERRORS", { enumerable: true, get: function () { return config_js_1.JSON_RPC_ERRORS; } });
Object.defineProperty(exports, "LSP_MESSAGE_TYPES", { enumerable: true, get: function () { return config_js_1.LSP_MESSAGE_TYPES; } });
Object.defineProperty(exports, "getConfigForExtension", { enumerable: true, get: function () { return config_js_1.getConfigForExtension; } });
Object.defineProperty(exports, "getConfigForLanguageId", { enumerable: true, get: function () { return config_js_1.getConfigForLanguageId; } });
Object.defineProperty(exports, "getAllLSPPorts", { enumerable: true, get: function () { return config_js_1.getAllLSPPorts; } });
Object.defineProperty(exports, "isValidJsonRpcMessage", { enumerable: true, get: function () { return config_js_1.isValidJsonRpcMessage; } });
// TCP Client
var tcp_lsp_client_js_1 = require("./tcp-lsp-client.js");
Object.defineProperty(exports, "TCPLSPClient", { enumerable: true, get: function () { return tcp_lsp_client_js_1.TCPLSPClient; } });
Object.defineProperty(exports, "LSPClientPool", { enumerable: true, get: function () { return tcp_lsp_client_js_1.LSPClientPool; } });
Object.defineProperty(exports, "lspClientPool", { enumerable: true, get: function () { return tcp_lsp_client_js_1.lspClientPool; } });
// Server Manager
var lsp_server_manager_js_1 = require("./lsp-server-manager.js");
Object.defineProperty(exports, "LSPServerManager", { enumerable: true, get: function () { return lsp_server_manager_js_1.LSPServerManager; } });
Object.defineProperty(exports, "lspServerManager", { enumerable: true, get: function () { return lsp_server_manager_js_1.lspServerManager; } });
// WebSocket Proxy
var lsp_proxy_js_1 = require("./lsp-proxy.js");
Object.defineProperty(exports, "LSPProxy", { enumerable: true, get: function () { return lsp_proxy_js_1.LSPProxy; } });
Object.defineProperty(exports, "lspProxy", { enumerable: true, get: function () { return lsp_proxy_js_1.lspProxy; } });
Object.defineProperty(exports, "registerLSPWebSocket", { enumerable: true, get: function () { return lsp_proxy_js_1.registerLSPWebSocket; } });
Object.defineProperty(exports, "handleLSPUpgrade", { enumerable: true, get: function () { return lsp_proxy_js_1.handleLSPUpgrade; } });
// ==================== Quick Start Helper ====================
const lsp_server_manager_js_2 = require("./lsp-server-manager.js");
const lsp_proxy_js_2 = require("./lsp-proxy.js");
const tcp_lsp_client_js_2 = require("./tcp-lsp-client.js");
/**
 * Initialize LSP support for the backend
 * Call this during server startup
 */
async function initializeLSP() {
    console.log('[LSP] Initializing LSP support...');
    // Set up event listeners for logging
    lsp_server_manager_js_2.lspServerManager.on('server-started', (projectId, languageId) => {
        console.log(`[LSP] Server started: ${languageId} for ${projectId}`);
    });
    lsp_server_manager_js_2.lspServerManager.on('server-stopped', (projectId, languageId) => {
        console.log(`[LSP] Server stopped: ${languageId} for ${projectId}`);
    });
    lsp_server_manager_js_2.lspServerManager.on('server-error', (projectId, languageId, error) => {
        console.error(`[LSP] Server error: ${languageId} for ${projectId}:`, error.message);
    });
    lsp_server_manager_js_2.lspServerManager.on('server-restarted', (projectId, languageId) => {
        console.log(`[LSP] Server restarted: ${languageId} for ${projectId}`);
    });
    console.log('[LSP] LSP support initialized');
}
/**
 * Shutdown LSP support
 * Call this during server shutdown
 */
async function shutdownLSP() {
    console.log('[LSP] Shutting down LSP support...');
    lsp_proxy_js_2.lspProxy.shutdown();
    await lsp_server_manager_js_2.lspServerManager.shutdown();
    console.log('[LSP] LSP support shutdown complete');
}
/**
 * Get combined LSP statistics
 */
function getLSPStats() {
    return {
        servers: lsp_server_manager_js_2.lspServerManager.getStats(),
        proxy: lsp_proxy_js_2.lspProxy.getStats(),
        clientPool: tcp_lsp_client_js_2.lspClientPool.getStats(),
    };
}
/**
 * Get detailed client statistics for a specific project/language
 */
function getClientStats(projectId, languageId) {
    return tcp_lsp_client_js_2.lspClientPool.getClientStats(projectId, languageId);
}
/**
 * Manually disconnect a specific LSP client
 */
async function disconnectClient(projectId, languageId) {
    await tcp_lsp_client_js_2.lspClientPool.removeClient(projectId, languageId);
}
/**
 * Check if LSP is ready for a specific language in a project
 */
function isLSPReady(projectId, languageId) {
    const serverStatus = lsp_server_manager_js_2.lspServerManager.getServerStatus(projectId, languageId);
    const client = tcp_lsp_client_js_2.lspClientPool.getExistingClient(projectId, languageId);
    return !!serverStatus?.running && !!client?.isInitialized();
}
