/**
 * CoordinationError — base error for the subsystem. Carries a typed code +
 * a sanitized context object. Context must never contain secrets (the
 * transport redaction layer is the second line of defense; authors are the
 * first — do not put credentials in context).
 */

import { CoordinationErrorCode } from './error-codes';

export type CoordinationErrorContext = Record<string, unknown>;

export class CoordinationError extends Error {
  readonly code: CoordinationErrorCode;
  readonly context: CoordinationErrorContext;

  constructor(
    code: CoordinationErrorCode,
    message: string,
    context: CoordinationErrorContext = {},
  ) {
    super(message);
    this.name = 'CoordinationError';
    this.code = code;
    this.context = context;
    // Preserve prototype chain when transpiled to ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isCoordinationError(value: unknown): value is CoordinationError {
  return value instanceof CoordinationError;
}
