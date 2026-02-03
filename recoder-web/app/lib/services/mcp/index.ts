/**
 * MCP (Model Context Protocol) Management System
 * Copied from Dyad - Provides MCP server management, tool discovery,
 * and consent handling for AI tool integrations
 */

import { z } from 'zod';
import { atom, map, computed } from 'nanostores';

// =============================================================================
// Schemas
// =============================================================================

export const McpTransportTypeSchema = z.enum(['stdio', 'sse', 'websocket']);

export const McpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transportType: McpTransportTypeSchema.default('stdio'),
  enabled: z.boolean().default(true),
  autoStart: z.boolean().default(false),
});

export const McpToolParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
});

export const McpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.array(McpToolParameterSchema).optional(),
  serverId: z.string(),
  serverName: z.string(),
});

export const McpResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  serverId: z.string(),
});

export const McpPromptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    required: z.boolean().default(false),
  })).optional(),
  serverId: z.string(),
});

export const McpServerStatusSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'error',
]);

export const McpServerStateSchema = z.object({
  config: McpServerConfigSchema,
  status: McpServerStatusSchema,
  tools: z.array(McpToolSchema),
  resources: z.array(McpResourceSchema),
  prompts: z.array(McpPromptSchema),
  error: z.string().optional(),
  lastConnected: z.string().optional(),
});

export const McpConsentSchema = z.object({
  toolName: z.string(),
  serverId: z.string(),
  scope: z.enum(['once', 'session', 'always']),
  grantedAt: z.string(),
  expiresAt: z.string().optional(),
});

export const McpToolCallSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  serverId: z.string(),
  arguments: z.record(z.unknown()),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  result: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});

// =============================================================================
// Types
// =============================================================================

export type McpTransportType = z.infer<typeof McpTransportTypeSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpTool = z.infer<typeof McpToolSchema>;
export type McpToolParameter = z.infer<typeof McpToolParameterSchema>;
export type McpResource = z.infer<typeof McpResourceSchema>;
export type McpPrompt = z.infer<typeof McpPromptSchema>;
export type McpServerStatus = z.infer<typeof McpServerStatusSchema>;
export type McpServerState = z.infer<typeof McpServerStateSchema>;
export type McpConsent = z.infer<typeof McpConsentSchema>;
export type McpToolCall = z.infer<typeof McpToolCallSchema>;

// =============================================================================
// State
// =============================================================================

export const mcpServersStore = map<Record<string, McpServerState>>({});
export const mcpConsentsStore = map<Record<string, McpConsent>>({});
export const mcpToolCallsStore = map<Record<string, McpToolCall>>({});
export const pendingConsentRequest = atom<{
  toolName: string;
  serverId: string;
  arguments: Record<string, unknown>;
} | null>(null);

// =============================================================================
// Computed State
// =============================================================================

export const allMcpTools = computed(mcpServersStore, (servers) => {
  const tools: McpTool[] = [];
  for (const server of Object.values(servers)) {
    if (server?.status === 'connected') {
      tools.push(...server.tools);
    }
  }
  return tools;
});

export const allMcpResources = computed(mcpServersStore, (servers) => {
  const resources: McpResource[] = [];
  for (const server of Object.values(servers)) {
    if (server?.status === 'connected') {
      resources.push(...server.resources);
    }
  }
  return resources;
});

export const allMcpPrompts = computed(mcpServersStore, (servers) => {
  const prompts: McpPrompt[] = [];
  for (const server of Object.values(servers)) {
    if (server?.status === 'connected') {
      prompts.push(...server.prompts);
    }
  }
  return prompts;
});

export const connectedServers = computed(mcpServersStore, (servers) => {
  return Object.values(servers).filter(s => s?.status === 'connected');
});

// =============================================================================
// Server Management
// =============================================================================

/**
 * Create a new MCP server ID
 */
export function createMcpServerId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Register an MCP server configuration
 */
export function registerMcpServer(config: McpServerConfig): void {
  const state: McpServerState = {
    config,
    status: 'disconnected',
    tools: [],
    resources: [],
    prompts: [],
  };
  mcpServersStore.setKey(config.id, state);
}

/**
 * Update MCP server status
 */
export function updateMcpServerStatus(
  serverId: string,
  status: McpServerStatus,
  error?: string
): void {
  const server = mcpServersStore.get()[serverId];
  if (!server) return;

  mcpServersStore.setKey(serverId, {
    ...server,
    status,
    error: error || undefined,
    lastConnected: status === 'connected' ? new Date().toISOString() : server.lastConnected,
  });
}

