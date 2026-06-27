import type { TaskRunState } from '@recoder/agent-os';
import type { NormalizedToolCall, NormalizedToolResult } from '../types/tool-call';
import type { TokenUsage } from '../types/usage';
import type { StopReason } from '../types/stop-reason';
import type { RuntimeEvidenceArtifact } from '../types/evidence';
import type { RuntimeErrorCode } from '../errors/error-codes';

/**
 * The universal lingua franca every driver emits. A driver's only job is to translate
 * its native CLI output into a stream of `DriverFrame`s; the engine does the rest
 * (normalization, policy guards, terminal guard, sink fan-out).
 */
export type DriverFrame =
  | TextFrame
  | ThinkingFrame
  | ToolCallFrame
  | ToolResultFrame
  | StateFrame
  | NeedsInputFrame
  | ApprovalFrame
  | UsageFrame
  | ArtifactFrame
  | LogFrame
  | ErrorFrame
  | DoneFrame;

export type DriverFrameKind = DriverFrame['kind'];

/** Assistant token delta / text output (debounced into `log` events downstream). */
export type TextFrame = {
  kind: 'text';
  text: string;
};

/** Reasoning / thinking delta (debounced into `log` events downstream). */
export type ThinkingFrame = {
  kind: 'thinking';
  text: string;
};

/** A tool/function invocation the agent is about to perform. */
export type ToolCallFrame = {
  kind: 'tool_call';
  toolCall: NormalizedToolCall;
};

/** The result of a previously emitted tool call. */
export type ToolResultFrame = {
  kind: 'tool_result';
  toolResult: NormalizedToolResult;
};

/** An explicit run-state transition reported by the driver. */
export type StateFrame = {
  kind: 'state';
  state: TaskRunState;
  message?: string;
};

/** The agent is blocked waiting for human/host input. */
export type NeedsInputFrame = {
  kind: 'needs_input';
  prompt?: string;
  data?: Record<string, unknown>;
};

/** The agent requests approval before a gated action; the run pauses until resolved. */
export type ApprovalFrame = {
  kind: 'approval';
  approvalId: string;
  reason: string;
  requiredAt:
    | 'before_execution'
    | 'before_write'
    | 'before_push'
    | 'before_pr'
    | 'before_sensitive_action'
    | 'after_verification'
    | 'custom';
  target?: { path?: string; command?: string; toolName?: string };
};

/** Incremental token-usage update (folded into the terminal `completed.data.usage`). */
export type UsageFrame = {
  kind: 'usage';
  usage: TokenUsage;
};

/** An artifact captured mid-run (diff, log, screenshot). */
export type ArtifactFrame = {
  kind: 'artifact';
  artifact: RuntimeEvidenceArtifact;
  artifactId?: string;
};

/** Free-form structured log line from the driver. */
export type LogFrame = {
  kind: 'log';
  message: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  data?: Record<string, unknown>;
};

/** A non-terminal error notice (terminal failures use a `done` frame with `ok: false`). */
export type ErrorFrame = {
  kind: 'error';
  message: string;
  code?: RuntimeErrorCode;
  retryable?: boolean;
  data?: Record<string, unknown>;
};

/** The single terminal frame: success or failure. The engine guarantees exactly one. */
export type DoneFrame = {
  kind: 'done';
  ok: boolean;
  stopReason: StopReason;
  finalText?: string;
  usage?: TokenUsage;
  /** Required when `ok` is false. */
  code?: RuntimeErrorCode;
  retryable?: boolean;
  message?: string;
  data?: Record<string, unknown>;
};

export function isTerminalFrame(frame: DriverFrame): frame is DoneFrame {
  return frame.kind === 'done';
}

export function isWriteBearingFrame(frame: DriverFrame): frame is ToolCallFrame {
  return frame.kind === 'tool_call' && frame.toolCall.modes.includes('write');
}
