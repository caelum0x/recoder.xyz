/**
 * Keyboard Shortcuts Store
 *
 * Manages keyboard shortcut bindings, user customizations, and context state.
 * Uses nanostores for reactive state management.
 */

import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('KeyboardShortcutsStore');

// Storage key for persisting user customizations
const SHORTCUTS_STORAGE_KEY = 'recoder_keyboard_shortcuts';

// Types
export type ShortcutContext =
  | 'global'
  | 'editor'
  | 'terminal'
  | 'chat'
  | 'file-tree'
  | 'preview';

export interface KeyBinding {
  id: string;
  keys: Array<{
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
    ctrlOrMeta?: boolean;
  }>;
  enabled: boolean;
}

export interface ShortcutDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  contexts: ShortcutContext[];
  defaultKeys: KeyBinding['keys'];
}

export interface SequenceBuffer {
  keys: Array<{
    key: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  }>;
  startTime: number | null;
}

// Default shortcut definitions
export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // General
  {
    id: 'save-file',
    name: 'Save File',
    description: 'Save the current file',
    category: 'general',
    contexts: ['editor'],
    defaultKeys: [{ key: 's', ctrlOrMeta: true }],
  },
  {
    id: 'quick-open',
    name: 'Quick Open File',
    description: 'Open the quick file finder',
    category: 'general',
    contexts: ['global'],
    defaultKeys: [{ key: 'p', ctrlOrMeta: true }],
  },
  {
    id: 'command-palette',
    name: 'Command Palette',
    description: 'Open the command palette',
    category: 'general',
    contexts: ['global'],
    defaultKeys: [{ key: 'p', ctrlOrMeta: true, shift: true }],
  },
  {
    id: 'toggle-sidebar',
    name: 'Toggle Sidebar',
    description: 'Show or hide the sidebar',
    category: 'view',
    contexts: ['global'],
    defaultKeys: [{ key: 'b', ctrlOrMeta: true }],
  },
  {
    id: 'toggle-terminal',
    name: 'Toggle Terminal',
    description: 'Show or hide the terminal panel',
    category: 'view',
    contexts: ['global'],
    defaultKeys: [{ key: 'j', ctrlOrMeta: true }],
  },
  {
    id: 'toggle-preview',
    name: 'Toggle Preview',
    description: 'Switch between code and preview',
    category: 'view',
    contexts: ['global'],
    defaultKeys: [{ key: '\\', ctrlOrMeta: true }],
  },
  {
    id: 'toggle-comment',
    name: 'Toggle Comment',
    description: 'Comment or uncomment the selected line(s)',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: '/', ctrlOrMeta: true }],
  },
  {
    id: 'duplicate-line',
    name: 'Duplicate Line',
    description: 'Duplicate the current line or selection',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: 'd', ctrlOrMeta: true }],
  },

  // Navigation
  {
    id: 'go-to-top',
    name: 'Go to Top',
    description: 'Go to the top of the file',
    category: 'navigation',
    contexts: ['editor'],
    defaultKeys: [{ key: 'g' }, { key: 'g' }], // Sequence: g g
  },
  {
    id: 'go-to-bottom',
    name: 'Go to Bottom',
    description: 'Go to the bottom of the file',
    category: 'navigation',
    contexts: ['editor'],
    defaultKeys: [{ key: 'g', shift: true }],
  },
  {
    id: 'go-to-line',
    name: 'Go to Line',
    description: 'Jump to a specific line number',
    category: 'navigation',
    contexts: ['editor'],
    defaultKeys: [{ key: 'g', ctrlOrMeta: true }],
  },
  {
    id: 'go-to-definition',
    name: 'Go to Definition',
    description: 'Go to the definition of the symbol under cursor',
    category: 'navigation',
    contexts: ['editor'],
    defaultKeys: [{ key: 'F12' }],
  },
  {
    id: 'peek-definition',
    name: 'Peek Definition',
    description: 'Peek at the definition inline',
    category: 'navigation',
    contexts: ['editor'],
    defaultKeys: [{ key: 'F12', alt: true }],
  },

  // Terminal
  {
    id: 'clear-terminal',
    name: 'Clear Terminal',
    description: 'Clear the terminal output',
    category: 'terminal',
    contexts: ['terminal'],
    defaultKeys: [{ key: 'k', ctrlOrMeta: true }],
  },
  {
    id: 'new-terminal',
    name: 'New Terminal',
    description: 'Create a new terminal tab',
    category: 'terminal',
    contexts: ['global'],
    defaultKeys: [{ key: '`', ctrlOrMeta: true, shift: true }],
  },

  // Chat
  {
    id: 'focus-chat',
    name: 'Focus Chat',
    description: 'Focus the chat input',
    category: 'chat',
    contexts: ['global'],
    defaultKeys: [{ key: 'l', ctrlOrMeta: true }],
  },
  {
    id: 'new-chat',
    name: 'New Chat',
    description: 'Start a new chat conversation',
    category: 'chat',
    contexts: ['global'],
    defaultKeys: [{ key: 'n', ctrlOrMeta: true, shift: true }],
  },

  // File operations
  {
    id: 'close-tab',
    name: 'Close Tab',
    description: 'Close the current editor tab',
    category: 'file',
    contexts: ['editor'],
    defaultKeys: [{ key: 'w', ctrlOrMeta: true }],
  },
  {
    id: 'close-all-tabs',
    name: 'Close All Tabs',
    description: 'Close all open editor tabs',
    category: 'file',
    contexts: ['editor'],
    defaultKeys: [{ key: 'w', ctrlOrMeta: true, shift: true, alt: true }],
  },
  {
    id: 'next-tab',
    name: 'Next Tab',
    description: 'Switch to the next editor tab',
    category: 'file',
    contexts: ['editor'],
    defaultKeys: [{ key: 'Tab', ctrl: true }],
  },
  {
    id: 'prev-tab',
    name: 'Previous Tab',
    description: 'Switch to the previous editor tab',
    category: 'file',
    contexts: ['editor'],
    defaultKeys: [{ key: 'Tab', ctrl: true, shift: true }],
  },

  // Search
  {
    id: 'find-in-file',
    name: 'Find in File',
    description: 'Open the find dialog',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: 'f', ctrlOrMeta: true }],
  },
  {
    id: 'find-and-replace',
    name: 'Find and Replace',
    description: 'Open the find and replace dialog',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: 'h', ctrlOrMeta: true }],
  },
  {
    id: 'find-in-files',
    name: 'Find in Files',
    description: 'Search across all files',
    category: 'general',
    contexts: ['global'],
    defaultKeys: [{ key: 'f', ctrlOrMeta: true, shift: true }],
  },

  // Undo/Redo
  {
    id: 'undo',
    name: 'Undo',
    description: 'Undo the last change',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: 'z', ctrlOrMeta: true }],
  },
  {
    id: 'redo',
    name: 'Redo',
    description: 'Redo the last undone change',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: 'z', ctrlOrMeta: true, shift: true }],
  },

  // Selection
  {
    id: 'select-all',
    name: 'Select All',
    description: 'Select all content',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: 'a', ctrlOrMeta: true }],
  },
  {
    id: 'select-line',
    name: 'Select Line',
    description: 'Select the current line',
    category: 'editor',
    contexts: ['editor'],
    defaultKeys: [{ key: 'l', ctrlOrMeta: true, shift: true }],
  },

  // Settings
  {
    id: 'open-settings',
    name: 'Open Settings',
    description: 'Open the settings panel',
    category: 'general',
    contexts: ['global'],
    defaultKeys: [{ key: ',', ctrlOrMeta: true }],
  },
  {
    id: 'open-keyboard-shortcuts',
    name: 'Keyboard Shortcuts',
    description: 'Open keyboard shortcuts settings',
    category: 'general',
    contexts: ['global'],
    defaultKeys: [{ key: 'k', ctrlOrMeta: true, shift: true }],
  },
];

