import type { AgentSurface, RunEvent } from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import type { RuntimeDriver } from '../contracts/runtime-driver';
import type { RuntimeConfig } from '../types/runtime-config';
import { RuntimeEngine } from '../engine/runtime-engine';
import type { CancellationRegistry } from '../engine/cancellation';
import { buildChildEnv } from '../drivers/shared/env-builder';

export type SendTaskDeps = {
  driver: RuntimeDriver;
  adapterId: string;
  runtimeId: string;
  surface: AgentSurface | 'browser_agent';
  config: RuntimeConfig;
  cancellation: CancellationRegistry;
  /** Resolve the cwd for a run (env-factory/cwd-resolver wire this; defaults to process cwd). */
  resolveCwd?: (input: RuntimeTaskInput) => string;
};

/**
 * The public async generator satisfying `AgentRuntimeAdapter.sendTask`. Delegates the
 * lifecycle to the engine; this file only resolves the per-run cwd/env.
 */
export async function* sendTask(
  input: RuntimeTaskInput,
  deps: SendTaskDeps,
): AsyncGenerator<RunEvent> {
  const engine = new RuntimeEngine({ config: deps.config, cancellation: deps.cancellation });
  const cwd = deps.resolveCwd?.(input) ?? process.cwd();
  const { env } = buildChildEnv({
    policy: input.policy,
    redactionPatterns: deps.config.redactionPatterns,
  });

  yield* engine.run({
    driver: deps.driver,
    adapterId: deps.adapterId,
    runtimeId: deps.runtimeId,
    surface: deps.surface,
    input,
    cwd,
    env,
  });
}
