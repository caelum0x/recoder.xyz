/**
 * TCP LSP Client
 * Connects to LSP servers running inside containers via TCP
 * Implements JSON-RPC 2.0 over LSP's Content-Length framing protocol
 */
import { EventEmitter } from 'events';
import { LSPServerConfig } from './config.js';
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: unknown;
}
export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}
export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: unknown;
    error?: JsonRpcError;
}
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;
export interface TCPLSPClientEvents {
    connected: () => void;
    disconnected: (reason: string) => void;
    error: (error: Error) => void;
    notification: (method: string, params: unknown) => void;
    request: (id: number | string, method: string, params: unknown) => void;
    initialized: () => void;
}
export interface TCPLSPClientOptions {
    host: string;
    port: number;
    config: LSPServerConfig;
    workspaceRoot: string;
    projectId: string;
    /** Optional: specific container ID for logging */
    containerId?: string;
}
export declare class TCPLSPClient extends EventEmitter {
    private socket;
    private parser;
    private pendingRequests;
    private requestId;
    private connected;
    private initialized;
    private reconnectAttempts;
    private reconnectTimer;
    private keepAliveTimer;
    private serverCapabilities;
    private autoReconnect;
    private destroyed;
    private lastActivityTime;
    private connectionErrorCount;
    private readonly MAX_CONNECTION_ERRORS;
    private readonly host;
    private readonly port;
    private readonly config;
    private readonly workspaceRoot;
    private readonly projectId;
    private readonly containerId;
    constructor(options: TCPLSPClientOptions);
    /**
     * Connect to the LSP server
     */
    connect(): Promise<void>;
    /**
     * Initialize the LSP server connection
     */
    initialize(): Promise<unknown>;
    /**
     * Send a JSON-RPC request and wait for response
     */
    sendRequest(method: string, params?: unknown): Promise<unknown>;
    /**
     * Send a JSON-RPC notification (no response expected)
     */
    sendNotification(method: string, params?: unknown): void;
    /**
     * Send a JSON-RPC response (for server requests)
     */
    sendResponse(id: number | string, result?: unknown, error?: JsonRpcError): void;
    /**
     * Disconnect from the LSP server gracefully
     */
    disconnect(graceful?: boolean): Promise<void>;
    /**
     * Destroy the client permanently (no reconnection)
     */
    destroy(): Promise<void>;
    /**
     * Check if the client is connected
     */
    isConnected(): boolean;
    /**
     * Check if the client is initialized
     */
    isInitialized(): boolean;
    /**
     * Get server capabilities
     */
    getServerCapabilities(): unknown;
    private handleData;
    private handleMessage;
    private sendMessage;
    private cleanup;
    private scheduleReconnect;
    /**
     * Enable or disable automatic reconnection
     */
    setAutoReconnect(enabled: boolean): void;
    /**
     * Get connection statistics
     */
    getStats(): {
        connected: boolean;
        initialized: boolean;
        reconnectAttempts: number;
        connectionErrors: number;
        pendingRequests: number;
        lastActivity: number;
        parser: {
            bufferSize: number;
            parseErrorCount: number;
        };
    };
    private startKeepAlive;
}
/**
 * Pool of LSP client connections
 * Manages multiple clients for different projects/languages
 */
export declare class LSPClientPool {
    private clients;
    private cleanupInterval;
    private readonly CLEANUP_INTERVAL_MS;
    constructor();
    /**
     * Get or create a client for a project/language combination
     */
    getClient(projectId: string, config: LSPServerConfig, host: string, workspaceRoot: string, containerId?: string): Promise<TCPLSPClient>;
    /**
     * Get existing client if connected
     */
    getExistingClient(projectId: string, languageId: string): TCPLSPClient | null;
    /**
     * Remove a specific client
     */
    removeClient(projectId: string, languageId: string): Promise<void>;
    /**
     * Remove all clients for a project
     */
    removeProject(projectId: string): Promise<void>;
    /**
     * Disconnect all clients
     */
    disconnectAll(): Promise<void>;
    /**
     * Cleanup disconnected clients periodically
     */
    private startCleanup;
    private cleanupDeadClients;
    /**
     * Stop the pool and cleanup
     */
    shutdown(): Promise<void>;
    /**
     * Get stats
     */
    getStats(): {
        total: number;
        connected: number;
        initialized: number;
        byProject: Record<string, number>;
    };
    /**
     * Get detailed stats for a specific client
     */
    getClientStats(projectId: string, languageId: string): ReturnType<TCPLSPClient['getStats']> | null;
}
export declare const lspClientPool: LSPClientPool;
export default TCPLSPClient;
