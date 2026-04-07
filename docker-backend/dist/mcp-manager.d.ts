/**
 * MCP Server Manager for Docker Backend
 * Spawns and manages MCP servers inside user containers
 */
import { EventEmitter } from 'events';
export interface MCPServerConfig {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
}
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
    serverId: string;
}
declare class MCPManager extends EventEmitter {
    private servers;
    private idleCheckInterval;
    constructor();
    /**
     * Start an MCP server for a project
     */
    startServer(projectId: string, config: MCPServerConfig): Promise<{
        success: boolean;
        tools?: MCPTool[];
        error?: string;
    }>;
    /**
     * Stop an MCP server
     */
    stopServer(projectId: string, serverId: string): Promise<void>;
    /**
     * Stop all servers for a project
     */
    stopAllServers(projectId: string): Promise<void>;
    /**
     * Call a tool on an MCP server
     */
    callTool(projectId: string, serverId: string, toolName: string, args: Record<string, any>): Promise<any>;
    /**
     * Get all running servers for a project
     */
    getServers(projectId: string): Array<{
        id: string;
        name: string;
        status: string;
        tools: MCPTool[];
    }>;
    /**
     * Get all tools across all running servers for a project
     */
    getAllTools(projectId: string): MCPTool[];
    private waitForReady;
    private sendRequest;
    private sendNotification;
    private processBuffer;
    private checkIdleServers;
    /**
     * Cleanup on shutdown
     */
    shutdown(): Promise<void>;
}
export declare const mcpManager: MCPManager;
export declare const PREINSTALLED_SERVERS: Record<string, Omit<MCPServerConfig, 'id'>>;
export declare const NPX_SERVERS: Record<string, Omit<MCPServerConfig, 'id'>>;
export {};
