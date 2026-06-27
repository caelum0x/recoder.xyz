import type { RunEvent } from '@recoder/agent-os';
import { runtimeEvent, type RuntimeEventInput } from '@recoder/agent-runtimes';

/**
 * Low-level RunEvent builder. Wraps the canonical `runtimeEvent` factory from
 * `@recoder/agent-runtimes` so the engine has one funnel for event construction.
 */
export function emitRunEvent(input: RuntimeEventInput): RunEvent {
  return runtimeEvent(input);
}

export type StartedEventInput = {
  taskId: string;
  runId: string;
  agentId?: string;
  runtimeId: string;
  surface: string;
  bundleId?: string;
  verificationCommands?: string[];
  acceptanceCriteria?: string[];
  now?: string;
};

/** Build the `started` event that opens every run (mirrors generic-adapter.ts:120). */
export function emitStartedEvent(input: StartedEventInput): RunEvent {
  return runtimeEvent({
    type: 'started',
    taskId: input.taskId,
    runId: input.runId,
    agentId: input.agentId,
    state: 'running',
    message: `Task accepted by ${input.surface} runtime.`,
    data: {
      runtimeId: input.runtimeId,
      bundleId: input.bundleId,
      verificationCommands: input.verificationCommands,
      acceptanceCriteria: input.acceptanceCriteria,
    },
    now: input.now,
  });
}
