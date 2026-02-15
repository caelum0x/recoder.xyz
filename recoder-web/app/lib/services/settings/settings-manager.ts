/**
 * Settings Manager
 *
 * Central manager for all application settings with:
 * - Local storage persistence
 * - Server sync for logged-in users
 * - Settings migration for version updates
 * - Nanostores for reactive state management
 */

import { atom, map, computed } from 'nanostores';
import type {
  UserPreferences,
  EditorSettings,
  AISettings,
  AppSettings,
  NotificationSettings,
  TerminalSettings,
  KeyboardSettings,
  AccountSettings,
  WorkspaceSettings,
  SettingsCategory,
  SettingsChangeEvent,
  SettingsSyncState,
  SettingsExport,
} from './types';
import { createScopedLogger } from '~/utils/logger';
import {
  DEFAULT_USER_PREFERENCES,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_APP_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  DEFAULT_KEYBOARD_SETTINGS,
  DEFAULT_ACCOUNT_SETTINGS,
  DEFAULT_WORKSPACE_SETTINGS,
  SETTINGS_VERSION,
} from './defaults';

const logger = createScopedLogger('SettingsManager');

// ============================================================================
// Storage Keys
// ============================================================================

const SETTINGS_STORAGE_KEY = 'recoder_user_preferences';
const SETTINGS_SYNC_KEY = 'recoder_settings_sync';

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Migrate settings from an older version to the current version
 */
function migrateSettings(settings: Partial<UserPreferences>): UserPreferences {
  const version = settings.version || 0;

  // Clone settings to avoid mutations
  let migrated = JSON.parse(JSON.stringify(settings)) as UserPreferences;

  // Apply migrations in order
  if (version < 1) {
    // Version 1 migrations (initial version)
    migrated = migrateToV1(migrated);
  }

  // Add future migrations here
  // if (version < 2) { migrated = migrateToV2(migrated); }

  // Update version
  migrated.version = SETTINGS_VERSION;
  migrated.lastUpdated = Date.now();

  return migrated;
}

/**
 * Migration to version 1
 */
function migrateToV1(settings: Partial<UserPreferences>): UserPreferences {
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...settings,
    editor: {
      ...DEFAULT_EDITOR_SETTINGS,
      ...(settings.editor || {}),
    },
    ai: {
      ...DEFAULT_AI_SETTINGS,
      ...(settings.ai || {}),
    },
    app: {
      ...DEFAULT_APP_SETTINGS,
      ...(settings.app || {}),
    },
    notifications: {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(settings.notifications || {}),
    },
    terminal: {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...(settings.terminal || {}),
    },
    keyboard: {
      ...DEFAULT_KEYBOARD_SETTINGS,
      ...(settings.keyboard || {}),
    },
    account: {
      ...DEFAULT_ACCOUNT_SETTINGS,
      ...(settings.account || {}),
    },
    workspace: {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...(settings.workspace || {}),
    },
    version: 1,
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Load settings from localStorage
 */
function loadSettings(): UserPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_PREFERENCES;
  }

  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<UserPreferences>;

      // Check if migration is needed
      if (!parsed.version || parsed.version < SETTINGS_VERSION) {
        const migrated = migrateSettings(parsed);
        saveSettings(migrated);
        return migrated;
      }

      // Merge with defaults to handle any new properties
      return deepMerge(DEFAULT_USER_PREFERENCES as unknown as Record<string, unknown>, parsed as unknown as Record<string, unknown>) as unknown as UserPreferences;
    }
  } catch (error) {
    logger.error('[Settings] Failed to load settings:', error);
  }

  return DEFAULT_USER_PREFERENCES;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: UserPreferences): void {
  if (typeof window === 'undefined') return;

  try {
    settings.lastUpdated = Date.now();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    logger.error('[Settings] Failed to save settings:', error);
  }
}

