/**
 * Unified stop reason across every CLI/agent. Each driver maps its native terminal
 * signal (exit code, finish reason, ACP stopReason) into one of these.
 */
export type StopReason =
  | 'end_turn'
  | 'max_steps'
  | 'aborted'
  | 'error'
  | 'refusal'
  | 'unknown';

export const STOP_REASONS: readonly StopReason[] = [
  'end_turn',
  'max_steps',
  'aborted',
  'error',
  'refusal',
  'unknown',
] as const;

export function isTerminalStopReason(reason: StopReason): boolean {
  return reason !== 'unknown';
}

export function isSuccessStopReason(reason: StopReason): boolean {
  return reason === 'end_turn' || reason === 'max_steps';
}
