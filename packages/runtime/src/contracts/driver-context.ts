import type { AgentSurface, RunEvent } from '@recoder/agent-os';
import type { RuntimeTaskInput, RuntimePolicy } from '@recoder/agent-runtimes';
import type { RunId } from '../types/run-id';
import type { DriverFrame } from './driver-frame';

/**
 * Everything a driver needs to perform one headless run, handed in by the engine.
 *
 * Pure-effect boundary: the driver reads `input`/`cwd`/`env`/`policy`, watches `signal`,
 * and emits `DriverFrame`s — either by returning an `AsyncIterable` from `run()` or by
 * calling `emit()` directly. It never touches control-plane state.
 */
export type DriverContext = {
  readonly runId: RunId;
  readonly adapterId: string;
  readonly runtimeId: string;
  readonly surface: AgentSurface | 'browser_agent';

  /** The compiled task to execute. */
  readonly input: RuntimeTaskInput;
  /** Convenience alias of `input.policy`. */
  readonly policy: RuntimePolicy;

  /** Policy-bounded working directory the CLI runs in. */
  readonly cwd: string;
  /** Secret-redacted, policy-scoped child environment. */
  readonly env: Readonly<Record<string, string>>;

  /** Cooperative cancellation: aborted on `cancel(runId)` or deadline expiry. */
  readonly signal: AbortSignal;

  /** Monotonic-ish clock used for deadlines/timestamps (injectable for tests). */
  now(): number;

  /** Optional imperative emit channel (drivers may instead return an AsyncIterable). */
  emit(frame: DriverFrame): void;

  /** Structured logging seam (already redacted downstream). */
  log(message: string, data?: Record<string, unknown>): void;
};

/** A reduced view passed to probes (no per-run input required). */
export type DriverProbeContext = {
  readonly surface: AgentSurface | 'browser_agent';
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cliPathOverride?: string;
};

export type { RunEvent };
