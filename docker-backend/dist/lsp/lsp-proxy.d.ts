/**
 * LSP WebSocket-to-TCP Proxy
 * Bridges WebSocket connections from the browser to TCP-based LSP servers in containers
 * Implements JSON-RPC 2.0 message validation and security checks
 */
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { TCPLSPClient } from './tcp-lsp-client.js';
export interface LSPProxySession {
    id: string;
    projectId: string;
    userId: string;
    languageId: string;
    ws: WebSocket;
    client: TCPLSPClient | null;
    createdAt: number;
    lastActivity: number;
    messageCount: number;
    errorCount: number;
}
export interface LSPProxyConfig {
    /** Max sessions per user */
    maxSessionsPerUser: number;
    /** Session timeout in ms */
    sessionTimeoutMs: number;
    /** Max messages per minute per session */
    maxMessagesPerMinute: number;
    /** Max message size in bytes */
    maxMessageSizeBytes: number;
    /** Allowed LSP methods (empty = allow all) */
    allowedMethods: string[];
    /** Blocked LSP methods */
    blockedMethods: string[];
}
export declare class LSPProxy extends EventEmitter {
    private sessions;
    private userSessions;
    private rateLimiter;
    private config;
    private cleanupInterval;
    constructor(config?: Partial<LSPProxyConfig>);
    /**
     * Handle a new WebSocket connection for LSP
     */
    handleConnection(ws: WebSocket, projectId: string, userId: string, languageId: string): Promise<LSPProxySession | null>;
    /**
     * Handle incoming WebSocket message
     */
    private handleMessage;
    /**
     * Handle WebSocket close
     */
    private handleClose;
    /**
     * Handle WebSocket error
     */
    private handleError;
    /**
     * Send JSON-RPC error response
     */
    private sendError;
    /**
     * Send JSON-RPC response
     */
    private sendResponse;
    /**
     * Send JSON-RPC notification
     */
    private sendNotification;
    /**
     * Send JSON-RPC request
     */
    private sendRequest;
    /**
     * Clean up stale sessions
     */
    private cleanupStaleSessions;
    /**
     * Close all sessions for a project
     */
    closeProjectSessions(projectId: string): void;
    /**
     * Close all sessions for a user
     */
    closeUserSessions(userId: string): void;
    /**
     * Get session statistics
     */
    getStats(): {
        totalSessions: number;
        sessionsByLanguage: Record<string, number>;
        sessionsByUser: Record<string, number>;
        avgMessageCount: number;
    };
    /**
     * Shutdown the proxy
     */
    shutdown(): void;
}
/**
 * Register LSP WebSocket endpoint with Express app
 */
export declare function registerLSPWebSocket(wss: WebSocket.Server, proxy: LSPProxy, authenticateConnection: (req: any) => Promise<{
    userId: string;
    projectId: string;
} | null>): void;
/**
 * Handle WebSocket upgrade for LSP connections
 * Called from server.ts when a WebSocket connection comes in on /ws/lsp/:projectId/:languageId
 */
export declare function handleLSPUpgrade(ws: WebSocket, projectId: string, languageId: string, userId: string, proxy: LSPProxy): Promise<void>;
export declare const lspProxy: LSPProxy;
export default LSPProxy;