// Stores

/**
 * Custom key bindings (user overrides)
 * Maps shortcut ID to custom binding
 */
export const keyBindingsStore = map<Record<string, KeyBinding>>(loadBindings());

/**
 * Active context for context-aware shortcuts
 */
export const activeContextStore = atom<ShortcutContext>('global');

/**
 * Buffer for key sequences (e.g., 'g g')
 */
export const sequenceBufferStore = atom<SequenceBuffer>({
  keys: [],
  startTime: null,
});

/**
 * Keyboard shortcuts panel visibility
 */
export const shortcutsPanelOpen = atom<boolean>(false);

/**
 * Search query for filtering shortcuts
 */
export const shortcutsSearchQuery = atom<string>('');

// Persistence functions

/**
 * Load key bindings from localStorage
 */
function loadBindings(): Record<string, KeyBinding> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    logger.error('[KeyboardShortcuts] Failed to load bindings:', e);
  }

  return {};
}

/**
 * Save key bindings to localStorage
 */
function saveBindings(bindings: Record<string, KeyBinding>): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(bindings));
  } catch (e) {
    logger.error('[KeyboardShortcuts] Failed to save bindings:', e);
  }
}

// Subscribe to changes and persist
keyBindingsStore.subscribe((bindings) => {
  saveBindings(bindings);
});

// Helper functions

/**
 * Set a custom key binding for a shortcut
 */
export function setKeyBinding(id: string, binding: KeyBinding): void {
  keyBindingsStore.setKey(id, binding);
}

/**
 * Remove a custom key binding (revert to default)
 */
export function removeKeyBinding(id: string): void {
  const bindings = { ...keyBindingsStore.get() };
  delete bindings[id];
  keyBindingsStore.set(bindings);
}

/**
 * Reset all key bindings to defaults
 */
