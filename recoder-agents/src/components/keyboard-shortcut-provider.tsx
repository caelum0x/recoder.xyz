'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { SHORTCUTS, matchesShortcut } from '@/lib/keyboard-shortcuts';

interface ShortcutContextValue {
  registerHandler: (action: string, handler: () => void) => () => void;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

/**
 * Returns true if the currently focused element is an input-like element
 * where we should NOT intercept keyboard shortcuts.
 */
function isEditableElement(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  if (el.closest('.cm-editor') || el.closest('.ProseMirror')) return true;

  return false;
}

export function KeyboardShortcutProvider({ children }: { children: React.ReactNode }) {
  // Map of action -> Set of handlers
  const handlersRef = useRef<Map<string, Set<() => void>>>(new Map());

  const registerHandler = useCallback((action: string, handler: () => void) => {
    const handlers = handlersRef.current;
    if (!handlers.has(action)) {
      handlers.set(action, new Set());
    }
    handlers.get(action)!.add(handler);

    // Return unregister function
    return () => {
      const set = handlers.get(action);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          handlers.delete(action);
        }
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Allow Escape everywhere (for closing dialogs)
      const isEscape = event.key === 'Escape';

      // Skip shortcut matching for editable elements (except Escape-based shortcuts)
      if (!isEscape && isEditableElement()) return;

      for (const shortcut of SHORTCUTS) {
        if (matchesShortcut(event, shortcut)) {
          const actionHandlers = handlersRef.current.get(shortcut.action);
          if (actionHandlers && actionHandlers.size > 0) {
            event.preventDefault();
            event.stopPropagation();
            // Call the most recently registered handler (last added)
            const handlers = Array.from(actionHandlers);
            const lastHandler = handlers[handlers.length - 1];
            lastHandler();
          }
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture for priority
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return (
    <ShortcutContext.Provider value={{ registerHandler }}>
      {children}
    </ShortcutContext.Provider>
  );
}

/**
 * Register a handler for a specific shortcut action.
 * The handler is automatically cleaned up when the component unmounts.
 */
export function useShortcutAction(action: string, handler: () => void) {
  const ctx = useContext(ShortcutContext);

  useEffect(() => {
    if (!ctx) return;
    const unregister = ctx.registerHandler(action, handler);
    return unregister;
  }, [ctx, action, handler]);
}

/**
 * Get the shortcut context for manual handler registration.
 */
export function useShortcutContext() {
  return useContext(ShortcutContext);
}
