/**
 * to-result — maps a thrown value at the engine edge into a Result so the
 * public boundary NEVER throws (design §9). Known CoordinationErrors pass
 * through; unknown throwables become an INTERNAL CoordinationError with no
 * secret leakage (only the message is carried, not arbitrary fields).
 */

import { err, ok, type Result } from '../result';
import { CoordinationError } from './coordination-error';
import { CoordinationErrorCode } from './error-codes';

export function toCoordinationError(value: unknown): CoordinationError {
  if (value instanceof CoordinationError) {
    return value;
  }
  if (value instanceof Error) {
    return new CoordinationError(CoordinationErrorCode.INTERNAL, value.message);
  }
  return new CoordinationError(CoordinationErrorCode.INTERNAL, 'Unknown coordination failure');
}

/** Run a thunk, returning ok(value) or err(CoordinationError). */
export function tryResult<T>(thunk: () => T): Result<T, CoordinationError> {
  try {
    return ok(thunk());
  } catch (value: unknown) {
    return err(toCoordinationError(value));
  }
}

/** Async variant of tryResult. */
export async function tryResultAsync<T>(
  thunk: () => Promise<T>,
): Promise<Result<T, CoordinationError>> {
  try {
    return ok(await thunk());
  } catch (value: unknown) {
    return err(toCoordinationError(value));
  }
}
