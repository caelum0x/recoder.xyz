/**
 * Auto-Restore on Build Errors
 * Monitors dev server for errors and auto-restores to last working snapshot
 */
export interface ParsedBuildError {
    id: string;
    type: 'syntax' | 'type' | 'reference' | 'module' | 'build' | 'npm' | 'runtime' | 'unknown';
    severity: 'error' | 'warning';
    message: string;
    shortMessage: string;
    filePath?: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    source: 'typescript' | 'vite' | 'eslint' | 'npm' | 'runtime' | 'unknown';
    rawError: string;
    timestamp: number;
}
interface AutoRestoreConfig {
    enabled: boolean;
    maxRetries: number;
    baseCooldownMs: number;
    maxCooldownMs: number;
}
declare class AutoRestoreManager {
    private retryStates;
    private config;
    private getRetryState;
    /**
     * Get exponential backoff delay based on error count
     */
    private getBackoffDelay;
    /**
     * Analyze logs for critical errors
     * Returns both generic descriptions and actual error context
     */
    detectErrors(logs: string): {
        hasError: boolean;
        errors: string[];
        details: string[];
    };
    /**
     * Check if auto-restore should trigger
     */
    shouldRestore(projectId: string): {
        allowed: boolean;
        reason?: string;
        nextRetryIn?: number;
    };
    /**
     * Attempt auto-restore
     */
    attemptRestore(containerId: string, projectId: string, force?: boolean): Promise<{
        success: boolean;
        restoredTo?: string;
        error?: string;
        retryCount?: number;
        nextRetryIn?: number;
    }>;
    /**
     * Reset error count (call when build succeeds)
     */
    resetErrors(projectId: string): void;
    /**
     * Reset on file change - gives more retry attempts
     * Called when user makes a new file change, indicating they're trying to fix the issue
     */
    resetOnFileChange(projectId: string): void;
    /**
     * Force reset all retry state (manual user action)
     */
    forceReset(projectId: string): void;
    /**
     * Get current retry state for a project
     */
    getState(projectId: string): {
        errorCount: number;
        maxRetries: number;
        lastErrors: string[];
        canRetry: boolean;
        nextRetryIn?: number;
    };
    /**
     * Store error messages for later retrieval
     */
    setLastErrors(projectId: string, errors: string[]): void;
    /**
     * Configure auto-restore
     */
    configure(config: Partial<AutoRestoreConfig>): void;
}
export declare const autoRestoreManager: AutoRestoreManager;
/**
 * Parse all error types from logs
 * Returns deduplicated, structured errors for the frontend
 */
export declare function parseAllErrors(logs: string): ParsedBuildError[];
/**
 * Check if logs contain blocking errors (errors that prevent dev server from running)
 */
export declare function hasBlockingErrors(logs: string): boolean;
export {};
