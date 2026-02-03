import type { IngestError } from "./types";

const NULL_CHARACTER = "\u0000";
const DEFAULT_REPLACEMENT = "\uFFFD";

/**
 * Replace NUL ("\\u0000") characters with a safe replacement before persisting text.
 *
 * PostgreSQL text columns reject NUL bytes, so we swap them with the Unicode
 * replacement character by default. The function is idempotent and skips
 * allocation when the input does not contain NUL characters.
 */
export function replaceNullCharacters(
  value: string,
  replacement: string = DEFAULT_REPLACEMENT
): string {
  if (!value.includes(NULL_CHARACTER)) {
    return value;
  }

  return value.split(NULL_CHARACTER).join(replacement);
}

/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: IngestError) => void;
  context?: string;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;

/**
 * Execute an operation with retry logic
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    onError,
    context = "operation",
  } = options;

  const attemptOperation = async (attempt = 1): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      const isLastAttempt = attempt >= maxRetries;

      if (onError) {
        onError({
          document: context,
          error: error instanceof Error ? error : new Error(String(error)),
          willRetry: !isLastAttempt,
          attemptNumber: attempt,
        });
      }

      if (isLastAttempt) {
        throw error;
      }

      const delay = retryDelay * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));

      return attemptOperation(attempt + 1);
    }
  };

  return await attemptOperation();
}

/**
 * Create batches from an async iterable
 */
export async function* createBatches<T>(
  items: AsyncIterable<T>,
  batchSize: number
): AsyncGenerator<T[]> {
  const batch: T[] = [];

  for await (const item of items) {
    batch.push(item);
    if (batch.length >= batchSize) {
      yield [...batch];
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}
