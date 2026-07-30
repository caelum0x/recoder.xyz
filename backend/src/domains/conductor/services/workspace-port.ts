/**
 * Per-workspace dev-server port (`RECODER_PORT`) — the parallel-dev-server fix.
 *
 * When several worktrees run their app at once, they collide on a hardcoded port
 * (3000/8080). Conductor solves this with `CONDUCTOR_PORT`; this is the Recoder
 * equivalent. `computeWorkspacePort` deterministically maps a workspace id to a
 * STABLE port in a bounded range, so:
 *
 *  - the SAME workspace always gets the SAME port (idempotent across restarts —
 *    a bookmarked localhost keeps working, and re-runs don't wander);
 *  - DIFFERENT workspaces spread across the range via a stable string hash, so
 *    parallel dev servers rarely collide.
 *
 * PURE: no allocation table, no I/O, no clock — the port is a function of the id
 * alone. The value is injected into the run/setup script env as `RECODER_PORT`
 * so a repo's `[scripts]` can bind to it (e.g. `next dev -p $RECODER_PORT`).
 */

/** Range chosen to avoid the usual 3000/5173/8080 dev defaults. */
export const DEFAULT_PORT_BASE = 4300;
export const DEFAULT_PORT_SPAN = 200;

/**
 * Deterministically map a workspace id to a port in `[base, base + span)` via an
 * FNV-1a hash of the id. Empty id → `base` (a stable, valid fallback). A
 * non-positive `span` is clamped to 1 so the result is always exactly `base`
 * rather than a NaN/negative — never a fabricated out-of-range port.
 */
export function computeWorkspacePort(
  workspaceId: string,
  base: number = DEFAULT_PORT_BASE,
  span: number = DEFAULT_PORT_SPAN,
): number {
  const id = (workspaceId ?? '').trim();
  const safeSpan = Number.isInteger(span) && span > 0 ? span : 1;
  const safeBase = Number.isInteger(base) && base > 0 ? base : DEFAULT_PORT_BASE;
  if (id === '') {
    return safeBase;
  }
  let hash = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0; // FNV prime, kept in uint32
  }
  return safeBase + (hash % safeSpan);
}
