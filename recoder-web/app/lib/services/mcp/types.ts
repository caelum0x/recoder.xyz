/**
 * MCP (Model Context Protocol) Types
 *
 * Core type definitions for MCP server management, tool discovery,
 * consent handling, and transport configuration.
 */

// =============================================================================
// Transport Types
// =============================================================================

export type McpTransport = 'stdio' | 'sse' | 'http';

export interface StdioTransportConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface SSETransportConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface HTTPTransportConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type McpTransportConfig = StdioTransportConfig | SSETransportConfig | HTTPTransportConfig;

// =============================================================================
// Server Types
// =============================================================================

export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[] | null;
  envJson: Record<string, string> | null;
  url: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMcpServerInput {
  name: string;
  transport?: McpTransport;
  command?: string | null;
  args?: string[] | string | null;
  envJson?: Record<string, string> | string | null;
  url?: string | null;
  enabled?: boolean;
}

export interface UpdateMcpServerInput {
  id: string;
  name?: string;
  transport?: McpTransport;
  command?: string;
  args?: string;
  cwd?: string;
  envJson?: Record<string, string> | string;
  url?: string;
  enabled?: boolean;
}

// =============================================================================
// Tool Types
// =============================================================================

export interface McpTool {
  name: string;
  description: string | null;
  inputSchema?: Record<string, unknown>;
  consent?: McpConsentValue;
}

export interface McpToolWithServer extends McpTool {
  serverId: string;
  serverName: string;
}

// =============================================================================
// Consent Types
// =============================================================================

export type McpConsentValue = 'ask' | 'always' | 'denied';

export interface McpToolConsent {
  id: string;
  serverId: string;
  toolName: string;
  consent: McpConsentValue;
  updatedAt: Date;
}

export interface SetMcpToolConsentParams {
  serverId: string;
  toolName: string;
  consent: McpConsentValue;
}

export type McpConsentDecision = 'accept-once' | 'accept-always' | 'decline';

export interface McpConsentRequest {
  requestId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  toolDescription?: string | null;
  inputPreview?: string | null;
}

export interface McpConsentResponse {
  requestId: string;
  decision: McpConsentDecision;
}

// =============================================================================
// Connection Types
// =============================================================================

export type McpConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

export interface McpServerState {
  config: McpServerConfig;
  status: McpConnectionStatus;
  error?: string;
  tools: McpTool[];
  lastConnected?: Date;
  reconnectAttempts: number;
}

export interface McpServerConfig {
  id: string;
  name: string;
  description?: string;
  transport: McpTransportConfig;
  enabled: boolean;
  timeout?: number;
  autoConnect?: boolean;
  env?: Record<string, string>;
}

// =============================================================================
// Tool Execution Types
// =============================================================================

export interface ToolCallRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}

export interface ToolCallResponse {
  success: boolean;
  serverId: string;
  toolName: string;
  result?: ToolCallResult;
  error?: string;
  duration: number;
  timestamp: number;
}

// =============================================================================
// Event Types
// =============================================================================

export type McpClientEvent =
  | { type: 'server-connected'; serverId: string }
  | { type: 'server-disconnected'; serverId: string }
  | { type: 'server-error'; serverId: string; error: string }
  | { type: 'tools-updated'; serverId: string; tools: McpTool[] }
  | { type: 'tool-call-start'; serverId: string; toolName: string }
  | { type: 'tool-call-complete'; serverId: string; toolName: string; success: boolean }
  | { type: 'consent-request'; request: McpConsentRequest }
  | { type: 'consent-response'; response: McpConsentResponse };

export type McpEventListener = (event: McpClientEvent) => void;
