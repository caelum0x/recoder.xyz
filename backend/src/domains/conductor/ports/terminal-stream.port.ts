/**
 * TerminalStreamPort — the seam the `http`/`edge` domain consumes to attach the
 * `/terminal` (control-mode terminal) and `/sync` (RunEvent fan-out) WebSockets.
 *
 * Conflict #6 resolution (BUILD-ORDER Phase 4/5b): the EDGE owns the single
 * `server.on('upgrade')` dispatcher, the origin check, the on-upgrade auth, and
 * the WS rate limit. The conductor does NOT touch the raw upgrade — it PROVIDES
 * the `WsBackend`s (one per path) that the edge's upgrade router registers and
 * dispatches already-authorized sockets to. This port is how the conductor hands
 * those backends up.
 *
 * `WsBackend`/`WsConnectionCtx` are the FROZEN Phase-4 edge contract; the
 * conductor implements them (in `terminal/terminal-stream.ts` and
 * `terminal/live-events.ts`) and exposes them through `terminalBackends()`.
 */
import type { WsBackend } from '../../edge/ports/ws-backend.port.js';
import type { WorkspaceState } from '@recoder/agent-os';
import type { AttentionState } from '../types.js';

/** A live per-workspace `/sync` event pushed to attached clients. */
export interface WorkspaceSyncEvent {
  readonly workspaceId: string;
  /** State change, log delta, or attention update. */
  readonly kind: 'state' | 'log' | 'attention';
  readonly state?: WorkspaceState;
  readonly attention?: AttentionState;
  /** Log delta text (kind='log') — already decoded from the terminal. */
  readonly text?: string;
  readonly at: string;
}

/**
 * The conductor's terminal surface, consumed by the edge. Provides the WS
 * backends to register and the publish hook the run-tailer/live-events use to
 * fan a `RunEvent` out to `/sync` subscribers.
 */
export interface TerminalStreamPort {
  /**
   * The WS backends this domain serves: `/terminal` (control-mode stream + steer
   * via send-keys) and `/sync` (per-workspace RunEvent fan-out). The edge
   * registers each with its upgrade router; both require `authScope: 'session'`.
   */
  terminalBackends(): readonly WsBackend[];
  /** Publish a live event to every client attached to that workspace's `/sync`. */
  publishSync(event: WorkspaceSyncEvent): void;
  /**
   * Publish a FULL RunEvent to every client attached to that workspace's
   * `/workspaces/:id/stream`. The conductor's local run-event sink calls this for
   * conductor-tailed events; the composition root calls it to fan NON-conductor
   * (engine/cloud/internal-api) bus envelopes onto the same live stream.
   */
  publishRunEvent(workspaceId: string, event: unknown): void;
}
