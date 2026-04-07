/**
 * Project API Routes
 *
 * Endpoints for managing projects via the public API:
 * - POST   /v1/projects              - Create a new project
 * - GET    /v1/projects              - List user's projects
 * - GET    /v1/projects/:id          - Get project details
 * - POST   /v1/projects/:id/prompt   - Send a prompt to the project
 * - GET    /v1/projects/:id/tasks/:taskId - Get prompt task status
 * - POST   /v1/projects/:id/publish  - Publish the project
 */
import { type PublicTaskStreamEvent } from '../task-stream-protocol.js';
/**
 * Project state
 */
type ProjectState = 'creating' | 'running' | 'stopped' | 'error' | 'deleted';
/**
 * Project storage record (in-memory for now)
 * In production, use database
 */
interface ProjectRecord {
    id: string;
    apiKeyId: string;
    userId: string;
    name: string;
    description?: string;
    state: ProjectState;
    template: string;
    framework?: string;
    containerId?: string;
    port?: number;
    previewUrl?: string;
    publishedUrl?: string;
    publishedSlug?: string;
    publishedAt?: number;
    createdAt: number;
    lastActivityAt: number;
    metadata?: Record<string, unknown>;
}
type PromptTaskStatus = 'queued' | 'running' | 'completed' | 'failed';
interface PromptTaskRecord {
    id: string;
    projectId: string;
    apiKeyId: string;
    userId: string;
    prompt: string;
    model?: string;
    status: PromptTaskStatus;
    result?: string;
    error?: string;
    createdAt: number;
    updatedAt: number;
}
/**
 * Interface for project operations
 * These should be injected from the main server
 */
export interface ProjectDependencies {
    /** Create a container for the project */
    createContainer: (options: {
        projectId: string;
        template: string;
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
    /** Get preview URL */
    getPreviewUrl: (port: number) => string;
    /** Publish a project */
    publishProject: (projectId: string, containerId: string) => Promise<{
        url: string;
        slug: string;
    }>;
}
/**
 * Initialize project routes with dependencies
 */
export declare function initProjectRoutes(dependencies: ProjectDependencies): void;
declare function toPromptTaskResponse(record: PromptTaskRecord): {
    id: string;
    projectId: string;
    status: PromptTaskStatus;
    model: string | undefined;
    createdAt: number;
    updatedAt: number;
    result: string | undefined;
    error: string | undefined;
};
declare function getPromptTaskForProject(projectId: string, taskId: string, apiKeyId: string): PromptTaskRecord | null;
type ProcessPromptTaskResult = {
    outcome: 'completed';
} | {
    outcome: 'failed' | 'cancelled';
    error: string;
} | {
    outcome: 'retry';
    error: string;
};
declare function processPromptTask(taskId: string, options?: {
    allowRetry?: boolean;
}): Promise<ProcessPromptTaskResult>;
declare const router: import("express-ws").Router;
export { router as projectRouter };
export declare const _testing: {
    projects: Map<string, ProjectRecord>;
    projectsByApiKey: Map<string, Set<string>>;
    promptTasks: Map<string, PromptTaskRecord>;
    promptTasksByProject: Map<string, Set<string>>;
    taskEventSequences: Map<string, number>;
    taskEventHistory: Map<string, {
        id: string;
        order: number;
        event: PublicTaskStreamEvent;
    }[]>;
    inFlightPromptTasks: Set<string>;
    promptTaskAbortControllers: Map<string, AbortController>;
    processPromptTask: typeof processPromptTask;
    getPromptTaskForProject: typeof getPromptTaskForProject;
    toPromptTaskResponse: typeof toPromptTaskResponse;
    clearAll: () => Promise<void>;
};
