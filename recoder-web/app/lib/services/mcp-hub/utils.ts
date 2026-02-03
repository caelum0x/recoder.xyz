/**
 * MCP Hub Utilities
 *
 * Utility functions for MCP server name handling, configuration validation,
 * and other common operations.
 */

import { z } from 'zod';
import type {
  ServerConfig,
  StdioServerConfig,
  SseServerConfig,
  StreamableHttpServerConfig,
  ConfigValidationResult,
  ParsedMcpToolName,
} from './types';
import { MCP_TOOL_SEPARATOR, MCP_TOOL_PREFIX } from './types';

// ============================================================================
// Name Sanitization
// ============================================================================

/**
 * Sanitize a name to be safe for use in API function names.
 * Removes special characters and ensures the name starts correctly.
 *
 * @param name - The original name (e.g., MCP server name or tool name)
 * @returns A sanitized name that conforms to API requirements
 */
export function sanitizeMcpName(name: string): string {
  if (!name) {
    return '_';
  }

  // Replace spaces with underscores first
  let sanitized = name.replace(/\s+/g, '_');

  // Only allow alphanumeric, underscores, and dashes
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\-]/g, '');

  // Replace any double-hyphen sequences with single hyphen to avoid separator conflicts
  sanitized = sanitized.replace(/--+/g, '-');

  // Ensure the name starts with a letter or underscore
  if (sanitized.length > 0 && !/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  // If empty after sanitization, use a placeholder
  if (!sanitized) {
    sanitized = '_unnamed';
  }

  return sanitized;
}

/**
 * Check if a tool name is an MCP tool (starts with the MCP prefix and separator).
 *
 * @param toolName - The tool name to check
 * @returns true if the tool name starts with "mcp--", false otherwise
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith(`${MCP_TOOL_PREFIX}${MCP_TOOL_SEPARATOR}`);
}

/**
 * Build a full MCP tool function name from server and tool names.
 * The format is: mcp--{sanitized_server_name}--{sanitized_tool_name}
 *
 * @param serverName - The MCP server name
 * @param toolName - The tool name
 * @returns A sanitized function name in the format mcp--serverName--toolName
 */
export function buildMcpToolName(serverName: string, toolName: string): string {
  const sanitizedServer = sanitizeMcpName(serverName);
  const sanitizedTool = sanitizeMcpName(toolName);

  // Build the full name: mcp--{server}--{tool}
  const fullName = `${MCP_TOOL_PREFIX}${MCP_TOOL_SEPARATOR}${sanitizedServer}${MCP_TOOL_SEPARATOR}${sanitizedTool}`;

  // Truncate if necessary (max 64 chars for Gemini compatibility)
  if (fullName.length > 64) {
    return fullName.slice(0, 64);
  }

  return fullName;
}

/**
 * Parse an MCP tool function name back into server and tool names.
 *
 * @param mcpToolName - The full MCP tool name (e.g., "mcp--weather--get_forecast")
 * @returns An object with serverName and toolName, or null if parsing fails
 */
export function parseMcpToolName(mcpToolName: string): ParsedMcpToolName | null {
  const prefix = MCP_TOOL_PREFIX + MCP_TOOL_SEPARATOR;
  if (!mcpToolName.startsWith(prefix)) {
    return null;
  }

  // Remove the "mcp--" prefix
  const remainder = mcpToolName.slice(prefix.length);

  // Split on the separator to get server and tool names
  const separatorIndex = remainder.indexOf(MCP_TOOL_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }

  const serverName = remainder.slice(0, separatorIndex);
  const toolName = remainder.slice(separatorIndex + MCP_TOOL_SEPARATOR.length);

  if (!serverName || !toolName) {
    return null;
  }

  return { serverName, toolName };
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Base configuration schema for common settings
 */
const BaseConfigSchema = z.object({
  disabled: z.boolean().optional(),
  timeout: z.number().min(1).max(3600).optional().default(60),
  alwaysAllow: z.array(z.string()).default([]),
  watchPaths: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).default([]),
});

/**
 * Stdio server configuration schema
 */
const StdioConfigSchema = BaseConfigSchema.extend({
  type: z.literal('stdio').optional(),
  command: z.string().min(1, 'Command cannot be empty'),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  // Ensure no SSE/HTTP fields
  url: z.undefined().optional(),
  headers: z.undefined().optional(),
}).transform((data) => ({
  ...data,
  type: 'stdio' as const,
}));

