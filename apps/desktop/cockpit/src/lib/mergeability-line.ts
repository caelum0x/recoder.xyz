/**
 * mergeabilityLine — the terminal-plain merge-preflight advisory line shown in
 * WorkspaceDetail's ready-to-merge banner. A PURE, total projection over the
 * {@link WorkspaceMergeability} the backend persisted (GET
 * /workspaces/:id/mergeability): no I/O, no hooks.
 *
 * CRITICAL degrade-truthful guard: emit a 'clean'/'cleanly' verdict ONLY when
 * `available === true && verdict === 'clean'`. Every other shape — unavailable,
 * an 'unknown' verdict, or a malformed payload — collapses to the truthful
 * 'unknown' line. The preflight NEVER fabricates a clean merge.
 */
import type { WorkspaceMergeability } from '../types';

/** Coarse tone for the preflight line (color is glanceability only; the label carries the meaning). */
export type MergeabilityTone = 'good' | 'warn' | 'unknown';

export interface MergeabilityLine {
  readonly tone: MergeabilityTone;
  readonly label: string;
}

/** Show at most this many conflicted paths inline; the rest collapse to "(+N more)". */
const MAX_CONFLICT_PATHS = 3;

export function mergeabilityLine(view: WorkspaceMergeability): MergeabilityLine {
  // Unavailable / could-not-judge / malformed ⇒ truthful unknown. Never 'clean'.
  if (!view || view.available !== true) {
    return {
      tone: 'unknown',
      label: `Merge preflight unavailable${view && view.reason ? ` — ${view.reason}` : ''}`,
    };
  }
  if (view.verdict === 'conflicting') {
    const paths = Array.isArray(view.conflicts) ? view.conflicts : [];
    const n = paths.length;
    const shown = paths.slice(0, MAX_CONFLICT_PATHS).join(', ');
    const more = n > MAX_CONFLICT_PATHS ? ` (+${n - MAX_CONFLICT_PATHS} more)` : '';
    return { tone: 'warn', label: `${n} conflict${n === 1 ? '' : 's'}: ${shown}${more}` };
  }
  if (view.verdict === 'clean') {
    const ahead = view.ahead > 0 ? ` · ${view.ahead} ahead` : '';
    const behind = view.behind > 0 ? `, ${view.behind} behind ${view.base}` : '';
    return { tone: 'good', label: `Will merge cleanly${ahead}${behind}` };
  }
  // available:true but verdict neither clean nor conflicting — still never fake clean.
  return {
    tone: 'unknown',
    label: `Merge preflight unavailable${view.reason ? ` — ${view.reason}` : ''}`,
  };
}
