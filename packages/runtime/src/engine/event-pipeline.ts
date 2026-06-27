import type { RunEvent } from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import type { DriverFrame } from '../contracts/driver-frame';
import { frameToRunEvent, type FrameEventContext } from '../events/frame-to-event';
import { UsageAggregator } from '../events/usage-aggregator';
import { SecretRedactor } from '../policy/secret-redactor';
import type { RunGuards } from '../policy/policy-gate';
import { normalizeRunEvent } from './event-normalizer';
import { TerminalEventGuard } from './terminal-event-guard';

export type PipelineContext = {
  input: RuntimeTaskInput;
  runId: string;
  redactor: SecretRedactor;
  guards: RunGuards;
  terminalGuard: TerminalEventGuard;
  /** Surface a non-terminal advisory (e.g. target-path warning) as a log event. */
  onAdvisory?: (event: RunEvent) => void;
  now?: () => number;
};

/**
 * Processes a single `DriverFrame` through the middleware chain:
 *   policy guards (work-lock/forbidden-path/shell) -> secret-redactor ->
 *   frame-to-event -> normalizer -> terminal-guard.
 *
 * Returns the events to emit (0..n). Usage frames fold into the aggregator and emit
 * nothing. A policy violation throws (the engine converts it to a terminal `failed`).
 * After a terminal event has passed, later events are suppressed (caller still journals).
 */
export class EventPipeline {
  private usage = UsageAggregator.empty();

  constructor(private readonly ctx: PipelineContext) {}

  process(frame: DriverFrame): RunEvent[] {
    this.enforcePolicy(frame);
    this.usage = this.usage.observe(frame);

    const redacted = this.redactFrame(frame);
    const eventCtx: FrameEventContext = {
      taskId: this.ctx.input.task.taskId,
      runId: this.ctx.runId,
      agentId: this.ctx.input.bundle.agentId,
      now: this.ctx.now ? new Date(this.ctx.now()).toISOString() : undefined,
      usage: this.usage.value(),
    };

    const event = frameToRunEvent(redacted, eventCtx);
    if (!event) return [];

    const normalized = normalizeRunEvent(event, this.ctx.input, this.ctx.runId);
    if (!this.ctx.terminalGuard.admit(normalized)) {
      return [];
    }
    return [normalized];
  }

  /** Final usage snapshot for folding into a synthesized terminal event. */
  usageSnapshot() {
    return this.usage.value();
  }

  private enforcePolicy(frame: DriverFrame): void {
    if (frame.kind !== 'tool_call') return;
    this.ctx.guards.shell.assert(frame);
    this.ctx.guards.workLock.assert(frame);
    this.ctx.guards.forbiddenPath.assert(frame);
    const warnings = this.ctx.guards.targetPath.check(frame);
    for (const warning of warnings) {
      this.ctx.onAdvisory?.(
        normalizeRunEvent(
          frameToRunEvent(
            {
              kind: 'log',
              message: `Write outside declared target paths: ${warning.path}`,
              level: 'warn',
              data: { offTargetPath: warning.path, toolName: frame.toolCall.toolName },
            },
            {
              taskId: this.ctx.input.task.taskId,
              runId: this.ctx.runId,
              agentId: this.ctx.input.bundle.agentId,
            },
          ) as RunEvent,
          this.ctx.input,
          this.ctx.runId,
        ),
      );
    }
  }

  private redactFrame(frame: DriverFrame): DriverFrame {
    const redactor = this.ctx.redactor;
    switch (frame.kind) {
      case 'text':
      case 'thinking':
        return { ...frame, text: redactor.redactString(frame.text) };
      case 'log':
        return {
          ...frame,
          message: redactor.redactString(frame.message),
          data: frame.data ? (redactor.redactValue(frame.data) as Record<string, unknown>) : undefined,
        };
      case 'tool_call':
        return {
          ...frame,
          toolCall: {
            ...frame.toolCall,
            input: frame.toolCall.input
              ? (redactor.redactValue(frame.toolCall.input) as Record<string, unknown>)
              : undefined,
          },
        };
      case 'tool_result':
        return {
          ...frame,
          toolResult: {
            ...frame.toolResult,
            output: redactor.redactValue(frame.toolResult.output),
            errorMessage: frame.toolResult.errorMessage
              ? redactor.redactString(frame.toolResult.errorMessage)
              : undefined,
          },
        };
      case 'error':
        return { ...frame, message: redactor.redactString(frame.message) };
      case 'done':
        return {
          ...frame,
          finalText: frame.finalText ? redactor.redactString(frame.finalText) : undefined,
          message: frame.message ? redactor.redactString(frame.message) : undefined,
        };
      default:
        return frame;
    }
  }
}
