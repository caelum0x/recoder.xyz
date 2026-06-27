/**
 * Parser for the `codex exec --json` event stream.
 *
 * Codex emits one JSON object per line (JSONL) on stdout. There are two shapes in the
 * wild and this parser handles both faithfully:
 *
 *  1. The modern thread/turn/item schema:
 *       { "type": "thread.started", "thread_id": "..." }
 *       { "type": "turn.started" }
 *       { "type": "item.started"|"item.updated"|"item.completed", "item": { ... } }
 *       { "type": "turn.completed", "usage": { ... } }
 *       { "type": "turn.failed", "error": { "message": "..." } }
 *       { "type": "error", "message": "..." }
 *     Item types: `agent_message`, `reasoning`, `command_execution`, `file_change`,
 *     `mcp_tool_call`, `web_search`, `todo_list`, `error`.
 *
 *  2. The legacy msg-tagged protocol:
 *       { "id": "...", "msg": { "type": "agent_message", "message": "..." } }
 *       { "id": "...", "msg": { "type": "agent_reasoning", "text": "..." } }
 *       { "id": "...", "msg": { "type": "exec_command_begin", ... } }
 *       { "id": "...", "msg": { "type": "task_complete", ... } }
 *       { "id": "...", "msg": { "type": "error", "message": "..." } }
 *
 * The parser is a pure function: one raw codex event object -> zero or more
 * `DriverFrame`s. It owns no IO; `codex-driver.ts` feeds it lines read by the shared
 * JSONL reader and forwards the resulting frames. This keeps it deterministic and
 * trivially testable against recorded fixtures.
 */
import type { DriverFrame } from '../../contracts/driver-frame';
import type { StopReason } from '../../types/stop-reason';
import type { TokenUsage } from '../../types/usage';
import { emptyTokenUsage } from '../../types/usage';
import {
  mapCommandExecution,
  mapFileChange,
  mapMcpToolCall,
  mapLegacyExecBegin,
  mapLegacyExecEnd,
  mapLegacyPatchApply,
} from './codex-tool-mapper';

export type CodexRawEvent = Record<string, unknown>;

/** Mutable parse state threaded across lines (final text, last usage, thread id). */
export type CodexParseState = {
  finalText: string;
  usage: TokenUsage;
  threadId?: string;
  /** Set once a terminal codex event (turn.completed/failed, task_complete, error) is seen. */
  terminal?: { ok: boolean; stopReason: StopReason; message?: string };
};

export function createCodexParseState(): CodexParseState {
  return { finalText: '', usage: emptyTokenUsage() };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseUsage(raw: Record<string, unknown> | undefined): TokenUsage | undefined {
  if (!raw) return undefined;
  const num = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return undefined;
  };
  const inputTokens = num('input_tokens', 'inputTokens', 'prompt_tokens') ?? 0;
  const outputTokens = num('output_tokens', 'outputTokens', 'completion_tokens') ?? 0;
  const totalTokens =
    num('total_tokens', 'totalTokens') ?? inputTokens + outputTokens;
  const usage: TokenUsage = { inputTokens, outputTokens, totalTokens };
  const cacheRead = num('cached_input_tokens', 'cache_read_tokens', 'cacheReadTokens');
  if (cacheRead !== undefined) usage.cacheReadTokens = cacheRead;
  const reasoning = num('reasoning_output_tokens', 'reasoning_tokens', 'reasoningTokens');
  if (reasoning !== undefined) usage.reasoningTokens = reasoning;
  const cost = num('cost_usd', 'costUsd');
  if (cost !== undefined) usage.costUsd = cost;
  return usage;
}

/** Translate ONE raw codex event into zero or more DriverFrames, mutating parse state. */
export function parseCodexEvent(event: CodexRawEvent, state: CodexParseState): DriverFrame[] {
  const modernType = asString(event['type']);
  if (modernType) {
    return parseModernEvent(modernType, event, state);
  }

  const msg = asRecord(event['msg']);
  if (msg) {
    return parseLegacyEvent(msg, state);
  }

  // Unknown shape: surface as a debug log rather than silently dropping.
  return [{ kind: 'log', message: 'codex: unrecognized event', level: 'debug', data: { event } }];
}

