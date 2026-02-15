/**
 * Quick Actions Store
 *
 * Manages the floating quick actions menu state including:
 * - Menu visibility and position
 * - Available actions based on context
 * - Recently used actions
 * - Custom/user-defined actions
 *
 * Uses nanostores for state management.
 */

import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('QuickActionsStore');

// =============================================================================
// Types
// =============================================================================

export type QuickActionCategory = 'file' | 'terminal' | 'view' | 'ai' | 'project' | 'custom';

export interface QuickAction {
  /** Unique action ID */
  id: string;
  /** Display label */
  label: string;
  /** Action description */
  description?: string;
  /** Category for grouping */
  category: QuickActionCategory;
  /** Icon class (Phosphor icons) */
  icon: string;
  /** Action handler */
  action: () => void | Promise<void>;
  /** Condition for showing the action */
  when?: () => boolean;
  /** Whether this is an AI action */
  isAI?: boolean;
  /** Optional keyboard shortcut hint */
  shortcutHint?: string;
}

export interface MenuPosition {
  /** Horizontal position: 'left' | 'right' */
  horizontal: 'left' | 'right';
  /** Vertical position: 'top' | 'bottom' */
  vertical: 'top' | 'bottom';
  /** Offset from edge in pixels */
  offset: number;
}

export interface QuickActionsState {
  /** Whether the menu is open */
  isOpen: boolean;
  /** Whether the FAB is visible */
  isFabVisible: boolean;
  /** Current menu position */
  position: MenuPosition;
}

// =============================================================================
// Storage Keys
// =============================================================================

const STORAGE_KEY_RECENT = 'recoder_quick_actions_recent';
const STORAGE_KEY_POSITION = 'recoder_quick_actions_position';
const STORAGE_KEY_CUSTOM = 'recoder_quick_actions_custom';

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_POSITION: MenuPosition = {
  horizontal: 'right',
  vertical: 'bottom',
  offset: 24,
};

const DEFAULT_STATE: QuickActionsState = {
  isOpen: false,
  isFabVisible: true,
  position: DEFAULT_POSITION,
};

// =============================================================================
// Stores
// =============================================================================

/** Main quick actions state */
export const quickActionsState = map<QuickActionsState>(DEFAULT_STATE);

/** Registered quick actions */
export const quickActionsRegistry = map<Record<string, QuickAction>>({});

/** Recently used action IDs (most recent first, max 5) */
export const recentQuickActions = atom<string[]>([]);

/** Custom user-defined actions */
export const customQuickActions = map<Record<string, QuickAction>>({});

/** Current context for filtering actions (e.g., current file extension) */
export const quickActionsContext = map<{
  hasFile: boolean;
  fileExtension: string | null;
  hasTerminal: boolean;
  hasPreview: boolean;
  hasErrors: boolean;
}>({
  hasFile: false,
  fileExtension: null,
  hasTerminal: true,
  hasPreview: false,
  hasErrors: false,
});

// =============================================================================
// State Actions
// =============================================================================

/**
 * Open the quick actions menu
 */
export function openQuickActions(): void {
  quickActionsState.setKey('isOpen', true);
}

/**
 * Close the quick actions menu
 */
export function closeQuickActions(): void {
  quickActionsState.setKey('isOpen', false);
}

/**
 * Toggle the quick actions menu
 */
export function toggleQuickActions(): void {
  const current = quickActionsState.get();
  quickActionsState.setKey('isOpen', !current.isOpen);
}

/**
 * Show the FAB button
 */
export function showFab(): void {
  quickActionsState.setKey('isFabVisible', true);
}

/**
 * Hide the FAB button
 */
export function hideFab(): void {
  quickActionsState.setKey('isFabVisible', false);
}

/**
 * Set menu position
 */
export function setMenuPosition(position: MenuPosition): void {
  quickActionsState.setKey('position', position);
  savePosition(position);
}

/**
 * Update menu position partially
 */
export function updateMenuPosition(updates: Partial<MenuPosition>): void {
  const current = quickActionsState.get().position;
  const newPosition = { ...current, ...updates };
  quickActionsState.setKey('position', newPosition);
  savePosition(newPosition);
}

// =============================================================================
// Action Registry
// =============================================================================

/**
 * Register a quick action
 */
export function registerQuickAction(action: QuickAction): void {
  quickActionsRegistry.setKey(action.id, action);
}

/**
 * Register multiple quick actions
 */
export function registerQuickActions(actions: QuickAction[]): void {
  const current = quickActionsRegistry.get();
  const newActions = { ...current };
  for (const action of actions) {
    newActions[action.id] = action;
  }
  quickActionsRegistry.set(newActions);
}

/**
 * Unregister a quick action
 */
export function unregisterQuickAction(id: string): void {
  const current = quickActionsRegistry.get();
  const { [id]: _, ...rest } = current;
  quickActionsRegistry.set(rest);
}

/**
 * Get all available quick actions (filtered by context and conditions)
 */
export function getAvailableQuickActions(): QuickAction[] {
  const registered = Object.values(quickActionsRegistry.get());
  const custom = Object.values(customQuickActions.get());
  const all = [...registered, ...custom];

  return all.filter((action) => {
    // Check the when condition if present
    if (action.when && !action.when()) {
      return false;
    }
    return true;
  });
}

/**
 * Get quick actions grouped by category
 */
