/**
 * list-selection — a PURE, hook-free reducer + id⇄index helpers for a single
 * highlight cursor over a linear list. No wrap, always in-bounds.
 *
 * The cursor is pinned to an ID by the consumer (useListKeyboardNav) and the
 * index is re-derived on every poll, because the workspace list mutates every
 * ~2s. Keeping this layer pure means the same input always yields the same
 * clamped index — the degrade-truthful core: an empty or shrunk list can never
 * produce an out-of-range or phantom selection.
 */

export type NavDirection = 'up' | 'down';

/**
 * Clamp an index into [0, count-1]. An empty list (count<=0) has no valid index
 * and returns -1 (no selection). Never wraps.
 */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  if (index < 0) return 0;
  if (index >= count) return count - 1;
  return index;
}

/**
 * Move the cursor one step in `dir` over a list of `count` items.
 *
 * - Empty list (count<=0) ⇒ -1 (no selection).
 * - From no cursor (index<0): down ⇒ 0 (first), up ⇒ last — the terminal feel
 *   where the first keypress lands on an end of the list.
 * - Otherwise a clamped ±1 step. Never wraps, always in-bounds.
 */
export function move(index: number, dir: NavDirection, count: number): number {
  if (count <= 0) return -1;
  if (index < 0) return dir === 'down' ? 0 : Math.max(0, count - 1);
  return clampIndex(dir === 'up' ? index - 1 : index + 1, count);
}

/** Index of `id` in `ids`, or -1 when `id` is null/absent. */
export function indexOfId(ids: readonly string[], id: string | null): number {
  if (id == null) return -1;
  return ids.indexOf(id);
}

/** Bounds-checked read of the id at `index`, or null when out of range. */
export function idAt(ids: readonly string[], index: number): string | null {
  if (index < 0 || index >= ids.length) return null;
  return ids[index];
}
