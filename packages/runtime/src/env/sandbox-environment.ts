import type { CliInvocation } from '../contracts/cli-invocation';
import type { SpawnedProcess } from '../drivers/shared/process-driver';
import type { SandboxPort } from '../seams';
import { runtimeError } from '../errors/runtime-error';
import type {
  ExecResult,
  ExecStreamChunk,
  ExecutionEnvironment,
} from './execution-environment';

/**
 * Runs the same CLI inside a Daytona/E2B sandbox via the `SandboxPort` seam.
 *
 * TODO(wave): the streaming `execStream`/`exec` paths over the `SandboxPort` are wired below
 * against the seam's `exec` async-iterable. The `spawn()` path (returning a live
 * `SpawnedProcess` with node stdio streams) has no faithful remote analog yet — a remote
 * sandbox does not hand back a local `ChildProcess` — so it throws a truthful
 * `env_unavailable` instead of faking a local child. Process-based drivers that need a live
 * child must run in the local environment until the sandbox transport exposes a streamed
 * stdio handle. This is intentionally NOT green-washed.
 */
export class SandboxEnvironment implements ExecutionEnvironment {
  readonly kind = 'sandbox';

  readonly #sandbox: SandboxPort;
  readonly #sandboxId: string;

  constructor(input: { sandbox: SandboxPort; sandboxId: string }) {
    this.#sandbox = input.sandbox;
    this.#sandboxId = input.sandboxId;
  }

  // TODO(wave): no remote ChildProcess handle exists; refuse rather than fake one.
  async spawn(_invocation: CliInvocation): Promise<SpawnedProcess> {
    throw runtimeError(
      'env_unavailable',
      'SandboxEnvironment.spawn() is not yet implemented: the sandbox transport does not ' +
        'expose a live ChildProcess. Use execStream(), or run process-based drivers locally.',
      { retryable: false, details: { sandboxId: this.#sandboxId } },
    );
  }

  async exec(input: {
    command: string;
    args: readonly string[];
    cwd: string;
    env?: Readonly<Record<string, string>>;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ExecResult> {
    let stdout = '';
    let stderr = '';
    for await (const chunk of this.#sandbox.exec({
      sandboxId: this.#sandboxId,
      command: input.command,
      args: [...input.args],
      cwd: input.cwd,
      env: input.env ? { ...input.env } : undefined,
    })) {
      if (chunk.stream === 'stdout') stdout += chunk.chunk;
      else stderr += chunk.chunk;
      if (input.signal?.aborted) break;
    }
    // The SandboxPort exec stream does not surface an exit code; report null (unknown)
    // truthfully rather than inventing a zero.
    return { exitCode: null, stdout, stderr };
  }

  async *execStream(input: {
    command: string;
    args: readonly string[];
    cwd: string;
    env?: Readonly<Record<string, string>>;
    signal?: AbortSignal;
  }): AsyncIterable<ExecStreamChunk> {
    for await (const chunk of this.#sandbox.exec({
      sandboxId: this.#sandboxId,
      command: input.command,
      args: [...input.args],
      cwd: input.cwd,
      env: input.env ? { ...input.env } : undefined,
    })) {
      if (input.signal?.aborted) return;
      yield { stream: chunk.stream, chunk: chunk.chunk };
    }
  }

  // TODO(wave): a remote `exists` probe needs a sandbox fs port; refuse rather than guess.
  async exists(_path: string): Promise<boolean> {
    throw runtimeError(
      'env_unavailable',
      'SandboxEnvironment.exists() requires a sandbox filesystem port not yet wired.',
      { retryable: false },
    );
  }

  async dispose(): Promise<void> {
    // The sandbox lifecycle is owned by @recoder/agent-sandbox, not this env wrapper.
  }
}

export function createSandboxEnvironment(input: {
  sandbox: SandboxPort;
  sandboxId: string;
}): ExecutionEnvironment {
  return new SandboxEnvironment(input);
}
