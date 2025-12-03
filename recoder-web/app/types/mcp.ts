/**
 * MCP (Model Context Protocol) Type Definitions
 */

export interface MCPServer {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  status: 'connected' | 'disconnected' | 'error';
  enabled: boolean;
  config: MCPServerConfig;
  createdAt?: string;
  updatedAt?: string;

  // Legacy properties for backward compatibility
  type?: 'filesystem' | 'git' | 'database' | 'custom';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  lastConnected?: Date | string;
  error?: string;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  version?: string;
  [key: string]: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  serverId?: string;
}

export interface MCPToolCall {
  id: string;
  serverId: string;
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
  error?: string;
  timestamp: string;
  status: 'pending' | 'success' | 'error';
}

// API Response Types
export interface MCPServersResponse {
  servers: MCPServer[];
}

export interface MCPServerResponse {
  server: MCPServer;
}

export interface MCPToolsResponse {
  tools: MCPTool[];
  serverId?: string;
}

export interface MCPToolCallResponse {
  result: any;
  error?: string;
}

export interface MCPHealthResponse {
  healthy: boolean;
  servers: {
    serverId: string;
    status: 'connected' | 'disconnected' | 'error';
    lastCheck: string;
  }[];
}

export interface MCPInstallRequest {
  serverId: string;
  config: MCPServerConfig;
}

export interface MCPUpdateRequest {
  enabled?: boolean;
  config?: Partial<MCPServerConfig>;
}

export interface MCPToolCallRequest {
  serverId: string;
  toolName: string;
  parameters: Record<string, any>;
}

// Error Response
export interface MCPErrorResponse {
  error: string;
  details?: any;
}

// Generic API Response Wrapper
export type MCPApiResponse<T> = T | MCPErrorResponse;

// Type Guards
export function isMCPError(response: any): response is MCPErrorResponse {
  return response && typeof response === 'object' && 'error' in response;
}

export function isMCPServer(obj: any): obj is MCPServer {
  return obj && typeof obj === 'object' && 'serverId' in obj && 'status' in obj;
}
