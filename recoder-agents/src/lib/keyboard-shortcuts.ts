export interface KeyboardShortcut {
  key: string; // e.g., 'k', 'n', '/'
  modifier: 'meta' | 'ctrl' | 'alt' | 'shift' | 'meta+shift';
  label: string; // "Search"
  description: string; // "Open global search"
  category: 'navigation' | 'actions' | 'editor' | 'general';
  action: string; // identifier for the action
}

export const SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  { key: 'k', modifier: 'meta', label: 'Search', description: 'Open global search', category: 'navigation', action: 'open-search' },
  { key: '1', modifier: 'meta', label: 'Dashboard', description: 'Go to dashboard', category: 'navigation', action: 'nav-dashboard' },
  { key: '2', modifier: 'meta', label: 'Agents', description: 'Go to agents', category: 'navigation', action: 'nav-agents' },
  { key: '3', modifier: 'meta', label: 'Marketplace', description: 'Go to marketplace', category: 'navigation', action: 'nav-marketplace' },
  { key: '4', modifier: 'meta', label: 'Reports', description: 'Go to reports', category: 'navigation', action: 'nav-reports' },
  { key: '5', modifier: 'meta', label: 'Settings', description: 'Go to settings', category: 'navigation', action: 'nav-settings' },

  // Actions
  { key: 'n', modifier: 'meta', label: 'New Thread', description: 'Start a new thread', category: 'actions', action: 'new-thread' },
  { key: 'n', modifier: 'meta+shift', label: 'New Agent', description: 'Create a new agent', category: 'actions', action: 'new-agent' },
  { key: 'e', modifier: 'meta', label: 'Export', description: 'Export current view', category: 'actions', action: 'export' },
  { key: '/', modifier: 'meta', label: 'Focus Input', description: 'Focus chat input', category: 'actions', action: 'focus-input' },

  // General
  { key: '?', modifier: 'meta+shift', label: 'Shortcuts', description: 'Show keyboard shortcuts', category: 'general', action: 'show-shortcuts' },
  { key: 'Escape', modifier: 'meta', label: 'Close', description: 'Close current dialog', category: 'general', action: 'close-dialog' },
];

export const SHORTCUT_CATEGORIES = [
  { key: 'navigation', label: 'Navigation' },
  { key: 'actions', label: 'Actions' },
  { key: 'general', label: 'General' },
] as const;

/**
 * Detect if the user is on macOS (uses ⌘) or other (uses Ctrl).
 */
function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return true; // SSR default to Mac
  return navigator.platform?.toLowerCase().includes('mac') ||
    navigator.userAgent?.toLowerCase().includes('mac');
}

/**
 * Format a shortcut for display.
 * e.g. { key: 'k', modifier: 'meta' } => "⌘K" on Mac, "Ctrl+K" on Windows/Linux
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const isMac = isMacPlatform();
  const parts: string[] = [];

  const modifiers = shortcut.modifier.split('+');
  for (const mod of modifiers) {
    switch (mod) {
      case 'meta':
        parts.push(isMac ? '⌘' : 'Ctrl');
        break;
      case 'ctrl':
        parts.push(isMac ? '⌃' : 'Ctrl');
        break;
      case 'alt':
        parts.push(isMac ? '⌥' : 'Alt');
        break;
      case 'shift':
        parts.push(isMac ? '⇧' : 'Shift');
        break;
    }
  }

  // Normalize display key
  const displayKey = shortcut.key === 'Escape' ? 'Esc' : shortcut.key.toUpperCase();
  parts.push(displayKey);

  return isMac ? parts.join('') : parts.join('+');
}

/**
 * Format a shortcut into separate modifier and key parts for rendering as kbd elements.
 */
export function formatShortcutParts(shortcut: KeyboardShortcut): { modifiers: string[]; key: string } {
  const isMac = isMacPlatform();
  const modifiers: string[] = [];

  const mods = shortcut.modifier.split('+');
  for (const mod of mods) {
    switch (mod) {
      case 'meta':
        modifiers.push(isMac ? '⌘' : 'Ctrl');
        break;
      case 'ctrl':
        modifiers.push(isMac ? '⌃' : 'Ctrl');
        break;
      case 'alt':
        modifiers.push(isMac ? '⌥' : 'Alt');
        break;
      case 'shift':
        modifiers.push(isMac ? '⇧' : 'Shift');
        break;
    }
  }

  const displayKey = shortcut.key === 'Escape' ? 'Esc' : shortcut.key.toUpperCase();

  return { modifiers, key: displayKey };
}

/**
 * Check if a keyboard event matches a shortcut definition.
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const modifiers = shortcut.modifier.split('+');
  const needsMeta = modifiers.includes('meta');
  const needsShift = modifiers.includes('shift');
  const needsAlt = modifiers.includes('alt');
  const needsCtrl = modifiers.includes('ctrl');

  // Meta key: metaKey on Mac, ctrlKey on Windows/Linux
  const metaPressed = event.metaKey || event.ctrlKey;

  if (needsMeta && !metaPressed) return false;
  if (!needsMeta && needsCtrl && !event.ctrlKey) return false;
  if (needsShift && !event.shiftKey) return false;
  if (!needsShift && event.shiftKey && shortcut.key !== '?') return false; // ? requires shift inherently
  if (needsAlt && !event.altKey) return false;

  // Compare key (case-insensitive)
  const eventKey = event.key.toLowerCase();
  const shortcutKey = shortcut.key.toLowerCase();

  // Special handling for '?' which is Shift+/
  if (shortcutKey === '?') {
    return eventKey === '?' || eventKey === '/';
  }

  return eventKey === shortcutKey;
}
