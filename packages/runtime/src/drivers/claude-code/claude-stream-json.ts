import type { DriverFrame, DoneFrame } from '../../contracts/driver-frame';
import type { TokenUsage } from '../../types/usage';
import type { StopReason } from '../../types/stop-reason';
import type { RuntimeErrorCode } from '../../errors/error-codes';
import {
  mapClaudeToolUse,
  mapClaudeToolResult,
  type ClaudeToolUseBlock,
  type ClaudeToolResultBlock,
} from './claude-tool-mapper';

/**
 * Parse the Claude Code CLI's `--output-format stream-json` envelope into `DriverFrame`s.
 * This is the driver's only real job: native CLI output -> DriverFrame[]. The engine does
 * normalization, policy guards, terminal-guard, and sink fan-out.
 *
 * The CLI emits one JSON object per line. The known top-level event shapes are:
 *  - { type: 'system', subtype: 'init', ... }                 session start / capabilities
 *  - { type: 'assistant', message: { content: [...] }, ... }  assistant turn (text/thinking/tool_use)
 *  - { type: 'user', message: { content: [...] }, ... }       tool_result turns
 *  - { type: 'result', subtype, usage, total_cost_usd, ... }  THE terminal event
 *  - { type: 'stream_event', event: {...} }                   raw passthrough (ignored for framing)
 *
 * Parsing is intentionally defensive: unknown/extra fields are ignored, malformed shapes
 * become `log`/`error` frames (never thrown mid-stream), and only `result` produces a
 * terminal `done`.
 */

/** A loosely-typed Anthropic content block as it appears inside a stream-json message. */
type ContentBlock =
  | { type: 'text'; text?: string }
  | { type: 'thinking'; thinking?: string }
  | ({ type: 'tool_use' } & ClaudeToolUseBlock)
  | ({ type: 'tool_result' } & ClaudeToolResultBlock)
  | { type: string; [key: string]: unknown };

type StreamJsonEvent = {
  type?: string;
  subtype?: string;
  message?: { content?: ContentBlock[]; stop_reason?: string | null; usage?: RawUsage };
  usage?: RawUsage;
  total_cost_usd?: number;
  result?: unknown;
  is_error?: boolean;
  error?: unknown;
  session_id?: string;
  [key: string]: unknown;
};

type RawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  [key: string]: unknown;
};

/**
 * Translate a single parsed stream-json event into zero or more `DriverFrame`s.
 * Order is preserved; the engine consumes them as a flat stream.
 */
export function parseClaudeStreamJsonEvent(event: StreamJsonEvent): DriverFrame[] {
  switch (event.type) {
    case 'system':
      return parseSystemEvent(event);
    case 'assistant':
      return parseAssistantEvent(event);
    case 'user':
      return parseUserEvent(event);
    case 'result':
      return [parseResultEvent(event)];
    case 'stream_event':
      // Fine-grained deltas — not needed for framing (assistant events carry the full turn).
      return [];
    default:
      return [
        {
          kind: 'log',
          level: 'debug',
          message: `Unrecognized claude stream-json event: ${event.type ?? '<no type>'}`,
          data: { raw: event },
        },
      ];
  }
}

function parseSystemEvent(event: StreamJsonEvent): DriverFrame[] {
  const detail = event.subtype ? `system:${event.subtype}` : 'system';
  return [
    {
      kind: 'log',
      level: 'debug',
      message: `claude ${detail}`,
      data: event.session_id ? { sessionId: event.session_id } : undefined,
    },
  ];
}

function parseAssistantEvent(event: StreamJsonEvent): DriverFrame[] {
  const blocks = event.message?.content ?? [];
  const frames: DriverFrame[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        const text = (block as { text?: string }).text;
        if (typeof text === 'string' && text.length > 0) {
          frames.push({ kind: 'text', text });
        }
        break;
      }
      case 'thinking': {
        const thinking = (block as { thinking?: string }).thinking;
        if (typeof thinking === 'string' && thinking.length > 0) {
          frames.push({ kind: 'thinking', text: thinking });
        }
        break;
      }
      case 'tool_use': {
        frames.push({ kind: 'tool_call', toolCall: mapClaudeToolUse(block as ClaudeToolUseBlock) });
        break;
      }
      default:
        // redacted_thinking, server_tool_use, etc. — surface as a debug log, never drop silently.
        frames.push({
          kind: 'log',
          level: 'debug',
          message: `claude assistant block ignored: ${block.type}`,
        });
    }
  }

  // Incremental usage on the assistant turn folds into terminal completed.data.usage.
  const usage = normalizeUsage(event.message?.usage);
  if (usage) frames.push({ kind: 'usage', usage });

  return frames;
}

