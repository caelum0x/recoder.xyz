import type { StopReason } from '../types/stop-reason';
import type { TokenUsage } from '../types/usage';
import type { RuntimeErrorCode } from '../errors/error-codes';

/**
 * The summary a driver's run resolves to once its frame stream has ended.
 * Distinct from the terminal `DoneFrame` (which flows through the pipeline): this is the
 * out-of-band return value used for journaling + evidence collection.
 */
export type DriverResult = {
  ok: boolean;
  stopReason: StopReason;
  exitCode?: number | null;
  finalText?: string;
  usage?: TokenUsage;
  code?: RuntimeErrorCode;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
};

export function successResult(input: Omit<DriverResult, 'ok'> & { ok?: true }): DriverResult {
  return { ...input, ok: true };
}

export function failureResult(
  input: Omit<DriverResult, 'ok' | 'stopReason'> & { stopReason?: StopReason },
): DriverResult {
  return { ...input, ok: false, stopReason: input.stopReason ?? 'error' };
}
