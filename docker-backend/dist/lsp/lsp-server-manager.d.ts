/**
 * LSP Server Manager
 * Manages the lifecycle of LSP servers running inside Docker containers
 * Handles start, stop, restart, health checks, and automatic recovery
 */
import { EventEmitter } from 'events';
import { LSPServerConfig } from './config.js';
import { TCPLSPClient } from './tcp-lsp-client.js';
export interface LSPServerStatus {
    languageId: string;
    running: boolean;
    port: number;
    pid?: number;
    startedAt?: number;
    lastHealthCheck?: number;
    errorCount: number;
    restartCount: number;
}
export interface ManagedLSPServer {
    config: LSPServerConfig;
    containerId: string;
    projectId: string;
    status: LSPServerStatus;
    healthCheckTimer?: ReturnType<typeof setInterval>;
}
export interface LSPServerManagerEvents {
    'server-started': (projectId: string, languageId: string) => void;
    'server-stopped': (projectId: string, languageId: string) => void;
    'server-error': (projectId: string, languageId: string, error: Error) => void;
    'server-restarted': (projectId: string, languageId: string) => void;
    'health-check-failed': (projectId: string, languageId: string) => void;
}
export declare class LSPServerManager extends EventEmitter {
    private servers;
    private readonly HEALTH_CHECK_INTERVAL_MS;
    private readonly MAX_ERROR_COUNT;
    private readonly MAX_RESTART_COUNT;
    private containerMonitors;
    private isShuttingDown;
    /**
     * Start LSP servers for a container based on detected languages
     */
    autoStartForContainer(containerId: string, projectId: string, workspaceRoot?: string): Promise<void>;
    /**
     * Start a specific LSP server in a container
     */
    startServer(containerId: string, projectId: string, config: LSPServerConfig, workspaceRoot?: string): Promise<boolean>;
    /**
     * Stop a specific LSP server
     */
    stopServer(projectId: string, languageId: string): Promise<void>;
    /**
     * Stop all LSP servers for a project
     */
    stopAllForProject(projectId: string): Promise<void>;
    /**
     * Restart a specific LSP server
     */
    restartServer(projectId: string, languageId: string): Promise<boolean>;
    /**
     * Get status of all servers for a project
     */
    getProjectStatus(projectId: string): LSPServerStatus[];
    /**
     * Get a specific server status
     */
    getServerStatus(projectId: string, languageId: string): LSPServerStatus | null;
    /**
     * Get the container host for connecting to LSP
     * For containers on the same Docker network, this is usually 'localhost' or the container IP
     */
    getContainerHost(containerId: string): Promise<string>;
    /**
     * Get LSP client for a project/language
     */
    getClient(projectId: string, languageId: string, workspaceRoot?: string): Promise<TCPLSPClient | null>;
    /**
     * Shutdown all servers and cleanup
     */
    shutdown(): Promise<void>;
    /**
     * Get statistics
     */
    getStats(): {
        totalServers: number;
        runningServers: number;
        byLanguage: Record<string, number>;
        byProject: Record<string, string[]>;
    };
    private getServerKey;
    /**
     * Detect languages in the workspace by scanning file extensions
     */
    private detectLanguages;
    /**
     * Ensure LSP server package is installed in the container
     */
    private ensureServerInstalled;
    /**
     * Start the LSP server process inside the container
     */
    private startServerProcess;
    /**
     * Stop the LSP server process
     */
    private stopServerProcess;
    /**
     * Wait for server to be ready (accepting connections)
     */
    private waitForServerReady;
    /**
     * Perform health check on a running server
     */
    private healthCheck;
    /**
     * Check if a container is running
     */
    private isContainerRunning;
    /**
     * Start monitoring a container for lifecycle events
     */
    private startContainerMonitoring;
    /**
     * Stop monitoring a container
     */
    private stopContainerMonitoring;
    /**
     * Execute a command inside a container and return output
     */
    private execInContainer;
}
export declare const lspServerManager: LSPServerManager;
export default LSPServerManager;
