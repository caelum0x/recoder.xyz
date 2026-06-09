export type RuntimeErrorCode =
  | 'runtime_unavailable'
  | 'capability_mismatch'
  | 'policy_denied'
  | 'approval_required'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

export class RuntimeAdapterError extends Error {
  readonly code: RuntimeErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: RuntimeErrorCode, message: string, options: { retryable?: boolean; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'RuntimeAdapterError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}
