/**
 * MCP Tool Utilities
 *
 * Helper functions for parsing, building, and sanitizing MCP tool keys.
 * Tool keys combine server name and tool name to create unique identifiers.
 */

import type { McpTool, McpToolWithServer } from './types';

// =============================================================================
// Tool Key Management
// =============================================================================

/**
 * Separator used between server name and tool name in MCP tool keys.
 * Uses double underscore to minimize conflicts with actual names.
 */
export const MCP_TOOL_KEY_SEPARATOR = '__';

/**
 * Parse an MCP tool key into its component parts.
 * Tool keys are formatted as "serverName__toolName".
 *
 * @param toolKey - The composite tool key (e.g., "my-server__my-tool")
 * @returns An object containing the serverName and toolName.
 *          If no separator is found, serverName will be empty and toolName will be the full key.
 */
export function parseMcpToolKey(toolKey: string): {
  serverName: string;
  toolName: string;
} {
  const lastIndex = toolKey.lastIndexOf(MCP_TOOL_KEY_SEPARATOR);
  if (lastIndex === -1) {
    return { serverName: '', toolName: toolKey };
  }
  const serverName = toolKey.slice(0, lastIndex);
  const toolName = toolKey.slice(lastIndex + MCP_TOOL_KEY_SEPARATOR.length);
  return { serverName, toolName };
}

/**
 * Build an MCP tool key from server name and tool name.
 *
 * @param serverName - The name of the MCP server
 * @param toolName - The name of the tool
 * @returns The composite tool key
 */
export function buildMcpToolKey(serverName: string, toolName: string): string {
  const sanitizedServer = sanitizeMcpName(serverName);
  const sanitizedTool = sanitizeMcpName(toolName);
  return `${sanitizedServer}${MCP_TOOL_KEY_SEPARATOR}${sanitizedTool}`;
}

/**
 * Sanitize a name for use in an MCP tool key.
 * Replaces any characters that aren't alphanumeric, underscore, or hyphen with a hyphen.
 *
 * @param name - The name to sanitize
 * @returns The sanitized name safe for use in tool keys
 */
export function sanitizeMcpName(name: string): string {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '-');
}

// =============================================================================
// Tool Schema Conversion
// =============================================================================

/**
 * Convert MCP tool to OpenAI-style function schema
 */
export function mcpToolToFunctionSchema(tool: McpToolWithServer): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  const toolKey = buildMcpToolKey(tool.serverName, tool.name);
  return {
    type: 'function',
    function: {
      name: toolKey,
      description: tool.description || '',
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  };
}

/**
 * Convert multiple MCP tools to OpenAI-style function schemas
 */
export function mcpToolsToFunctionSchemas(tools: McpToolWithServer[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools.map(mcpToolToFunctionSchema);
}

/**
 * Convert MCP tool to Anthropic-style tool schema
 */
export function mcpToolToAnthropicSchema(tool: McpToolWithServer): {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
} {
  const toolKey = buildMcpToolKey(tool.serverName, tool.name);
  return {
    name: toolKey,
    description: tool.description || '',
    input_schema: tool.inputSchema || { type: 'object', properties: {} },
  };
}

// =============================================================================
// Tool Discovery Helpers
// =============================================================================

/**
 * Find a tool by its key in a list of tools
 */
export function findToolByKey(
  tools: McpToolWithServer[],
  toolKey: string
): McpToolWithServer | undefined {
  const { serverName, toolName } = parseMcpToolKey(toolKey);
  return tools.find(
    (t) =>
      sanitizeMcpName(t.serverName) === serverName && sanitizeMcpName(t.name) === toolName
  );
}

/**
 * Find all tools from a specific server
 */
export function findToolsByServer(
  tools: McpToolWithServer[],
  serverName: string
): McpToolWithServer[] {
  const sanitizedServer = sanitizeMcpName(serverName);
  return tools.filter((t) => sanitizeMcpName(t.serverName) === sanitizedServer);
}

/**
 * Group tools by server
 */
export function groupToolsByServer(
  tools: McpToolWithServer[]
): Map<string, McpToolWithServer[]> {
  const grouped = new Map<string, McpToolWithServer[]>();

  for (const tool of tools) {
    const existing = grouped.get(tool.serverId) || [];
    existing.push(tool);
    grouped.set(tool.serverId, existing);
  }

  return grouped;
}

// =============================================================================
// Tool Prompt Generation
// =============================================================================

/**
 * Format MCP tools for AI context prompt
 */
export function formatMcpToolsForPrompt(tools: McpToolWithServer[]): string {
  if (tools.length === 0) {
    return '';
  }

  const toolDescriptions = tools.map((tool) => {
    const toolKey = buildMcpToolKey(tool.serverName, tool.name);
    const params = tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '{}';
    return `- **${toolKey}** (from ${tool.serverName}): ${tool.description || 'No description'}
  Parameters: \`${params}\``;
  });

  return `
## Available MCP Tools
The following tools are available from connected MCP servers:

${toolDescriptions.join('\n\n')}

To use an MCP tool, call it by name with the appropriate arguments.
`;
}

/**
 * Create a summary of available tools for display
 */
export function createToolsSummary(tools: McpToolWithServer[]): string {
  if (tools.length === 0) {
    return 'No MCP tools available';
  }

  const grouped = groupToolsByServer(tools);
  const summaries: string[] = [];

  grouped.forEach((serverTools, serverId) => {
    if (serverTools.length > 0) {
      const serverName = serverTools[0].serverName;
      summaries.push(`${serverName}: ${serverTools.length} tool(s)`);
    }
  });

  return summaries.join(', ');
}

// =============================================================================
// Tool Validation
// =============================================================================

/**
 * Validate tool arguments against input schema
 * Returns null if valid, or an error message if invalid
 */
export function validateToolArguments(
  tool: McpTool,
  args: Record<string, unknown>
): string | null {
  const schema = tool.inputSchema;
  if (!schema) {
    // No schema means any input is valid
    return null;
  }

  // Basic validation - check required properties
  const required = (schema as any).required as string[] | undefined;
  if (required && Array.isArray(required)) {
    for (const prop of required) {
      if (!(prop in args)) {
        return `Missing required property: ${prop}`;
      }
    }
  }

  // Check property types
  const properties = (schema as any).properties as Record<string, any> | undefined;
  if (properties) {
    for (const [key, value] of Object.entries(args)) {
      const propSchema = properties[key];
      if (propSchema && propSchema.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (propSchema.type !== actualType && !(propSchema.type === 'integer' && typeof value === 'number')) {
          return `Property "${key}" should be of type ${propSchema.type}, got ${actualType}`;
        }
      }
    }
  }

  return null;
}

/**
 * Extract required properties from tool schema
 */
export function getRequiredProperties(tool: McpTool): string[] {
  const schema = tool.inputSchema;
  if (!schema) return [];
  return ((schema as any).required as string[]) || [];
}

/**
 * Check if a tool has any required parameters
 */
export function hasRequiredParameters(tool: McpTool): boolean {
  return getRequiredProperties(tool).length > 0;
}
