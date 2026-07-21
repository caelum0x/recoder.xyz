/**
 * useListKeyboardNav — a Preact hook that drives a single highlight cursor over
 * a linear list of ids from the keyboard: j/↓ and k/↑ move the cursor, Enter
 * opens the highlighted id, Escape returns to the list.
 *
 * DEEP-LINK HALF (deliberately skipped): there is no workspace-id deep-link in
 * the cockpit. The only injected deep-link (`__RECODER_COCKPIT_RUNTIME__.view` /
 * COCKPIT_NAVIGATE_EVENT) is VIEW-scoped and carries no workspace id, and
 * nothing produces one. A future shell contract could extend the runtime object
 * with a `workspaceId`; until a producer exists we do not add a consumer, rather
 * than fake a capability nothing emits.
 *
 * Preact-dup safe: hooks are imported ONLY from `preact/hooks` (never React).
 * The window keydown listener is bound ONCE (deps: [setFocusedId]) and reads the
 * latest props/state through a ref that is refreshed every render, so the ~2s
 * board poll never rebinds the listener nor serves stale closures.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { idAt, indexOfId, move } from './list-selection';
import { isEditableTarget, navActionForKey } from './list-nav-keys';

interface ListKeyboardNavOptions {
  /** The ordered ids the cursor moves over (the list's visual/motion order). */
  ids: readonly string[];
  /** Master switch — when false the listener is inert (e.g. a modal is open). */
  enabled?: boolean;
  /** When false, j/k/Enter are suppressed but Escape still fires (thread open). */
  navigable?: boolean;
  /** Called with the id to open when Enter is pressed on a highlighted row. */
  onOpen: (id: string) => void;
  /** Called when Escape is pressed (return to the list). */
  onEscape: () => void;
}

interface ListKeyboardNav {
  /** The currently highlighted id, or null when there is no cursor. */
  focusedId: string | null;
  /** Set the cursor (also keeps the keydown listener's ref in sync). */
  setFocusedId: (id: string | null) => void;
}

interface NavState {
  ids: readonly string[];
  enabled: boolean;
  navigable: boolean;
  onOpen: (id: string) => void;
  onEscape: () => void;
  focusedId: string | null;
}

export function useListKeyboardNav({
  ids,
  enabled = true,
  navigable = true,
  onOpen,
  onEscape,
}: ListKeyboardNavOptions): ListKeyboardNav {
  const [focusedId, setFocusedIdState] = useState<string | null>(null);

  // Single source the window listener reads through, refreshed every render so
  // the once-bound handler always sees the latest ids/flags/callbacks/cursor
  // without rebinding on every poll.
  const stateRef = useRef<NavState>({ ids, enabled, navigable, onOpen, onEscape, focusedId });
  stateRef.current = { ids, enabled, navigable, onOpen, onEscape, focusedId };

  // Click-driven focus must be visible to the listener immediately (before the
  // next render commits the ref), so mirror it into the ref here too.
  const setFocusedId = useCallback((id: string | null) => {
    stateRef.current = { ...stateRef.current, focusedId: id };
    setFocusedIdState(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onKeyDown(e: KeyboardEvent) {
      const s = stateRef.current;
      if (!s.enabled) return;
      // Let native chords (Cmd+K, Cmd+Enter, Alt+…) pass through untouched.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = navActionForKey(e.key);
      if (action === null) return;
      // Never steal keys — including Escape — while the user is typing.
      if (isEditableTarget(e.target)) return;

      if (action === 'escape') {
        // Works even when not navigable — this is how Escape returns to the
        // list while a thread is open.
        e.preventDefault();
        s.onEscape();
        return;
      }

      // j/k/Enter are suppressed while a thread is already open.
      if (!s.navigable) return;

      if (action === 'open') {
        // No cursor ⇒ let a natively-focused button handle its own Enter; only
        // hijack activation when OUR cursor owns the selection (no double-open).
        if (s.focusedId == null) return;
        e.preventDefault();
        s.onOpen(s.focusedId);
        return;
      }

      // up / down: clamped, no-wrap step re-derived from the live ids.
      e.preventDefault();
      const next = move(indexOfId(s.ids, s.focusedId), action, s.ids.length);
      setFocusedId(idAt(s.ids, next));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setFocusedId]);

  // Prune a stale cursor: if the highlighted id left the list (merged/removed by
  // a poll), clear it so no phantom highlight points at a gone row.
  useEffect(() => {
    if (focusedId != null && indexOfId(ids, focusedId) === -1) {
      setFocusedId(null);
    }
  }, [ids, focusedId, setFocusedId]);

  return { focusedId, setFocusedId };
}
