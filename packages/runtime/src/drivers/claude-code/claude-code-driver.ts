import type { RuntimeDriver, DriverProbe, ApprovalDecision } from '../../contracts/runtime-driver';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverFrame } from '../../contracts/driver-frame';
import { makeCliInvocation, type CliInvocation } from '../../contracts/cli-invocation';
import {
  spawnInvocation,
  awaitProcessExit,
  killProcess,
  type SpawnedProcess,
} from '../../drivers/shared/process-driver';
import { attachJsonlObjectReader } from '../../drivers/shared/jsonl-reader';
import { serializeJsonLine } from '../../drivers/shared/jsonl-writer';
import { locateCli } from '../../drivers/shared/cli-locator';
import { RuntimeAdapterError } from '../../errors/runtime-error';
import type { RuntimeErrorCode } from '../../errors/error-codes';
import { CLAUDE_CODE_DESCRIPTOR, CLAUDE_CODE_BINARY } from './claude-descriptor';
import { probeClaudeCode } from './claude-health';
import { buildClaudeArgs } from './claude-args';
import { buildClaudePermissionFlags } from './claude-permission-bridge';
import { parseClaudeStreamJsonEvent } from './claude-stream-json';
import { writeClaudeMcpConfig, type ClaudeMcpConfig } from './claude-mcp-config';

/**
 * Options for constructing a Claude Code driver. All optional — the driver runs against the
 * user's `claude` CLI on PATH by default.
 */
export type ClaudeCodeDriverOptions = {
  /** Override the resolved binary path (RuntimeConfig.cliPaths.claude_code). */
  cliPathOverride?: string;
  /** `--model` override from brain/route hints. */
  model?: string;
  /** MCP server config to write to `.mcp.json` and pass via `--mcp-config`. */
  mcpConfig?: ClaudeMcpConfig;
  /** Extra passthrough CLI args (kept last). */
  extraArgs?: readonly string[];
  /** Version-probe timeout. */
  probeTimeoutMs?: number;
};

/**
 * RuntimeDriver that drives the user's `claude` CLI headless in stream-json mode.
 *
 * Its only job: native CLI output -> DriverFrame[]. The engine owns lifecycle, policy guards,
 * normalization, terminal-guard, and sink fan-out. This driver:
 *  1. probes the CLI truthfully (no fake availability),
 *  2. spawns `claude -p --output-format stream-json --verbose --input-format stream-json`,
 *  3. feeds the rendered prompt as a stream-json `user` message on stdin,
 *  4. parses native events into `DriverFrame`s,
 *  5. guarantees a terminal `done` — synthesizing a failure if the process exits without one
 *     (never marking complete without a real `result`).
 */
export class ClaudeCodeDriver implements RuntimeDriver {
  readonly descriptor = CLAUDE_CODE_DESCRIPTOR;

  private readonly options: ClaudeCodeDriverOptions;
  private active?: SpawnedProcess;

  constructor(options: ClaudeCodeDriverOptions = {}) {
    this.options = options;
  }

  async probe(ctx: DriverProbeContext): Promise<DriverProbe> {
    const probeCtx: DriverProbeContext = {
      ...ctx,
      cliPathOverride: ctx.cliPathOverride ?? this.options.cliPathOverride,
    };
    return probeClaudeCode(probeCtx, { timeoutMs: this.options.probeTimeoutMs });
  }

