/**
 * `tmuxDefaultSocket` — replicate tmux's DEFAULT server-socket path so the
 * conductor health can REPORT the exact socket its own tmux client already uses
 * (durable-shell unify §A1b). Behavior-preserving by construction: the conductor
 * drives tmux's DEFAULT socket today (`tmux-substrate.adapter.ts` shells tmux
 * with no `-L`, no `-S <path>`, no `TMUX_TMPDIR` override), so this only MIRRORS
 * and ASSERTS that coincidence — it selects no socket and moves no session.
 *
 * tmux's own algorithm (tmux.c `main`): the socket lives at
 *   `${TMUX_TMPDIR:-/tmp}/tmux-<uid>/default`
 * — the tmp dir is `TMUX_TMPDIR` when set and non-empty, else `/tmp`; joined with
 * a single `/` to `tmux-<uid>`; the socket label defaults to `default`. The
 * design pins `<uid>` to the EFFECTIVE uid (§A1b); on a non-setuid backend the
 * effective and real uid are identical, so this matches tmux exactly.
 *
 * An approximation that yields the WRONG path is worse than emitting nothing (it
 * would assert a FALSE shared-server identity), so an unknown uid — e.g. Windows,
 * where `process.geteuid` does not exist and tmux does not run — yields `null`:
 * a truthful "unknown", never a guessed default.
 */

export interface TmuxDefaultSocketInput {
  /** The backend process's `TMUX_TMPDIR` (its OWN env). Empty/absent ⇒ `/tmp`. */
  readonly tmuxTmpDir?: string | null;
  /** The backend process's effective uid. `null`/invalid ⇒ the socket is unknown. */
  readonly uid?: number | null;
}

/**
 * The tmux default socket path for a given uid + `TMUX_TMPDIR`, or `null` when
 * the uid is unknown. Pure — the caller supplies the process facts (see
 * {@link resolveConductorTmuxSocket} for the live-process default).
 */
export function tmuxDefaultSocket(input: TmuxDefaultSocketInput): string | null {
  const { uid } = input;
  if (uid == null || !Number.isInteger(uid) || uid < 0) {
    return null;
  }
  // Match tmux precisely: TMUX_TMPDIR is used VERBATIM when non-empty (tmux only
  // tests `*s != '\0'`, it does not trim or normalize), else `/tmp`.
  const tmpDir =
    typeof input.tmuxTmpDir === 'string' && input.tmuxTmpDir !== '' ? input.tmuxTmpDir : '/tmp';
  return `${tmpDir}/tmux-${uid}/default`;
}

/**
 * Resolve THIS conductor backend's own default tmux socket from the live process
 * (its `TMUX_TMPDIR` + effective uid). This is the one runtime process-identity
 * fact the health route needs: the socket the conductor's tmux client will
 * itself resolve, so it must be read from THIS process (it is not configuration).
 * It is the injectable seam DEFAULT — the route accepts a `resolveTmuxSocket`
 * dep so tests never touch the real process. Windows / no-`geteuid` ⇒ `null`.
 */
export function resolveConductorTmuxSocket(): string | null {
  const geteuid = (process as NodeJS.Process & { geteuid?: () => number }).geteuid;
  const uid = typeof geteuid === 'function' ? geteuid.call(process) : null;
  return tmuxDefaultSocket({ tmuxTmpDir: process.env.TMUX_TMPDIR ?? null, uid });
}
