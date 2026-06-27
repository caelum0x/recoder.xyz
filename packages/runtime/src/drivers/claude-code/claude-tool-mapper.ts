import type { NormalizedToolCall, NormalizedToolResult, ToolCallMode } from '../../types/tool-call';

/**
 * Map the Claude Code CLI's native `tool_use` / `tool_result` content blocks into the
 * runtime's normalized shape so policy guards + events stay uniform across drivers.
 *
 * The classifier is best-effort: it inspects the tool name + input to decide whether a
 * call reads, writes, executes, or touches the network, and which paths it intends to
 * touch. `modes` drive the work-lock / forbidden-path guards; getting `write` right is the
 * important part (a misclassified write that slips past the guard is the failure we avoid).
 */

/** Native `tool_use` content block as emitted by Claude's stream-json. */
export type ClaudeToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input?: Record<string, unknown>;
};

/** Native `tool_result` content block (arrives inside a `user` event). */
export type ClaudeToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content?: unknown;
  is_error?: boolean;
};

/** Built-in Claude Code tools that write to the filesystem. */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
/** Built-in tools that read the filesystem (no mutation). */
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']);
/** Built-in tools that reach the network. */
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

/** Input keys commonly carrying a path argument across Claude's file tools. */
const PATH_INPUT_KEYS = ['file_path', 'path', 'notebook_path', 'filePath'];

export function mapClaudeToolUse(block: ClaudeToolUseBlock): NormalizedToolCall {
  const input = block.input ?? undefined;
  return {
    toolCallId: block.id,
    toolName: block.name,
    modes: classifyToolModes(block.name, input),
    input,
    paths: extractPaths(block.name, input),
  };
}

export function mapClaudeToolResult(block: ClaudeToolResultBlock): NormalizedToolResult {
  const ok = block.is_error !== true;
  return {
    toolCallId: block.tool_use_id,
    toolName: '',
    ok,
    output: block.content,
    errorMessage: ok ? undefined : stringifyContent(block.content),
  };
}

function classifyToolModes(
  name: string,
  input: Record<string, unknown> | undefined,
): ToolCallMode[] {
  const modes: ToolCallMode[] = [];
  if (WRITE_TOOLS.has(name)) modes.push('write');
  if (READ_TOOLS.has(name)) modes.push('read');
  if (NETWORK_TOOLS.has(name)) modes.push('network');

  if (name === 'Bash' || name === 'BashOutput' || name === 'KillBash') {
    modes.push('execute');
    // A bash command can write or hit the network; the guards must see those intents.
    const command = typeof input?.['command'] === 'string' ? (input['command'] as string) : '';
    if (commandLooksWriteBearing(command)) modes.push('write');
    if (commandLooksNetworkBearing(command)) modes.push('network');
  }

  // MCP / custom tools (e.g. `mcp__server__tool`) cannot be classified statically.
  if (modes.length === 0) modes.push('custom');
  return dedupe(modes);
}

function extractPaths(
  name: string,
  input: Record<string, unknown> | undefined,
): readonly string[] | undefined {
  if (!input) return undefined;
  const paths: string[] = [];
  for (const key of PATH_INPUT_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) paths.push(value);
  }
  // MultiEdit carries a single file_path; Edit/Write likewise — already covered above.
  return paths.length > 0 ? dedupe(paths) : undefined;
}

const WRITE_COMMAND_PATTERN =
  /(^|[\s;&|])(rm|mv|cp|touch|mkdir|tee|dd|chmod|chown|ln|truncate)\b|>>?|sed\s+-i|git\s+(commit|push|add|checkout|reset|rebase|merge)/;
const NETWORK_COMMAND_PATTERN =
  /(^|[\s;&|])(curl|wget|nc|ncat|ssh|scp|rsync|npm|pnpm|yarn|pip|apt|apt-get|brew|git\s+(clone|fetch|pull|push))\b/;

function commandLooksWriteBearing(command: string): boolean {
  return WRITE_COMMAND_PATTERN.test(command);
}

function commandLooksNetworkBearing(command: string): boolean {
  return NETWORK_COMMAND_PATTERN.test(command);
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content === undefined || content === null) return 'tool execution failed';
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
