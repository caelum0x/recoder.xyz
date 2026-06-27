import type { RuntimeKind } from '@recoder/agent-os';
import type { SandboxPort } from '../seams';
import { runtimeError } from '../errors/runtime-error';
import type { ExecutionEnvironment } from './execution-environment';
import { createLocalEnvironment } from './local-environment';
import { createSandboxEnvironment } from './sandbox-environment';

export type EnvFactoryInput = {
  /** Desired environment kind from RuntimeConfig.defaultEnv / policy / task. */
  kind?: RuntimeKind;
  /** Sandbox seam + id, required when kind is `sandbox`. */
  sandbox?: SandboxPort;
  sandboxId?: string;
};

/**
 * Pick an `ExecutionEnvironment` from the requested kind. `local` is the default and the
 * only fully-implemented environment; `sandbox` is wired to the `SandboxPort` seam (its
 * `spawn` path is a wave stub). `hosted`/`external`/`browser` are not yet implemented and
 * fail truthfully with `env_unavailable` rather than silently degrading to local.
 */
export function createExecutionEnvironment(input: EnvFactoryInput = {}): ExecutionEnvironment {
  const kind = input.kind ?? 'local';
  switch (kind) {
    case 'local':
      return createLocalEnvironment();
    case 'sandbox':
      if (!input.sandbox || !input.sandboxId) {
        throw runtimeError(
          'env_unavailable',
          'Sandbox environment requested but no SandboxPort/sandboxId was provided.',
          { retryable: false },
        );
      }
      return createSandboxEnvironment({ sandbox: input.sandbox, sandboxId: input.sandboxId });
    case 'hosted':
    case 'external':
    case 'browser':
      // TODO(wave): hosted/external/browser environments are not implemented. Refuse rather
      // than silently running locally — a caller that asked for isolation must not get less.
      throw runtimeError(
        'env_unavailable',
        `Execution environment "${kind}" is not yet implemented.`,
        { retryable: false, details: { kind } },
      );
    default:
      throw runtimeError('env_unavailable', `Unknown execution environment "${kind}".`, {
        retryable: false,
      });
  }
}
