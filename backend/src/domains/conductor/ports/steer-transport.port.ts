/**
 * `SteerTransportPort` — the live send-keys seam `steerWorkspace` delivers through.
 *
 * The composer holds the workspace record (state of record) and the governance
 * verdict; this port is ONLY the transport: inject the user's steer text into the
 * live agent session addressed by the substrate's session name. Bootstrap wires
 * a substrate router with concrete Loom/tmux transports. Absent transport, or a
 * substrate with no transport, refuses steering truthfully (never faked).
 *
 * Contract: `sendKeys` THROWS when delivery is impossible (session gone, engine
 * errored) — a truthful failure the composer surfaces as `ok:false`; it never
 * silently drops keys.
 */

import type { SubstrateKind } from '../types.js';

/** One steer delivery: text/keys into the session, optionally submitted (Enter). */
export interface SteerKeysInput {
  /** Selects the concrete transport; never infer this from session-name syntax. */
  readonly substrate: SubstrateKind;
  /** The substrate session address (the workspace's `sessionName`). */
  readonly sessionName: string;
  /** The literal text to inject (sent as-is, never interpreted as key names). */
  readonly keys: string;
  /** Append a trailing Enter so the agent CLI submits the text. */
  readonly submit: boolean;
}

/** The live send-keys transport into a workspace's interactive session. */
export interface SteerTransportPort {
  /** Deliver keys into the live session; throws truthfully when it cannot. */
  sendKeys(input: SteerKeysInput): Promise<void>;
}
