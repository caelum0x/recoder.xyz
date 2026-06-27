/**
 * SubstrateError — the typed base for everything the substrate can fail with.
 *
 * Replaces today's bare `throw new Error(...)` strings (design §8) so routes can
 * map a stable `code` → HTTP status and callers can branch on `retryable`
 * without string-matching.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import type { SubstrateErrorCode } from './codes.js';

export interface SubstrateErrorOptions {
  /** Originating substrate id, when known. */
  substrateId?: WorkspaceSubstrate;
  /** Underlying error, preserved for logs (never surfaced to clients raw). */
  cause?: unknown;
  /** Whether retrying the operation could plausibly succeed. */
  retryable?: boolean;
  /** Structured, non-secret detail for diagnostics. */
  detail?: Record<string, unknown>;
}

export class SubstrateError extends Error {
  readonly code: SubstrateErrorCode;
  readonly substrateId?: WorkspaceSubstrate;
  readonly retryable: boolean;
  readonly detail?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(code: SubstrateErrorCode, message: string, options: SubstrateErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.substrateId = options.substrateId;
    this.retryable = options.retryable ?? false;
    this.detail = options.detail;
    this.cause = options.cause;
    // Preserve the prototype chain when transpiled to ES5-era targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
