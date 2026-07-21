/**
 * `createRecoderSessionLister` — the READ-ONLY attach-list bridge
 * (durable-shell unify §A2): surfaces the live `recoder-*` tmux sessions the
 * conductor drives so the wave-side attach path can SEE them without owning a
 * competing durability engine.
 *
 * It is a pure composition of two EXISTING, verified seams:
 *   - the engines domain's DEEP read-only {@link TmuxIntrospectPort} (built at the
 *     composition root over the SAME pinned binary the conductor's headless
 *     sessions live in) — INJECTED here, never imported across the domain boundary,
 *     and
 *   - the conductor's `createTmuxScanSource`, which filters the box-wide
 *     `list-sessions` down to the conductor's OWN `recoder-` namespace.
 *
 * STRICTLY READ-ONLY: `list-sessions` only — no `new-session`, no `send-keys`, no
 * `kill-session`. It observes; it never mutates a session's lifecycle. This is the
 * behavior-preserving half of the unify: additive, unused by the default terminal
 * lifecycle, and it changes which server/socket/PTY no durable session lives in.
 *
 * CONDUCTOR-SCOPED BY CONSTRUCTION: only names under `SESSION_PREFIX` (`recoder-`)
 * are returned — a user's unrelated tmux sessions are NEVER surfaced.
 *
 * DEGRADE-TRUTHFUL: tmux absent / not runnable ⇒ the introspect port returns a
 * typed `fail` (never throws), the scan source maps it to an empty list + a
 * truthful warn, and this bridge returns `[]`. A tmux present with no server yet
 * is the empty state. Nothing is ever fabricated.
 */
import type { LoggerPort } from '@recoder/substrate';
// Type-only across the domain boundary (the guard allows types): the engines
// domain OWNS `createTmuxIntrospect`/`TMUX_BIN`; a runtime value import of them
// here would couple conductor → engines. The concrete port is INJECTED from the
// composition root instead (bootstrap builds `engines.tmuxIntrospect()`).
import type { TmuxIntrospectPort } from '../../engines/adapters/cli/tmux-introspect.adapter.js';
import { createTmuxScanSource } from './tmux-scan-source.adapter.js';

export interface RecoderSessionListerDeps {
  /**
   * The read-only introspection port to observe through, INJECTED from the
   * composition root over the SAME pinned tmux binary the conductor drives.
   * Absent ⇒ the engines-owned tmux facet is undeclared, so this bridge cannot
   * observe the substrate and DEGRADES TRUTHFULLY to an empty list — it never
   * value-imports the engines default and never fabricates a live session.
   */
  readonly introspect?: TmuxIntrospectPort;
  /** Structured logger for the truthful degrade path (optional). */
  readonly logger?: LoggerPort;
}

/**
 * Build the read-only `recoder-*` session lister. The returned function resolves
 * the live conductor-owned session names (prefix-filtered) when an introspect
 * port is injected, or an empty list when it is absent or tmux cannot be observed
 * — it NEVER throws and NEVER fabricates a live session.
 */
export function createRecoderSessionLister(
  deps: RecoderSessionListerDeps = {},
): () => Promise<readonly string[]> {
  // No injected introspect ⇒ the engines tmux facet is undeclared. Cannot observe
  // ⇒ truthful empty list (never a fabricated live session), never a cross-domain
  // value import to build a default.
  if (!deps.introspect) {
    return async () => [];
  }
  const scan = createTmuxScanSource({
    introspect: deps.introspect,
    ...(deps.logger ? { logger: deps.logger } : {}),
  });
  return async () => (await scan.listLiveSessions?.()) ?? [];
}