/**
 * Update MCP server tools
 */
export function updateMcpServerTools(serverId: string, tools: McpTool[]): void {
  const server = mcpServersStore.get()[serverId];
  if (!server) return;

  mcpServersStore.setKey(serverId, {
    ...server,
    tools: tools.map(t => ({ ...t, serverId, serverName: server.config.name })),
  });
}

/**
 * Update MCP server resources
 */
export function updateMcpServerResources(serverId: string, resources: McpResource[]): void {
  const server = mcpServersStore.get()[serverId];
  if (!server) return;

  mcpServersStore.setKey(serverId, {
    ...server,
    resources: resources.map(r => ({ ...r, serverId })),
  });
}

/**
 * Update MCP server prompts
 */
export function updateMcpServerPrompts(serverId: string, prompts: McpPrompt[]): void {
  const server = mcpServersStore.get()[serverId];
  if (!server) return;

  mcpServersStore.setKey(serverId, {
    ...server,
    prompts: prompts.map(p => ({ ...p, serverId })),
  });
}

/**
 * Remove an MCP server
 */
export function removeMcpServer(serverId: string): void {
  const servers = { ...mcpServersStore.get() };
  delete servers[serverId];
  mcpServersStore.set(servers);

  // Also remove consents for this server
  const consents = { ...mcpConsentsStore.get() };
  for (const [key, consent] of Object.entries(consents)) {
    if (consent?.serverId === serverId) {
      delete consents[key];
    }
  }
  mcpConsentsStore.set(consents);
}

/**
 * Get an MCP server by ID
 */
export function getMcpServer(serverId: string): McpServerState | undefined {
  return mcpServersStore.get()[serverId];
}

/**
 * Get all MCP servers
 */
export function getAllMcpServers(): McpServerState[] {
  return Object.values(mcpServersStore.get()).filter(Boolean) as McpServerState[];
}

// =============================================================================
// Tool Discovery
// =============================================================================

/**
 * Find an MCP tool by name
 */
export function findMcpTool(toolName: string): McpTool | undefined {
  return allMcpTools.get().find(t => t.name === toolName);
}

/**
 * Find MCP tools matching a pattern
 */
