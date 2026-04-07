/**
 * REPL Manager - Manages interactive REPL sessions within Docker containers
 * Supports Node.js, Python, Ruby, and Go (via gore)
 */
import { Duplex } from 'stream';
export type ReplLanguage = 'nodejs' | 'python' | 'ruby' | 'go';
export interface ReplLanguageConfig {
    name: string;
    command: string;
    args: string[];
    prompt: RegExp;
    multilinePrompt: RegExp;
    exitCommand: string;
    checkCommand: string;
}
export declare const REPL_CONFIGS: Record<ReplLanguage, ReplLanguageConfig>;
export interface ReplSession {
    id: string;
    projectId: string;
    language: ReplLanguage;
    containerId: string;
    stream: Duplex;
    execId: string;
    startedAt: number;
    lastActive: number;
    outputBuffer: string;
    isWaitingForPrompt: boolean;
    pendingResolve: ((output: string) => void) | null;
    pendingReject: ((error: Error) => void) | null;
}
declare class ReplManager {
    private docker;
    private sessions;
    private cleanupInterval;
    private readonly SESSION_TIMEOUT;
    constructor();
    private startCleanupInterval;
    private cleanupIdleSessions;
    private getSessionKey;
    /**
     * Check if a REPL language is available in the container
     */
    checkLanguageAvailable(containerId: string, language: ReplLanguage): Promise<boolean>;
    /**
     * Start a REPL session
     */
    startSession(projectId: string, containerId: string, language: ReplLanguage): Promise<{
        sessionId: string;
        welcomeMessage: string;
    }>;
    private setupStreamHandlers;
    private waitForOutput;
    /**
     * Execute code in a REPL session
     */
    executeCode(projectId: string, language: ReplLanguage, code: string): Promise<string>;
    private cleanOutput;
    /**
     * Stop a REPL session
     */
    stopSession(projectId: string, language: ReplLanguage): Promise<void>;
    /**
     * Get session status
     */
    getSession(projectId: string, language: ReplLanguage): ReplSession | undefined;
    /**
     * Get all active sessions for a project
     */
    getProjectSessions(projectId: string): ReplSession[];
    /**
     * Stop all sessions for a project
     */
    stopProjectSessions(projectId: string): Promise<void>;
    /**
     * Get available languages for a container
     */
    getAvailableLanguages(containerId: string): Promise<ReplLanguage[]>;
    /**
     * Cleanup on shutdown
     */
    shutdown(): Promise<void>;
}
export declare const replManager: ReplManager;
export {};
