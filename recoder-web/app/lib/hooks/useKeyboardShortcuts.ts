import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input fields (except for specific ones)
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      for (const shortcut of shortcuts) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrlKey === undefined || event.ctrlKey === shortcut.ctrlKey;
        const metaMatches = shortcut.metaKey === undefined || event.metaKey === shortcut.metaKey;
        const shiftMatches = shortcut.shiftKey === undefined || event.shiftKey === shortcut.shiftKey;
        const altMatches = shortcut.altKey === undefined || event.altKey === shortcut.altKey;

        // Special handling for Cmd/Ctrl + Enter (should work in textarea)
        const isSendShortcut = shortcut.key === 'Enter' && (shortcut.metaKey || shortcut.ctrlKey);
        
        if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
          // Allow Cmd+Enter in textarea, prevent other shortcuts when in inputs
          if (isInput && !isSendShortcut) {
            continue;
          }
          
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

// Common keyboard shortcuts
export const COMMON_SHORTCUTS: Record<string, Omit<KeyboardShortcut, 'action'>> = {
  SEND_MESSAGE: {
    key: 'Enter',
    metaKey: true,
    description: 'Send message',
  },
  SEND_MESSAGE_CTRL: {
    key: 'Enter',
    ctrlKey: true,
    description: 'Send message',
  },
  QUICK_ACTIONS: {
    key: 'k',
    metaKey: true,
    description: 'Open quick actions',
  },
  QUICK_ACTIONS_CTRL: {
    key: 'k',
    ctrlKey: true,
    description: 'Open quick actions',
  },
  CLEAR_CHAT: {
    key: 'l',
    metaKey: true,
    description: 'Clear chat',
  },
  CLEAR_CHAT_CTRL: {
    key: 'l',
    ctrlKey: true,
    description: 'Clear chat',
  },
  TOGGLE_SIDEBAR: {
    key: 'b',
    metaKey: true,
    description: 'Toggle sidebar',
  },
  TOGGLE_SIDEBAR_CTRL: {
    key: 'b',
    ctrlKey: true,
    description: 'Toggle sidebar',
  },
  SHOW_SHORTCUTS: {
    key: '/',
    metaKey: true,
    description: 'Show keyboard shortcuts',
  },
  SHOW_SHORTCUTS_CTRL: {
    key: '/',
    ctrlKey: true,
    description: 'Show keyboard shortcuts',
  },
  CANCEL: {
    key: 'Escape',
    description: 'Cancel/Close',
  },
  FOCUS_INPUT: {
    key: 'i',
    metaKey: true,
    description: 'Focus input',
  },
  FOCUS_INPUT_CTRL: {
    key: 'i',
    ctrlKey: true,
    description: 'Focus input',
  },
  OPEN_SETTINGS: {
    key: ',',
    metaKey: true,
    description: 'Open settings',
  },
  OPEN_SETTINGS_CTRL: {
    key: ',',
    ctrlKey: true,
    description: 'Open settings',
  },
};
