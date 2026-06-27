import type { RunEvent, RunEventType } from '@recoder/agent-os';
import { runtimeEvent } from '@recoder/agent-runtimes';
import type { DriverFrame } from '../contracts/driver-frame';
import type { TokenUsage } from '../types/usage';

export type FrameEventContext = {
  taskId: string;
  runId: string;
  agentId?: string;
  now?: string;
  /** Aggregated usage to fold into a terminal `completed` event. */
  usage?: TokenUsage;
};

/**
 * The canonical `DriverFrame.kind -> RunEventType` mapping table (docs §3.8).
 * `usage` frames return `null` — they fold into the terminal `completed.data.usage`
 * via the usage-aggregator rather than emitting their own event.
 */
export const FRAME_TO_EVENT_TYPE: Record<DriverFrame['kind'], RunEventType | null> = {
  text: 'log',
  thinking: 'log',
  tool_call: 'log',
  tool_result: 'log',
  state: 'state_transition',
  needs_input: 'needs_input',
  approval: 'approval_requested',
  artifact: 'artifact',
  usage: null,
  log: 'log',
  error: 'failed',
  done: 'completed',
};

/**
 * Convert a single `DriverFrame` into a `RunEvent`, or `null` when the frame folds
 * into a later event (usage). The engine guarantees ids/agentId/taskId/runId are set.
 */
export function frameToRunEvent(frame: DriverFrame, ctx: FrameEventContext): RunEvent | null {
  switch (frame.kind) {
    case 'usage':
      return null;

    case 'text':
    case 'thinking':
      return base(ctx, 'log', frame.text, { delta: frame.kind });

    case 'tool_call':
      return base(ctx, 'log', `tool_call:${frame.toolCall.toolName}`, { toolCall: frame.toolCall });

    case 'tool_result':
      return base(ctx, 'log', `tool_result:${frame.toolResult.toolName}`, {
        toolResult: frame.toolResult,
      });

    case 'log':
      return base(ctx, 'log', frame.message, { level: frame.level, ...(frame.data ?? {}) });

    case 'state':
      return runtimeEvent({
        type: 'state_transition',
        taskId: ctx.taskId,
        runId: ctx.runId,
        agentId: ctx.agentId,
        state: frame.state,
        message: frame.message,
        now: ctx.now,
      });

    case 'needs_input':
      return base(ctx, 'needs_input', frame.prompt ?? 'Runtime is waiting for input.', frame.data);

    case 'approval':
      return runtimeEvent({
        type: 'approval_requested',
        taskId: ctx.taskId,
        runId: ctx.runId,
        agentId: ctx.agentId,
        state: 'waiting_for_approval',
        message: frame.reason,
        data: {
          approvalId: frame.approvalId,
          requiredAt: frame.requiredAt,
          target: frame.target,
        },
        now: ctx.now,
      });

    case 'artifact':
      return runtimeEvent({
        type: 'artifact',
        taskId: ctx.taskId,
        runId: ctx.runId,
        agentId: ctx.agentId,
        artifactId: frame.artifactId,
        message: frame.artifact.title,
        data: { artifact: frame.artifact },
        now: ctx.now,
      });

    case 'error':
      return runtimeEvent({
        type: 'failed',
        taskId: ctx.taskId,
        runId: ctx.runId,
        agentId: ctx.agentId,
        state: 'failed',
        message: frame.message,
        data: {
          code: frame.code ?? 'unknown',
          retryable: frame.retryable ?? false,
          ...(frame.data ?? {}),
        },
        now: ctx.now,
      });

    case 'done':
      return doneToEvent(frame, ctx);
  }
}

function doneToEvent(
  frame: Extract<DriverFrame, { kind: 'done' }>,
  ctx: FrameEventContext,
): RunEvent {
  const usage = frame.usage ?? ctx.usage;
  if (frame.ok) {
    return runtimeEvent({
      type: 'completed',
      taskId: ctx.taskId,
      runId: ctx.runId,
      agentId: ctx.agentId,
      state: 'completed',
      message: frame.message ?? 'Run completed.',
      data: pruneUndefined({
        stopReason: frame.stopReason,
        finalText: frame.finalText,
        usage,
        ...(frame.data ?? {}),
      }),
      now: ctx.now,
    });
  }
  return runtimeEvent({
    type: 'failed',
    taskId: ctx.taskId,
    runId: ctx.runId,
    agentId: ctx.agentId,
    state: 'failed',
    message: frame.message ?? 'Run failed.',
    data: pruneUndefined({
      code: frame.code ?? 'unknown',
      retryable: frame.retryable ?? false,
      stopReason: frame.stopReason,
      usage,
      ...(frame.data ?? {}),
    }),
    now: ctx.now,
  });
}

function base(
  ctx: FrameEventContext,
  type: RunEventType,
  message: string,
  data?: Record<string, unknown>,
): RunEvent {
  return runtimeEvent({
    type,
    taskId: ctx.taskId,
    runId: ctx.runId,
    agentId: ctx.agentId,
    message,
    data: data && Object.keys(data).length > 0 ? pruneUndefined(data) : undefined,
    now: ctx.now,
  });
}

function pruneUndefined(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