/**
 * Deep merge objects
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== undefined &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        sourceValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue) &&
        targetValue !== null
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

// ============================================================================
// Nanostores
// ============================================================================

// Main preferences store
const initialSettings = loadSettings();

export const userPreferencesStore = map<UserPreferences>(initialSettings);

// Individual category stores for easier access
export const editorSettingsStore = map<EditorSettings>(initialSettings.editor);
export const aiSettingsStore = map<AISettings>(initialSettings.ai);
export const appSettingsStore = map<AppSettings>(initialSettings.app);
export const notificationSettingsStore = map<NotificationSettings>(initialSettings.notifications);
export const terminalSettingsStore = map<TerminalSettings>(initialSettings.terminal);
export const keyboardSettingsStore = map<KeyboardSettings>(initialSettings.keyboard);
export const accountSettingsStore = map<AccountSettings>(initialSettings.account);
export const workspaceSettingsStore = map<WorkspaceSettings>(initialSettings.workspace);

// Sync state store
export const settingsSyncStore = map<SettingsSyncState>({
  lastSyncedAt: null,
  syncEnabled: false,
  syncInProgress: false,
  syncError: null,
  pendingChanges: [],
});

// Settings panel state
export const settingsDialogOpen = atom<boolean>(false);
export const activeSettingsTab = atom<SettingsCategory>('editor');

// Settings change history (for undo functionality)
export const settingsHistory = atom<SettingsChangeEvent[]>([]);

// ============================================================================
// Computed Stores
// ============================================================================

// Check if settings have been modified from defaults
export const hasModifiedSettings = computed(userPreferencesStore, (prefs) => {
  return JSON.stringify(prefs) !== JSON.stringify(DEFAULT_USER_PREFERENCES);
});

// Check if there are pending sync changes
export const hasPendingSync = computed(settingsSyncStore, (sync) => {
  return sync.pendingChanges.length > 0;
});

// ============================================================================
// Store Subscriptions
// ============================================================================

// Keep individual stores in sync with main store
userPreferencesStore.subscribe((prefs) => {
  editorSettingsStore.set(prefs.editor);
  aiSettingsStore.set(prefs.ai);
  appSettingsStore.set(prefs.app);
  notificationSettingsStore.set(prefs.notifications);
  terminalSettingsStore.set(prefs.terminal);
  keyboardSettingsStore.set(prefs.keyboard);
  accountSettingsStore.set(prefs.account);
  workspaceSettingsStore.set(prefs.workspace);
  saveSettings(prefs);
});

// ============================================================================
// Update Functions
// ============================================================================

/**
 * Update editor settings
 */
export function updateEditorSettings(updates: Partial<EditorSettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.editor };
  const newEditor = { ...current.editor, ...updates };

  userPreferencesStore.set({
    ...current,
    editor: newEditor,
    lastUpdated: Date.now(),
  });

  // Record changes
  recordChanges('editor', oldValues, updates);
}

/**
 * Update AI settings
 */
export function updateAISettings(updates: Partial<AISettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.ai };
  const newAI = { ...current.ai, ...updates };

  userPreferencesStore.set({
    ...current,
    ai: newAI,
    lastUpdated: Date.now(),
  });

  recordChanges('ai', oldValues, updates);
}

/**
 * Update app settings
 */
export function updateAppSettings(updates: Partial<AppSettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.app };
  const newApp = { ...current.app, ...updates };

  userPreferencesStore.set({
    ...current,
    app: newApp,
    lastUpdated: Date.now(),
  });

  recordChanges('app', oldValues, updates);

  // Apply theme changes immediately
  if (updates.theme !== undefined) {
    applyTheme(updates.theme);
  }
}

/**
 * Update notification settings
 */
export function updateNotificationSettings(updates: Partial<NotificationSettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.notifications };
  const newNotifications = { ...current.notifications, ...updates };

  userPreferencesStore.set({
    ...current,
    notifications: newNotifications,
    lastUpdated: Date.now(),
  });

  recordChanges('notifications', oldValues, updates);
}

/**
 * Update terminal settings
 */
export function updateTerminalSettings(updates: Partial<TerminalSettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.terminal };
  const newTerminal = { ...current.terminal, ...updates };

  userPreferencesStore.set({
    ...current,
    terminal: newTerminal,
    lastUpdated: Date.now(),
  });

  recordChanges('terminal', oldValues, updates);
}

/**
 * Update keyboard settings
 */
export function updateKeyboardSettings(updates: Partial<KeyboardSettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.keyboard };
  const newKeyboard = { ...current.keyboard, ...updates };

  userPreferencesStore.set({
    ...current,
    keyboard: newKeyboard,
    lastUpdated: Date.now(),
  });

  recordChanges('keyboard', oldValues, updates);
}

/**
 * Update account settings
 */
