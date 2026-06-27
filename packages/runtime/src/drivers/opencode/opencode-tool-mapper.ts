import type {
  NormalizedToolCall,
  NormalizedToolResult,
  ToolCallMode,
} from '../../types/tool-call';

/**
 * Reference shape of an opencode `ToolPart` as it appears on the `tool_use` event from
 * `opencode run --format json` (faithful to
 * `ts/opencode/packages/opencode/src/session/message-v2.ts` + the SDK `ToolPart`).
 *
 * Type-only: we do NOT import opencode's Bun/Effect runtime — we describe the wire shape
 * we parse off stdout.
 */
export type OpenCodeToolState =
  | {
      status: 'pending' | 'running';
      input?: Record<string, unknown>;
      title?: string;
    }
  | {
      status: 'completed';
      input?: Record<string, unknown>;
      output?: string;
      title?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'error';
      input?: Record<string, unknown>;
      error?: string;
      title?: string;
      metadata?: Record<string, unknown>;
    };

export type OpenCodeToolPart = {
  type: 'tool';
  /** Tool invocation id, stable across call + result. */
  callID: string;
  /** Tool name, e.g. `bash`, `edit`, `write`, `read`, `webfetch`, `task`. */
  tool: string;
  state: OpenCodeToolState;
  metadata?: { providerExecuted?: boolean } & Record<string, unknown>;
};

/**
 * Best-effort classification of an opencode tool into policy `ToolCallMode`s. Drives the
 * work-lock / forbidden-path / network guards downstream. Conservative: when a tool is
 * unknown we mark it `custom` so the engine treats it cautiously rather than as a no-op.
 */
const READ_TOOLS = new Set(['read', 'grep', 'glob', 'list', 'ls', 'cat']);
const WRITE_TOOLS = new Set(['write', 'edit', 'patch', 'apply_patch', 'multiedit']);
const EXECUTE_TOOLS = new Set(['bash', 'shell', 'run', 'task', 'exec']);
const NETWORK_TOOLS = new Set(['webfetch', 'websearch', 'fetch', 'http', 'curl']);

export function classifyToolModes(toolName: string): readonly ToolCallMode[] {
  const name = toolName.toLowerCase();
  const modes: ToolCallMode[] = [];
  if (READ_TOOLS.has(name)) modes.push('read');
  if (WRITE_TOOLS.has(name)) modes.push('write');
  if (EXECUTE_TOOLS.has(name)) modes.push('execute');
  if (NETWORK_TOOLS.has(name)) modes.push('network');
  if (modes.length === 0) modes.push('custom');
  return modes;
}

/** Pull candidate file paths off a tool's input for forbidden/target-path guards. */
export function extractToolPaths(input?: Record<string, unknown>): readonly string[] | undefined {
  if (!input) return undefined;
  const candidates: string[] = [];
  for (const key of ['filePath', 'path', 'file', 'filename', 'target']) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) candidates.push(value);
  }
  // `edit`/`multiedit` may carry an array of edits each with a path.
  const edits = input['edits'];
  if (Array.isArray(edits)) {
    for (const edit of edits) {
      if (edit && typeof edit === 'object') {
        const p = (edit as Record<string, unknown>)['filePath'] ?? (edit as Record<string, unknown>)['path'];
        if (typeof p === 'string' && p.length > 0) candidates.push(p);
      }
    }
  }
  return candidates.length > 0 ? candidates : undefined;
}

/** Map an opencode `ToolPart` into a normalized tool call. */
export function toNormalizedToolCall(part: OpenCodeToolPart): NormalizedToolCall {
  const input = part.state.input;
  return {
    toolCallId: part.callID,
    toolName: part.tool,
    modes: classifyToolModes(part.tool),
    input,
    paths: extractToolPaths(input),
  };
}

/**
 * Map an opencode `ToolPart` in a terminal state (`completed`/`error`) into a normalized
 * tool result. Returns `null` for non-terminal states (pending/running) which carry no
 * result yet.
 */
export function toNormalizedToolResult(part: OpenCodeToolPart): NormalizedToolResult | null {
  if (part.state.status === 'completed') {
    return {
      toolCallId: part.callID,
      toolName: part.tool,
      ok: true,
      output: part.state.output,
    };
  }
  if (part.state.status === 'error') {
    return {
      toolCallId: part.callID,
      toolName: part.tool,
      ok: false,
      errorMessage: part.state.error ?? 'tool error',
    };
  }
  return null;
}
