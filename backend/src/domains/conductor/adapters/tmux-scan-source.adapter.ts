/**
 * `createTmuxScanSource` — the FUSION seam that feeds the engines domain's DEEP,
 * read-only tmux introspection ({@link TmuxIntrospectPort}) into the conductor's
 * reconcile-GC substrate scan ({@link SubstrateScanDeps}).
 *
 * Reconcile's whole point is restart survivability: after a backend restart the
 * in-memory session map is empty, so reconcile must query the REAL box directly.
 * This source drives `tmux list-sessions` (through the engine's typed introspect
 * port, NOT a second raw shell-out) and hands reconcile the live conductor
 * session names, so orphaned/leaked `recoder-*` sessions are detectable for GC and
 * record-vs-session drift is corrected.
 *
 * CONDUCTOR-SCOPED BY CONSTRUCTION: only sessions under the conductor's own
 * `recoder-` prefix are surfaced. A user's unrelated tmux sessions are NEVER
 * reported, so reconcile's `orphanedSessions` set can never target non-conductor
 * work — the box-wide introspection is filtered down to the sessions the conductor
 * actually owns before it reaches the GC logic.
 *
 * DEGRADE-TRUTHFUL: tmux absent / not runnable ⇒ the introspect port returns a
 * typed `fail` (never throws), which this source maps to an empty list and a
 * truthful warn — reconcile then sees "cannot observe live sessions" exactly as it
 * does with no source wired at all. It NEVER blocks a run and NEVER fabricates a
 * live session. tmux present but with no server yet is the empty state (`ok([])`).
 */
import type { LoggerPort } from '@recoder/substrate';
import type { TmuxIntrospectPort } from '../../engines/adapters/cli/tmux-introspect.adapter.js';
import type { SubstrateScanDeps } from './substrate-scan.adapter.js';

/** The conductor namespaces every tmux session + worktree dir under this prefix. */
const CONDUCTOR_SESSION_PREFIX = 'recoder-';

export interface TmuxScanSourceDeps {
  /** The engines domain's read-only tmux introspection port (box-wide `list-sessions`). */
  readonly introspect: TmuxIntrospectPort;
  /** Structured logger for the truthful degrade path (optional). */
  readonly logger?: LoggerPort;
  /** Session-name prefix that marks a conductor-owned session; default `recoder-`. */
  readonly sessionPrefix?: string;
  /**
   * Optional worktree lister (`git worktree list` → conductor workspace-ids). Left
   * to the composition root; absent ⇒ reconcile degrades on the worktree facet
   * exactly as before (empty), while the tmux-session facet is fully live.
   */
  readonly listConductorWorktrees?: () => Promise<readonly string[]>;
}

/**
 * Build the reconcile substrate-scan source over the tmux introspection engine.
 * The returned {@link SubstrateScanDeps} is what the conductor module hands to
 * `createSubstrateScan(...)` so `reconcile` can see the live box.
 */
export function createTmuxScanSource(deps: TmuxScanSourceDeps): SubstrateScanDeps {
  const prefix = deps.sessionPrefix ?? CONDUCTOR_SESSION_PREFIX;
  return {
    async listLiveSessions(): Promise<readonly string[]> {
      const res = await deps.introspect.listSessions();
      if (!res.ok) {
        deps.logger?.warn('reconcile scan: tmux introspection unavailable — degrading to no live sessions', {
          reason: res.reason,
          ...(res.code ? { code: res.code } : {}),
        });
        return [];
      }
      // Box-wide sessions filtered to the conductor's OWN namespace: reconcile's
      // orphan/GC logic must never see (and so never flag) a user's unrelated tmux.
      return res.value.map((session) => session.name).filter((name) => name.startsWith(prefix));
    },
    ...(deps.listConductorWorktrees ? { listConductorWorktrees: deps.listConductorWorktrees } : {}),
  };
}
