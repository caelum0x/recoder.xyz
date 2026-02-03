/**
 * Tool Execution Framework
 * Copied from Kilocode - Provides a unified tool abstraction with
 * typed parameters, streaming support, and approval workflows
 */

import { z } from 'zod';
import { atom, map, computed } from 'nanostores';

// Re-export parseXmlToolCalls from assistant-parser for convenience
export { parseXmlToolCalls } from '~/lib/services/assistant-parser';

// =============================================================================
// Tool Protocol Types
// =============================================================================

export type ToolProtocol = 'xml' | 'native';

export const ToolNameSchema = z.enum([
  // File operations
  'read_file',
  'write_file',
  'edit_file',
  'delete_file',
  'list_files',
  'search_files',

  // Code operations
  'apply_diff',
  'multi_apply_diff',
  'search_replace',

  // System operations
  'execute_command',
  'browser_action',

  // Workflow operations
  'new_task',
  'attempt_completion',
  'update_todo',

  // MCP operations
  'use_mcp_tool',
  'access_mcp_resource',
]);

export type ToolName = z.infer<typeof ToolNameSchema>;

// =============================================================================
// Tool Parameter Schemas
// =============================================================================

export const ReadFileParamsSchema = z.object({
  path: z.string(),
  start_line: z.number().optional(),
  end_line: z.number().optional(),
});

export const WriteFileParamsSchema = z.object({
  path: z.string(),
  content: z.string(),
  create_dirs: z.boolean().optional(),
});

export const EditFileParamsSchema = z.object({
  path: z.string(),
  old_text: z.string(),
  new_text: z.string(),
});

export const DeleteFileParamsSchema = z.object({
  path: z.string(),
});

export const ListFilesParamsSchema = z.object({
  path: z.string(),
  recursive: z.boolean().optional(),
  pattern: z.string().optional(),
});

export const SearchFilesParamsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  file_pattern: z.string().optional(),
  case_sensitive: z.boolean().optional(),
});

export const ApplyDiffParamsSchema = z.object({
  path: z.string(),
  diff: z.string(),
});

export const MultiApplyDiffParamsSchema = z.object({
  diffs: z.array(z.object({
    path: z.string(),
    diff: z.string(),
  })),
});

export const SearchReplaceParamsSchema = z.object({
  path: z.string(),
  search: z.string(),
  replace: z.string(),
  start_line: z.number().optional(),
});

export const ExecuteCommandParamsSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  timeout: z.number().optional(),
});

export const BrowserActionParamsSchema = z.object({
  action: z.enum(['launch', 'navigate', 'click', 'type', 'screenshot', 'close']),
  url: z.string().optional(),
  selector: z.string().optional(),
  text: z.string().optional(),
});

export const NewTaskParamsSchema = z.object({
  description: z.string(),
  mode: z.string().optional(),
});

export const AttemptCompletionParamsSchema = z.object({
  result: z.string(),
  command: z.string().optional(),
});

export const UpdateTodoParamsSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    description: z.string().optional(),
  })),
});