function parseModernEvent(
  type: string,
  event: CodexRawEvent,
  state: CodexParseState,
): DriverFrame[] {
  switch (type) {
    case 'thread.started': {
      const threadId = asString(event['thread_id']) ?? asString(event['threadId']);
      if (threadId) state.threadId = threadId;
      return [{ kind: 'state', state: 'running', message: 'codex thread started' }];
    }
    case 'turn.started':
      return [];
    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      return parseItem(type, asRecord(event['item']), state);
    case 'turn.completed': {
      const usage = parseUsage(asRecord(event['usage']));
      const frames: DriverFrame[] = [];
      if (usage) {
        state.usage = usage;
        frames.push({ kind: 'usage', usage });
      }
      state.terminal = { ok: true, stopReason: 'end_turn' };
      return frames;
    }
    case 'turn.failed': {
      const error = asRecord(event['error']);
      const message = asString(error?.['message']) ?? 'codex turn failed';
      state.terminal = { ok: false, stopReason: 'error', message };
      return [{ kind: 'error', message, code: 'parse_error', retryable: false }];
    }
    case 'error': {
      const message = asString(event['message']) ?? 'codex error';
      state.terminal = { ok: false, stopReason: 'error', message };
      return [{ kind: 'error', message, retryable: false }];
    }
    default:
      return [{ kind: 'log', message: `codex: ${type}`, level: 'debug', data: { event } }];
  }
}

function parseItem(
  phase: 'item.started' | 'item.updated' | 'item.completed',
  item: Record<string, unknown> | undefined,
  state: CodexParseState,
): DriverFrame[] {
  if (!item) return [];
  const itemType = asString(item['item_type']) ?? asString(item['type']);

  switch (itemType) {
    case 'agent_message': {
      const text = asString(item['text']) ?? asString(item['message']) ?? '';
      if (text.length === 0) return [];
      // Only fold completed messages into finalText to avoid double-counting deltas.
      if (phase === 'item.completed') state.finalText = text;
      return [{ kind: 'text', text }];
    }
    case 'reasoning': {
      const text = asString(item['text']) ?? '';
      return text.length > 0 ? [{ kind: 'thinking', text }] : [];
    }
    case 'command_execution':
      return mapCommandExecution(phase, item);
    case 'file_change':
      return mapFileChange(phase, item);
    case 'mcp_tool_call':
      return mapMcpToolCall(phase, item);
    case 'todo_list': {
      return [
        {
          kind: 'log',
          message: 'codex todo_list updated',
          level: 'info',
          data: { item },
        },
      ];
    }
    case 'web_search': {
      const query = asString(item['query']) ?? '';
      return [
        { kind: 'log', message: `codex web_search: ${query}`, level: 'info', data: { item } },
      ];
    }
    case 'error': {
      const message = asString(item['text']) ?? asString(item['message']) ?? 'codex item error';
      return [{ kind: 'error', message, retryable: false }];
    }
    default:
      return [
        { kind: 'log', message: `codex item ${itemType ?? 'unknown'}`, level: 'debug', data: { item } },
      ];
  }
}

function parseLegacyEvent(
  msg: Record<string, unknown>,
  state: CodexParseState,
): DriverFrame[] {
  const type = asString(msg['type']);
  switch (type) {
    case 'agent_message':
    case 'agent_message_delta': {
      const text = asString(msg['message']) ?? asString(msg['delta']) ?? '';
      if (text.length === 0) return [];
      if (type === 'agent_message') state.finalText = text;
      return [{ kind: 'text', text }];
    }
    case 'agent_reasoning':
    case 'agent_reasoning_delta': {
      const text = asString(msg['text']) ?? asString(msg['delta']) ?? '';
      return text.length > 0 ? [{ kind: 'thinking', text }] : [];
    }
    case 'exec_command_begin':
      return mapLegacyExecBegin(msg);
    case 'exec_command_end':
      return mapLegacyExecEnd(msg);
    case 'patch_apply_begin':
    case 'patch_apply_end':
      return mapLegacyPatchApply(type, msg);
    case 'token_count': {
      const usage = parseUsage(asRecord(msg['info']) ?? msg);
      if (!usage) return [];
      state.usage = usage;
      return [{ kind: 'usage', usage }];
    }
    case 'task_complete': {
      const text = asString(msg['last_agent_message']);
      if (text) state.finalText = text;
      state.terminal = { ok: true, stopReason: 'end_turn' };
      return [];
    }
    case 'error': {
      const message = asString(msg['message']) ?? 'codex error';
      state.terminal = { ok: false, stopReason: 'error', message };
      return [{ kind: 'error', message, retryable: false }];
    }
    default:
      return [{ kind: 'log', message: `codex msg ${type ?? 'unknown'}`, level: 'debug', data: { msg } }];
  }
}
