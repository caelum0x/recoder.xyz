/**
 * Sandbox API Routes
 *
 * Endpoints for managing sandboxes via the public API:
 * - POST   /v1/sandboxes           - Create a new sandbox
 * - GET    /v1/sandboxes           - List sandboxes
 * - GET    /v1/sandboxes/:id       - Get sandbox details
 * - DELETE /v1/sandboxes/:id       - Delete a sandbox
 * - POST   /v1/sandboxes/:id/execute - Execute a command
 * - POST   /v1/sandboxes/:id/files - Write a file
 * - GET    /v1/sandboxes/:id/files - Read a file
 * - GET    /v1/sandboxes/:id/files/list - List files
 * - DELETE /v1/sandboxes/:id/files - Delete a file
 */
import type { SandboxState, FileInfo } from '../types.js';
/**
 * Sandbox storage (in-memory for now)
 * In production, use database
 */
interface SandboxRecord {
    id: string;
    apiKeyId: string;
    userId: string;
    name: string;
    state: SandboxState;
    template: string;
    containerId?: string;
    port?: number;
    previewUrl?: string;
    terminalUrl?: string;
    createdAt: number;
    lastActivityAt: number;
    expiresAt?: number;
    resourceLimits: {
        memoryMB: number;
        cpuShares: number;
        diskMB: number;
    };
    metadata?: Record<string, unknown>;
}
/**
 * Interface for container operations
 * These should be injected from the main server
 */
export interface SandboxDependencies {
    /** Create a container for the sandbox */
    createContainer: (options: {
        projectId: string;
        template: string;
        env?: Record<string, string>;
        resourceLimits?: {
            memoryMB?: number;
            cpuShares?: number;
        };
    }) => Promise<{
        containerId: string;
        port: number;
    }>;
    /** Start a container */
    startContainer: (containerId: string) => Promise<void>;
    /** Stop a container */
    stopContainer: (containerId: string) => Promise<void>;
    /** Delete a container */
    deleteContainer: (containerId: string) => Promise<void>;
    /** Execute command in container */
    execInContainer: (containerId: string, command: string, options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeoutMs?: number;
    }) => Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
        executionTimeMs: number;
        timedOut: boolean;
        killed: boolean;
    }>;
    /** Write file in container */
    writeFile: (containerId: string, path: string, content: string) => Promise<void>;
    /** Read file from container */
    readFile: (containerId: string, path: string) => Promise<{
        content: string;
        size: number;
        mimeType: string;
    }>;
    /** List files in container */
    listFiles: (containerId: string, path: string) => Promise<FileInfo[]>;
    /** Delete file in container */
    deleteFile: (containerId: string, path: string) => Promise<void>;
    /** Get preview URL */
    getPreviewUrl: (port: number) => string;
    /** Get terminal WebSocket URL */
    getTerminalUrl: (sandboxId: string) => string;
}
/**
 * Initialize sandbox routes with dependencies
 */
export declare function initSandboxRoutes(dependencies: SandboxDependencies): void;
declare const router: import("express-ws").Router;
export { router as sandboxRouter };
export declare const _testing: {
    sandboxes: Map<string, SandboxRecord>;
    sandboxesByApiKey: Map<string, Set<string>>;
    clearAll: () => void;
};
