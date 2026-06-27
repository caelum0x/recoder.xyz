import type { RunEvent } from '@recoder/agent-os';
import { runtimeEvent } from '@recoder/agent-runtimes';
import { RuntimeAdapterError } from '@recoder/agent-runtimes';
import { toRuntimeAdapterError } from './error-classifier';

export type ErrorEventContext = {
  taskId: string;
  runId: string;
  agentId?: string;
  now?: string;
};

/**
 * Convert any error into the single terminal `failed` RunEvent.
 * Mirrors `generic-adapter.ts:186-205`: `data.code` + `data.retryable` + optional details.
 * Cancellation maps to `state: 'cancelled'`; everything else to `state: 'failed'`.
 */
export function errorToFailedEvent(error: unknown, ctx: ErrorEventContext): RunEvent {
  const adapterError: RuntimeAdapterError = toRuntimeAdapterError(error);
  const data: Record<string, unknown> = {
    code: adapterError.code,
    retryable: adapterError.retryable,
  };
  if (adapterError.details) {
    data['details'] = adapterError.details;
  }

  return runtimeEvent({
    type: 'failed',
    taskId: ctx.taskId,
    runId: ctx.runId,
    agentId: ctx.agentId,
    state: adapterError.code === 'cancelled' ? 'cancelled' : 'failed',
    message: adapterError.message,
    data,
    now: ctx.now,
  });
}
