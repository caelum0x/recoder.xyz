import type { Approval, RuntimeHealth } from '@recoder/agent-os';
import type { RuntimeHandle, RuntimeStartInput } from '@recoder/agent-runtimes';
import type { DriverDescriptor } from '../registry/driver-descriptor';
import type { DriverContext, DriverProbeContext } from './driver-context';
import type { DriverFrame } from './driver-frame';

export type ApprovalDecision = Pick<Approval, 'status' | 'decidedBy' | 'decisionReason'>;

/**
 * Result of a driver's health/presence probe. The engine merges this with env health
 * and a CLI-version probe to produce the adapter `health()` value.
 */
export type DriverProbe = {
  health: RuntimeHealth;
  /** Whether the underlying CLI binary / in-process agent is present + invocable. */
  available: boolean;
  /** Detected CLI version, when probed. */
  version?: string;
  /** Reason the driver is unavailable, when `available` is false (truthful, never faked). */
  unavailableReason?: string;
};

/**
 * The internal SPI every fused source implements. This is the frame-oriented analog of
 * the public `AgentRuntimeAdapter`. A driver's contract:
 *
 * - `probe` reports truthful availability/health (never green-washes a missing CLI).
 * - `run` performs the headless run, yielding `DriverFrame`s. It MUST yield a terminal
 *   `done` frame; a driver with no real run impl must NOT mark complete — it throws or
 *   yields `done({ ok: false, code: 'runtime_unavailable' })`.
 * - `cancel`/`approve` are optional steering hooks resolved by the engine.
 */
export interface RuntimeDriver {
  readonly descriptor: DriverDescriptor;

  probe(ctx: DriverProbeContext): Promise<DriverProbe>;

  start?(ctx: DriverContext): Promise<RuntimeHandle>;

  /** Perform the headless run. May also use `ctx.emit`; the returned iterable is primary. */
  run(ctx: DriverContext): AsyncIterable<DriverFrame>;

  cancel?(runId: string): Promise<void>;

  approve?(approvalId: string, decision: ApprovalDecision): Promise<void>;
}

export type { RuntimeHandle, RuntimeStartInput };