  async *run(ctx: DriverContext): AsyncIterable<DriverFrame> {
    // 1. Resolve the binary truthfully. A missing CLI must NOT fake completion.
    const location = locateCli({
      binary: CLAUDE_CODE_BINARY,
      binName: CLAUDE_CODE_BINARY,
      override: this.options.cliPathOverride,
      cwd: ctx.cwd,
      pathEnv: ctx.env['PATH'],
    });
    if (!location.found || !location.resolvedPath) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'error',
        code: 'cli_not_found',
        retryable: false,
        message: `claude CLI not found on PATH or local bin (cwd=${ctx.cwd}).`,
      };
      return;
    }

    // 2. Compose the invocation: args from policy, env/cwd from the engine, prompt on stdin.
    const invocation = await this.#buildInvocation(ctx, location.resolvedPath);

    if (ctx.signal.aborted) {
      yield this.#abortedDone();
      return;
    }

    yield* this.#streamRun(ctx, invocation);
  }

  async cancel(): Promise<void> {
    if (this.active) {
      killProcess(this.active, 'SIGTERM');
    }
  }

  // Claude Code approvals are handled by the engine's approval-pause + the CLI's own
  // permission mode; this hook is a no-op acknowledgement for SPI completeness.
  async approve(_approvalId: string, _decision: ApprovalDecision): Promise<void> {
    return;
  }

  async #buildInvocation(ctx: DriverContext, command: string): Promise<CliInvocation> {
    const permission = buildClaudePermissionFlags({
      policy: ctx.policy,
      forbiddenActions: ctx.input.bundle.forbiddenActions,
    });

    const mcpConfigPath = await writeClaudeMcpConfig(this.options.mcpConfig);

    const args = buildClaudeArgs({
      permission,
      mcpConfigPath,
      model: this.options.model,
      extraArgs: this.options.extraArgs,
    });

    // The prompt is fed as a single stream-json `user` message line on stdin, then stdin
    // is closed (no mid-run steering in this print-mode driver).
    const stdin = serializeJsonLine({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: ctx.input.bundle.renderedPrompt }],
      },
    });

    return makeCliInvocation({
      command,
      args,
      cwd: ctx.cwd,
      env: ctx.env,
      stdin,
      keepStdinOpen: false,
    });
  }

  async *#streamRun(
    ctx: DriverContext,
    invocation: CliInvocation,
  ): AsyncIterable<DriverFrame> {
    let spawned: SpawnedProcess;
    try {
      spawned = spawnInvocation(invocation);
    } catch (error) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'error',
        code: 'spawn_failed',
        retryable: true,
        message: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    this.active = spawned;

    const queue = new FrameQueue();
    let sawTerminal = false;
    const stderrChunks: string[] = [];

    const detachStdout = attachJsonlObjectReader(
      spawned.stdout,
      (value) => {
        for (const frame of parseClaudeStreamJsonEvent(value as Record<string, unknown>)) {
          if (frame.kind === 'done') sawTerminal = true;
          queue.push(frame);
        }
      },
      (parseError, line) => {
        queue.push({
          kind: 'log',
          level: 'warn',
          message: `claude stream-json parse error: ${parseError.message}`,
          data: { line },
        });
      },
    );

    const onStderr = (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    };
    spawned.stderr.on('data', onStderr);

    const onAbort = () => {
      killProcess(spawned, 'SIGTERM');
    };
    if (ctx.signal.aborted) {
      onAbort();
    } else {
      ctx.signal.addEventListener('abort', onAbort, { once: true });
    }

    // Drive the process to exit; resolve the queue's terminator with the exit outcome.
    const exitPromise = awaitProcessExit(spawned, {
      command: CLAUDE_CODE_BINARY,
      stderrTail: () => stderrChunks.join('').slice(-2000),
    })
      .then(() => ({ ok: true as const }))
      .catch((error: unknown) => ({ ok: false as const, error }))
      .finally(() => {
        detachStdout();
        spawned.stderr.off('data', onStderr);
        ctx.signal.removeEventListener('abort', onAbort);
        queue.close();
      });

    try {
      for await (const frame of queue) {
        yield frame;
      }
    } finally {
      this.active = undefined;
    }

    const exit = await exitPromise;

    // 5. Fail-safe terminal guarantee. The `result` event yields the real `done`; if the
    // process exited without one, synthesize a truthful failure — never a fake completion.
    if (!sawTerminal) {
      yield this.#syntheticTerminal(ctx, exit, stderrChunks.join('').slice(-2000));
    }
  }

  #abortedDone(): DriverFrame {
    return {
      kind: 'done',
      ok: false,
      stopReason: 'aborted',
      code: 'cancelled',
      retryable: false,
      message: 'claude run aborted before start',
    };
  }

  #syntheticTerminal(
    ctx: DriverContext,
    exit: { ok: true } | { ok: false; error: unknown },
    stderrTail: string,
  ): DriverFrame {
    if (ctx.signal.aborted) {
      return {
        kind: 'done',
        ok: false,
        stopReason: 'aborted',
        code: 'cancelled',
        retryable: false,
        message: 'claude run cancelled',
        data: stderrTail ? { stderr: stderrTail } : undefined,
      };
    }

    if (exit.ok) {
      // Clean exit but no `result` event — the CLI produced no terminal frame. Truthful
      // failure: we cannot claim success without evidence.
      return {
        kind: 'done',
        ok: false,
        stopReason: 'unknown',
        code: 'parse_error',
        retryable: false,
        message: 'claude exited without emitting a result event',
        data: stderrTail ? { stderr: stderrTail } : undefined,
      };
    }

    const { code, retryable, message } = classifyExitError(exit.error);
    return {
      kind: 'done',
      ok: false,
      stopReason: 'error',
      code,
      retryable,
      message,
      data: stderrTail ? { stderr: stderrTail } : undefined,
    };
  }
}

function classifyExitError(error: unknown): {
  code: RuntimeErrorCode;
  retryable: boolean;
  message: string;
} {
  if (error instanceof RuntimeAdapterError) {
    return {
      code: error.code as RuntimeErrorCode,
      retryable: error.retryable ?? false,
      message: error.message,
    };
  }
  return {
    code: 'spawn_failed',
    retryable: true,
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * A minimal async push queue bridging the event-emitter stdout reader to the driver's
 * async generator. Frames pushed before consumption are buffered; `close()` ends iteration.
 */
class FrameQueue implements AsyncIterable<DriverFrame> {
  private readonly buffer: DriverFrame[] = [];
  private closed = false;
  private resolveNext?: () => void;

  push(frame: DriverFrame): void {
    if (this.closed) return;
    this.buffer.push(frame);
    this.resolveNext?.();
    this.resolveNext = undefined;
  }

  close(): void {
    this.closed = true;
    this.resolveNext?.();
    this.resolveNext = undefined;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<DriverFrame> {
    while (true) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as DriverFrame;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.resolveNext = resolve;
      });
    }
  }
}

/** Factory matching the public-api signature `createClaudeCodeDriver(opts?)`. */
export function createClaudeCodeDriver(options?: ClaudeCodeDriverOptions): RuntimeDriver {
  return new ClaudeCodeDriver(options);
}
