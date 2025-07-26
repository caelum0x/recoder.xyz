/**
 * Cross-Platform Session Manager for Recoder.xyz Ecosystem
 *
 * Enables session sharing between CLI, Web Platform, and VS Code Extension
 */
import { EventEmitter } from 'events';
export interface SessionMessage {
    id: string;
    timestamp: number;
    platform: 'cli' | 'web' | 'extension';
    type: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: {
        provider?: string;
        model?: string;
        tokens?: number;
        confidence?: number;
        project?: string;
        language?: string;
    };
}
export interface SessionContext {
    projectPath?: string;
    workingDirectory?: string;
    openFiles?: Array<{
        path: string;
        content: string;
        language: string;
    }>;
    gitBranch?: string;
    packageManager?: string;
    framework?: string;
    dependencies?: Record<string, string>;
}
export interface Session {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    platform: 'cli' | 'web' | 'extension';
    messages: SessionMessage[];
    context: SessionContext;
    metadata: {
        totalTokens: number;
        aiProviders: string[];
        codeGenerated: number;
        filesModified: string[];
    };
}
export declare class SessionManager extends EventEmitter {
    private static instance;
    private sessions;
    private currentSessionId?;
    private sessionDir;
    private platform;
    private watchMode;
    private constructor();
    static getInstance(platform: 'cli' | 'web' | 'extension'): SessionManager;
    /**
     * Get the session storage directory
     */
    private getSessionDirectory;
    /**
     * Setup file watcher for cross-platform synchronization
     */
    private setupFileWatcher;
    /**
     * Handle session file changes from other platforms
     */
    private handleSessionFileChange;
    /**
     * Load all sessions from disk
     */
    private loadSessions;
    /**
     * Save a session to disk
     */
    private saveSession;
    /**
     * Create a new session
     */
    createSession(title: string, context?: SessionContext): Session;
    /**
     * Get a session by ID
     */
    getSession(sessionId: string): Session | undefined;
    /**
     * Get current active session
     */
    getCurrentSession(): Session | undefined;
    /**
     * Set the current active session
     */
    setCurrentSession(sessionId: string): void;
    /**
     * Get all sessions
     */
    getAllSessions(): Session[];
    /**
     * Get sessions by platform
     */
    getSessionsByPlatform(platform: 'cli' | 'web' | 'extension'): Session[];
    /**
     * Add a message to the current session
     */
    addMessage(content: string, type: 'user' | 'assistant' | 'system', metadata?: SessionMessage['metadata']): SessionMessage;
    /**
     * Update session context
     */
    updateContext(context: Partial<SessionContext>): void;
    /**
     * Delete a session
     */
    deleteSession(sessionId: string): void;
    /**
     * Export session for sharing
     */
    exportSession(sessionId: string, includeContext?: boolean): string;
    /**
     * Import session from exported data
     */
    importSession(sessionData: string): Session;
    /**
     * Search sessions by content
     */
    searchSessions(query: string): Session[];
    /**
     * Get session statistics
     */
    getSessionStats(sessionId: string): {
        messageCount: number;
        totalTokens: number;
        aiProviders: string[];
        duration: number;
        codeBlocks: number;
    };
    /**
     * Enable cross-platform synchronization
     */
    enableSync(): void;
    /**
     * Disable cross-platform synchronization
     */
    disableSync(): void;
    /**
     * Generate unique session ID
     */
    private generateSessionId;
    /**
     * Generate unique message ID
     */
    private generateMessageId;
    /**
     * Clean up old sessions (older than 30 days)
     */
    cleanupOldSessions(daysToKeep?: number): number;
}
export declare const cliSessionManager: () => SessionManager;
export declare const webSessionManager: () => SessionManager;
export declare const extensionSessionManager: () => SessionManager;
export default SessionManager;
//# sourceMappingURL=session-manager.d.ts.map