function parseUserEvent(event: StreamJsonEvent): DriverFrame[] {
  const blocks = event.message?.content ?? [];
  const frames: DriverFrame[] = [];

  for (const block of blocks) {
    if (block.type === 'tool_result') {
      frames.push({
        kind: 'tool_result',
        toolResult: mapClaudeToolResult(block as ClaudeToolResultBlock),
      });
    }
    // Text in a `user` event is an echoed prompt / system reminder — not run output.
  }

  return frames;
}

/** The Claude Code CLI `result` event is the single source of the terminal `done` frame. */
function parseResultEvent(event: StreamJsonEvent): DoneFrame {
  const usage = normalizeUsage(event.usage, event.total_cost_usd);
  const ok = event.is_error !== true && isSuccessSubtype(event.subtype);

  if (ok) {
    return {
      kind: 'done',
      ok: true,
      stopReason: mapStopReason(event.subtype, event.message?.stop_reason),
      finalText: typeof event.result === 'string' ? event.result : undefined,
      usage,
    };
  }

  const { code, retryable, message } = classifyResultFailure(event);
  return {
    kind: 'done',
    ok: false,
    stopReason: mapStopReason(event.subtype, event.message?.stop_reason),
    code,
    retryable,
    message,
    usage,
    data: { subtype: event.subtype },
  };
}

function isSuccessSubtype(subtype: string | undefined): boolean {
  return subtype === undefined || subtype === 'success';
}

function classifyResultFailure(event: StreamJsonEvent): {
  code: RuntimeErrorCode;
  retryable: boolean;
  message: string;
} {
  switch (event.subtype) {
    case 'error_max_turns':
      return { code: 'unknown', retryable: false, message: 'claude reached max turns' };
    case 'error_during_execution':
      return {
        code: 'unknown',
        retryable: false,
        message: extractErrorMessage(event) ?? 'claude errored during execution',
      };
    default:
      return {
        code: 'unknown',
        retryable: false,
        message: extractErrorMessage(event) ?? `claude result failed: ${event.subtype ?? 'unknown'}`,
      };
  }
}

function extractErrorMessage(event: StreamJsonEvent): string | undefined {
  if (typeof event.error === 'string') return event.error;
  if (typeof event.result === 'string') return event.result;
  return undefined;
}

function mapStopReason(
  subtype: string | undefined,
  anthropicStopReason: string | null | undefined,
): StopReason {
  if (subtype === 'error_max_turns') return 'max_steps';
  if (subtype && subtype.startsWith('error')) return 'error';

  switch (anthropicStopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'max_tokens':
      return 'max_steps';
    case 'refusal':
      return 'refusal';
    case 'tool_use':
      return 'end_turn';
    default:
      return isSuccessSubtype(subtype) ? 'end_turn' : 'unknown';
  }
}

/** Normalize Anthropic-shaped usage into the runtime's `TokenUsage`. Returns undefined if empty. */
export function normalizeUsage(raw: RawUsage | undefined, costUsd?: number): TokenUsage | undefined {
  if (!raw && costUsd === undefined) return undefined;
  const inputTokens = numberOrZero(raw?.input_tokens);
  const outputTokens = numberOrZero(raw?.output_tokens);
  const cacheReadTokens = optionalNumber(raw?.cache_read_input_tokens);
  const cacheWriteTokens = optionalNumber(raw?.cache_creation_input_tokens);

  const hasAny =
    inputTokens > 0 ||
    outputTokens > 0 ||
    cacheReadTokens !== undefined ||
    cacheWriteTokens !== undefined ||
    costUsd !== undefined;
  if (!hasAny) return undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd,
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
