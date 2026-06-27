/**
 * A thin generic process driver (design §3.5). It drives any CLI that takes a prompt and
 * streams text output, over `drivers/shared` plumbing, and is the base for the remaining
 * `AgentSurface` surfaces that do not yet have a bespoke fused driver:
 * `gemini-cli`, `qwen-code`, and the generic `acp` transport.
 *
 * It owns only the universal "spawn CLI -> stream stdout as text frames -> terminal done by
 * exit code" path. It NEVER fakes completion: a missing binary yields
 * `done({ ok:false, code:'cli_not_found' })`; a non-zero exit yields
 * `done({ ok:false, code:'spawn_failed' })`. Bespoke event parsing (stream-json, ACP
 * JSON-RPC) is layered by replacing the `parseStdout` hook in a richer driver later.
 */
import type { RuntimeDriver, DriverProbe } from '../../contracts/runtime-driver';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverFrame } from '../../contracts/driver-frame';
import type { CliInvocation } from '../../contracts/cli-invocation';
import { makeCliInvocation } from '../../contracts/cli-invocation';
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import type { RuntimeHealth } from '@recoder/agent-os';
import { spawnInvocation, killProcess, type SpawnedProcess } from '../shared/process-driver';
import { attachAnsiTextReader } from '../shared/ansi-text-reader';
import { locateCli } from '../shared/cli-locator';
import { probeCliVersion } from '../shared/cli-version-probe';

export type GenericArgsBuilder = (input: {
  prompt: string;
  ctx: DriverContext;
}) => readonly string[];

export type GenericProcessDriverOptions = {
  descriptor: DriverDescriptor;
  /** Binary name (from descriptor.cli.binary when omitted). */
  binary?: string;
  /** node_modules/.bin name (from descriptor.cli.binName when omitted). */
  binName?: string;
  /** Version probe arg (from descriptor.cli.versionArg when omitted). */
  versionArg?: string;
  /** Build the CLI args from the rendered prompt + context. */
  buildArgs: GenericArgsBuilder;
  /** Feed the prompt over stdin instead of args (default false). */
  promptViaStdin?: boolean;
  cliPathOverride?: string;
};

export class GenericProcessDriver implements RuntimeDriver {
  readonly descriptor: DriverDescriptor;
  readonly #options: GenericProcessDriverOptions;
  #active: SpawnedProcess | null = null;

  constructor(options: GenericProcessDriverOptions) {
    this.descriptor = options.descriptor;
    this.#options = options;
  }

  async probe(ctx: DriverProbeContext): Promise<DriverProbe> {
    const binary = this.#binary();
    const result = probeCliVersion({
      binary,
      binName: this.#binName(),
      override: ctx.cliPathOverride ?? this.#options.cliPathOverride,
      cwd: ctx.cwd,
      pathEnv: ctx.env?.['PATH'],
      versionArg: this.#options.versionArg ?? this.descriptor.cli?.versionArg ?? '--version',
    });
    const checkedAt = new Date().toISOString();
    if (!result.available) {
      const health: RuntimeHealth = {
        status: 'offline',
        checkedAt,
        message: result.unavailableReason ?? `${binary} not found`,
      };
      return { health, available: false, unavailableReason: result.unavailableReason };
    }
    const health: RuntimeHealth = {
      status: 'healthy',
      checkedAt,
      message: result.version ? `${binary} ${result.version}` : `${binary} available`,
    };
    return { health, available: true, version: result.version };
  }

  run(ctx: DriverContext): AsyncIterable<DriverFrame> {
    return this.#runGenerator(ctx);
  }

  async cancel(_runId: string): Promise<void> {
    if (this.#active) killProcess(this.#active, 'SIGTERM');
  }

  async *#runGenerator(ctx: DriverContext): AsyncGenerator<DriverFrame> {
    const binary = this.#binary();
    const location = locateCli({
      binary,
      binName: this.#binName(),
      override: this.#options.cliPathOverride,
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
        message: `${binary} CLI not found (looked up "${binary}" on PATH/local bin).`,
      };
      return;
    }

    const invocation = this.#buildInvocation(ctx, location.resolvedPath);
    yield { kind: 'state', state: 'running', message: `${binary} starting` };

    const queue: DriverFrame[] = [];
    let ended = false;
    let exitCode: number | null | undefined;
    let wake: (() => void) | null = null;
    const signalWake = (): void => {
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    };

    const stderrChunks: string[] = [];

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
        message: error instanceof Error ? error.message : `failed to spawn ${binary}`,
      };
      return;
    }
    this.#active = spawned;

    const onAbort = (): void => killProcess(spawned, 'SIGTERM');
    ctx.signal.addEventListener('abort', onAbort, { once: true });

    const detach = attachAnsiTextReader(spawned.stdout, (text) => {
      if (text.length > 0) {
        queue.push({ kind: 'text', text });
        signalWake();
      }
    });

    spawned.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
    spawned.child.on('close', (code) => {
      exitCode = code;
      ended = true;
      detach();
      signalWake();
    });
    spawned.child.on('error', () => {
      ended = true;
      signalWake();
    });

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift() as DriverFrame;
        }
        if (ended) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      while (queue.length > 0) {
        yield queue.shift() as DriverFrame;
      }
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
      detach();
      this.#active = null;
    }

    if (ctx.signal.aborted) {
      yield {
        kind: 'done',
        ok: false,
        stopReason: 'aborted',
        code: 'cancelled',
        retryable: false,
        message: `${binary} run cancelled`,
      };
      return;
    }

    if (exitCode === 0) {
      yield { kind: 'done', ok: true, stopReason: 'end_turn' };
      return;
    }
    yield {
      kind: 'done',
      ok: false,
      stopReason: 'error',
      code: 'spawn_failed',
      retryable: true,
      message:
        exitCode === null || exitCode === undefined
          ? `${binary} exited abnormally`
          : `${binary} exited with code ${exitCode}`,
      data: stderrChunks.length > 0 ? { stderr: stderrChunks.join('').slice(-2000) } : undefined,
    };
  }

  #buildInvocation(ctx: DriverContext, resolvedBinary: string): CliInvocation {
    const prompt = ctx.input.bundle.renderedPrompt;
    const args = this.#options.buildArgs({ prompt, ctx });
    return makeCliInvocation({
      command: resolvedBinary,
      args,
      cwd: ctx.cwd,
      env: ctx.env,
      stdin: this.#options.promptViaStdin ? prompt : undefined,
      keepStdinOpen: false,
    });
  }

  #binary(): string {
    return this.#options.binary ?? this.descriptor.cli?.binary ?? this.descriptor.id;
  }

  #binName(): string | undefined {
    return this.#options.binName ?? this.descriptor.cli?.binName;
  }
}

export function createGenericProcessDriver(
  options: GenericProcessDriverOptions,
): RuntimeDriver {
  return new GenericProcessDriver(options);
}
