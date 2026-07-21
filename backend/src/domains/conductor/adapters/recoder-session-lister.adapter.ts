/**
 * `createRecoderSessionLister` — the READ-ONLY attach-list bridge
 * (durable-shell unify §A2): surfaces the live `recoder-*` tmux sessions the
 * conductor drives so the wave-side attach path can SEE them without owning a
 * competing durability engine.
 *
 * It is a pure composition of two EXISTING, verified seams:
 *   - the engines domain's DEEP read-only {@link TmuxIntrospectPort}
 *     (`createTmuxIntrospect` over the SAME pinned binary from `tmux-path.ts` the
 *     conductor's headless sessions live in), and
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
import { createTmuxIntrospect, type TmuxIntrospectPort } from '../../engines/adapters/cli/tmux-introspect.adapter.js';
import { TMUX_BIN, TMUX_IS_VENDORED } from '../../engines/tmux-path.js';
import { createTmuxScanSource } from './tmux-scan-source.adapter.js';

export interface RecoderSessionListerDeps {
  /**
   * The read-only introspection port to observe through. Absent ⇒ the default
   * over the pinned tmux binary (`TMUX_BIN` / `TMUX_IS_VENDORED` from
   * `tmux-path.ts`) — the SAME server the conductor drives. Injectable so tests
   * mock the exec seam instead of touching a real tmux.
   */
  readonly introspect?: TmuxIntrospectPort;
  /** Structured logger for the truthful degrade path (optional). */
  readonly logger?: LoggerPort;
}

/**
 * Build the read-only `recoder-*` session lister. The returned function resolves
 * the live conductor-owned session names (prefix-filtered), or an empty list when
 * tmux cannot be observed — it NEVER throws and NEVER fabricates a live session.
 */
export function createRecoderSessionLister(
  deps: RecoderSessionListerDeps = {},
): () => Promise<readonly string[]> {
  const introspect =
    deps.introspect ??
    createTmuxIntrospect({
      bin: TMUX_BIN,
      // Pure read bridge: always attempt the observation and let the introspect
      // port's own degrade-truthful path (tmux absent ⇒ typed fail ⇒ empty) speak.
      enabled: () => true,
      vendored: TMUX_IS_VENDORED,
    });
  const scan = createTmuxScanSource({
    introspect,
    ...(deps.logger ? { logger: deps.logger } : {}),
  });
  return async () => (await scan.listLiveSessions?.()) ?? [];
}