/**
 * SSE server configuration schema
 */
const SseConfigSchema = BaseConfigSchema.extend({
  type: z.literal('sse'),
  url: z.string().url('URL must be a valid URL format'),
  headers: z.record(z.string()).optional(),
  // Ensure no stdio fields
  command: z.undefined().optional(),
  args: z.undefined().optional(),
  env: z.undefined().optional(),
}).transform((data) => ({
  ...data,
  type: 'sse' as const,
}));

/**
 * Streamable HTTP server configuration schema
 */
const StreamableHttpConfigSchema = BaseConfigSchema.extend({
  type: z.literal('streamable-http'),
  url: z.string().url('URL must be a valid URL format'),
  headers: z.record(z.string()).optional(),
  // Ensure no stdio fields
  command: z.undefined().optional(),
  args: z.undefined().optional(),
  env: z.undefined().optional(),
}).transform((data) => ({
  ...data,
  type: 'streamable-http' as const,
}));

/**
 * Combined server configuration schema
 */
export const ServerConfigSchema = z.union([
  StdioConfigSchema,
  SseConfigSchema,
  StreamableHttpConfigSchema,
]);

/**
 * MCP settings schema
 */
export const McpSettingsSchema = z.object({
  mcpServers: z.record(ServerConfigSchema),
});

// Error messages for configuration validation
const ERROR_MESSAGES = {
  typeError: "Server type must be 'stdio', 'sse', or 'streamable-http'",
  stdioFieldsError:
    "For 'stdio' type servers, you must provide a 'command' field and can optionally include 'args' and 'env'",
  sseFieldsError:
    "For 'sse' type servers, you must provide a 'url' field and can optionally include 'headers'",
  streamableHttpFieldsError:
    "For 'streamable-http' type servers, you must provide a 'url' field and can optionally include 'headers'",
  mixedFieldsError:
    "Cannot mix 'stdio' and ('sse' or 'streamable-http') fields. For 'stdio' use 'command', 'args', and 'env'. For 'sse'/'streamable-http' use 'url' and 'headers'",
  missingFieldsError:
    "Server configuration must include either 'command' (for stdio) or 'url' (for sse/streamable-http) and a corresponding 'type' if 'url' is used.",
};

/**
 * Validate and normalize server configuration
 *
 * @param config - Raw configuration to validate
 * @param serverName - Optional server name for error messages
 * @returns Validation result with normalized config if valid
 */
export function validateServerConfig(
  config: unknown,
  serverName?: string
): ConfigValidationResult {
  const result: ConfigValidationResult = {
    valid: false,
    errors: [],
    warnings: [],
  };

  if (!config || typeof config !== 'object') {
    result.errors.push('Configuration must be an object');
    return result;
  }

  const rawConfig = config as Record<string, unknown>;
  const hasStdioFields = rawConfig.command !== undefined;
  const hasUrlFields = rawConfig.url !== undefined;

  // Check for mixed fields
  if (hasStdioFields && hasUrlFields) {
    result.errors.push(ERROR_MESSAGES.mixedFieldsError);
    return result;
  }

  // Infer type for stdio if not provided
  if (!rawConfig.type && hasStdioFields) {
    (rawConfig as Record<string, unknown>).type = 'stdio';
  }

  // For url-based configs, type must be provided
  if (hasUrlFields && !rawConfig.type) {
    result.errors.push(
      "Configuration with 'url' must explicitly specify 'type' as 'sse' or 'streamable-http'."
    );
    return result;
  }

  // Validate type if provided
  if (rawConfig.type && !['stdio', 'sse', 'streamable-http'].includes(rawConfig.type as string)) {
    result.errors.push(ERROR_MESSAGES.typeError);
    return result;
  }

  // Check for type/field mismatch
  if (rawConfig.type === 'stdio' && !hasStdioFields) {
    result.errors.push(ERROR_MESSAGES.stdioFieldsError);
    return result;
  }
  if (rawConfig.type === 'sse' && !hasUrlFields) {
    result.errors.push(ERROR_MESSAGES.sseFieldsError);
    return result;
  }
  if (rawConfig.type === 'streamable-http' && !hasUrlFields) {
    result.errors.push(ERROR_MESSAGES.streamableHttpFieldsError);
    return result;
  }

  // If neither command nor url is present
  if (!hasStdioFields && !hasUrlFields) {
    result.errors.push(ERROR_MESSAGES.missingFieldsError);
    return result;
  }

  // Validate with Zod schema
  try {
    const validated = ServerConfigSchema.parse(rawConfig);
    result.valid = true;
    result.normalizedConfig = validated as ServerConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      result.errors.push(
        serverName
          ? `Invalid configuration for server "${serverName}": ${errorMessages}`
          : `Invalid server configuration: ${errorMessages}`
      );
    } else {
      result.errors.push('Unknown validation error');
    }
  }

  return result;
}

