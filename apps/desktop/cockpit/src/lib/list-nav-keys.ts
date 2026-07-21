/**
 * list-nav-keys — PURE key-mapping + the "don't steal keys from inputs" guard
 * for keyboard-driven list navigation. No hooks, no DOM listeners; just the two
 * decisions a keydown handler needs: which nav action a key means, and whether
 * the event originated in an editable field (where nav keys must be left alone).
 */

export type NavAction = 'up' | 'down' | 'open' | 'escape';

/**
 * Map a KeyboardEvent.key to a nav action, or null when the key is not a nav
 * key. j / ArrowDown ⇒ down, k / ArrowUp ⇒ up, Enter ⇒ open, Escape ⇒ escape.
 * Only the lowercase j/k bind (uppercase J/K — a Shift chord — are ignored).
 */
export function navActionForKey(key: string): NavAction | null {
  switch (key) {
    case 'j':
    case 'ArrowDown':
      return 'down';
    case 'k':
    case 'ArrowUp':
      return 'up';
    case 'Enter':
      return 'open';
    case 'Escape':
      return 'escape';
    default:
      return null;
  }
}

/**
 * True when the event target is a field the user is typing into — INPUT,
 * TEXTAREA, SELECT, or any contentEditable host. Non-HTMLElement targets (and
 * null) are never editable. Used to bail out so navigation keys are not stolen
 * from a focused input.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (target == null) return false;
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
