/**
 * The `recoder-<id>` session-naming contract — ONE canonical, single-sourced spec.
 *
 * Every conductor-owned tmux session name and worktree dir is namespaced under
 * {@link SESSION_PREFIX}; {@link tmuxNameFor} is the deterministic,
 * restart-survivable producer:
 *
 *   name = `recoder-${id with every char outside [a-zA-Z0-9_-] replaced by '_'}`
 *
 * This module exists so the sanitize rule can never silently drift across the
 * several adapters that reproduce it (the tmux substrate, the in-process
 * openfang substrate, the reconcile scan-source filter, the dmux grid), and so
 * the wave-side attach path + the eventual (owner-deferred) lifecycle
 * unification can rely on a locked contract. The golden-vector test
 * (`session-naming.test.ts`) pins the exact input→output mapping.
 *
 * See docs/architecture/TERMINAL-UNIFICATION.md §3.
 */

/** tmux session names + worktree dirs are namespaced under this prefix. */
export const SESSION_PREFIX = 'recoder-';

/**
 * Deterministic conductor session/worktree name for a workspace id
 * (restart-survivable). Every character outside `[a-zA-Z0-9_-]` becomes `_`.
 */
export function tmuxNameFor(id: string): string {
  return `${SESSION_PREFIX}${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