/**
 * Parse and validate MCP settings JSON
 *
 * @param content - JSON string to parse
 * @returns Parsed settings or null with error
 */
export function parseSettings(content: string): {
  settings: Record<string, ServerConfig> | null;
  error: string | null;
} {
  try {
    const parsed = JSON.parse(content);
    const result = McpSettingsSchema.safeParse(parsed);

    if (result.success) {
      return { settings: result.data.mcpServers, error: null };
    }

    const errorMessages = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('\n');

    return { settings: null, error: `Invalid MCP settings: ${errorMessages}` };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { settings: null, error: 'Invalid JSON syntax in MCP settings' };
    }
    return { settings: null, error: 'Failed to parse MCP settings' };
  }
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Create default settings structure
 */
export function createDefaultSettings(): { mcpServers: Record<string, ServerConfig> } {
  return { mcpServers: {} };
}

/**
 * Merge server configurations
 *
 * @param base - Base configuration
 * @param updates - Updates to apply
 * @returns Merged configuration
 */
export function mergeServerConfig(
  base: ServerConfig,
  updates: Partial<ServerConfig>
): ServerConfig {
  return {
    ...base,
    ...updates,
    alwaysAllow: updates.alwaysAllow ?? base.alwaysAllow ?? [],
    disabledTools: updates.disabledTools ?? base.disabledTools ?? [],
  } as ServerConfig;
}

/**
 * Check if a server configuration is for HTTP-based transport
 */
export function isHttpTransport(config: ServerConfig): config is SseServerConfig | StreamableHttpServerConfig {
  return config.type === 'sse' || config.type === 'streamable-http';
}

/**
 * Check if a server configuration is for stdio transport
 */
export function isStdioTransport(config: ServerConfig): config is StdioServerConfig {
  return config.type === 'stdio' || (!('type' in config) && 'command' in config);
}

// ============================================================================
// Environment Variable Injection
// ============================================================================

/**
 * Inject environment variables into a string
 *
 * @param value - String potentially containing ${VAR} patterns
 * @param env - Environment variables to use
 * @returns String with variables replaced
 */
export function injectEnvVars(value: string, env: Record<string, string | undefined>): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return env[varName] ?? '';
  });
}

/**
 * Inject variables into server configuration
 *
 * @param config - Server configuration
 * @param context - Context with environment and workspace info
 * @returns Configuration with variables injected
 */
export function injectVariables(
  config: ServerConfig,
  context: {
    env: Record<string, string | undefined>;
    workspaceFolder?: string;
  }
): ServerConfig {
  const inject = (value: string) => injectEnvVars(value, context.env);

  if (isStdioTransport(config)) {
    return {
      ...config,
      command: inject(config.command),
      args: config.args?.map(inject),
      cwd: config.cwd ? inject(config.cwd) : context.workspaceFolder,
      env: config.env
        ? Object.fromEntries(
            Object.entries(config.env).map(([k, v]) => [k, inject(v)])
          )
        : undefined,
    } as StdioServerConfig;
  }

  if (isHttpTransport(config)) {
    return {
      ...config,
      url: inject(config.url),
      headers: config.headers
        ? Object.fromEntries(
            Object.entries(config.headers).map(([k, v]) => [k, inject(v)])
          )
        : undefined,
    } as SseServerConfig | StreamableHttpServerConfig;
  }

  return config;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Truncate error message to reasonable length
 *
 * @param message - Error message
 * @param maxLength - Maximum length (default 1000)
 * @returns Truncated message
 */
export function truncateError(message: string, maxLength = 1000): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.substring(0, maxLength)}...(error message truncated)`;
}

/**
 * Format error for display
 *
 * @param error - Error object or string
 * @returns Formatted error message
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

// ============================================================================
// Delay Utility
// ============================================================================

/**
 * Delay execution for specified milliseconds
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
