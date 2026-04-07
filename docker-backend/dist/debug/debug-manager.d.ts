/**
 * Debug Session Manager
 *
 * Manages debug sessions for projects, including:
 * - Starting/stopping debug adapters per language
 * - Managing breakpoints across files
 * - WebSocket communication with frontend
 * - Session state and cleanup
 */
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { DAPClient, DebugLanguage, DebugConfig, Breakpoint, SourceBreakpoint, StackFrame, Scope, Variable, Thread, Capabilities } from './dap-client.js';
export interface DebugSession {
    id: string;
    projectId: string;
    containerId: string;
    language: DebugLanguage;
    client: DAPClient;
    process?: ChildProcess;
    port: number;
    state: DebugSessionState;
    config: DebugConfig;
    breakpoints: Map<string, FileBreakpoints>;
    createdAt: Date;
    lastActivity: Date;
}
export interface FileBreakpoints {
    path: string;
    breakpoints: SourceBreakpoint[];
    verified: Breakpoint[];
}
export type DebugSessionState = 'initializing' | 'configured' | 'running' | 'paused' | 'stopped' | 'terminated';
export interface DebugEvent {
    type: 'stopped' | 'continued' | 'exited' | 'terminated' | 'thread' | 'output' | 'breakpoint' | 'module' | 'loadedSource' | 'process' | 'capabilities' | 'progressStart' | 'progressUpdate' | 'progressEnd' | 'invalidated' | 'memory';
    sessionId: string;
    body: Record<string, unknown>;
}
declare class DebugManager extends EventEmitter {
    private docker;
    private sessions;
    private sessionsByProject;
    private portPool;
    private nextPort;
    private readonly maxPort;
    private cleanupInterval;
    private readonly sessionTimeout;
    constructor();
    private startCleanupInterval;
    private cleanupStaleSessions;
    private allocatePort;
    private releasePort;
    /**
     * Start a debug session for a project
     */
    startSession(projectId: string, containerId: string, config: DebugConfig): Promise<DebugSession>;
    private setupClientEvents;
    private startDebugAdapter;
    private waitForDebugAdapter;
    private initializeSession;
    private execInContainer;
    /**
     * Terminate a debug session
     */
    terminateSession(sessionId: string): Promise<void>;
    /**
     * Terminate all sessions for a project
     */
    terminateProjectSessions(projectId: string): Promise<void>;
    /**
     * Get session by ID
     */
    getSession(sessionId: string): DebugSession | undefined;
    /**
     * Get all sessions for a project
     */
    getProjectSessions(projectId: string): DebugSession[];
    /**
     * Set breakpoints for a file
     */
    setBreakpoints(sessionId: string, filePath: string, breakpoints: SourceBreakpoint[]): Promise<Breakpoint[]>;
    /**
     * Clear all breakpoints for a file
     */
    clearBreakpoints(sessionId: string, filePath: string): Promise<void>;
    /**
     * Continue execution
     */
    continue(sessionId: string, threadId?: number): Promise<void>;
    /**
     * Step over (next)
     */
    stepOver(sessionId: string, threadId?: number): Promise<void>;
    /**
     * Step into
     */
    stepInto(sessionId: string, threadId?: number): Promise<void>;
    /**
     * Step out
     */
    stepOut(sessionId: string, threadId?: number): Promise<void>;
    /**
     * Pause execution
     */
    pause(sessionId: string, threadId?: number): Promise<void>;
    /**
     * Restart debug session
     */
    restart(sessionId: string): Promise<void>;
    /**
     * Get threads
     */
    getThreads(sessionId: string): Promise<Thread[]>;
    /**
     * Get stack trace
     */
    getStackTrace(sessionId: string, threadId: number): Promise<StackFrame[]>;
    /**
     * Get scopes for a stack frame
     */
    getScopes(sessionId: string, frameId: number): Promise<Scope[]>;
    /**
     * Get variables
     */
    getVariables(sessionId: string, variablesReference: number): Promise<Variable[]>;
    /**
     * Evaluate expression
     */
    evaluate(sessionId: string, expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover'): Promise<{
        result: string;
        type?: string;
        variablesReference: number;
    }>;
    /**
     * Set variable value
     */
    setVariable(sessionId: string, variablesReference: number, name: string, value: string): Promise<{
        value: string;
        type?: string;
    }>;
    /**
     * Get session capabilities
     */
    getCapabilities(sessionId: string): Capabilities;
    /**
     * Get debug manager stats
     */
    getStats(): {
        activeSessions: number;
        sessionsByLanguage: Record<string, number>;
        portPoolSize: number;
    };
    /**
     * Cleanup all sessions
     */
    shutdown(): Promise<void>;
}
export declare const debugManager: DebugManager;
export {};
