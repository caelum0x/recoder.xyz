/**
 * Map codex tool/patch/command events into normalized `ToolCallFrame`/`ToolResultFrame`s.
 *
 * Codex expresses "tools" as a few distinct item kinds:
 *  - `command_execution`  — shell commands (modes: execute, network if not sandboxed)
 *  - `file_change`        — apply_patch diffs (modes: write; carries touched paths)
 *  - `mcp_tool_call`      — MCP server tool invocations (modes inferred from name)
 * plus the legacy msg-tagged equivalents (`exec_command_begin/end`, `patch_apply_*`).
 *
 * The `modes` + `paths` we attach here are what the engine's policy guards
 * (work-lock / forbidden-path / network) read, so classification is load-bearing:
 * a `file_change` MUST carry `'write'` and its paths, a `command_execution` MUST carry
 * `'execute'`. We classify conservatively (a write-bearing call never downgrades to read).
 */
import type { DriverFrame, ToolCallFrame, ToolResultFrame } from '../../contracts/driver-frame';
import type { NormalizedToolCall, ToolCallMode } from '../../types/tool-call';

type ItemPhase = 'item.started' | 'item.updated' | 'item.completed';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function itemId(item: Record<string, unknown>, fallback: string): string {
  return asString(item['id']) ?? asString(item['item_id']) ?? fallback;
}

function statusOk(item: Record<string, unknown>): boolean {
  const status = asString(item['status']);
  if (status === undefined) return true;
  return status === 'completed' || status === 'success' || status === 'ok';
}

/** Collect the file paths referenced by a `file_change` item's `changes` list. */
function collectChangePaths(item: Record<string, unknown>): string[] {
  const changes = item['changes'];
  const paths: string[] = [];
  if (Array.isArray(changes)) {
    for (const change of changes) {
      const record = asRecord(change);
      const path = asString(record?.['path']) ?? asString(change);
      if (path) paths.push(path);
    }
  }
  const single = asString(item['path']);
  if (single) paths.push(single);
  return [...new Set(paths)];
}

// ---------------------------------------------------------------------------
// Modern item-schema mappers
// ---------------------------------------------------------------------------

export function mapCommandExecution(phase: ItemPhase, item: Record<string, unknown>): DriverFrame[] {
  const toolCallId = itemId(item, 'codex_cmd');
  const command = asString(item['command']) ?? '';
  const modes: ToolCallMode[] = ['execute'];

  if (phase === 'item.started') {
    const call: NormalizedToolCall = {
      toolCallId,
      toolName: 'shell',
      modes,
      input: { command },
    };
    const frame: ToolCallFrame = { kind: 'tool_call', toolCall: call };
    return [frame];
  }

  if (phase === 'item.completed') {
    const result: ToolResultFrame = {
      kind: 'tool_result',
      toolResult: {
        toolCallId,
        toolName: 'shell',
        ok: statusOk(item),
        output: asString(item['aggregated_output']) ?? asString(item['output']),
        errorMessage: statusOk(item) ? undefined : asString(item['output']) ?? 'command failed',
      },
    };
    return [result];
  }

  return [];
}

export function mapFileChange(phase: ItemPhase, item: Record<string, unknown>): DriverFrame[] {
  const toolCallId = itemId(item, 'codex_patch');
  const paths = collectChangePaths(item);
  const modes: ToolCallMode[] = ['write'];

  if (phase === 'item.started') {
    const call: NormalizedToolCall = {
      toolCallId,
      toolName: 'apply_patch',
      modes,
      paths,
      input: { changes: item['changes'] },
    };
    return [{ kind: 'tool_call', toolCall: call }];
  }

  if (phase === 'item.completed') {
    return [
      {
        kind: 'tool_result',
        toolResult: {
          toolCallId,
          toolName: 'apply_patch',
          ok: statusOk(item),
          errorMessage: statusOk(item) ? undefined : 'patch failed',
        },
      },
    ];
  }

  return [];
}

