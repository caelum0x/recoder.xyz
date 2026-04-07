/**
 * Terminal Session Store
 * Persists terminal sessions in Redis for recovery after container/backend restarts
 */
export interface TerminalSession {
    projectId: string;
    terminalId: string;
    userId?: string;
    createdAt: number;
    lastActive: number;
    history: string[];
    cwd: string;
    env: Record<string, string>;
}
export interface ChatSession {
    projectId: string;
    userId?: string;
    messages: Array<{
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        timestamp: number;
        source?: 'web' | 'cli';
    }>;
    createdAt: number;
    lastActive: number;
}
declare class SessionStore {
    private redis;
    private connected;
    private memoryFallback;
    connect(): Promise<boolean>;
    saveTerminalSession(session: TerminalSession): Promise<void>;
    getTerminalSession(projectId: string, terminalId: string): Promise<TerminalSession | null>;
    updateTerminalActivity(projectId: string, terminalId: string): Promise<void>;
    addCommandToHistory(projectId: string, terminalId: string, command: string): Promise<void>;
    getTerminalSessions(projectId: string): Promise<TerminalSession[]>;
    deleteTerminalSession(projectId: string, terminalId: string): Promise<void>;
    saveChatSession(session: ChatSession): Promise<void>;
    getChatSession(projectId: string): Promise<ChatSession | null>;
    addChatMessage(projectId: string, message: ChatSession['messages'][0]): Promise<void>;
    getChatMessages(projectId: string, limit?: number): Promise<ChatSession['messages']>;
    queueOfflineChange(projectId: string, change: {
        type: 'create' | 'modify' | 'delete';
        path: string;
        content?: string;
        timestamp: number;
    }): Promise<void>;
    getOfflineChanges(projectId: string): Promise<any[]>;
    clearOfflineChanges(projectId: string): Promise<void>;
    isConnected(): boolean;
    disconnect(): Promise<void>;
}
export declare const sessionStore: SessionStore;
export {};
