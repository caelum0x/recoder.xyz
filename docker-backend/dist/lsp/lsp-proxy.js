"use strict";
/**
 * LSP WebSocket-to-TCP Proxy
 * Bridges WebSocket connections from the browser to TCP-based LSP servers in containers
 * Implements JSON-RPC 2.0 message validation and security checks
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lspProxy = exports.LSPProxy = void 0;
exports.registerLSPWebSocket = registerLSPWebSocket;
exports.handleLSPUpgrade = handleLSPUpgrade;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const config_js_1 = require("./config.js");
const lsp_server_manager_js_1 = require("./lsp-server-manager.js");
const DEFAULT_PROXY_CONFIG = {
    maxSessionsPerUser: 10,
    sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
    maxMessagesPerMinute: 1000,
    maxMessageSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMethods: [], // Empty = allow all
    blockedMethods: [
        // Block potentially dangerous methods
        'workspace/executeCommand',
        'workspace/applyEdit', // We handle this separately with proper validation
    ],
};
// ==================== Rate Limiter ====================
class RateLimiter {
    requests = new Map();
    windowMs;
    maxRequests;
    constructor(windowMs = 60000, maxRequests = 1000) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
    }
    isAllowed(key) {
        const now = Date.now();
        let timestamps = this.requests.get(key) || [];
        // Remove old timestamps
        timestamps = timestamps.filter(t => now - t < this.windowMs);
        if (timestamps.length >= this.maxRequests) {
            return false;
        }
        timestamps.push(now);
        this.requests.set(key, timestamps);
        return true;
    }
    reset(key) {
        this.requests.delete(key);
    }
}
// ==================== LSP Proxy ====================
class LSPProxy extends events_1.EventEmitter {
    sessions = new Map();
    userSessions = new Map(); // userId -> sessionIds
    rateLimiter;
    config;
    cleanupInterval = null;
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_PROXY_CONFIG, ...config };
        this.rateLimiter = new RateLimiter(60000, this.config.maxMessagesPerMinute);
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60000);
    }
    /**
     * Handle a new WebSocket connection for LSP
     */
    async handleConnection(ws, projectId, userId, languageId) {
        // Validate language
        const config = (0, config_js_1.getConfigForLanguageId)(languageId);
        if (!config) {
            this.sendError(ws, null, config_js_1.JSON_RPC_ERRORS.INVALID_PARAMS, `Unsupported language: ${languageId}`);
            ws.close(4000, `Unsupported language: ${languageId}`);
            return null;
        }
        // Check user session limit
        const userSessionCount = this.userSessions.get(userId)?.size || 0;
        if (userSessionCount >= this.config.maxSessionsPerUser) {
            this.sendError(ws, null, config_js_1.JSON_RPC_ERRORS.INTERNAL_ERROR, 'Session limit reached');
            ws.close(4001, 'Session limit reached');
            return null;
        }
        // Generate session ID
        const sessionId = `${projectId}-${languageId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        // Create session
        const session = {
            id: sessionId,
            projectId,
            userId,
            languageId,
            ws,
            client: null,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            messageCount: 0,
            errorCount: 0,
        };
        this.sessions.set(sessionId, session);
        // Track user sessions
        if (!this.userSessions.has(userId)) {
            this.userSessions.set(userId, new Set());
        }
        this.userSessions.get(userId).add(sessionId);
        // Set up WebSocket handlers
        ws.on('message', (data) => this.handleMessage(session, data));
        ws.on('close', () => this.handleClose(session));
        ws.on('error', (error) => this.handleError(session, error));
        // Try to connect to LSP server
        try {
            const client = await lsp_server_manager_js_1.lspServerManager.getClient(projectId, languageId);
            if (!client) {
                // LSP server not running, try to start it
                console.log(`[LSP Proxy] LSP server not running, attempting to start ${languageId} for ${projectId}`);
                // The server manager will handle this - client will be null for now
            }
            else {
                session.client = client;
                // Forward notifications from LSP server to client
                client.on('notification', (method, params) => {
                    this.sendNotification(ws, method, params);
                });
                // Handle server requests (e.g., workspace/configuration)
                client.on('request', (id, method, params) => {
                    // Forward to client
                    this.sendRequest(ws, id, method, params);
                });
                client.on('disconnected', () => {
                    console.log(`[LSP Proxy] LSP client disconnected for session ${sessionId}`);
                    session.client = null;
                });
            }
        }
        catch (error) {
            console.error(`[LSP Proxy] Failed to connect to LSP server:`, error.message);
            session.errorCount++;
        }
        console.log(`[LSP Proxy] Session created: ${sessionId} (${languageId} for ${projectId})`);
        // Send ready notification to client
        this.sendNotification(ws, '$/ready', {
            sessionId,
            languageId,
            connected: !!session.client,
        });
        return session;
    }
    /**
     * Handle incoming WebSocket message
     */
    async handleMessage(session, data) {
        session.lastActivity = Date.now();
        session.messageCount++;
        // Rate limiting
        if (!this.rateLimiter.isAllowed(session.id)) {
            this.sendError(session.ws, null, config_js_1.JSON_RPC_ERRORS.INTERNAL_ERROR, 'Rate limit exceeded');
            return;
        }
        // Parse message
        let message;
        try {
            const raw = data.toString();
            // Size check
            if (raw.length > this.config.maxMessageSizeBytes) {
                this.sendError(session.ws, null, config_js_1.JSON_RPC_ERRORS.INVALID_REQUEST, 'Message too large');
                return;
            }
            message = JSON.parse(raw);
        }
        catch (e) {
            this.sendError(session.ws, null, config_js_1.JSON_RPC_ERRORS.PARSE_ERROR, 'Invalid JSON');
            return;
        }
        // Validate JSON-RPC structure
        if (!(0, config_js_1.isValidJsonRpcMessage)(message)) {
            this.sendError(session.ws, null, config_js_1.JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC message');
            return;
        }
        // Check for method in requests/notifications
        if ('method' in message) {
            const method = message.method;
            // Block dangerous methods
            if (this.config.blockedMethods.includes(method)) {
                const id = 'id' in message ? message.id : null;
                this.sendError(session.ws, id, config_js_1.JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not allowed: ${method}`);
                return;
            }
            // Check allowed methods if specified
            if (this.config.allowedMethods.length > 0 && !this.config.allowedMethods.includes(method)) {
                const id = 'id' in message ? message.id : null;
                this.sendError(session.ws, id, config_js_1.JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not allowed: ${method}`);
                return;
            }
        }
        // Forward to LSP server
        if (!session.client) {
            // Try to get client again
            try {
                session.client = await lsp_server_manager_js_1.lspServerManager.getClient(session.projectId, session.languageId);
            }
            catch (e) {
                // Ignore
            }
            if (!session.client) {
                const id = 'id' in message ? message.id : null;
                this.sendError(session.ws, id, config_js_1.JSON_RPC_ERRORS.SERVER_NOT_INITIALIZED, 'LSP server not connected');
                return;
            }
            // Set up event handlers for new client
            session.client.on('notification', (method, params) => {
                this.sendNotification(session.ws, method, params);
            });
            session.client.on('request', (id, method, params) => {
                this.sendRequest(session.ws, id, method, params);
            });
        }
        // Determine message type and forward
        try {
            if ('id' in message && 'method' in message) {
                // It's a request
                const request = message;
                const result = await session.client.sendRequest(request.method, request.params);
                this.sendResponse(session.ws, request.id, result);
            }
            else if ('method' in message) {
                // It's a notification
                const notification = message;
                session.client.sendNotification(notification.method, notification.params);
            }
            else if ('id' in message) {
                // It's a response to a server request
                const response = message;
                if (response.error) {
                    session.client.sendResponse(response.id, undefined, response.error);
                }
                else {
                    session.client.sendResponse(response.id, response.result);
                }
            }
        }
        catch (error) {
            session.errorCount++;
            console.error(`[LSP Proxy] Error forwarding message:`, error.message);
            const id = 'id' in message ? message.id : null;
            this.sendError(session.ws, id, config_js_1.JSON_RPC_ERRORS.INTERNAL_ERROR, error.message);
        }
    }
    /**
     * Handle WebSocket close
     */
    handleClose(session) {
        console.log(`[LSP Proxy] Session closed: ${session.id}`);
        // Clean up
        this.sessions.delete(session.id);
        const userSessions = this.userSessions.get(session.userId);
        if (userSessions) {
            userSessions.delete(session.id);
            if (userSessions.size === 0) {
                this.userSessions.delete(session.userId);
            }
        }
        this.rateLimiter.reset(session.id);
    }
    /**
     * Handle WebSocket error
     */
    handleError(session, error) {
        console.error(`[LSP Proxy] WebSocket error for session ${session.id}:`, error.message);
        session.errorCount++;
    }
    /**
     * Send JSON-RPC error response
     */
    sendError(ws, id, code, message) {
        if (ws.readyState !== ws_1.default.OPEN)
            return;
        const response = {
            jsonrpc: '2.0',
            id,
            error: { code, message },
        };
        ws.send(JSON.stringify(response));
    }
    /**
     * Send JSON-RPC response
     */
    sendResponse(ws, id, result) {
        if (ws.readyState !== ws_1.default.OPEN)
            return;
        const response = {
            jsonrpc: '2.0',
            id,
            result,
        };
        ws.send(JSON.stringify(response));
    }
    /**
     * Send JSON-RPC notification
     */
    sendNotification(ws, method, params) {
        if (ws.readyState !== ws_1.default.OPEN)
            return;
        const notification = {
            jsonrpc: '2.0',
            method,
            params,
        };
        ws.send(JSON.stringify(notification));
    }
    /**
     * Send JSON-RPC request
     */
    sendRequest(ws, id, method, params) {
        if (ws.readyState !== ws_1.default.OPEN)
            return;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };
        ws.send(JSON.stringify(request));
    }
    /**
     * Clean up stale sessions
     */
    cleanupStaleSessions() {
        const now = Date.now();
        const stale = [];
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivity > this.config.sessionTimeoutMs) {
                stale.push(id);
            }
        }
        for (const id of stale) {
            const session = this.sessions.get(id);
            if (session) {
                console.log(`[LSP Proxy] Closing stale session: ${id}`);
                session.ws.close(4002, 'Session timeout');
                this.handleClose(session);
            }
        }
        if (stale.length > 0) {
            console.log(`[LSP Proxy] Cleaned up ${stale.length} stale sessions`);
        }
    }
    /**
     * Close all sessions for a project
     */
    closeProjectSessions(projectId) {
        for (const [id, session] of this.sessions) {
            if (session.projectId === projectId) {
                console.log(`[LSP Proxy] Closing session for project ${projectId}: ${id}`);
                session.ws.close(4003, 'Project closed');
                this.handleClose(session);
            }
        }
    }
    /**
     * Close all sessions for a user
     */
    closeUserSessions(userId) {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds)
            return;
        for (const id of sessionIds) {
            const session = this.sessions.get(id);
            if (session) {
                console.log(`[LSP Proxy] Closing session for user ${userId}: ${id}`);
                session.ws.close(4004, 'User sessions closed');
                this.handleClose(session);
            }
        }
    }
    /**
     * Get session statistics
     */
    getStats() {
        const byLanguage = {};
        const byUser = {};
        let totalMessages = 0;
        for (const session of this.sessions.values()) {
            byLanguage[session.languageId] = (byLanguage[session.languageId] || 0) + 1;
            byUser[session.userId] = (byUser[session.userId] || 0) + 1;
            totalMessages += session.messageCount;
        }
        return {
            totalSessions: this.sessions.size,
            sessionsByLanguage: byLanguage,
            sessionsByUser: byUser,
            avgMessageCount: this.sessions.size > 0 ? totalMessages / this.sessions.size : 0,
        };
    }
    /**
     * Shutdown the proxy
     */
    shutdown() {
        console.log('[LSP Proxy] Shutting down...');
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        // Close all sessions
        for (const session of this.sessions.values()) {
            session.ws.close(4005, 'Server shutdown');
        }
        this.sessions.clear();
        this.userSessions.clear();
        console.log('[LSP Proxy] Shutdown complete');
    }
}
exports.LSPProxy = LSPProxy;
/**
 * Register LSP WebSocket endpoint with Express app
 */
function registerLSPWebSocket(wss, proxy, authenticateConnection) {
    // We'll handle upgrade in server.ts, this is just a helper for message routing
    console.log('[LSP Proxy] WebSocket handler registered');
}
/**
 * Handle WebSocket upgrade for LSP connections
 * Called from server.ts when a WebSocket connection comes in on /ws/lsp/:projectId/:languageId
 */
async function handleLSPUpgrade(ws, projectId, languageId, userId, proxy) {
    await proxy.handleConnection(ws, projectId, userId, languageId);
}
// Singleton instance
exports.lspProxy = new LSPProxy();
exports.default = LSPProxy;
