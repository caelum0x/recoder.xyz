import { RuntimeAdapterError } from '@recoder/agent-runtimes';
import type { RuntimeErrorCode } from './error-codes';
import { runtimeError, isRuntimeAdapterError } from './runtime-error';

export type ProcessFailureInput = {
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  stderrTail?: string;
  command?: string;
};

/**
 * Classify a raw process/exec failure into a `RuntimeAdapterError` with an extended
 * code + retryable flag. Never invents success; an unknown failure becomes `unknown`.
 */
export function classifyProcessFailure(input: ProcessFailureInput): RuntimeAdapterError {
  const stderr = (input.stderrTail ?? '').toLowerCase();

  if (
    stderr.includes('command not found') ||
    stderr.includes('enoent') ||
    stderr.includes('no such file')
  ) {
    return runtimeError('cli_not_found', describe('CLI binary not found', input), {
      details: detailsOf(input),
    });
  }

  if (input.signal === 'SIGABRT' || stderr.includes('spawn') || stderr.includes('eacces')) {
    return runtimeError('spawn_failed', describe('Failed to spawn CLI process', input), {
      details: detailsOf(input),
    });
  }

  if (input.signal === 'SIGKILL' || input.signal === 'SIGTERM') {
    return runtimeError('cancelled', describe('CLI process was terminated', input), {
      details: detailsOf(input),
    });
  }

  return runtimeError('unknown', describe(`CLI exited with code ${input.exitCode ?? 'null'}`, input), {
    details: detailsOf(input),
  });
}

/** Normalize any thrown value into a `RuntimeAdapterError` with the given fallback code. */
export function toRuntimeAdapterError(
  error: unknown,
  fallbackCode: RuntimeErrorCode = 'unknown',
): RuntimeAdapterError {
  if (isRuntimeAdapterError(error)) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return runtimeError(fallbackCode, message);
}

function detailsOf(input: ProcessFailureInput): Record<string, unknown> {
  return {
    exitCode: input.exitCode ?? null,
    signal: input.signal ?? null,
    command: input.command,
  };
}

function describe(prefix: string, input: ProcessFailureInput): string {
  return input.command ? `${prefix} (${input.command})` : prefix;
}