export function searchMcpTools(query: string): McpTool[] {
  const lowerQuery = query.toLowerCase();
  return allMcpTools.get().filter(
    t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get tools for a specific server
 */
export function getServerTools(serverId: string): McpTool[] {
  const server = mcpServersStore.get()[serverId];
  return server?.tools || [];
}

// =============================================================================
// Consent Management
// =============================================================================

/**
 * Create a consent key
 */
function createConsentKey(toolName: string, serverId: string): string {
  return `${serverId}:${toolName}`;
}

/**
 * Grant consent for a tool
 */
export function grantMcpConsent(
  toolName: string,
  serverId: string,
  scope: McpConsent['scope']
): void {
  const key = createConsentKey(toolName, serverId);
  const now = new Date();

  let expiresAt: string | undefined;
  if (scope === 'session') {
    // Session consent expires in 24 hours
    expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  const consent: McpConsent = {
    toolName,
    serverId,
    scope,
    grantedAt: now.toISOString(),
    expiresAt,
  };

  mcpConsentsStore.setKey(key, consent);

  // Clear pending request if this was the requested tool
  const pending = pendingConsentRequest.get();
  if (pending?.toolName === toolName && pending?.serverId === serverId) {
    pendingConsentRequest.set(null);
  }
}

/**
 * Revoke consent for a tool
 */
export function revokeMcpConsent(toolName: string, serverId: string): void {
  const key = createConsentKey(toolName, serverId);
  const consents = { ...mcpConsentsStore.get() };
  delete consents[key];
  mcpConsentsStore.set(consents);
}

/**
 * Check if consent is granted for a tool
 */
export function hasMcpConsent(toolName: string, serverId: string): boolean {
  const key = createConsentKey(toolName, serverId);
  const consent = mcpConsentsStore.get()[key];

  if (!consent) return false;

  // Check expiration
  if (consent.expiresAt) {
    const expiresAt = new Date(consent.expiresAt);
    if (expiresAt < new Date()) {
      // Consent expired, revoke it
      revokeMcpConsent(toolName, serverId);
      return false;
    }
  }

  return true;
}

/**
 * Get consent for a tool
 */
export function getMcpConsent(toolName: string, serverId: string): McpConsent | undefined {
  const key = createConsentKey(toolName, serverId);
  return mcpConsentsStore.get()[key];
}

/**
 * Request consent for a tool
 */
export function requestMcpConsent(
  toolName: string,
  serverId: string,
  arguments_: Record<string, unknown>
): void {
  pendingConsentRequest.set({
    toolName,
    serverId,
    arguments: arguments_,
  });
}

/**
 * Deny pending consent request
 */
export function denyPendingConsent(): void {
  pendingConsentRequest.set(null);
}

// =============================================================================
// Tool Execution
// =============================================================================

/**
 * Create a tool call ID
 */
export function createToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Start a tool call
 */
export function startToolCall(
  toolName: string,
  serverId: string,
  arguments_: Record<string, unknown>
): string {
  const id = createToolCallId();

  const call: McpToolCall = {
    id,
    toolName,
    serverId,
    arguments: arguments_,
    status: 'pending',
    startedAt: new Date().toISOString(),
  };

  mcpToolCallsStore.setKey(id, call);
  return id;
}

/**
 * Update tool call to running
 */
export function markToolCallRunning(callId: string): void {
  const call = mcpToolCallsStore.get()[callId];
  if (!call) return;

  mcpToolCallsStore.setKey(callId, {
    ...call,
    status: 'running',
  });
}

/**
 * Complete a tool call
 */
export function completeToolCall(callId: string, result: unknown): void {
  const call = mcpToolCallsStore.get()[callId];
  if (!call) return;

  mcpToolCallsStore.setKey(callId, {
    ...call,
    status: 'completed',
    result,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Fail a tool call
 */
export function failToolCall(callId: string, error: string): void {
  const call = mcpToolCallsStore.get()[callId];
  if (!call) return;

  mcpToolCallsStore.setKey(callId, {
    ...call,
    status: 'failed',
    error,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Get a tool call by ID
 */
export function getToolCall(callId: string): McpToolCall | undefined {
  return mcpToolCallsStore.get()[callId];
}

// =============================================================================
// Built-in Server Configs
// =============================================================================

export const BUILT_IN_MCP_SERVERS: McpServerConfig[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-filesystem', '/'],
    transportType: 'stdio',
    enabled: false,
    autoStart: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, and PRs',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-github'],
    env: {
      GITHUB_TOKEN: '${GITHUB_TOKEN}',
    },
    transportType: 'stdio',
    enabled: false,
    autoStart: false,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query PostgreSQL databases',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-postgres'],
    env: {
      POSTGRES_URL: '${DATABASE_URL}',
    },
    transportType: 'stdio',
    enabled: false,
    autoStart: false,
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-puppeteer'],
    transportType: 'stdio',
    enabled: false,
    autoStart: false,
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory and knowledge base',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-memory'],
    transportType: 'stdio',
    enabled: false,
    autoStart: false,
  },
];

/**
 * Initialize built-in MCP servers
 */
export function initializeBuiltInServers(): void {
  for (const config of BUILT_IN_MCP_SERVERS) {
    if (!mcpServersStore.get()[config.id]) {
      registerMcpServer(config);
    }
  }
}

// =============================================================================
// UI Helpers
// =============================================================================

/**
 * Get status color for an MCP server
 */
export function getServerStatusColor(status: McpServerStatus): string {
  switch (status) {
    case 'connected':
      return 'text-green-500';
    case 'connecting':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    case 'disconnected':
    default:
      return 'text-gray-500';
  }
}

/**
 * Get status icon for an MCP server
 */
export function getServerStatusIcon(status: McpServerStatus): string {
  switch (status) {
    case 'connected':
      return 'i-ph:check-circle-fill';
    case 'connecting':
      return 'i-ph:spinner animate-spin';
    case 'error':
      return 'i-ph:warning-circle-fill';
    case 'disconnected':
    default:
      return 'i-ph:circle';
  }
}

/**
 * Get human-readable status label
 */
export function getServerStatusLabel(status: McpServerStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Error';
    case 'disconnected':
    default:
      return 'Disconnected';
  }
}

/**
 * Format tool parameters for display
 */
export function formatToolParameters(tool: McpTool): string {
  if (!tool.parameters || tool.parameters.length === 0) {
    return 'No parameters';
  }

  return tool.parameters
    .map(p => `${p.name}${p.required ? '*' : ''}: ${p.type}`)
    .join(', ');
}
