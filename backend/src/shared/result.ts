/**
 * The `Result<T, E>` envelope — explicit success/failure without throwing.
 *
 * Used at domain seams where an error is an expected outcome (a gate deny, a
 * degraded engine, a validation miss) rather than an exceptional one. Throwing
 * is reserved for truly unexpected faults; `Result` makes the failure path part
 * of the type so callers must handle it.
 */
import type { AppError } from './errors.js';

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Success or failure. Defaults the error channel to `AppError`. */
export type Result<T, E = AppError> = Ok<T> | Err<E>;

/** Wrap a success value. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Wrap a failure value. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard: narrow a Result to its success branch. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard: narrow a Result to its failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Map the success value, leaving a failure untouched. */
export function mapOk<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Extract the value or fall back on failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** Run a throwing function, capturing any thrown value as an `Err`. */
export function tryCatch<T>(fn: () => T): Result<T, unknown> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error);
  }
}

/** Async variant of {@link tryCatch}. */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, unknown>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error);
  }
}
