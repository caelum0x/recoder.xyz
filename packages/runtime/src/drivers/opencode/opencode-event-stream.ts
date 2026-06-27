import type { DriverFrame } from '../../contracts/driver-frame';
import type { TokenUsage } from '../../types/usage';
import {
  toNormalizedToolCall,
  toNormalizedToolResult,
  type OpenCodeToolPart,
} from './opencode-tool-mapper';

/**
 * Parse the event stream produced by `opencode run --format json`.
 *
 * Faithful to `ts/opencode/packages/opencode/src/cli/cmd/run.ts` (the `emit()` + `loop()`
 * functions): in `--format json` mode opencode writes one JSON object per line to stdout
 * with the shape `{ type, timestamp, sessionID, ...data }`. The event `type`s emitted are:
 *
 *   - `text`         { part: TextPart }       assistant text (only when `part.time.end`)
 *   - `reasoning`    { part: ReasoningPart }  thinking text
 *   - `tool_use`     { part: ToolPart }       tool completed/error (status in part.state)
 *   - `step_start`   { part }                 model step boundary
 *   - `step_finish`  { part }                 model step boundary (may carry usage)
 *   - `error`        { error }                session error (non-terminal notice)
 *
 * Session idle (`session.status` → `idle`) ends the loop; in JSON mode that is signalled by
 * the stdout stream closing (process exit). The driver maps process exit → terminal frame,
 * so this parser emits only the non-terminal frames above.
 */
export type OpenCodeJsonEvent = {
  type: string;
  timestamp?: number;
  sessionID?: string;
  part?: OpenCodePart;
  error?: unknown;
};

export type OpenCodeTextPart = {
  type: 'text';
  text: string;
  time?: { start?: number; end?: number };
};

export type OpenCodeReasoningPart = {
  type: 'reasoning';
  text: string;
  time?: { start?: number; end?: number };
};

export type OpenCodeStepPart = {
  type: 'step-start' | 'step-finish';
  tokens?: { input?: number; output?: number; cache?: { read?: number; write?: number } };
  cost?: number;
};

export type OpenCodePart =
  | OpenCodeTextPart
  | OpenCodeReasoningPart
  | OpenCodeToolPart
  | OpenCodeStepPart
  | { type: string; [key: string]: unknown };

/**
 * Translate a single opencode JSON event into zero or more `DriverFrame`s.
 *
 * Pure + synchronous: the only job of the driver is `native CLI output -> DriverFrame[]`.
 * Never emits a terminal `done` frame — process exit owns the terminal (see driver).
 */
export function mapOpenCodeEvent(event: OpenCodeJsonEvent): DriverFrame[] {
  switch (event.type) {
    case 'text':
      return mapTextPart(event.part);
    case 'reasoning':
      return mapReasoningPart(event.part);
    case 'tool_use':
      return mapToolPart(event.part);
    case 'step_start':
      return [];
    case 'step_finish':
      return mapStepFinish(event.part);
    case 'error':
      return mapError(event.error);
    default:
      return [];
  }
}

function mapTextPart(part: OpenCodePart | undefined): DriverFrame[] {
  if (!part || part.type !== 'text') return [];
  const text = typeof part.text === 'string' ? part.text : '';
  if (text.trim().length === 0) return [];
  return [{ kind: 'text', text }];
}

function mapReasoningPart(part: OpenCodePart | undefined): DriverFrame[] {
  if (!part || part.type !== 'reasoning') return [];
  const text = typeof part.text === 'string' ? part.text : '';
  if (text.trim().length === 0) return [];
  return [{ kind: 'thinking', text }];
}

function mapToolPart(part: OpenCodePart | undefined): DriverFrame[] {
  if (!part || part.type !== 'tool') return [];
  const toolPart = part as OpenCodeToolPart;
  const frames: DriverFrame[] = [
    { kind: 'tool_call', toolCall: toNormalizedToolCall(toolPart) },
  ];
  const result = toNormalizedToolResult(toolPart);
  if (result) {
    frames.push({ kind: 'tool_result', toolResult: result });
  }
  return frames;
}

function mapStepFinish(part: OpenCodePart | undefined): DriverFrame[] {
  if (!part || part.type !== 'step-finish') return [];
  const usage = extractUsage(part as OpenCodeStepPart);
  return usage ? [{ kind: 'usage', usage }] : [];
}

function mapError(error: unknown): DriverFrame[] {
  return [
    {
      kind: 'error',
      message: stringifyError(error),
      data: isRecord(error) ? error : { error: String(error) },
    },
  ];
}

/** Extract an incremental usage record from a `step-finish` part, when present. */
export function extractUsage(part: OpenCodeStepPart): TokenUsage | undefined {
  const tokens = part.tokens;
  if (!tokens) return undefined;
  const inputTokens = tokens.input ?? 0;
  const outputTokens = tokens.output ?? 0;
  const cacheReadTokens = tokens.cache?.read;
  const cacheWriteTokens = tokens.cache?.write;
  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
  if (cacheReadTokens !== undefined) usage.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens !== undefined) usage.cacheWriteTokens = cacheWriteTokens;
  if (typeof part.cost === 'number') usage.costUsd = part.cost;
  return usage;
}

function stringifyError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (isRecord(error)) {
    const name = typeof error['name'] === 'string' ? error['name'] : undefined;
    const data = error['data'];
    if (isRecord(data) && typeof data['message'] === 'string') {
      return data['message'];
    }
    if (name) return name;
  }
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