/** MCP tool names are server-scoped; we classify network for unknown remote tools. */
function classifyMcpModes(toolName: string): ToolCallMode[] {
  const lower = toolName.toLowerCase();
  if (/(write|edit|create|delete|apply|patch|put|post)/.test(lower)) return ['write', 'network'];
  if (/(read|get|list|search|fetch|query)/.test(lower)) return ['read', 'network'];
  return ['network', 'custom'];
}

export function mapMcpToolCall(phase: ItemPhase, item: Record<string, unknown>): DriverFrame[] {
  const toolCallId = itemId(item, 'codex_mcp');
  const server = asString(item['server']) ?? asString(item['server_name']) ?? '';
  const tool = asString(item['tool']) ?? asString(item['tool_name']) ?? 'mcp_tool';
  const toolName = server ? `${server}.${tool}` : tool;

  if (phase === 'item.started') {
    const call: NormalizedToolCall = {
      toolCallId,
      toolName,
      modes: classifyMcpModes(tool),
      input: asRecord(item['arguments']) ?? asRecord(item['input']),
    };
    return [{ kind: 'tool_call', toolCall: call }];
  }

  if (phase === 'item.completed') {
    return [
      {
        kind: 'tool_result',
        toolResult: {
          toolCallId,
          toolName,
          ok: statusOk(item),
          output: item['result'] ?? item['output'],
          errorMessage: statusOk(item) ? undefined : asString(item['error']),
        },
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Legacy msg-tagged mappers
// ---------------------------------------------------------------------------

export function mapLegacyExecBegin(msg: Record<string, unknown>): DriverFrame[] {
  const toolCallId = asString(msg['call_id']) ?? asString(msg['id']) ?? 'codex_cmd';
  const commandValue = msg['command'];
  const command = Array.isArray(commandValue)
    ? commandValue.map((c) => String(c)).join(' ')
    : asString(commandValue) ?? '';
  const call: NormalizedToolCall = {
    toolCallId,
    toolName: 'shell',
    modes: ['execute'],
    input: { command, cwd: asString(msg['cwd']) },
  };
  return [{ kind: 'tool_call', toolCall: call }];
}

export function mapLegacyExecEnd(msg: Record<string, unknown>): DriverFrame[] {
  const toolCallId = asString(msg['call_id']) ?? asString(msg['id']) ?? 'codex_cmd';
  const exitCode = msg['exit_code'];
  const ok = typeof exitCode === 'number' ? exitCode === 0 : true;
  return [
    {
      kind: 'tool_result',
      toolResult: {
        toolCallId,
        toolName: 'shell',
        ok,
        output: asString(msg['stdout']),
        errorMessage: ok ? undefined : asString(msg['stderr']) ?? `exit ${String(exitCode)}`,
      },
    },
  ];
}

export function mapLegacyPatchApply(
  type: 'patch_apply_begin' | 'patch_apply_end',
  msg: Record<string, unknown>,
): DriverFrame[] {
  const toolCallId = asString(msg['call_id']) ?? asString(msg['id']) ?? 'codex_patch';
  const changes = asRecord(msg['changes']);
  const paths = changes ? Object.keys(changes) : [];

  if (type === 'patch_apply_begin') {
    const call: NormalizedToolCall = {
      toolCallId,
      toolName: 'apply_patch',
      modes: ['write'],
      paths,
      input: { changes: msg['changes'] },
    };
    return [{ kind: 'tool_call', toolCall: call }];
  }

  const success = msg['success'];
  const ok = typeof success === 'boolean' ? success : true;
  return [
    {
      kind: 'tool_result',
      toolResult: {
        toolCallId,
        toolName: 'apply_patch',
        ok,
        errorMessage: ok ? undefined : asString(msg['stderr']) ?? 'patch failed',
      },
    },
  ];
}
