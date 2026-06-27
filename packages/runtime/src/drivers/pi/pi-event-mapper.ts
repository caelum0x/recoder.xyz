/**
 * FUSION of `packages/pi-agent-core/src/agent-loop.ts` event semantics into the runtime's
 * `DriverFrame` model. The pi CLI emits `PiAgentSessionEvent` JSONL lines; this mapper is the
 * pure, deterministic `native output -> DriverFrame[]` translation the SPI requires. It owns
 * no IO and no timers, so it is fully testable offline against recorded fixtures.
 */

import type { DriverFrame } from '../../contracts/driver-frame';
import type { StopReason } from '../../types/stop-reason';
import type { TokenUsage } from '../../types/usage';
import type { NormalizedToolCall, ToolCallMode } from '../../types/tool-call';
import type { RuntimeErrorCode } from '../../errors/error-codes';
import type {
  PiAgentSessionEvent,
  PiAssistantMessage,
  PiAssistantMessageEvent,
  PiStopReason,
  PiToolCallContent,
  PiUsage,
} from './pi-wire-types';

/** Best-effort classification of a pi tool name into policy-relevant modes + touched paths. */
export function classifyToolCall(toolName: string, args: unknown): {
  modes: ToolCallMode[];
  paths?: string[];
} {
  const name = toolName.toLowerCase();
  const record = (args && typeof args === 'object' ? (args as Record<string, unknown>) : {}) ?? {};
  const paths = collectPaths(record);

  // Mirror pi's built-in tool surface (read_file, write_file, edit_file, bash, etc.).
  if (name.includes('write') || name.includes('edit') || name.includes('patch') || name.includes('apply')) {
    return { modes: ['write'], paths };
  }
  if (name.includes('bash') || name.includes('exec') || name.includes('shell') || name.includes('run')) {
    return { modes: ['execute'], paths };
  }
  if (name.includes('fetch') || name.includes('http') || name.includes('web') || name.includes('search')) {
    return { modes: ['network'], paths };
  }
  if (name.includes('read') || name.includes('list') || name.includes('grep') || name.includes('glob') || name.includes('cat')) {
    return { modes: ['read'], paths };
  }
  return { modes: ['custom'], paths };
}

function collectPaths(args: Record<string, unknown>): string[] | undefined {
  const candidates: string[] = [];
  for (const key of ['path', 'file', 'filePath', 'file_path', 'filename', 'target']) {
    const value = args[key];
    if (typeof value === 'string' && value.length > 0) candidates.push(value);
  }
  const list = args['paths'] ?? args['files'];
  if (Array.isArray(list)) {
    for (const value of list) {
      if (typeof value === 'string' && value.length > 0) candidates.push(value);
    }
  }
  return candidates.length > 0 ? candidates : undefined;
}

/** Fold pi-ai `Usage` into the runtime's normalized `TokenUsage`. */
export function mapUsage(usage: PiUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    totalTokens: usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0),
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    reasoningTokens: usage.reasoning,
    costUsd: usage.cost?.total,
  };
}

/** Map pi-ai `StopReason` to the runtime's unified `StopReason`. */
export function mapStopReason(reason: PiStopReason | undefined): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_steps';
    case 'aborted':
      return 'aborted';
    case 'error':
      return 'error';
    case 'toolUse':
      // A turn that ended on a tool call but reached our terminal boundary: treat as end_turn.
      return 'end_turn';
    default:
      return 'unknown';
  }
}

function toNormalizedToolCall(call: PiToolCallContent): NormalizedToolCall {
  const { modes, paths } = classifyToolCall(call.name, call.arguments);
  return {
    toolCallId: call.id,
    toolName: call.name,
    modes,
    input: call.arguments,
    paths,
  };
}

