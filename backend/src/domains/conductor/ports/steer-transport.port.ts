/**
 * `SteerTransportPort` — the live send-keys seam `steerWorkspace` delivers through.
 *
 * The composer holds the workspace record (state of record) and the governance
 * verdict; this port is ONLY the transport: inject the user's steer text into the
 * live agent session addressed by the substrate's session name (the tmux session
 * for `tmux_worktree`). The tmux-backed adapter lives in
 * `adapters/steer-transport.adapter.ts`; bootstrap wires it at the composition
 * root. Absent transport ⇒ the composer refuses steering truthfully (never faked).
 *
 * Contract: `sendKeys` THROWS when delivery is impossible (session gone, tmux
 * errored) — a truthful failure the composer surfaces as `ok:false`; it never
 * silently drops keys.
 */

/** One steer delivery: text/keys into the session, optionally submitted (Enter). */
export interface SteerKeysInput {
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
