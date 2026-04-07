/**
 * Set the public hostname used for Expo's REACT_NATIVE_PACKAGER_HOSTNAME.
 * Called from server.ts after detecting the external IP.
 */
export declare function setExpoPublicHostname(hostname: string): void;
interface DevServerInfo {
    projectId: string;
    pid?: number;
    port?: number;
    framework: string;
    startedAt: number;
    status: 'starting' | 'running' | 'stopped' | 'error';
}
/**
 * Dev Server Manager - handles background dev server processes
 * Keeps dev server logs separate from interactive terminals
 */
export declare class DevServerManager {
    private servers;
    /**
     * Start a dev server in background for a project
     */
    start(containerId: string, projectId: string, framework: string | undefined, ports: number[]): Promise<{
        ready: boolean;
        port?: number;
        logs?: string;
    }>;
    /**
     * Stop the dev server for a project
     */
    stop(containerId: string, projectId: string): Promise<boolean>;
    /**
     * Restart the dev server
     */
    restart(containerId: string, projectId: string, ports: number[]): Promise<{
        ready: boolean;
        port?: number;
    }>;
    /**
     * Register an externally-started server (e.g. Expo started via /api/expo-start)
     * so the manager knows the framework for log routing.
     */
    registerExternalServer(projectId: string, framework: string): void;
    /**
     * Get dev server logs
     * @param source - optional hint: 'expo' reads /tmp/expo-dev.log
     */
    getLogs(containerId: string, projectId: string, tail?: number, source?: string): Promise<string>;
    /**
     * Get detailed error info for a project
     */
    getErrorInfo(projectId: string): {
        hasErrors: boolean;
        errors: string[];
        retryState: {
            errorCount: number;
            maxRetries: number;
            canRetry: boolean;
            nextRetryIn?: number;
        };
    };
    /**
     * Force retry after max retries reached
     */
    forceRetry(containerId: string, projectId: string, ports: number[]): Promise<{
        ready: boolean;
        port?: number;
        error?: string;
    }>;
    /**
     * Notify that user made a file change (gives more retry attempts)
     */
    onFileChange(projectId: string): void;
    /**
     * Stream logs via WebSocket
     */
    streamLogs(containerId: string, projectId: string, onData: (data: string) => void): Promise<() => void>;
    /**
     * Get status of dev server
     */
    getStatus(projectId: string): DevServerInfo | undefined;
    /**
     * Check if dev server is running
     */
    isRunning(projectId: string): boolean;
    private getStartCommand;
    /**
     * Get the kill pattern for a framework's dev server process
     */
    private getKillPattern;
    private waitForReady;
    private execCommand;
}
export declare const devServerManager: DevServerManager;
/**
 * Auto-detect framework from project files in a container
 * Returns the detected framework name or 'unknown'
 */
export declare function detectFrameworkFromContainer(containerId: string): Promise<string>;
/**
 * Get the install command for a detected framework
 */
export declare function getInstallCommand(framework: string): string;
/**
 * Get the dev server start command for a detected framework
 */
export declare function getDevCommand(framework: string): string;
/**
 * Get expected ports for a framework
 */
export declare function getExpectedPorts(framework: string, basePorts: number[]): number[];
export {};
