import type { RunEvent } from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';

/**
 * Merge of `normalizeRuntimeOutput` + `createRunEventFromUpdate` from
 * generic-adapter.ts:217-256, hardened: every event gets `taskId`, `agentId` (from
 * `bundle.agentId`), `runId`, and `createdAt`. Inputs here are already canonical
 * `RunEvent`s produced by `frame-to-event`; this fills any missing identity fields.
 */
export function normalizeRunEvent(event: RunEvent, input: RuntimeTaskInput, runId: string): RunEvent {
  return {
    ...event,
    taskId: event.taskId || input.task.taskId,
    agentId: event.agentId ?? input.bundle.agentId,
    runId: event.runId ?? runId,
    createdAt: event.createdAt || new Date().toISOString(),
  };
}