export const UseMcpToolParamsSchema = z.object({
  server_name: z.string(),
  tool_name: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

export const AccessMcpResourceParamsSchema = z.object({
  server_name: z.string(),
  resource_uri: z.string(),
});

// Parameter type map
export const ToolParamsSchemas = {
  read_file: ReadFileParamsSchema,
  write_file: WriteFileParamsSchema,
  edit_file: EditFileParamsSchema,
  delete_file: DeleteFileParamsSchema,
  list_files: ListFilesParamsSchema,
  search_files: SearchFilesParamsSchema,
  apply_diff: ApplyDiffParamsSchema,
  multi_apply_diff: MultiApplyDiffParamsSchema,
  search_replace: SearchReplaceParamsSchema,
  execute_command: ExecuteCommandParamsSchema,
  browser_action: BrowserActionParamsSchema,
  new_task: NewTaskParamsSchema,
  attempt_completion: AttemptCompletionParamsSchema,
  update_todo: UpdateTodoParamsSchema,
  use_mcp_tool: UseMcpToolParamsSchema,
  access_mcp_resource: AccessMcpResourceParamsSchema,
} as const;

// =============================================================================
// Tool Types
// =============================================================================

export type ToolParams<T extends ToolName> = z.infer<typeof ToolParamsSchemas[T]>;

export interface ToolUse<T extends ToolName = ToolName> {
  id: string;
  name: T;
  params: ToolParams<T>;
  partial?: boolean;
  rawContent?: string;
}

export interface ToolResult {
  toolUseId: string;
  success: boolean;
  content: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallbacks {
  askApproval: (toolUse: ToolUse, message: string) => Promise<boolean>;
  handleError: (toolUse: ToolUse, error: Error) => void;
  pushToolResult: (result: ToolResult) => void;
  onPartialUpdate?: (toolUse: ToolUse, partialContent: string) => void;
}

export interface ToolDefinition<T extends ToolName = ToolName> {
  name: T;
  description: string;
  parameters: typeof ToolParamsSchemas[T];
  requiresApproval: boolean;
  category: 'file' | 'code' | 'system' | 'workflow' | 'mcp';
}

// =============================================================================
// Tool Execution State
// =============================================================================

export const ToolExecutionStatusSchema = z.enum([
  'pending',
  'awaiting_approval',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type ToolExecutionStatus = z.infer<typeof ToolExecutionStatusSchema>;

export interface ToolExecution {
  id: string;
  toolUse: ToolUse;
  status: ToolExecutionStatus;
  startedAt: string;
  completedAt?: string;
  result?: ToolResult;
  approvalRequired: boolean;
  approvalGranted?: boolean;
}

export const toolExecutionsStore = map<Record<string, ToolExecution>>({});
export const pendingApproval = atom<ToolUse | null>(null);
export const consecutiveMistakes = atom<number>(0);
export const toolErrors = map<Record<string, string[]>>({});

// =============================================================================
// Tool Definitions
// =============================================================================

export const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path',
    parameters: ReadFileParamsSchema,
    requiresApproval: false,
    category: 'file',
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file, creating directories if needed',
    parameters: WriteFileParamsSchema,
    requiresApproval: true,
    category: 'file',
  },
  edit_file: {
    name: 'edit_file',
    description: 'Edit a file by replacing old text with new text',
    parameters: EditFileParamsSchema,
    requiresApproval: true,
    category: 'file',
  },
  delete_file: {
    name: 'delete_file',
    description: 'Delete a file at the given path',
    parameters: DeleteFileParamsSchema,
    requiresApproval: true,
    category: 'file',
  },
  list_files: {
    name: 'list_files',
    description: 'List files in a directory',
    parameters: ListFilesParamsSchema,
    requiresApproval: false,
    category: 'file',
  },
  search_files: {
    name: 'search_files',
    description: 'Search for a pattern in files',
    parameters: SearchFilesParamsSchema,
    requiresApproval: false,
    category: 'file',
  },
  apply_diff: {
    name: 'apply_diff',
    description: 'Apply a diff to a file',
    parameters: ApplyDiffParamsSchema,
    requiresApproval: true,
    category: 'code',
  },
  multi_apply_diff: {
    name: 'multi_apply_diff',
    description: 'Apply diffs to multiple files atomically',
    parameters: MultiApplyDiffParamsSchema,
    requiresApproval: true,
    category: 'code',
  },
  search_replace: {
    name: 'search_replace',
    description: 'Search and replace text in a file',
    parameters: SearchReplaceParamsSchema,
    requiresApproval: true,
    category: 'code',
  },
  execute_command: {
    name: 'execute_command',
    description: 'Execute a shell command',
    parameters: ExecuteCommandParamsSchema,
    requiresApproval: true,
    category: 'system',
  },
  browser_action: {
    name: 'browser_action',
    description: 'Perform a browser automation action',
    parameters: BrowserActionParamsSchema,
    requiresApproval: true,
    category: 'system',
  },
  new_task: {
    name: 'new_task',
    description: 'Create a new task or subtask',
    parameters: NewTaskParamsSchema,
    requiresApproval: false,
    category: 'workflow',
  },
  attempt_completion: {
    name: 'attempt_completion',
    description: 'Attempt to complete the current task',
    parameters: AttemptCompletionParamsSchema,
    requiresApproval: false,
    category: 'workflow',
  },
  update_todo: {
    name: 'update_todo',
    description: 'Update todo list items',
    parameters: UpdateTodoParamsSchema,
    requiresApproval: false,
    category: 'workflow',
  },
  use_mcp_tool: {
    name: 'use_mcp_tool',
    description: 'Execute an MCP server tool',
    parameters: UseMcpToolParamsSchema,
    requiresApproval: true,
    category: 'mcp',
  },
  access_mcp_resource: {
    name: 'access_mcp_resource',
    description: 'Access an MCP server resource',
    parameters: AccessMcpResourceParamsSchema,
    requiresApproval: false,
    category: 'mcp',
  },
};

// =============================================================================
// Tool Validation
// =============================================================================

/**
 * Validate tool use parameters
 */
export function validateToolUse<T extends ToolName>(
  toolUse: ToolUse<T>
): { valid: true } | { valid: false; error: string } {
  const definition = TOOL_DEFINITIONS[toolUse.name];
  if (!definition) {
    return { valid: false, error: `Unknown tool: ${toolUse.name}` };
  }

  const schema = ToolParamsSchemas[toolUse.name];
  const result = schema.safeParse(toolUse.params);

  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return { valid: false, error: `Invalid parameters: ${errors.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Check if tool requires approval
 */
export function requiresApproval(toolName: ToolName): boolean {
  return TOOL_DEFINITIONS[toolName]?.requiresApproval ?? true;
}

// =============================================================================
// Tool Execution Management
// =============================================================================

/**
 * Create a tool execution ID
 */
export function createToolExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Start a tool execution
 */
export function startToolExecution<T extends ToolName>(
  toolUse: ToolUse<T>
): ToolExecution {
  const id = createToolExecutionId();
  const needsApproval = requiresApproval(toolUse.name);

  const execution: ToolExecution = {
    id,
    toolUse,
    status: needsApproval ? 'awaiting_approval' : 'running',
    startedAt: new Date().toISOString(),
    approvalRequired: needsApproval,
  };

  toolExecutionsStore.setKey(id, execution);

  if (needsApproval) {
    pendingApproval.set(toolUse);
  }

  return execution;
}

/**
 * Grant approval for a tool execution
 */
export function grantApproval(executionId: string): void {
  const execution = toolExecutionsStore.get()[executionId];
  if (!execution) return;

  toolExecutionsStore.setKey(executionId, {
    ...execution,
    status: 'running',
    approvalGranted: true,
  });

  if (pendingApproval.get()?.id === execution.toolUse.id) {
    pendingApproval.set(null);
  }
}

/**
 * Deny approval for a tool execution
 */
export function denyApproval(executionId: string): void {
  const execution = toolExecutionsStore.get()[executionId];
  if (!execution) return;

  toolExecutionsStore.setKey(executionId, {
    ...execution,
    status: 'cancelled',
    approvalGranted: false,
    completedAt: new Date().toISOString(),
  });

  if (pendingApproval.get()?.id === execution.toolUse.id) {
    pendingApproval.set(null);
  }
}

/**
 * Complete a tool execution
 */
export function completeToolExecution(
  executionId: string,
  result: ToolResult
): void {
  const execution = toolExecutionsStore.get()[executionId];
  if (!execution) return;

  toolExecutionsStore.setKey(executionId, {
    ...execution,
    status: result.success ? 'completed' : 'failed',
    completedAt: new Date().toISOString(),
    result,
  });

  // Track consecutive mistakes
  if (!result.success) {
    consecutiveMistakes.set(consecutiveMistakes.get() + 1);

    // Track errors by tool
    const errors = toolErrors.get()[execution.toolUse.name] || [];
    errors.push(result.error || 'Unknown error');
    toolErrors.setKey(execution.toolUse.name, errors.slice(-10)); // Keep last 10 errors
  } else {
    consecutiveMistakes.set(0);
  }
}

/**
 * Get tool execution by ID
 */
export function getToolExecution(id: string): ToolExecution | undefined {
  return toolExecutionsStore.get()[id];
}

/**
 * Get all pending tool executions
 */
export function getPendingExecutions(): ToolExecution[] {
  return Object.values(toolExecutionsStore.get()).filter(
    e => e?.status === 'pending' || e?.status === 'awaiting_approval'
  ) as ToolExecution[];
}

// =============================================================================
// Tool Repetition Detection
// =============================================================================

interface ToolRepetition {
  toolName: ToolName;
  paramsHash: string;
  count: number;
  lastSeen: string;
}

const toolRepetitions = map<Record<string, ToolRepetition>>({});

/**
 * Hash tool parameters for repetition detection
 */
function hashParams(params: unknown): string {
  return JSON.stringify(params);
}

/**
 * Check if a tool call is being repeated excessively
 */
export function detectRepetition(toolUse: ToolUse): {
  isRepetition: boolean;
  count: number;
  shouldWarn: boolean;
  shouldBlock: boolean;
} {
  const paramsHash = hashParams(toolUse.params);
  const key = `${toolUse.name}:${paramsHash}`;
  const existing = toolRepetitions.get()[key];

  if (!existing) {
    toolRepetitions.setKey(key, {
      toolName: toolUse.name,
      paramsHash,
      count: 1,
      lastSeen: new Date().toISOString(),
    });
    return { isRepetition: false, count: 1, shouldWarn: false, shouldBlock: false };
  }

  const newCount = existing.count + 1;
  toolRepetitions.setKey(key, {
    ...existing,
    count: newCount,
    lastSeen: new Date().toISOString(),
  });

  return {
    isRepetition: true,
    count: newCount,
    shouldWarn: newCount >= 3,
    shouldBlock: newCount >= 5,
  };
}

/**
 * Clear repetition tracking
 */
export function clearRepetitionTracking(): void {
  toolRepetitions.set({});
}

// =============================================================================
// XML Tool Parsing
// =============================================================================

/**
 * Parse XML tool use from assistant message
 */
export function parseXmlToolUse(content: string): ToolUse[] {
  const toolUses: ToolUse[] = [];

  // Match tool use blocks: <tool_name>params</tool_name>
  const toolRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = toolRegex.exec(content)) !== null) {
    const [_, tagName, innerContent] = match;
    const toolName = tagName as ToolName;

    if (!ToolNameSchema.safeParse(toolName).success) {
      continue; // Not a valid tool
    }

    // Parse parameters from inner content
    const params: Record<string, string> = {};
    const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(innerContent)) !== null) {
      const [_, paramName, paramValue] = paramMatch;
      params[paramName] = paramValue.trim();
    }

    toolUses.push({
      id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: toolName,
      params: params as unknown as ToolParams<typeof toolName>,
    });
  }

  return toolUses;
}

/**
 * Remove closing tag from partial content (for streaming)
 */
export function removeClosingTag(content: string, tagName: string): string {
  const closingTag = `</${tagName}>`;
  const lastIndex = content.lastIndexOf(closingTag);
  if (lastIndex !== -1 && lastIndex > content.length - closingTag.length - 10) {
    return content.slice(0, lastIndex);
  }
  return content;
}

// =============================================================================
// Native Tool Format
// =============================================================================

/**
 * Convert tool definition to native format (for AI providers)
 */
export function toNativeToolFormat(definition: ToolDefinition): {
  name: string;
  description: string;
  input_schema: unknown;
} {
  const schema = ToolParamsSchemas[definition.name];

  // Convert Zod schema to JSON Schema
  const jsonSchema = zodToJsonSchema(schema);

  return {
    name: definition.name,
    description: definition.description,
    input_schema: jsonSchema,
  };
}

/**
 * Get all tools in native format
 */
export function getAllNativeTools(): Array<{
  name: string;
  description: string;
  input_schema: unknown;
}> {
  return Object.values(TOOL_DEFINITIONS).map(toNativeToolFormat);
}

/**
 * Simple Zod to JSON Schema converter
 */
function zodToJsonSchema(schema: z.ZodType): unknown {
  // This is a simplified converter - in production, use zod-to-json-schema
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      if (!(value as z.ZodType).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema._def.values,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema._def.valueType),
    };
  }

  return { type: 'string' }; // Fallback
}
