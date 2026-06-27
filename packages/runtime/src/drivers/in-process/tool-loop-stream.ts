import type { TextStreamPart, ToolSet } from 'ai';
import type { DriverFrame } from '../../contracts/driver-frame';
import type { StopReason } from '../../types/stop-reason';
import type { TokenUsage } from '../../types/usage';
import { emptyTokenUsage } from '../../types/usage';
import { classifyToolModes, extractToolPaths } from './tool-loop-tools';

/**
 * Fusion core: consume the `ToolLoopAgent`/`streamText` `fullStream` and translate each
 * native `TextStreamPart` into a `DriverFrame`. This is the in-process analog of the
 * `*-event-stream.ts` translators in the CLI drivers — the driver's ONLY job is
 * native output -> DriverFrame[]; the engine does normalization, policy guards, and
 * terminal handling.
 *
 * The `ai@5` v5 stream is the same shape `ToolLoopAgent.stream({...}).fullStream` exposes.
 * We map:
 *   text-delta        -> text
 *   reasoning-delta   -> thinking
 *   tool-call         -> tool_call  (modes/paths classified for policy guards)
 *   tool-result       -> tool_result (ok: true)
 *   tool-error        -> tool_result (ok: false) + non-terminal error frame
 *   error             -> error      (non-terminal notice)
 *   finish            -> usage (folded) ; the terminal `done` is emitted by the driver
 */

/** Map a v5 `FinishReason` onto the runtime's unified `StopReason`. */
export function mapFinishReason(reason: string | undefined): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_steps';
    case 'tool-calls':
      // The loop stopped on a tool-call boundary (e.g. step cap); treat as max_steps.
      return 'max_steps';
    case 'content-filter':
      return 'refusal';
    case 'error':
      return 'error';
    case 'other':
    case 'unknown':
    default:
      return 'unknown';
  }
}

/** Normalize a v5 `LanguageModelUsage` (tokens are `number | undefined`) to `TokenUsage`. */
export function normalizeUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}): TokenUsage {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
  const result: TokenUsage = { inputTokens, outputTokens, totalTokens };
  if (typeof usage.reasoningTokens === 'number') result.reasoningTokens = usage.reasoningTokens;
  if (typeof usage.cachedInputTokens === 'number') result.cacheReadTokens = usage.cachedInputTokens;
  return result;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * The running outcome accumulated while mapping the stream. The driver reads this after the
 * stream completes to build the single terminal `done` frame.
 */
export type ToolLoopOutcome = {
  usage: TokenUsage;
  finishReason: StopReason;
  finalText: string;
  errored: boolean;
  errorMessage?: string;
};

export function emptyOutcome(): ToolLoopOutcome {
  return {
    usage: emptyTokenUsage(),
    finishReason: 'unknown',
    finalText: '',
    errored: false,
  };
}

/**
 * Translate one `fullStream` part into zero or more `DriverFrame`s, mutating `outcome`
 * in place for the terminal-frame accounting the driver performs afterward.
 *
 * Returns the frames to emit for this part (text/thinking/tool/usage/error). The terminal
 * `done` is intentionally NOT produced here — the driver owns the single terminal frame so
 * it can apply policy/cancellation outcomes.
 */
export function mapStreamPart<TOOLS extends ToolSet>(
  part: TextStreamPart<TOOLS>,
  outcome: ToolLoopOutcome,
): DriverFrame[] {
  switch (part.type) {
    case 'text-delta': {
      if (part.text.length === 0) return [];
      outcome.finalText += part.text;
      return [{ kind: 'text', text: part.text }];
    }
    case 'reasoning-delta': {
      if (part.text.length === 0) return [];
      return [{ kind: 'thinking', text: part.text }];
    }
    case 'tool-call': {
      const input =
        part.input && typeof part.input === 'object'
          ? (part.input as Record<string, unknown>)
          : undefined;
      const paths = extractToolPaths(part.toolName, part.input);
      return [
        {
          kind: 'tool_call',
          toolCall: {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            modes: classifyToolModes(part.toolName),
            input,
            paths,
          },
        },
      ];
    }
    case 'tool-result': {
      return [
        {
          kind: 'tool_result',
          toolResult: {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            ok: true,
            output: part.output,
          },
        },
      ];
    }
    case 'tool-error': {
      const message = errorToMessage(part.error);
      return [
        {
          kind: 'tool_result',
          toolResult: {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            ok: false,
            errorMessage: message,
          },
        },
        { kind: 'log', level: 'warn', message: `Tool ${part.toolName} failed: ${message}` },
      ];
    }
    case 'finish': {
      outcome.usage = normalizeUsage(part.totalUsage);
      outcome.finishReason = mapFinishReason(part.finishReason);
      return [{ kind: 'usage', usage: outcome.usage }];
    }
    case 'finish-step': {
      // Step-level usage is rolled up by the terminal `finish` part; nothing to emit.
      return [];
    }
    case 'abort': {
      outcome.finishReason = 'aborted';
      return [];
    }
    case 'error': {
      outcome.errored = true;
      outcome.errorMessage = errorToMessage(part.error);
      outcome.finishReason = 'error';
      return [
        { kind: 'error', message: outcome.errorMessage, code: 'unknown', retryable: false },
      ];
    }
    // Structural/no-op parts in the v5 stream we intentionally don't surface as frames.
    case 'start':
    case 'start-step':
    case 'text-start':
    case 'text-end':
    case 'reasoning-start':
    case 'reasoning-end':
    case 'tool-input-start':
    case 'tool-input-delta':
    case 'tool-input-end':
    case 'source':
    case 'file':
    case 'raw':
      return [];
    default:
      return [];
  }
}

/**
 * Consume an entire `fullStream`, yielding mapped `DriverFrame`s. Accumulates terminal
 * accounting into `outcome`. Does NOT yield the terminal `done` frame — the driver appends
 * exactly one after this generator completes.
 */
export async function* mapFullStream<TOOLS extends ToolSet>(
  fullStream: AsyncIterable<TextStreamPart<TOOLS>>,
  outcome: ToolLoopOutcome,
): AsyncIterable<DriverFrame> {
  for await (const part of fullStream) {
    for (const frame of mapStreamPart(part, outcome)) {
      yield frame;
    }
  }
}