export function updateAccountSettings(updates: Partial<AccountSettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.account };
  const newAccount = { ...current.account, ...updates };

  userPreferencesStore.set({
    ...current,
    account: newAccount,
    lastUpdated: Date.now(),
  });

  recordChanges('account', oldValues, updates);
}

/**
 * Update workspace settings
 */
export function updateWorkspaceSettings(updates: Partial<WorkspaceSettings>): void {
  const current = userPreferencesStore.get();
  const oldValues = { ...current.workspace };
  const newWorkspace = { ...current.workspace, ...updates };

  userPreferencesStore.set({
    ...current,
    workspace: newWorkspace,
    lastUpdated: Date.now(),
  });

  recordChanges('workspace', oldValues, updates);
}

// ============================================================================
// Change Recording
// ============================================================================

/**
 * Record setting changes for history and sync
 */
function recordChanges<T extends SettingsCategory>(
  category: T,
  oldValues: Record<string, unknown>,
  updates: Record<string, unknown>
): void {
  const changes: SettingsChangeEvent[] = [];
  const timestamp = Date.now();

  for (const key in updates) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      changes.push({
        category,
        key,
        oldValue: oldValues[key],
        newValue: updates[key],
        timestamp,
      });
    }
  }

  // Update history
  const currentHistory = settingsHistory.get();
  settingsHistory.set([...changes, ...currentHistory].slice(0, 100)); // Keep last 100 changes

  // Add to pending sync if sync is enabled
  const syncState = settingsSyncStore.get();
  if (syncState.syncEnabled) {
    settingsSyncStore.set({
      ...syncState,
      pendingChanges: [...syncState.pendingChanges, ...changes],
    });
  }
}

// ============================================================================
// Theme Application
// ============================================================================

/**
 * Apply theme to document
 */
function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  if (typeof window === 'undefined') return;

  let effectiveTheme: 'dark' | 'light';

  if (theme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    effectiveTheme = theme;
  }

  document.documentElement.setAttribute('data-theme', effectiveTheme);

  // Also update class for Tailwind dark mode
  if (effectiveTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// ============================================================================
// Reset Functions
// ============================================================================

/**
 * Reset all settings to defaults
 */
export function resetAllSettings(): void {
  userPreferencesStore.set({ ...DEFAULT_USER_PREFERENCES, lastUpdated: Date.now() });
}

/**
 * Reset a specific category to defaults
 */
export function resetCategorySettings(category: SettingsCategory): void {
  const current = userPreferencesStore.get();

  const defaults: Record<SettingsCategory, unknown> = {
    editor: DEFAULT_EDITOR_SETTINGS,
    ai: DEFAULT_AI_SETTINGS,
    app: DEFAULT_APP_SETTINGS,
    notifications: DEFAULT_NOTIFICATION_SETTINGS,
    terminal: DEFAULT_TERMINAL_SETTINGS,
    keyboard: DEFAULT_KEYBOARD_SETTINGS,
    account: DEFAULT_ACCOUNT_SETTINGS,
    workspace: DEFAULT_WORKSPACE_SETTINGS,
  };

  userPreferencesStore.set({
    ...current,
    [category]: defaults[category],
    lastUpdated: Date.now(),
  });
}

// ============================================================================
// Export / Import
// ============================================================================

/**
 * Export settings for backup
 */
export function exportSettings(includeKeyboardShortcuts = true): SettingsExport {
  const settings = userPreferencesStore.get();

  const exportData: SettingsExport = {
    version: SETTINGS_VERSION,
    exportedAt: Date.now(),
    settings: { ...settings },
    includeKeyboardShortcuts,
  };

  if (!includeKeyboardShortcuts) {
    delete exportData.settings.keyboard;
  }

  return exportData;
}

/**
 * Export settings as JSON string
 */
export function exportSettingsAsJson(includeKeyboardShortcuts = true): string {
  return JSON.stringify(exportSettings(includeKeyboardShortcuts), null, 2);
}

/**
 * Import settings from JSON
 */
export function importSettings(json: string): { success: boolean; error?: string } {
  try {
    const imported = JSON.parse(json) as SettingsExport;

    // Validate import structure
    if (!imported.version || !imported.settings) {
      return { success: false, error: 'Invalid settings file format' };
    }

    // Migrate if necessary
    const migrated = migrateSettings(imported.settings);

    // Apply settings
    userPreferencesStore.set(migrated);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse settings file',
    };
  }
}