export function resetAllBindings(): void {
  keyBindingsStore.set({});
}

/**
 * Get bindings for a specific context
 */
export function getBindingsForContext(context: ShortcutContext): ShortcutDefinition[] {
  return DEFAULT_SHORTCUTS.filter(
    (s) => s.contexts.includes(context) || s.contexts.includes('global')
  );
}

/**
 * Get the effective binding for a shortcut (custom or default)
 */
export function getEffectiveBinding(id: string): KeyBinding['keys'] {
  const customBinding = keyBindingsStore.get()[id];
  if (customBinding && customBinding.enabled !== false) {
    return customBinding.keys;
  }

  const defaultShortcut = DEFAULT_SHORTCUTS.find((s) => s.id === id);
  return defaultShortcut?.defaultKeys || [];
}

/**
 * Check if a shortcut has been customized
 */
export function isCustomized(id: string): boolean {
  return id in keyBindingsStore.get();
}

/**
 * Clear the sequence buffer
 */
export function clearSequenceBuffer(): void {
  sequenceBufferStore.set({ keys: [], startTime: null });
}

/**
 * Set the active shortcut context
 */
export function setContext(context: ShortcutContext): void {
  activeContextStore.set(context);
}

/**
 * Open the shortcuts panel
 */
export function openShortcutsPanel(): void {
  shortcutsPanelOpen.set(true);
}

/**
 * Close the shortcuts panel
 */
export function closeShortcutsPanel(): void {
  shortcutsPanelOpen.set(false);
}

/**
 * Toggle the shortcuts panel
 */
export function toggleShortcutsPanel(): void {
  shortcutsPanelOpen.set(!shortcutsPanelOpen.get());
}

/**
 * Set the search query for filtering shortcuts
 */
export function setShortcutsSearchQuery(query: string): void {
  shortcutsSearchQuery.set(query);
}

/**
 * Get shortcuts filtered by search query
 */
export function getFilteredShortcuts(query: string): ShortcutDefinition[] {
  if (!query.trim()) return DEFAULT_SHORTCUTS;

  const lowerQuery = query.toLowerCase();
  return DEFAULT_SHORTCUTS.filter(
    (s) =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.description.toLowerCase().includes(lowerQuery) ||
      s.category.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get shortcuts grouped by category
 */
export function getShortcutsByCategory(): Record<string, ShortcutDefinition[]> {
  const grouped: Record<string, ShortcutDefinition[]> = {};

  for (const shortcut of DEFAULT_SHORTCUTS) {
    if (!grouped[shortcut.category]) {
      grouped[shortcut.category] = [];
    }
    grouped[shortcut.category].push(shortcut);
  }

  return grouped;
}

/**
 * Check if a shortcut is enabled
 */
export function isShortcutEnabled(id: string): boolean {
  const customBinding = keyBindingsStore.get()[id];
  if (customBinding) {
    return customBinding.enabled !== false;
  }
  return true; // Default is enabled
}

/**
 * Toggle a shortcut's enabled state
 */
export function toggleShortcutEnabled(id: string): void {
  const bindings = keyBindingsStore.get();
  const existing = bindings[id];

  if (existing) {
    setKeyBinding(id, {
      ...existing,
      enabled: !existing.enabled,
    });
  } else {
    // Create new binding based on default, but disabled
    const defaultShortcut = DEFAULT_SHORTCUTS.find((s) => s.id === id);
    if (defaultShortcut) {
      setKeyBinding(id, {
        id,
        keys: defaultShortcut.defaultKeys,
        enabled: false,
      });
    }
  }
}

/**
 * Get category display info
 */
export function getCategoryDisplayInfo(category: string): { icon: string; label: string } {
  const categories: Record<string, { icon: string; label: string }> = {
    general: { icon: 'i-ph:gear', label: 'General' },
    editor: { icon: 'i-ph:code', label: 'Editor' },
    navigation: { icon: 'i-ph:compass', label: 'Navigation' },
    terminal: { icon: 'i-ph:terminal-window', label: 'Terminal' },
    chat: { icon: 'i-ph:chat-circle', label: 'Chat' },
    view: { icon: 'i-ph:layout', label: 'View' },
    file: { icon: 'i-ph:file', label: 'File' },
    custom: { icon: 'i-ph:star', label: 'Custom' },
  };

  return categories[category] || { icon: 'i-ph:keyboard', label: category };
}

/**
 * Export bindings for backup
 */
export function exportBindings(): string {
  return JSON.stringify(keyBindingsStore.get(), null, 2);
}

/**
 * Import bindings from backup
 */
export function importBindings(json: string): boolean {
  try {
    const bindings = JSON.parse(json);
    if (typeof bindings === 'object' && bindings !== null) {
      keyBindingsStore.set(bindings);
      return true;
    }
  } catch (e) {
    logger.error('[KeyboardShortcuts] Failed to import bindings:', e);
  }
  return false;
}
