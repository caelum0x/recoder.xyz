/**
 * Error handling utility with Result type pattern
 * Provides type-safe error handling without try-catch blocks
 */

type Success<T> = readonly [T, null];
type Failure<E> = readonly [null, E];
type ResultSync<T, E> = Success<T> | Failure<E>;
type ResultAsync<T, E> = Promise<ResultSync<T, E>>;
type Operation<T> = Promise<T> | (() => T) | (() => Promise<T>);

/**
 * Result type representing either a success value or an error
 */
export type Result<T, E = Error> = ResultSync<T, E>;

/**
 * Async result type for promise-based operations
 */
export type AsyncResult<T, E = Error> = ResultAsync<T, E>;

/**
 * Wraps an operation in a try-catch and returns a Result tuple
 *
 * @example
 * // Synchronous usage
 * const [data, error] = tryCatch(() => JSON.parse(jsonString));
 * if (error) {
 *   console.error('Failed to parse JSON:', error);
 * }
 *
 * @example
 * // Async usage
 * const [response, error] = await tryCatch(fetch('/api/data'));
 * if (error) {
 *   console.error('Request failed:', error);
 * }
 *
 * @example
 * // Async function usage
 * const [data, error] = await tryCatch(async () => {
 *   const response = await fetch('/api/data');
 *   return response.json();
 * });
 */
export function tryCatch<T, E = Error>(operation: Promise<T>): ResultAsync<T, E>;
export function tryCatch<T, E = Error>(operation: () => Promise<T>): ResultAsync<T, E>;
export function tryCatch<T, E = Error>(operation: () => T): ResultSync<T, E>;
export function tryCatch<T, E = Error>(
  operation: Operation<T>
): ResultSync<T, E> | ResultAsync<T, E> {
  if (operation instanceof Promise) {
    return operation
      .then((data: T) => [data, null] as const)
      .catch((error: E) => [null, error as E] as const);
  }

  try {
    const result = operation();

    if (result instanceof Promise) {
      return result
        .then((data: T) => [data, null] as const)
        .catch((error: E) => [null, error as E] as const);
    }

    return [result, null] as const;
  } catch (error) {
    return [null, error as E] as const;
  }
}

/**
 * Checks if a result is successful (no error)
 */
export function isSuccess<T, E>(result: ResultSync<T, E>): result is Success<T> {
  return result[1] === null;
}

/**
 * Checks if a result is a failure (has error)
 */
export function isFailure<T, E>(result: ResultSync<T, E>): result is Failure<E> {
  return result[1] !== null;
}

/**
 * Maps a successful result to a new value
 *
 * @example
 * const [value, error] = mapResult(result, (data) => data.toUpperCase());
 */
export function mapResult<T, U, E>(
  result: ResultSync<T, E>,
  fn: (value: T) => U
): ResultSync<U, E> {
  if (isSuccess(result)) {
    return [fn(result[0]), null] as const;
  }
  return result as ResultSync<U, E>;
}

/**
 * Maps an error result to a new error
 *
 * @example
 * const [value, error] = mapError(result, (err) => new CustomError(err.message));
 */
export function mapError<T, E, F>(
  result: ResultSync<T, E>,
  fn: (error: E) => F
): ResultSync<T, F> {
  if (isFailure(result)) {
    return [null, fn(result[1])] as const;
  }
  return result as ResultSync<T, F>;
}

/**
 * Chains result operations
 *
 * @example
 * const result = await chainResults(
 *   () => tryCatch(() => parseInput(input)),
 *   (parsed) => tryCatch(async () => await validateInput(parsed)),
 *   (validated) => tryCatch(async () => await processInput(validated))
 * );
 */
export async function chainResults<T, E = Error>(
  ...operations: Array<(prev?: unknown) => ResultSync<unknown, E> | ResultAsync<unknown, E>>
): Promise<ResultSync<T, E>> {
  let currentValue: unknown = undefined;

  for (const operation of operations) {
    const result = await operation(currentValue);
    if (isFailure(result)) {
      return result as ResultSync<T, E>;
    }
    currentValue = result[0];
  }

  return [currentValue as T, null] as const;
}

/**
 * Runs multiple operations in parallel and collects results
 * Returns all successes and all failures
 *
 * @example
 * const { successes, failures } = await collectResults([
 *   tryCatch(fetch('/api/a')),
 *   tryCatch(fetch('/api/b')),
 *   tryCatch(fetch('/api/c')),
 * ]);
 */
export async function collectResults<T, E = Error>(
  operations: Array<ResultAsync<T, E>>
): Promise<{ successes: T[]; failures: E[] }> {
  const results = await Promise.all(operations);
  const successes: T[] = [];
  const failures: E[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      successes.push(result[0]);
    } else {
      failures.push(result[1]);
    }
  }

  return { successes, failures };
}

/**
 * Unwraps a result, throwing the error if present
 *
 * @example
 * const data = unwrap(result); // throws if error
 */
export function unwrap<T, E>(result: ResultSync<T, E>): T {
  if (isFailure(result)) {
    throw result[1];
  }
  return result[0];
}

/**
 * Unwraps a result with a default value for errors
 *
 * @example
 * const data = unwrapOr(result, defaultValue);
 */
export function unwrapOr<T, E>(result: ResultSync<T, E>, defaultValue: T): T {
  if (isFailure(result)) {
    return defaultValue;
  }
  return result[0];
}

/**
 * Unwraps a result with a function to compute default value from error
 *
 * @example
 * const data = unwrapOrElse(result, (error) => computeDefault(error));
 */
export function unwrapOrElse<T, E>(result: ResultSync<T, E>, fn: (error: E) => T): T {
  if (isFailure(result)) {
    return fn(result[1]);
  }
  return result[0];
}
