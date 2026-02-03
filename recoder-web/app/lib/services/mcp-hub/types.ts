/**
 * MCP Hub Types
 *
 * Type definitions for MCP (Model Context Protocol) server management.
 * Based on the MCP specification with extensions for web environments.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// ============================================================================
// MCP Server Types
// ============================================================================

/**
 * Error entry for tracking server issues
 */
export interface McpErrorEntry {
  message: string;
  timestamp: number;
  level: 'error' | 'warn' | 'info';
}

/**
 * MCP Server representation
 */
export interface McpServer {
  /** Server name/identifier */
  name: string;
  /** JSON-serialized configuration */
  config: string;
  /** Current connection status */
  status: 'connected' | 'connecting' | 'disconnected';
  /** Current error message if any */
  error?: string;
  /** History of errors for debugging */
  errorHistory?: McpErrorEntry[];
  /** Available tools from this server */
  tools?: McpTool[];
  /** Available resources from this server */
  resources?: McpResource[];
  /** Available resource templates from this server */
  resourceTemplates?: McpResourceTemplate[];
  /** Whether the server is disabled */
  disabled?: boolean;
  /** Timeout for tool calls in seconds */
  timeout?: number;
  /** Whether this is a global or project server */
  source?: 'global' | 'project';
  /** Project path for project-scoped servers */
  projectPath?: string;
  /** Server instructions/description from MCP protocol */
  instructions?: string;
}

/**
 * MCP Tool definition
 */
export interface McpTool {
  /** Tool name */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: object;
  /** Whether this tool is always allowed without confirmation */
  alwaysAllow?: boolean;
  /** Whether this tool is enabled for prompts */
  enabledForPrompt?: boolean;
}

/**
 * MCP Resource definition
 */
export interface McpResource {
  /** Resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** MIME type of the resource */
  mimeType?: string;
  /** Resource description */
  description?: string;
}

/**
 * MCP Resource Template definition
 */
export interface McpResourceTemplate {
  /** URI template (RFC 6570) */
  uriTemplate: string;
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** MIME type of resources matching this template */
  mimeType?: string;
}

/**
 * Response from reading an MCP resource
 */
export interface McpResourceResponse {
  _meta?: Record<string, unknown>;
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

/**
 * Response from calling an MCP tool
 */
export interface McpToolCallResponse {
  _meta?: Record<string, unknown>;
  content: Array<
    | {
        type: 'text';
        text: string;
        _meta?: Record<string, unknown>;
      }
    | {
        type: 'image';
        data: string;
        mimeType: string;
        _meta?: Record<string, unknown>;
      }
    | {
        type: 'audio';
        data: string;
        mimeType: string;
        _meta?: Record<string, unknown>;
      }
    | {
        type: 'resource';
        resource: {
          uri: string;
          mimeType?: string;
          text?: string;
          blob?: string;
          _meta?: Record<string, unknown>;
        };
        _meta?: Record<string, unknown>;
      }
    | {
        type: 'resource_link';
        uri: string;
        name?: string;
        description?: string;
        mimeType?: string;
        _meta?: Record<string, unknown>;
      }
  >;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

// ============================================================================
// Transport Types
// ============================================================================

/**
 * Transport type identifier
 */
export type McpTransportType = 'stdio' | 'sse' | 'streamable-http';

/**
 * HTTP-based transport (SSE or Streamable HTTP)
 */
export interface HttpTransport {
  /** Transport endpoint URL */
  url: string;
  /** Optional headers */
  headers?: Record<string, string>;
}

/**
 * Stdio-based transport
 */
export type StdioTransport = StdioClientTransport;

/**
 * SSE-based transport
 */
export type SseTransport = SSEClientTransport;

/**
 * Union type for all transports
 */
export type McpTransport = StdioTransport | SseTransport;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Base configuration shared by all server types
 */
export interface BaseServerConfig {
  /** Whether the server is disabled */
  disabled?: boolean;
  /** Timeout for tool calls in seconds (1-3600) */
  timeout?: number;
  /** Tools that are always allowed without confirmation */
  alwaysAllow?: string[];
  /** Paths to watch for changes (triggers server restart) */
  watchPaths?: string[];
  /** Tools that are disabled */
  disabledTools?: string[];
}

/**
 * Stdio server configuration
 */
export interface StdioServerConfig extends BaseServerConfig {
  type?: 'stdio';
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * SSE server configuration
 */
export interface SseServerConfig extends BaseServerConfig {
  type: 'sse';
  /** SSE endpoint URL */
  url: string;
  /** Optional headers */
  headers?: Record<string, string>;
}

/**
 * Streamable HTTP server configuration
 */
export interface StreamableHttpServerConfig extends BaseServerConfig {
  type: 'streamable-http';
  /** HTTP endpoint URL */
  url: string;
  /** Optional headers */
  headers?: Record<string, string>;
}

/**
 * Union type for all server configurations
 */
export type ServerConfig = StdioServerConfig | SseServerConfig | StreamableHttpServerConfig;

/**
 * MCP settings file structure
 */
export interface McpSettings {
  mcpServers: Record<string, ServerConfig>;
}

// ============================================================================
// Connection Types
// ============================================================================

/**
 * Connected MCP connection with active client
 */
export interface ConnectedMcpConnection {
  type: 'connected';
  server: McpServer;
  client: Client;
  transport: McpTransport;
}

/**
 * Disconnected MCP connection (placeholder)
 */
export interface DisconnectedMcpConnection {
  type: 'disconnected';
  server: McpServer;
  client: null;
  transport: null;
}

/**
 * Union type for all connection states
 */
export type McpConnection = ConnectedMcpConnection | DisconnectedMcpConnection;

/**
 * Reason for disabling a server
 */
export enum DisableReason {
  MCP_DISABLED = 'mcpDisabled',
  SERVER_DISABLED = 'serverDisabled',
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * MCP Hub event types
 */
export type McpHubEventType =
  | 'server-connecting'
  | 'server-connected'
  | 'server-disconnected'
  | 'server-error'
  | 'tools-updated'
  | 'resources-updated'
  | 'config-changed'
  | 'connection-status-changed';

/**
 * MCP Hub event payload
 */
export interface McpHubEvent {
  type: McpHubEventType;
  serverName?: string;
  source?: 'global' | 'project';
  error?: string;
  data?: unknown;
}

/**
 * Event listener type
 */
export type McpHubEventListener = (event: McpHubEvent) => void;

// ============================================================================
// Configuration Validation Types
// ============================================================================

/**
 * Validation result for server configuration
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedConfig?: ServerConfig;
}

// ============================================================================
// Tool Name Utilities
// ============================================================================

/**
 * MCP tool separator used in function names
 */
export const MCP_TOOL_SEPARATOR = '--';

/**
 * MCP tool name prefix
 */
export const MCP_TOOL_PREFIX = 'mcp';

/**
 * Parsed MCP tool name
 */
export interface ParsedMcpToolName {
  serverName: string;
  toolName: string;
}
