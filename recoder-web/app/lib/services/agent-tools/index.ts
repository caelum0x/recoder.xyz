/**
 * Agent Tools Index
 *
 * This module provides autonomous code modification tools with safety checks
 * that can be called by an AI agent. Tools are designed to be secure,
 * with path traversal protection and proper permission checking.
 *
 * Tools included:
 * - read_file: Read file contents
 * - write_file: Create or overwrite files
 * - edit_file: Smart edit with "existing code" markers
 * - search_replace: Targeted search/replace edits
 * - list_files: List directory contents
 * - grep: Search for patterns in code
 * - code_search: Semantic file search
 * - execute_sql: Run SQL queries
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Core types
  type AgentContext,
  type ToolDefinition,
  type ToolResult,
  type ToolExecutionResult,
  type AgentToolConsent,

  // Utilities
  escapeXmlAttr,
  unescapeXmlAttr,
  escapeXmlContent,
  unescapeXmlContent,
  parsePartialJson,
  normalizePath,
  isPathSafe,
  safeJoin,
} from './types';

// ============================================================================
// Read File Tool
// ============================================================================

export {
  readFileTool,
  readFile,
  readFiles,
  type ReadFileArgs,
} from './read-file';

// ============================================================================
// Write File Tool
// ============================================================================

export {
  writeFileTool,
  writeFile,
  writeFiles,
  type WriteFileArgs,
} from './write-file';

// ============================================================================
// Edit File Tool
// ============================================================================

export {
  editFileTool,
  editFile,
  applySmartEdit,
  type EditFileArgs,
} from './edit-file';

// ============================================================================
// Search Replace Tool
// ============================================================================

export {
  searchReplaceTool,
  searchReplace,
  applySearchReplace,
  applySingleSearchReplace,
  parseSearchReplaceBlocks,
  type SearchReplaceArgs,
  type SearchReplaceBlock,
  type ApplySearchReplaceResult,
} from './search-replace';

// ============================================================================
// List Files Tool
// ============================================================================

export {
  listFilesTool,
  listFiles,
  getFileTree,
  type ListFilesArgs,
  type FileEntry,
} from './list-files';

// ============================================================================
// Grep Tool
// ============================================================================

export {
  grepTool,
  grep,
  type GrepArgs,
  type GrepMatch,
} from './grep';

// ============================================================================
// Code Search Tool
// ============================================================================

export {
  codeSearchTool,
  codeSearch,
  type CodeSearchArgs,
} from './code-search';

// ============================================================================
// Execute SQL Tool
// ============================================================================

export {
  executeSqlTool,
  executeSql,
  selectQuery,
  mutationQuery,
  type ExecuteSqlArgs,
  type SqlResult,
} from './execute-sql';

// ============================================================================
// Tool Registry
// ============================================================================

import type { ToolDefinition, AgentContext } from './types';
import { readFileTool } from './read-file';
import { writeFileTool } from './write-file';
import { editFileTool } from './edit-file';
import { searchReplaceTool } from './search-replace';
import { listFilesTool } from './list-files';
import { grepTool } from './grep';
import { codeSearchTool } from './code-search';
import { executeSqlTool } from './execute-sql';

/**
 * All available agent tools
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: ToolDefinition<any>[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  searchReplaceTool,
  listFilesTool,
  grepTool,
  codeSearchTool,
  executeSqlTool,
];

/**
 * Get a tool by name
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTool(name: string): ToolDefinition<any> | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

/**
 * Get all tools that are enabled in the given context
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEnabledTools(ctx: AgentContext): ToolDefinition<any>[] {
  return ALL_TOOLS.filter((tool) => {
    if (tool.isEnabled && !tool.isEnabled(ctx)) {
      return false;
    }
    // Filter out state-modifying tools if not allowed
    if (tool.modifiesState && !ctx.canModify) {
      return false;
    }
    return true;
  });
}

/**
 * Get read-only tools (no state modification)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getReadOnlyTools(): ToolDefinition<any>[] {
  return ALL_TOOLS.filter((tool) => !tool.modifiesState);
}

/**
 * Get tools that modify state
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStateModifyingTools(): ToolDefinition<any>[] {
  return ALL_TOOLS.filter((tool) => tool.modifiesState);
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  args: unknown,
  ctx: AgentContext,
): Promise<string> {
  const tool = getTool(name);

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Check if tool is enabled
  if (tool.isEnabled && !tool.isEnabled(ctx)) {
    throw new Error(`Tool ${name} is not available in current context`);
  }

  // Check permissions for state-modifying tools
  if (tool.modifiesState && !ctx.canModify) {
    throw new Error(`Tool ${name} requires write permissions`);
  }

  // Validate arguments
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Invalid arguments for ${name}: ${errors.join(', ')}`);
  }

  // Execute the tool
  return tool.execute(parsed.data, ctx);
}

/**
 * Generate tool schemas for AI model function calling
 */
export function getToolSchemas(ctx?: AgentContext): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  const tools = ctx ? getEnabledTools(ctx) : ALL_TOOLS;

  return tools.map((tool) => {
    // Convert Zod schema to JSON Schema
    const zodSchema = tool.inputSchema;
    const shape = (zodSchema as any)._def?.shape?.() || {};

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const def = (value as any)._def;
      const isOptional = def?.typeName === 'ZodOptional';
      const innerDef = isOptional ? def?.innerType?._def : def;

      properties[key] = {
        type: getJsonType(innerDef?.typeName),
        description: innerDef?.description || def?.description || '',
      };

      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    };
  });
}

/**
 * Map Zod type to JSON Schema type
 */
function getJsonType(zodTypeName: string): string {
  switch (zodTypeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray':
      return 'array';
    case 'ZodObject':
      return 'object';
    default:
      return 'string';
  }
}

/**
 * Create an agent context with defaults
 */
export function createAgentContext(
  projectId: string,
  options?: Partial<AgentContext>,
): AgentContext {
  return {
    projectId,
    canModify: true,
    ...options,
  };
}