export function getQuickActionsByCategory(): Record<QuickActionCategory, QuickAction[]> {
  const available = getAvailableQuickActions();
  const grouped: Record<QuickActionCategory, QuickAction[]> = {
    file: [],
    terminal: [],
    view: [],
    ai: [],
    project: [],
    custom: [],
  };

  for (const action of available) {
    grouped[action.category].push(action);
  }

  return grouped;
}

/**
 * Execute a quick action by ID
 */
export async function executeQuickAction(id: string): Promise<void> {
  const action = quickActionsRegistry.get()[id] || customQuickActions.get()[id];

  if (!action) {
    logger.warn(`[QuickActions] Action not found: ${id}`);
    return;
  }

  // Add to recent actions
  addToRecent(id);

  // Close the menu
  closeQuickActions();

  // Execute the action
  try {
    await action.action();
  } catch (error) {
    logger.error(`[QuickActions] Error executing action ${id}:`, error);
  }
}

// =============================================================================
// Recent Actions
// =============================================================================

/**
 * Add action to recent list
 */
export function addToRecent(id: string): void {
  const current = recentQuickActions.get();
  // Remove if already exists, then add to front
  const filtered = current.filter((aid) => aid !== id);
  const newRecent = [id, ...filtered].slice(0, 5); // Keep last 5
  recentQuickActions.set(newRecent);
  saveRecent(newRecent);
}

/**
 * Get recent quick actions
 */
export function getRecentQuickActions(): QuickAction[] {
  const recent = recentQuickActions.get();
  const registry = quickActionsRegistry.get();
  const custom = customQuickActions.get();

  return recent
    .map((id) => registry[id] || custom[id])
    .filter((action): action is QuickAction => {
      if (!action) return false;
      // Check when condition
      if (action.when && !action.when()) return false;
      return true;
    });
}

/**
 * Clear recent actions
 */
export function clearRecentActions(): void {
  recentQuickActions.set([]);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_RECENT);
  }
}

// =============================================================================
// Custom Actions
// =============================================================================

/**
 * Add a custom action
 */
export function addCustomAction(action: Omit<QuickAction, 'category'> & { category?: QuickActionCategory }): void {
  const customAction: QuickAction = {
    ...action,
    category: action.category || 'custom',
  };
  customQuickActions.setKey(action.id, customAction);
  saveCustomActions();
}

/**
 * Remove a custom action
 */
export function removeCustomAction(id: string): void {
  const current = customQuickActions.get();
  const { [id]: _, ...rest } = current;
  customQuickActions.set(rest);
  saveCustomActions();
}

/**
 * Update a custom action
 */
export function updateCustomAction(id: string, updates: Partial<QuickAction>): void {
  const current = customQuickActions.get()[id];
  if (current) {
    customQuickActions.setKey(id, { ...current, ...updates });
    saveCustomActions();
  }
}

// =============================================================================
// Context Updates
// =============================================================================

/**
 * Update the quick actions context
 */
export function updateQuickActionsContext(updates: Partial<typeof quickActionsContext extends { get: () => infer T } ? T : never>): void {
  const current = quickActionsContext.get();
  quickActionsContext.set({ ...current, ...updates });
}

/**
 * Set current file context
 */
export function setFileContext(filePath: string | null): void {
  if (!filePath) {
    quickActionsContext.setKey('hasFile', false);
    quickActionsContext.setKey('fileExtension', null);
    return;
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || null;
  quickActionsContext.setKey('hasFile', true);
  quickActionsContext.setKey('fileExtension', ext);
}

// =============================================================================
// Persistence
// =============================================================================

/**
 * Load persisted state from localStorage
 */
export function loadQuickActionsState(): void {
  if (typeof localStorage === 'undefined') return;

  // Load recent actions
  try {
    const recentStored = localStorage.getItem(STORAGE_KEY_RECENT);
    if (recentStored) {
      const parsed = JSON.parse(recentStored);
      if (Array.isArray(parsed)) {
        recentQuickActions.set(parsed);
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Load position
  try {
    const positionStored = localStorage.getItem(STORAGE_KEY_POSITION);
    if (positionStored) {
      const parsed = JSON.parse(positionStored);
      quickActionsState.setKey('position', { ...DEFAULT_POSITION, ...parsed });
    }
  } catch {
    // Ignore parse errors
  }

  // Note: Custom actions with functions cannot be persisted to localStorage
  // They need to be re-registered on app load
}

/**
 * Save recent actions to localStorage
 */
function saveRecent(recent: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recent));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Save position to localStorage
 */
function savePosition(position: MenuPosition): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_POSITION, JSON.stringify(position));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Save custom actions metadata (without functions)
 */
function saveCustomActions(): void {
  // Note: We can't serialize functions, so custom actions need to be
  // re-registered on app load. This is just a placeholder for future
  // enhancement where we might store action metadata.
}

// =============================================================================
// Category Metadata
// =============================================================================

export const CATEGORY_INFO: Record<QuickActionCategory, { label: string; icon: string }> = {
  file: { label: 'File', icon: 'i-ph:file' },
  terminal: { label: 'Terminal', icon: 'i-ph:terminal-window' },
  view: { label: 'View', icon: 'i-ph:eye' },
  ai: { label: 'AI', icon: 'i-ph:robot' },
  project: { label: 'Project', icon: 'i-ph:folder-open' },
  custom: { label: 'Custom', icon: 'i-ph:star' },
};

// =============================================================================
// Initialize
// =============================================================================

// Load persisted state on module initialization
if (typeof window !== 'undefined') {
  loadQuickActionsState();
}
