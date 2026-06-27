import type { AgentSurface } from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import type { DriverContext } from '../contracts/driver-context';
import type { DriverFrame } from '../contracts/driver-frame';
import { makeRunId, type RunId } from '../types/run-id';

export type RunContextInit = {
  adapterId: string;
  runtimeId: string;
  surface: AgentSurface | 'browser_agent';
  input: RuntimeTaskInput;
  signal: AbortSignal;
  cwd: string;
  env: Readonly<Record<string, string>>;
  emit: (frame: DriverFrame) => void;
  log: (message: string, data?: Record<string, unknown>) => void;
  now?: () => number;
  runId?: RunId;
};

/**
 * Build the per-run `DriverContext` handed to a driver. The runId derives from the
 * bundleId (mirrors generic-adapter.ts:116) when present, else a fresh id.
 */
export function buildDriverContext(init: RunContextInit): DriverContext {
  const runId =
    init.runId ?? makeRunId(init.input.bundle.bundleId || `${init.adapterId}:${init.input.task.taskId}`);
  const now = init.now ?? Date.now;

  return {
    runId,
    adapterId: init.adapterId,
    runtimeId: init.runtimeId,
    surface: init.surface,
    input: init.input,
    policy: init.input.policy,
    cwd: init.cwd,
    env: init.env,
    signal: init.signal,
    now,
    emit: init.emit,
    log: init.log,
  };
}
