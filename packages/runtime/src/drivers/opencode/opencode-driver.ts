import type { RuntimeDriver, DriverProbe } from '../../contracts/runtime-driver';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverFrame, DoneFrame } from '../../contracts/driver-frame';
import type { StopReason } from '../../types/stop-reason';
import type { TokenUsage } from '../../types/usage';
import { addTokenUsage, emptyTokenUsage } from '../../types/usage';
import { makeCliInvocation } from '../../contracts/cli-invocation';
import { OPENCODE_DESCRIPTOR, OPENCODE_BINARY } from './opencode-descriptor';
import { probeOpenCode } from './opencode-health';
import { buildOpenCodeRunArgs } from './opencode-args';
import { resolveOpenCodeConfig, type OpenCodeConfigOverrides } from './opencode-plugin-config';
import { bridgeOpenCodeEvent } from './opencode-hooks-bridge';
import type { OpenCodeJsonEvent } from './opencode-event-stream';
import { spawnInvocation, killProcess, type SpawnedProcess } from '../shared/process-driver';
import { waitForChildProcess } from '../shared/wait-for-exit';
import { attachJsonlObjectReader } from '../shared/jsonl-reader';
import { attachAnsiTextReader } from '../shared/ansi-text-reader';
import { locateCli } from '../shared/cli-locator';
import { repoEnginePreferenceEnabled } from '../shared/repo-engine-locator';
import { runtimeError, errorCodeOf } from '../../errors/runtime-error';

export type OpenCodeDriverOptions = {
  /** Explicit path to the `opencode` binary (overrides PATH lookup). */
  cliPathOverride?: string;
  /** Static config overrides (model/agent/variant/disabled tools), faithful to oh-my-openagent. */
  config?: OpenCodeConfigOverrides;
};

/** A frame-or-done sentinel pushed onto the internal queue. */
type QueueItem = { frame: DriverFrame } | { error: unknown };

/**
 * Drives the user's `opencode` CLI headless via `opencode run --format json`, parsing its
 * line-delimited JSON event stream into `DriverFrame`s. The driver's ONLY job is
 * `native opencode output -> DriverFrame[]`; the engine owns normalization, policy guards,
 * and terminal-event guarantees.
 *
 * Fail-safe contract:
 *  - If the `opencode` binary is absent, `run()` yields a single terminal
 *    `done({ ok: false, code: 'cli_not_found' })` — it NEVER fakes completion.
 *  - A non-zero exit yields `done({ ok: false, ... })` with a classified code.
 *  - Cancellation (signal abort) kills the child and yields `done({ ok:false, 'cancelled' })`.
 */
export class OpenCodeDriver implements RuntimeDriver {
  readonly descriptor = OPENCODE_DESCRIPTOR;

  private readonly options: OpenCodeDriverOptions;
  private readonly running = new Map<string, SpawnedProcess>();

  constructor(options: OpenCodeDriverOptions = {}) {
    this.options = options;
  }

  async probe(ctx: DriverProbeContext): Promise<DriverProbe> {
    return probeOpenCode({
      ...ctx,
      cliPathOverride: ctx.cliPathOverride ?? this.options.cliPathOverride,
    });
  }

