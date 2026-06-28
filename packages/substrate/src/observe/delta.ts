/**
 * delta — the run-tailer's incremental pane delta (design §4.7).
 *
 * Promoted verbatim from the inline prefix-diff in
 * docker-backend/src/conductor/run-tailer.ts. When a new capture extends the
 * previous one (the common terminal append case) we emit only the new suffix;
 * otherwise (a scroll/clear changed the prefix) we emit the whole capture. The
 * emitted text is trimmed and capped to the last MAX_DELTA_CHARS characters so a
 * runaway burst can't flood the RunEvent log.
 */

/** Default cap on a single delta — promoted from run-tailer's MAX_DELTA_CHARS. */
export const MAX_DELTA_CHARS = 8000;

export interface CaptureDeltaResult {
  /** Trimmed, capped new output to emit (empty string = nothing new). */
  delta: string;
  /** Whether the delta was capped to `maxChars`. */
  truncated: boolean;
}

/**
 * Compute the incremental delta between the previous and current capture.
 *
 * - prefix-diff: if `current` starts with `previous`, the delta is the suffix;
 *   otherwise it is the full `current` (the prefix changed).
 * - trimmed: leading/trailing whitespace stripped (a whitespace-only delta is
 *   reported as empty — nothing to emit).
 * - capped: keep only the last `maxChars` characters of the trimmed delta.
 */
export function computeDelta(
  previous: string,
  current: string,
  maxChars: number = MAX_DELTA_CHARS,
): CaptureDeltaResult {
  const raw = current.startsWith(previous) ? current.slice(previous.length) : current;
  const trimmed = raw.trim();
  if (!trimmed) return { delta: '', truncated: false };
  if (trimmed.length > maxChars) {
    return { delta: trimmed.slice(-maxChars), truncated: true };
  }
  return { delta: trimmed, truncated: false };
}
