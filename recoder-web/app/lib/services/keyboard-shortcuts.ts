/**
 * Keyboard Shortcuts Manager
 *
 * A comprehensive system for handling keyboard shortcuts with:
 * - Key combo support (Cmd+S, Ctrl+Shift+P, etc.)
 * - Key sequence support (g g for go to top)
 * - Context-aware shortcuts (editor, terminal, chat)
 * - Conflict detection and prevention
 * - Customizable shortcuts per user
 */

import {
  keyBindingsStore,
  activeContextStore,
  sequenceBufferStore,
  type KeyBinding,
  type ShortcutContext,
  getBindingsForContext,
  clearSequenceBuffer,
} from '~/lib/stores/keyboard-shortcuts';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('KeyboardShortcuts');

// Types
export interface KeyCombo {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  // Cross-platform: true = Cmd on Mac, Ctrl on Windows/Linux
  ctrlOrMeta?: boolean;
}

export interface ShortcutHandler {
  id: string;
  name: string;
  description: string;
  category: ShortcutCategory;
  contexts: ShortcutContext[];
  defaultBinding: KeyCombo | KeyCombo[]; // Array for sequences
  handler: () => void | Promise<void>;
  enabled?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export type ShortcutCategory =
  | 'general'
  | 'editor'
  | 'navigation'
  | 'terminal'
  | 'chat'
  | 'view'
  | 'file'
  | 'custom';

// Registered handlers
const handlers = new Map<string, ShortcutHandler>();

// Sequence timeout (ms) - how long to wait for next key in sequence
const SEQUENCE_TIMEOUT = 1000;
let sequenceTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Track if keyboard shortcuts manager is initialized
let isInitialized = false;

/**
 * Convert a KeyboardEvent to our KeyCombo format
 */
function eventToKeyCombo(event: KeyboardEvent): KeyCombo {
  return {
    key: event.key.toLowerCase(),
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  };
}

/**
 * Check if a key combo matches the binding
 */
function matchesKeyCombo(event: KeyCombo, binding: KeyCombo): boolean {
  // Normalize the key
  const eventKey = event.key.toLowerCase();
  const bindingKey = binding.key.toLowerCase();

  if (eventKey !== bindingKey) return false;

  // Handle ctrlOrMeta (cross-platform)
  if (binding.ctrlOrMeta) {
    const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
    const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
    if (!modifierPressed) return false;

    // When using ctrlOrMeta, ensure the other modifier isn't unexpectedly pressed
    if (isMac && event.ctrlKey && !binding.ctrlKey) return false;
    if (!isMac && event.metaKey && !binding.metaKey) return false;
  } else {
    // Exact modifier matching when not using ctrlOrMeta
    if (Boolean(event.ctrlKey) !== Boolean(binding.ctrlKey)) return false;
    if (Boolean(event.metaKey) !== Boolean(binding.metaKey)) return false;
  }

  // Always check shift and alt
  if (Boolean(event.shiftKey) !== Boolean(binding.shiftKey)) return false;
  if (Boolean(event.altKey) !== Boolean(binding.altKey)) return false;

  return true;
}

/**
 * Convert a KeyCombo to a human-readable string
 */
export function keyComboToString(combo: KeyCombo): string {
  const parts: string[] = [];
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

  if (combo.ctrlOrMeta) {
    parts.push(isMac ? 'Cmd' : 'Ctrl');
  } else {
    if (combo.ctrlKey) parts.push('Ctrl');
    if (combo.metaKey) parts.push(isMac ? 'Cmd' : 'Win');
  }

  if (combo.altKey) parts.push(isMac ? 'Option' : 'Alt');
  if (combo.shiftKey) parts.push('Shift');

  // Capitalize the key for display
  const displayKey = combo.key.length === 1 ? combo.key.toUpperCase() : capitalizeKey(combo.key);
  parts.push(displayKey);

  return parts.join('+');
}

/**
 * Capitalize special keys for display
 */
function capitalizeKey(key: string): string {
  const specialKeys: Record<string, string> = {
    escape: 'Esc',
    arrowup: 'Up',
    arrowdown: 'Down',
    arrowleft: 'Left',
    arrowright: 'Right',
    backspace: 'Backspace',
    delete: 'Delete',
    enter: 'Enter',
    tab: 'Tab',
    space: 'Space',
    ' ': 'Space',
  };

  return specialKeys[key.toLowerCase()] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Parse a string like "Cmd+Shift+P" into a KeyCombo
 */
export function parseKeyComboString(str: string): KeyCombo {
  const parts = str.split('+').map(p => p.trim().toLowerCase());
  const combo: KeyCombo = { key: '' };

  for (const part of parts) {
    switch (part) {
      case 'cmd':
      case 'command':
      case 'meta':
        combo.metaKey = true;
        break;
      case 'ctrl':
      case 'control':
        combo.ctrlKey = true;
        break;
      case 'alt':
      case 'option':
        combo.altKey = true;
        break;
      case 'shift':
        combo.shiftKey = true;
        break;
      default:
        combo.key = part;
    }
  }

  // If both ctrl and meta are set, treat as ctrlOrMeta
  if (combo.ctrlKey && combo.metaKey) {
    combo.ctrlOrMeta = true;
    combo.ctrlKey = false;
    combo.metaKey = false;
  }

  return combo;
}

/**
 * Check if the current context matches any of the handler's contexts
 */
function contextMatches(handlerContexts: ShortcutContext[], currentContext: ShortcutContext): boolean {
  // 'global' context always matches
  if (handlerContexts.includes('global')) return true;

  return handlerContexts.includes(currentContext);
}

/**
 * Get the user's custom binding for a shortcut, or the default
 */
function getEffectiveBinding(handlerId: string, defaultBinding: KeyCombo | KeyCombo[]): KeyCombo | KeyCombo[] {
  const bindings = keyBindingsStore.get();
  const customBinding = bindings[handlerId];

  if (customBinding) {
    // Convert stored binding format back to KeyCombo
    if (Array.isArray(customBinding.keys)) {
      return customBinding.keys.map(k => ({
        key: k.key,
        ctrlKey: k.ctrl,
        shiftKey: k.shift,
        altKey: k.alt,
        metaKey: k.meta,
        ctrlOrMeta: k.ctrlOrMeta,
      }));
    }
  }

  return defaultBinding;
}

/**
 * Handle a keyboard event
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Ignore events when typing in inputs (unless in a context that allows it)
  const target = event.target as HTMLElement;
  const isInputElement = target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable;

  const currentContext = activeContextStore.get();

  // Allow shortcuts in editor context even in contentEditable (CodeMirror)
  if (isInputElement && currentContext !== 'editor' && currentContext !== 'chat') {
    return;
  }

  const eventCombo = eventToKeyCombo(event);
  const sequenceBuffer = sequenceBufferStore.get();

  // Try to match handlers
  for (const [id, handler] of handlers) {
    if (handler.enabled === false) continue;

    // Check context
    if (!contextMatches(handler.contexts, currentContext)) continue;

    const binding = getEffectiveBinding(id, handler.defaultBinding);

    // Handle sequence shortcuts
    if (Array.isArray(binding)) {
      const nextIndex = sequenceBuffer.keys.length;
      if (nextIndex >= binding.length) continue;

      const expectedCombo = binding[nextIndex];
      if (matchesKeyCombo(eventCombo, expectedCombo)) {
        // Clear any existing timeout
        if (sequenceTimeoutId) {
          clearTimeout(sequenceTimeoutId);
          sequenceTimeoutId = null;
        }

        // Add to sequence buffer
        const newKeys = [...sequenceBuffer.keys, eventCombo];
        sequenceBufferStore.set({
          keys: newKeys,
          startTime: sequenceBuffer.startTime || Date.now(),
        });

        // Check if sequence is complete
        if (newKeys.length === binding.length) {
          // Execute handler
          try {
            handler.handler();
          } catch (err) {
            logger.error(`[KeyboardShortcuts] Error executing handler ${id}:`, err);
          }

          clearSequenceBuffer();

          if (handler.preventDefault !== false) {
            event.preventDefault();
          }
          if (handler.stopPropagation !== false) {
            event.stopPropagation();
          }
          return;
        }

        // Set timeout for next key in sequence
        sequenceTimeoutId = setTimeout(() => {
          clearSequenceBuffer();
        }, SEQUENCE_TIMEOUT);

        event.preventDefault();
        return;
      }
    } else {
      // Single key combo
      if (matchesKeyCombo(eventCombo, binding)) {
        // Clear any sequence in progress
        clearSequenceBuffer();

        // Execute handler
        try {
          handler.handler();
        } catch (err) {
          logger.error(`[KeyboardShortcuts] Error executing handler ${id}:`, err);
        }

        if (handler.preventDefault !== false) {
          event.preventDefault();
        }
        if (handler.stopPropagation !== false) {
          event.stopPropagation();
        }
        return;
      }
    }
  }

  // If we get here and there was a sequence in progress, check if it's invalid
  if (sequenceBuffer.keys.length > 0) {
    // Check if this key could be start of any sequence
    let isValidSequenceStart = false;
    for (const [, handler] of handlers) {
      const binding = getEffectiveBinding(handler.id, handler.defaultBinding);
      if (Array.isArray(binding) && matchesKeyCombo(eventCombo, binding[0])) {
        isValidSequenceStart = true;
        break;
      }
    }

    if (!isValidSequenceStart) {
      clearSequenceBuffer();
    }
  }
}

/**
 * Register a keyboard shortcut handler
 */
export function registerShortcut(handler: ShortcutHandler): () => void {
  if (handlers.has(handler.id)) {
    logger.warn(`[KeyboardShortcuts] Handler ${handler.id} already registered, replacing`);
  }

  handlers.set(handler.id, handler);

  // Return unregister function
  return () => {
    handlers.delete(handler.id);
  };
}

/**
 * Register multiple shortcuts at once
 */
export function registerShortcuts(shortcuts: ShortcutHandler[]): () => void {
  const unregisterFns = shortcuts.map(s => registerShortcut(s));

  return () => {
    unregisterFns.forEach(fn => fn());
  };
}

/**
 * Unregister a shortcut by ID
 */
export function unregisterShortcut(id: string): boolean {
  return handlers.delete(id);
}

/**
 * Get all registered shortcuts
 */
export function getRegisteredShortcuts(): ShortcutHandler[] {
  return Array.from(handlers.values());
}

/**
 * Get shortcuts by category
 */
export function getShortcutsByCategory(category: ShortcutCategory): ShortcutHandler[] {
  return Array.from(handlers.values()).filter(h => h.category === category);
}

/**
 * Get shortcuts for a specific context
 */
export function getShortcutsForContext(context: ShortcutContext): ShortcutHandler[] {
  return Array.from(handlers.values()).filter(h =>
    h.contexts.includes(context) || h.contexts.includes('global')
  );
}

/**
 * Set the active context
 */
export function setActiveContext(context: ShortcutContext): void {
  activeContextStore.set(context);
}

/**
 * Get the active context
 */
export function getActiveContext(): ShortcutContext {
  return activeContextStore.get();
}

/**
 * Enable a shortcut
 */
export function enableShortcut(id: string): void {
  const handler = handlers.get(id);
  if (handler) {
    handler.enabled = true;
  }
}

/**
 * Disable a shortcut
 */
export function disableShortcut(id: string): void {
  const handler = handlers.get(id);
  if (handler) {
    handler.enabled = false;
  }
}

/**
 * Check for conflicts with existing shortcuts
 */
export function checkConflicts(
  binding: KeyCombo | KeyCombo[],
  contexts: ShortcutContext[],
  excludeId?: string
): ShortcutHandler[] {
  const conflicts: ShortcutHandler[] = [];

  for (const [id, handler] of handlers) {
    if (id === excludeId) continue;

    // Check if contexts overlap
    const contextsOverlap = handler.contexts.some(c =>
      c === 'global' || contexts.includes('global') || contexts.includes(c)
    );
    if (!contextsOverlap) continue;

    const existingBinding = getEffectiveBinding(id, handler.defaultBinding);

    // Compare bindings
    const isConflict = Array.isArray(binding) && Array.isArray(existingBinding)
      ? binding.length === existingBinding.length &&
        binding.every((b, i) => matchesKeyCombo(b, existingBinding[i]))
      : !Array.isArray(binding) && !Array.isArray(existingBinding) &&
        matchesKeyCombo(binding, existingBinding);

    if (isConflict) {
      conflicts.push(handler);
    }
  }

  return conflicts;
}

/**
 * Initialize the keyboard shortcuts manager
 */
export function initKeyboardShortcuts(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (isInitialized) {
    logger.warn('[KeyboardShortcuts] Already initialized');
    return () => {};
  }

  window.addEventListener('keydown', handleKeyDown, { capture: true });
  isInitialized = true;

  logger.info('[KeyboardShortcuts] Initialized');

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyDown, { capture: true });
    isInitialized = false;
    handlers.clear();
    clearSequenceBuffer();
    if (sequenceTimeoutId) {
      clearTimeout(sequenceTimeoutId);
      sequenceTimeoutId = null;
    }
    logger.info('[KeyboardShortcuts] Cleaned up');
  };
}

/**
 * Execute a shortcut programmatically
 */
export async function executeShortcut(id: string): Promise<boolean> {
  const handler = handlers.get(id);
  if (!handler || handler.enabled === false) {
    return false;
  }

  try {
    await handler.handler();
    return true;
  } catch (err) {
    logger.error(`[KeyboardShortcuts] Error executing handler ${id}:`, err);
    return false;
  }
}

/**
 * Get a shortcut by ID
 */
export function getShortcut(id: string): ShortcutHandler | undefined {
  return handlers.get(id);
}

/**
 * Get all categories that have shortcuts
 */
export function getActiveCategories(): ShortcutCategory[] {
  const categories = new Set<ShortcutCategory>();
  for (const handler of handlers.values()) {
    categories.add(handler.category);
  }
  return Array.from(categories);
}

/**
 * Format a binding for display
 */
export function formatBindingForDisplay(binding: KeyCombo | KeyCombo[]): string {
  if (Array.isArray(binding)) {
    return binding.map(keyComboToString).join(' ');
  }
  return keyComboToString(binding);
}

/**
 * Check if the shortcuts manager is initialized
 */
export function isShortcutsInitialized(): boolean {
  return isInitialized;
}

// Export types
export type { ShortcutContext, KeyBinding };