  async *run(ctx: DriverContext): AsyncIterable<DriverFrame> {
    const location = locateCli({
      binary: OPENCODE_BINARY,
      binName: OPENCODE_BINARY,
      override: this.options.cliPathOverride,
      cwd: ctx.cwd,
      pathEnv: ctx.env['PATH'],
      preferRepoEngine: repoEnginePreferenceEnabled(ctx.env),
    });

    if (!location.found || !location.resolvedPath) {
      yield doneFailed(
        'cli_not_found',
        `opencode CLI not found on PATH or local bin (cwd: ${ctx.cwd}). Install opencode to run this surface.`,
        false,
      );
      return;
    }

    const config = resolveOpenCodeConfig(this.options.config, ctx.policy);
    const args = buildOpenCodeRunArgs({
      model: config.model,
      agent: config.agent,
      variant: config.variant,
      policy: ctx.policy,
    });

    const prompt = ctx.input.bundle.renderedPrompt;
    const invocation = makeCliInvocation({
      command: location.resolvedPath,
      args,
      cwd: ctx.cwd,
      env: ctx.env,
      stdin: prompt,
      keepStdinOpen: false,
    });

    let spawned: SpawnedProcess;
    try {
      spawned = spawnInvocation(invocation);
    } catch (error) {
      yield doneFailed('spawn_failed', `Failed to spawn opencode: ${messageOf(error)}`, true);
      return;
    }

    this.running.set(ctx.runId, spawned);

    // Wire cancellation: aborting the signal kills the child; the exit path emits terminal.
    const onAbort = () => killProcess(spawned, 'SIGTERM');
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener('abort', onAbort, { once: true });

    const queue: QueueItem[] = [];
    let resolveNext: (() => void) | null = null;
    const wake = () => {
      const r = resolveNext;
      resolveNext = null;
      r?.();
    };
    const pushFrame = (frame: DriverFrame) => {
      queue.push({ frame });
      wake();
    };
    const pushError = (error: unknown) => {
      queue.push({ error });
      wake();
    };

    let usage: TokenUsage = emptyTokenUsage();
    let usageSeen = false;
    let approvalCounter = 0;

    const detachStdout = attachJsonlObjectReader<OpenCodeJsonEvent>(
      spawned.stdout,
      (event) => {
        const frames = bridgeOpenCodeEvent(event, {
          approveBeforeWrite: ctx.policy.approvalMode === 'manual',
          nextApprovalId: () => `oc_appr_${ctx.runId}_${++approvalCounter}`,
        });
        for (const frame of frames) {
          if (frame.kind === 'usage') {
            usage = addTokenUsage(usage, frame.usage);
            usageSeen = true;
          }
          pushFrame(frame);
        }
      },
      (error, line) => {
        // Malformed JSON line: surface as a non-terminal log, never silently swallow.
        pushFrame({
          kind: 'log',
          level: 'warn',
          message: `Unparseable opencode event line: ${error.message}`,
          data: { line: line.slice(0, 500) },
        });
      },
    );

    // Capture stderr tail for failure diagnostics (also surfaced as debug logs).
    let stderrTail = '';
    const detachStderr = attachAnsiTextReader(spawned.stderr, (text) => {
      stderrTail = (stderrTail + text).slice(-4000);
    });

    // Drive process exit on a side channel so we can interleave frame draining.
    let exitCode: number | null | undefined;
    let exitError: unknown;
    let exited = false;
    waitForChildProcess(spawned.child)
      .then((code) => {
        exitCode = code;
      })
      .catch((error) => {
        exitError = error;
      })
      .finally(() => {
        exited = true;
        wake();
      });

    try {
      // Drain frames as they arrive until the process has exited AND the queue is empty.
      while (true) {
        while (queue.length > 0) {
          const item = queue.shift()!;
          if ('error' in item) {
            yield errorToDone(item.error);
            return;
          }
          yield item.frame;
        }

        if (exited && queue.length === 0) break;

        await new Promise<void>((resolve) => {
          resolveNext = resolve;
          // Re-check synchronously in case wake() fired between the loop guard and here.
          if (queue.length > 0 || exited) {
            resolveNext = null;
            resolve();
          }
        });
      }
    } finally {
      detachStdout();
      detachStderr();
      ctx.signal.removeEventListener('abort', onAbort);
      this.running.delete(ctx.runId);
    }

    // Terminal frame derived from the process outcome.
    const finalUsage = usageSeen ? usage : undefined;

    if (ctx.signal.aborted) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'aborted',
        code: 'cancelled',
        retryable: false,
        message: 'opencode run was cancelled.',
        usage: finalUsage,
      };
      return;
    }

    if (exitError) {
      yield { ...errorToDone(exitError), usage: finalUsage };
      return;
    }

    if (exitCode === 0) {
      yield {
        kind: 'done',
        ok: true,
        stopReason: 'end_turn',
        usage: finalUsage,
      };
      return;
    }

    yield {
      kind: 'done',
      ok: false,
      stopReason: 'error' as StopReason,
      code: 'spawn_failed',
      retryable: false,
      message: `opencode exited with code ${exitCode ?? 'null'}.${stderrTail ? ` stderr: ${stderrTail.slice(-500)}` : ''}`,
      usage: finalUsage,
    };
  }

  async cancel(runId: string): Promise<void> {
    const spawned = this.running.get(runId);
    if (spawned) {
      killProcess(spawned, 'SIGTERM');
    }
  }
}

function doneFailed(
  code: ReturnType<typeof errorCodeOf>,
  message: string,
  retryable: boolean,
): DoneFrame {
  return {
    kind: 'done',
    ok: false,
    stopReason: 'error',
    code,
    retryable,
    message,
  };
}

function errorToDone(error: unknown): DoneFrame {
  const code = errorCodeOf(error);
  return {
    kind: 'done',
    ok: false,
    stopReason: code === 'cancelled' ? 'aborted' : 'error',
    code,
    retryable: false,
    message: messageOf(error),
  };
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Factory matching the public API shape `createOpenCodeDriver(opts?)`. */
export function createOpenCodeDriver(options: OpenCodeDriverOptions = {}): RuntimeDriver {
  return new OpenCodeDriver(options);
}

// Re-export so callers that import the driver also see runtimeError without a deep path.
export { runtimeError };
