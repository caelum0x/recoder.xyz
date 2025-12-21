/**
 * MCP (Model Context Protocol) Type Definitions
 * Core types for MCP server integration
 */

export type MCPServerStatus = 'active' | 'inactive' | 'error' | 'initializing';

export type MCPToolCategory = 
  | 'filesystem' 
  | 'git' 
  | 'database' 
  | 'api' 
  | 'npm' 
  | 'testing' 
  | 'documentation'
  | 'custom';

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  status: MCPServerStatus;
  config: MCPServerConfig;
  tools: MCPTool[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MCPServerConfig {
  credentials?: Record<string, string>;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  permissions?: MCPPermissions;
  options?: Record<string, any>;
}

export interface MCPPermissions {
  filesystem?: {
    read: string[];
    write: string[];
    execute: boolean;
  };
  network?: {
    allowedDomains: string[];
    allowedPorts: number[];
    allowOutbound: boolean;
  };
  database?: {
    allowedOperations: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[];
    maxQuerySize: number;
    readOnly: boolean;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  category: MCPToolCategory;
  inputSchema: any; // JSON Schema
  outputSchema?: any;
  examples?: MCPToolExample[];
  requiresAuth: boolean;
  requiresApproval: boolean;
  estimatedDuration?: number;
  handler?: (parameters: Record<string, any>) => Promise<any>;
  metadata?: Record<string, any>;
}

export interface MCPToolExample {
  description: string;
  input: Record<string, any>;
  output?: Record<string, any>;
}

export interface MCPToolCall {
  id: string;
  toolName: string;
  serverId: string;
  parameters: Record<string, any>;
  context?: MCPExecutionContext;
  timestamp: Date;
}

export interface MCPToolResult {
  callId: string;
  success: boolean;
  result?: any;
  error?: MCPError;
  executionTime: number;
  metadata?: Record<string, any>;
}

export interface MCPExecutionContext {
  userId?: string;
  sessionId?: string;
  chatId?: string;
  environment?: 'development' | 'staging' | 'production';
  metadata?: Record<string, any>;
}

export interface MCPError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
  retryable: boolean;
}

// File operations
export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: Date;
  permissions?: string;
}

// Git operations
export interface GitRepo {
  name: string;
  url: string;
  private: boolean;
  description?: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

// Database operations
export interface QueryResult {
  rows: any[];
  rowCount: number;
  fields: string[];
  executionTime: number;
}

// API operations
export interface APIResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  duration: number;
}
