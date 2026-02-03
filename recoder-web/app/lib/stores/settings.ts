import { atom, map } from 'nanostores';
import { workbenchStore } from './workbench';

// Storage keys
const SETTINGS_KEY = 'recoder_settings';

// Shortcut types
export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlOrMetaKey?: boolean;
  action: () => void;
}

export interface Shortcuts {
  toggleTerminal: Shortcut;
}

// Preferences types
export interface EditorPreferences {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  codeFolding: boolean;
  stickyScroll: boolean;
  stickyScrollMaxLines: number;
  bracketPairColorization: boolean;
  indentGuides: boolean;
}

export interface TerminalPreferences {
  fontSize: number;
  fontFamily: string;
  cursorBlink: boolean;
  scrollback: number;
}

export interface AIPreferences {
  temperature: number;
  maxTokens: number;
  streamResponses: boolean;
  /** Enable automatic error fixing - sends build errors to AI for auto-fix */
  autoFixEnabled: boolean;
  /** Debounce time in ms before triggering auto-fix */
  autoFixDebounceMs: number;
  /** Maximum auto-fix attempts per session */
  autoFixMaxAttempts: number;
  /** Thinking budget controls how much reasoning the AI model performs (low/medium/high) */
  thinkingBudget: 'low' | 'medium' | 'high';
}

export interface WorkspacePreferences {
  /** Restore open tabs and editor state when opening a project */
  restoreEnabled: boolean;
  /** Auto-save interval in milliseconds (0 to disable) */
  autoSaveInterval: number;
}

export interface AppPreferences {
  editor: EditorPreferences;
  terminal: TerminalPreferences;
  ai: AIPreferences;
  workspace: WorkspacePreferences;
}

export interface Settings {
  shortcuts: Shortcuts;
  preferences: AppPreferences;
}

// Default values
export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  minimap: false,
  codeFolding: true,
  stickyScroll: true,
  stickyScrollMaxLines: 4,
  bracketPairColorization: true,
  indentGuides: true,
};

export const DEFAULT_TERMINAL_PREFERENCES: TerminalPreferences = {
  fontSize: 12,
  fontFamily: 'Menlo, courier-new, courier, monospace',
  cursorBlink: true,
  scrollback: 10000,
};

export const DEFAULT_AI_PREFERENCES: AIPreferences = {
  temperature: 0.7,
  maxTokens: 4096,
  streamResponses: true,
  autoFixEnabled: true,
  autoFixDebounceMs: 3000,
  autoFixMaxAttempts: 5,
  thinkingBudget: 'medium',
};

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  restoreEnabled: true,
  autoSaveInterval: 30000, // 30 seconds
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  editor: DEFAULT_EDITOR_PREFERENCES,
  terminal: DEFAULT_TERMINAL_PREFERENCES,
  ai: DEFAULT_AI_PREFERENCES,
  workspace: DEFAULT_WORKSPACE_PREFERENCES,
};

// Load preferences from localStorage
function loadPreferences(): AppPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings
      return {
        editor: { ...DEFAULT_EDITOR_PREFERENCES, ...parsed.editor },
        terminal: { ...DEFAULT_TERMINAL_PREFERENCES, ...parsed.terminal },
        ai: { ...DEFAULT_AI_PREFERENCES, ...parsed.ai },
        workspace: { ...DEFAULT_WORKSPACE_PREFERENCES, ...parsed.workspace },
      };
    }
  } catch (e) {
    console.error('[Settings] Failed to load preferences:', e);
  }

  return DEFAULT_PREFERENCES;
}

// Save preferences to localStorage
function savePreferences(preferences: AppPreferences): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch (e) {
    console.error('[Settings] Failed to save preferences:', e);
  }
}

// Shortcuts store
export const shortcutsStore = map<Shortcuts>({
  toggleTerminal: {
    key: 'j',
    ctrlOrMetaKey: true,
    action: () => workbenchStore.toggleTerminal(),
  },
});

// Preferences store
export const preferencesStore = map<AppPreferences>(loadPreferences());

// Subscribe to preferences changes and persist
preferencesStore.subscribe((preferences) => {
  savePreferences(preferences);
});

// Combined settings store
export const settingsStore = map<Settings>({
  shortcuts: shortcutsStore.get(),
  preferences: preferencesStore.get(),
});

// Keep settings store in sync
shortcutsStore.subscribe((shortcuts) => {
  settingsStore.set({
    ...settingsStore.get(),
    shortcuts,
  });
});

preferencesStore.subscribe((preferences) => {
  settingsStore.set({
    ...settingsStore.get(),
    preferences,
  });
});

// Convenience functions for updating preferences
export function updateEditorPreferences(updates: Partial<EditorPreferences>): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    editor: { ...current.editor, ...updates },
  });
}

export function updateTerminalPreferences(updates: Partial<TerminalPreferences>): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    terminal: { ...current.terminal, ...updates },
  });
}

export function updateAIPreferences(updates: Partial<AIPreferences>): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    ai: { ...current.ai, ...updates },
  });
}

export function updateWorkspacePreferences(updates: Partial<WorkspacePreferences>): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    workspace: { ...current.workspace, ...updates },
  });

  // Also sync with workspace store for immediate effect
  if (updates.restoreEnabled !== undefined) {
    import('./workspace').then(({ setWorkspaceRestoreEnabled }) => {
      setWorkspaceRestoreEnabled(updates.restoreEnabled!);
    });
  }
  if (updates.autoSaveInterval !== undefined) {
    import('./workspace').then(({ setWorkspaceAutoSaveInterval }) => {
      setWorkspaceAutoSaveInterval(updates.autoSaveInterval!);
    });
  }
}

export function resetAllPreferences(): void {
  preferencesStore.set(DEFAULT_PREFERENCES);
}

export function resetEditorPreferences(): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    editor: DEFAULT_EDITOR_PREFERENCES,
  });
}

export function resetTerminalPreferences(): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    terminal: DEFAULT_TERMINAL_PREFERENCES,
  });
}

export function resetAIPreferences(): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    ai: DEFAULT_AI_PREFERENCES,
  });
}

export function resetWorkspacePreferences(): void {
  const current = preferencesStore.get();
  preferencesStore.set({
    ...current,
    workspace: DEFAULT_WORKSPACE_PREFERENCES,
  });

  // Sync with workspace store
  import('./workspace').then(({ resetWorkspaceSettings }) => {
    resetWorkspaceSettings();
  });
}

// Settings panel visibility
export const settingsPanelOpen = atom<boolean>(false);

export function openSettingsPanel(): void {
  settingsPanelOpen.set(true);
}

export function closeSettingsPanel(): void {
  settingsPanelOpen.set(false);
}

export function toggleSettingsPanel(): void {
  settingsPanelOpen.set(!settingsPanelOpen.get());
}