function assistantText(message: PiAssistantMessage): string {
  return message.content
    .filter((part): part is { type: 'text'; text: string; textSignature?: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** The terminal summary the host derives from an `agent_end` event. */
export type PiTerminalSummary = {
  ok: boolean;
  stopReason: StopReason;
  finalText?: string;
  usage?: TokenUsage;
  code?: RuntimeErrorCode;
  message?: string;
  willRetry: boolean;
};

/**
 * Translate a single pi session event into zero or more `DriverFrame`s.
 *
 * The terminal `done` frame is NOT emitted here — `agent_end` is surfaced via
 * `summarizeAgentEnd` so the host owns terminal synthesis (with retry semantics) and the
 * engine's exactly-one-terminal guarantee is respected.
 */
export function mapSessionEvent(event: PiAgentSessionEvent): DriverFrame[] {
  switch (event.type) {
    case 'agent_start':
      return [{ kind: 'state', state: 'running' }];

    case 'turn_start':
      return [];

    case 'message_update':
      return mapAssistantDelta(event.assistantMessageEvent);

    case 'message_start':
    case 'message_end':
    case 'turn_end':
      return [];

    case 'tool_execution_start': {
      const call: NormalizedToolCall = toNormalizedToolCall({
        type: 'toolCall',
        id: event.toolCallId,
        name: event.toolName,
        arguments: (event.args && typeof event.args === 'object' ? (event.args as Record<string, unknown>) : {}),
      });
      return [{ kind: 'tool_call', toolCall: call }];
    }

    case 'tool_execution_update':
      return [];

    case 'tool_execution_end':
      return [
        {
          kind: 'tool_result',
          toolResult: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            ok: !event.isError,
            output: event.result,
            errorMessage: event.isError ? stringifyResult(event.result) : undefined,
          },
        },
      ];

    case 'compaction_start':
      return [{ kind: 'log', message: `Compaction started (${event.reason}).`, level: 'info' }];

    case 'compaction_end':
      return [
        {
          kind: 'log',
          message: event.aborted
            ? `Compaction aborted (${event.reason}).`
            : `Compaction finished (${event.reason}).`,
          level: event.errorMessage ? 'warn' : 'info',
          data: event.errorMessage ? { errorMessage: event.errorMessage } : undefined,
        },
      ];

    case 'auto_retry_start':
      return [
        {
          kind: 'log',
          message: `Auto-retry ${event.attempt}/${event.maxAttempts} after ${event.delayMs}ms: ${event.errorMessage}`,
          level: 'warn',
        },
      ];

    case 'auto_retry_end':
      return [
        {
          kind: 'log',
          message: event.success
            ? `Auto-retry ${event.attempt} succeeded.`
            : `Auto-retry ${event.attempt} failed: ${event.finalError ?? 'unknown error'}`,
          level: event.success ? 'info' : 'warn',
        },
      ];

    case 'queue_update':
    case 'session_info_changed':
    case 'thinking_level_changed':
      return [];

    case 'agent_end':
      // Terminal: surfaced via summarizeAgentEnd, not emitted as a frame here.
      return [];

    default:
      return [];
  }
}

/** Map an inner assistant stream delta into text/thinking/tool_call frames. */
function mapAssistantDelta(delta: PiAssistantMessageEvent): DriverFrame[] {
  switch (delta.type) {
    case 'text_delta':
      return delta.delta.length > 0 ? [{ kind: 'text', text: delta.delta }] : [];
    case 'thinking_delta':
      return delta.delta.length > 0 ? [{ kind: 'thinking', text: delta.delta }] : [];
    case 'toolcall_end':
      return [{ kind: 'tool_call', toolCall: toNormalizedToolCall(delta.toolCall) }];
    case 'error':
      return [
        {
          kind: 'log',
          message: delta.error.errorMessage ?? `Assistant stream ${delta.reason}`,
          level: 'error',
        },
      ];
    default:
      return [];
  }
}

/**
 * Derive the terminal summary from an `agent_end` event. The final assistant message carries
 * the authoritative `stopReason`, `usage`, and `errorMessage`.
 */
export function summarizeAgentEnd(event: Extract<PiAgentSessionEvent, { type: 'agent_end' }>): PiTerminalSummary {
  const last = [...event.messages].reverse().find((m): m is PiAssistantMessage => m.role === 'assistant');
  const stopReason = mapStopReason(last?.stopReason);
  const failed = last?.stopReason === 'error' || last?.stopReason === 'aborted';

  return {
    ok: !failed,
    stopReason,
    finalText: last ? assistantText(last) || undefined : undefined,
    usage: mapUsage(last?.usage),
    code: failed ? (last?.stopReason === 'aborted' ? 'cancelled' : 'unknown') : undefined,
    message: failed ? last?.errorMessage : undefined,
    willRetry: event.willRetry === true,
  };
}

function stringifyResult(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}
