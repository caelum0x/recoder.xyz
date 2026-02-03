/**
 * Sandbox Utility Functions
 * Helper functions for sandbox operations including retry logic,
 * health checking, and timeout management
 */

import type { ISandbox } from './interfaces';
import type {
  CommandOptions,
  CommandResult,
  RetryConfig,
  SandboxFile,
} from './types';
import { SandboxError, SandboxErrorType } from './types';

/**
 * Try-catch wrapper that returns [result, error] tuple
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<[T, null] | [null, Error]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

/**
 * Retry a function with exponential or linear backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const [result, error] = await tryCatch(fn);

    if (!error) {
      return result as T;
    }

    lastError = error;

    // Check if error is retryable
    if (config.retryableErrors && error instanceof SandboxError) {
      if (!config.retryableErrors.includes(error.type)) {
        throw error;
      }
    }

    // Don't wait after the last attempt
    if (attempt < config.maxRetries) {
      const delay =
        config.backoff === 'exponential'
          ? config.delay * 2 ** attempt
          : config.delay * (attempt + 1);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Execute a command with retry logic
 */
export async function executeCommandWithRetry(
  sandbox: ISandbox,
  command: string,
  options?: CommandOptions & { retryConfig?: RetryConfig }
): Promise<CommandResult> {
  const retryConfig = options?.retryConfig || {
    maxRetries: 2,
    delay: 1000,
    backoff: 'linear' as const,
    retryableErrors: [SandboxErrorType.COMMAND_FAILED, SandboxErrorType.TIMEOUT],
  };

  return retryWithBackoff(() => sandbox.executeCommand(command, options), retryConfig);
}

/**
 * Write files with batch processing and retry logic
 */
export async function writeFilesWithRetry(
  sandbox: ISandbox,
  files: SandboxFile[],
  batchSize = 10,
  retryConfig?: RetryConfig
): Promise<void> {
  const defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    delay: 1000,
    backoff: 'exponential',
    retryableErrors: [SandboxErrorType.FILE_OPERATION_FAILED],
  };

  const config = retryConfig || defaultRetryConfig;

  // Process files in batches
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    await retryWithBackoff(async () => {
      const result = await sandbox.writeFiles(batch);
      if (!result.success) {
        throw new Error(
          `Failed to write batch: ${result.results
            .filter((r) => !r.success)
            .map((r) => r.error)
            .join(', ')}`
        );
      }
    }, config);
  }
}

/**
 * Check if a sandbox is healthy
 */
export async function checkSandboxHealth(sandbox: ISandbox): Promise<boolean> {
  try {
    // Try to execute a simple command
    const result = await sandbox.executeCommand('echo "health-check"', { timeoutMs: 5000 });
    return result.exitCode === 0 && result.stdout.includes('health-check');
  } catch {
    return false;
  }
}

/**
 * Wait for sandbox to be ready
 */
export async function waitForSandboxReady(
  sandbox: ISandbox,
  timeoutMs = 60_000,
  checkIntervalMs = 2000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await checkSandboxHealth(sandbox)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  throw new SandboxError(
    SandboxErrorType.TIMEOUT,
    `Sandbox ${sandbox.id} did not become ready within ${timeoutMs}ms`,
    sandbox.id
  );
}

/**
 * Sanitize file paths to prevent directory traversal
 */
export function sanitizeFilePath(path: string): string {
  // Remove any path traversal attempts
  const sanitized = path
    .replace(/\.\./g, '') // Remove ..
    .replace(/\/+/g, '/') // Normalize multiple slashes
    .replace(/^\/+/, '') // Remove leading slashes
    .trim();

  if (!sanitized) {
    throw new Error('Invalid file path');
  }

  return sanitized;
}

/**
 * Validate command for security
 */
export function validateCommand(command: string): void {
  const blockedPatterns = [
    'rm -rf /',
    'dd if=/dev/zero',
    ':(){ :|:& };:',
    'chmod 777 /',
    '> /dev/sda',
  ];

  const lowerCommand = command.toLowerCase();

  for (const blocked of blockedPatterns) {
    if (lowerCommand.includes(blocked.toLowerCase())) {
      throw new Error(`Blocked command pattern detected: ${blocked}`);
    }
  }
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Parse environment variables from string
 */
export function parseEnvironmentVariables(envString: string): Record<string, string> {
  const env: Record<string, string> = {};

  const lines = envString.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();
      env[key] = value;
    }
  }

  return env;
}

/**
 * Create a timeout promise
 */
export function createTimeoutPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]);
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), waitMs);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limitMs);
    }
  };
}

/**
 * Create a logger with sandbox context
 */
export function createSandboxLogger(sandboxId: string) {
  const prefix = `[Sandbox:${sandboxId}]`;

  return {
    info: (message: string, ...args: unknown[]) => console.log(`${prefix} ${message}`, ...args),
    warn: (message: string, ...args: unknown[]) => console.warn(`${prefix} ${message}`, ...args),
    error: (message: string, ...args: unknown[]) => console.error(`${prefix} ${message}`, ...args),
    debug: (message: string, ...args: unknown[]) => console.debug(`${prefix} ${message}`, ...args),
  };
}

/**
 * Generate a unique sandbox ID
 */
export function generateSandboxId(): string {
  return `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof SandboxError) {
    const retryableTypes = [
      SandboxErrorType.CONNECTION_FAILED,
      SandboxErrorType.TIMEOUT,
      SandboxErrorType.PROVIDER_ERROR,
    ];
    return retryableTypes.includes(error.type);
  }

  // Check for common network errors
  const retryableMessages = [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'socket hang up',
    'network',
    'fetch',
  ];

  return retryableMessages.some((msg) =>
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
}

/**
 * Calculate retry delay with jitter
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  backoff: 'linear' | 'exponential' = 'exponential',
  jitter = true
): number {
  let delay = backoff === 'exponential' ? baseDelay * 2 ** attempt : baseDelay * (attempt + 1);

  // Add jitter to prevent thundering herd
  if (jitter) {
    delay += Math.random() * 1000;
  }

  return Math.min(delay, 30_000); // Cap at 30 seconds
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