// ============================================================================
// Server Sync Functions
// ============================================================================

/**
 * Enable server sync for logged-in users
 */
export function enableSync(userId: string): void {
  settingsSyncStore.set({
    ...settingsSyncStore.get(),
    syncEnabled: true,
  });

  // Trigger initial sync
  syncToServer(userId);
}

/**
 * Disable server sync
 */
export function disableSync(): void {
  settingsSyncStore.set({
    ...settingsSyncStore.get(),
    syncEnabled: false,
    pendingChanges: [],
  });
}

/**
 * Sync settings to server
 */
export async function syncToServer(userId: string): Promise<void> {
  const syncState = settingsSyncStore.get();

  if (!syncState.syncEnabled || syncState.syncInProgress) {
    return;
  }

  settingsSyncStore.set({
    ...syncState,
    syncInProgress: true,
    syncError: null,
  });

  try {
    const settings = userPreferencesStore.get();

    const response = await fetch('/api/user/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        settings,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to sync settings');
    }

    settingsSyncStore.set({
      ...settingsSyncStore.get(),
      lastSyncedAt: Date.now(),
      syncInProgress: false,
      pendingChanges: [],
    });
  } catch (error) {
    settingsSyncStore.set({
      ...settingsSyncStore.get(),
      syncInProgress: false,
      syncError: error instanceof Error ? error.message : 'Sync failed',
    });
  }
}

/**
 * Load settings from server
 */
export async function loadFromServer(userId: string): Promise<void> {
  try {
    const response = await fetch(`/api/user/settings?userId=${userId}`);

    if (!response.ok) {
      throw new Error('Failed to load settings from server');
    }

    const data = await response.json() as { settings?: Partial<UserPreferences> };

    if (data.settings) {
      const migrated = migrateSettings(data.settings);
      userPreferencesStore.set(migrated);

      settingsSyncStore.set({
        ...settingsSyncStore.get(),
        lastSyncedAt: Date.now(),
      });
    }
  } catch (error) {
    logger.error('[Settings] Failed to load from server:', error);
  }
}

// ============================================================================
// Dialog Controls
// ============================================================================

/**
 * Open settings dialog
 */
export function openSettingsDialog(tab?: SettingsCategory): void {
  if (tab) {
    activeSettingsTab.set(tab);
  }
  settingsDialogOpen.set(true);
}

/**
 * Close settings dialog
 */
export function closeSettingsDialog(): void {
  settingsDialogOpen.set(false);
}

/**
 * Toggle settings dialog
 */
export function toggleSettingsDialog(): void {
  settingsDialogOpen.set(!settingsDialogOpen.get());
}

/**
 * Set active settings tab
 */
export function setActiveSettingsTab(tab: SettingsCategory): void {
  activeSettingsTab.set(tab);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a specific setting value
 */
export function getSetting<T extends SettingsCategory, K extends keyof UserPreferences[T]>(
  category: T,
  key: K
): UserPreferences[T][K] {
  const prefs = userPreferencesStore.get();
  return prefs[category][key];
}

/**
 * Set a specific setting value
 */
export function setSetting<T extends SettingsCategory, K extends keyof UserPreferences[T]>(
  category: T,
  key: K,
  value: UserPreferences[T][K]
): void {
  const updateFns: Record<SettingsCategory, (updates: Record<string, unknown>) => void> = {
    editor: updateEditorSettings,
    ai: updateAISettings,
    app: updateAppSettings,
    notifications: updateNotificationSettings,
    terminal: updateTerminalSettings,
    keyboard: updateKeyboardSettings,
    account: updateAccountSettings,
    workspace: updateWorkspaceSettings,
  };

  updateFns[category]({ [key]: value });
}

/**
 * Check if a setting has been modified from default
 */
export function isSettingModified<T extends SettingsCategory, K extends keyof UserPreferences[T]>(
  category: T,
  key: K
): boolean {
  const currentValue = getSetting(category, key);
  const defaultValue = DEFAULT_USER_PREFERENCES[category][key];
  return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
}

// ============================================================================
// Initialize
// ============================================================================

/**
 * Initialize settings on app load
 */
export function initializeSettings(): void {
  if (typeof window === 'undefined') return;

  // Apply initial theme
  const appSettings = appSettingsStore.get();
  applyTheme(appSettings.theme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentTheme = appSettingsStore.get().theme;
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });
}
