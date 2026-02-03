/**
 * Workspace Session Store
 *
 * Manages workspace state persistence including:
 * - Open files/tabs
 * - Active file
 * - Editor scroll positions
 * - Split view state
 * - Panel visibility (terminal, problems, etc.)
 *
 * Per-project workspaces are stored by project ID in localStorage.
 */

import { atom, map } from 'nanostores';
import type { ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';

// Storage keys
const WORKSPACE_KEY_PREFIX = 'recoder_workspace_';
const WORKSPACE_SETTINGS_KEY = 'recoder_workspace_settings';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

// ==================== Types ====================

export interface WorkspaceScrollPositions {
  [filePath: string]: ScrollPosition;
}

export interface WorkspaceSplitState {
  enabled: boolean;
  secondaryFile?: string;
  ratio: number; // 20-80
  syncScrolling: boolean;
}

export interface WorkspacePanelState {
  terminalVisible: boolean;
  terminalHeight?: number;
  problemsVisible: boolean;
  problemsHeight?: number;
  fileTreeWidth?: number;
}

export interface WorkspaceState {
  /** Open file tabs */
  openTabs: string[];
  /** Pinned file tabs */
  pinnedTabs: string[];
  /** Currently selected/active file */
  activeFile?: string;
  /** Scroll positions per file */
  scrollPositions: WorkspaceScrollPositions;
  /** Split view configuration */
  splitState: WorkspaceSplitState;
  /** Panel visibility states */
  panelState: WorkspacePanelState;
  /** Current view (code or preview) */
  currentView: 'code' | 'preview';
  /** Last saved timestamp */
  savedAt: number;
}

export interface WorkspaceSettings {
  /** Enable workspace restore on project open */
  restoreEnabled: boolean;
  /** Auto-save interval in ms (0 to disable) */
  autoSaveInterval: number;
}

// ==================== Default Values ====================

export const DEFAULT_SPLIT_STATE: WorkspaceSplitState = {
  enabled: false,
  secondaryFile: undefined,
  ratio: 50,
  syncScrolling: false,
};

export const DEFAULT_PANEL_STATE: WorkspacePanelState = {
  terminalVisible: false,
  terminalHeight: 200,
  problemsVisible: false,
  problemsHeight: 150,
  fileTreeWidth: 250,
};

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  openTabs: [],
  pinnedTabs: [],
  activeFile: undefined,
  scrollPositions: {},
  splitState: DEFAULT_SPLIT_STATE,
  panelState: DEFAULT_PANEL_STATE,
  currentView: 'code',
  savedAt: 0,
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  restoreEnabled: true,
  autoSaveInterval: AUTO_SAVE_INTERVAL,
};

// ==================== Storage Functions ====================

/**
 * Get the localStorage key for a project's workspace
 */
function getWorkspaceKey(projectId: string): string {
  return `${WORKSPACE_KEY_PREFIX}${projectId}`;
}

/**
 * Load workspace state from localStorage for a project
 */
function loadWorkspaceState(projectId: string): WorkspaceState | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(getWorkspaceKey(projectId));
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<WorkspaceState>;
      // Merge with defaults to handle new/missing fields
      return {
        openTabs: parsed.openTabs || [],
        pinnedTabs: parsed.pinnedTabs || [],
        activeFile: parsed.activeFile,
        scrollPositions: parsed.scrollPositions || {},
        splitState: { ...DEFAULT_SPLIT_STATE, ...parsed.splitState },
        panelState: { ...DEFAULT_PANEL_STATE, ...parsed.panelState },
        currentView: parsed.currentView || 'code',
        savedAt: parsed.savedAt || 0,
      };
    }
  } catch (e) {
    console.warn('[Workspace] Failed to load workspace state:', e);
  }

  return null;
}

/**
 * Save workspace state to localStorage for a project
 */
function saveWorkspaceState(projectId: string, state: WorkspaceState): void {
  if (typeof window === 'undefined') return;

  try {
    const stateToSave: WorkspaceState = {
      ...state,
      savedAt: Date.now(),
    };
    localStorage.setItem(getWorkspaceKey(projectId), JSON.stringify(stateToSave));
    console.log(`[Workspace] Saved workspace state for project: ${projectId}`);
  } catch (e) {
    console.warn('[Workspace] Failed to save workspace state:', e);
  }
}

/**
 * Load workspace settings from localStorage
 */
function loadWorkspaceSettings(): WorkspaceSettings {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE_SETTINGS;

  try {
    const stored = localStorage.getItem(WORKSPACE_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<WorkspaceSettings>;
      return { ...DEFAULT_WORKSPACE_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('[Workspace] Failed to load workspace settings:', e);
  }

  return DEFAULT_WORKSPACE_SETTINGS;
}

/**
 * Save workspace settings to localStorage
 */
function saveWorkspaceSettings(settings: WorkspaceSettings): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(WORKSPACE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[Workspace] Failed to save workspace settings:', e);
  }
}

/**
 * Delete workspace state for a project
 */
export function deleteWorkspaceState(projectId: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(getWorkspaceKey(projectId));
    console.log(`[Workspace] Deleted workspace state for project: ${projectId}`);
  } catch (e) {
    console.warn('[Workspace] Failed to delete workspace state:', e);
  }
}

// ==================== Stores ====================

/** Current project ID for workspace management */
let currentProjectId: string | null = null;

/** Auto-save interval timer */
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

/** Workspace settings store */
export const workspaceSettingsStore = map<WorkspaceSettings>(loadWorkspaceSettings());

/** Current workspace state store */
export const workspaceStateStore = map<WorkspaceState>(DEFAULT_WORKSPACE_STATE);

/** Flag indicating if workspace is being restored (to prevent save during restore) */
export const isRestoringWorkspace = atom<boolean>(false);

/** Flag indicating if workspace has unsaved changes */
export const hasUnsavedWorkspaceChanges = atom<boolean>(false);

// Persist settings when they change
workspaceSettingsStore.subscribe((settings) => {
  saveWorkspaceSettings(settings);
});

// ==================== Workspace Management Functions ====================

/**
 * Initialize workspace for a project
 * Call this when a project is opened
 */
export function initWorkspace(projectId: string): WorkspaceState | null {
  currentProjectId = projectId;

  const settings = workspaceSettingsStore.get();

  if (!settings.restoreEnabled) {
    console.log('[Workspace] Restore disabled, starting with fresh workspace');
    workspaceStateStore.set(DEFAULT_WORKSPACE_STATE);
    startAutoSave();
    return null;
  }

  // Load saved workspace state
  const savedState = loadWorkspaceState(projectId);

  if (savedState) {
    console.log(`[Workspace] Restoring workspace for project: ${projectId}`);
    console.log(`[Workspace] - Open tabs: ${savedState.openTabs.length}`);
    console.log(`[Workspace] - Active file: ${savedState.activeFile || 'none'}`);
    console.log(`[Workspace] - Split enabled: ${savedState.splitState.enabled}`);

    isRestoringWorkspace.set(true);
    workspaceStateStore.set(savedState);

    // Clear restoring flag after a short delay to allow components to update
    setTimeout(() => {
      isRestoringWorkspace.set(false);
    }, 100);

    startAutoSave();
    return savedState;
  }

  console.log(`[Workspace] No saved workspace for project: ${projectId}`);
  workspaceStateStore.set(DEFAULT_WORKSPACE_STATE);
  startAutoSave();
  return null;
}

/**
 * Start auto-save timer
 */
function startAutoSave(): void {
  stopAutoSave();

  const settings = workspaceSettingsStore.get();
  if (settings.autoSaveInterval > 0) {
    autoSaveTimer = setInterval(() => {
      if (currentProjectId && hasUnsavedWorkspaceChanges.get()) {
        saveCurrentWorkspace();
      }
    }, settings.autoSaveInterval);

    console.log(`[Workspace] Auto-save started (interval: ${settings.autoSaveInterval}ms)`);
  }
}

/**
 * Stop auto-save timer
 */
function stopAutoSave(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/**
 * Save current workspace state immediately
 */
export function saveCurrentWorkspace(): void {
  if (!currentProjectId || isRestoringWorkspace.get()) return;

  const state = workspaceStateStore.get();
  saveWorkspaceState(currentProjectId, state);
  hasUnsavedWorkspaceChanges.set(false);
}

/**
 * Mark workspace as having unsaved changes
 */
function markWorkspaceChanged(): void {
  if (!isRestoringWorkspace.get()) {
    hasUnsavedWorkspaceChanges.set(true);
  }
}

/**
 * Clean up workspace management
 * Call this when leaving a project
 */
export function cleanupWorkspace(): void {
  // Save any pending changes
  if (currentProjectId && hasUnsavedWorkspaceChanges.get()) {
    saveCurrentWorkspace();
  }

  stopAutoSave();
  currentProjectId = null;
  workspaceStateStore.set(DEFAULT_WORKSPACE_STATE);
  hasUnsavedWorkspaceChanges.set(false);
}

// ==================== State Update Functions ====================

/**
 * Update open tabs in workspace
 */
export function updateWorkspaceOpenTabs(tabs: string[]): void {
  const current = workspaceStateStore.get();
  workspaceStateStore.set({
    ...current,
    openTabs: tabs,
  });
  markWorkspaceChanged();
}

/**
 * Update pinned tabs in workspace
 */
export function updateWorkspacePinnedTabs(tabs: string[]): void {
  const current = workspaceStateStore.get();
  workspaceStateStore.set({
    ...current,
    pinnedTabs: tabs,
  });
  markWorkspaceChanged();
}

/**
 * Update active file in workspace
 */
export function updateWorkspaceActiveFile(filePath: string | undefined): void {
  const current = workspaceStateStore.get();
  workspaceStateStore.set({
    ...current,
    activeFile: filePath,
  });
  markWorkspaceChanged();

  // Save immediately on tab change for better UX
  if (currentProjectId) {
    saveCurrentWorkspace();
  }
}

/**
 * Update scroll position for a file
 */
export function updateWorkspaceScrollPosition(filePath: string, position: ScrollPosition): void {
  const current = workspaceStateStore.get();
  workspaceStateStore.set({
    ...current,
    scrollPositions: {
      ...current.scrollPositions,
      [filePath]: position,
    },
  });
  markWorkspaceChanged();
}

/**
 * Get scroll position for a file
 */
export function getWorkspaceScrollPosition(filePath: string): ScrollPosition | undefined {
  return workspaceStateStore.get().scrollPositions[filePath];
}

/**
 * Update split view state
 */
export function updateWorkspaceSplitState(updates: Partial<WorkspaceSplitState>): void {
  const current = workspaceStateStore.get();
  workspaceStateStore.set({
    ...current,
    splitState: {
      ...current.splitState,
      ...updates,
    },
  });
  markWorkspaceChanged();
}

/**
 * Update panel visibility state
 */
export function updateWorkspacePanelState(updates: Partial<WorkspacePanelState>): void {
  const current = workspaceStateStore.get();
  workspaceStateStore.set({
    ...current,
    panelState: {
      ...current.panelState,
      ...updates,
    },
  });
  markWorkspaceChanged();
}

/**
 * Update current view (code/preview)
 */
export function updateWorkspaceCurrentView(view: 'code' | 'preview'): void {
  const current = workspaceStateStore.get();
  workspaceStateStore.set({
    ...current,
    currentView: view,
  });
  markWorkspaceChanged();
}

/**
 * Remove a file from workspace state (when file is deleted or closed)
 */
export function removeFileFromWorkspace(filePath: string): void {
  const current = workspaceStateStore.get();

  const newTabs = current.openTabs.filter(tab => tab !== filePath);
  const { [filePath]: _, ...newScrollPositions } = current.scrollPositions;

  const updates: Partial<WorkspaceState> = {
    openTabs: newTabs,
    scrollPositions: newScrollPositions,
  };

  // Clear active file if it was the removed file
  if (current.activeFile === filePath) {
    updates.activeFile = newTabs.length > 0 ? newTabs[0] : undefined;
  }

  // Clear secondary file in split view if it was the removed file
  if (current.splitState.secondaryFile === filePath) {
    updates.splitState = {
      ...current.splitState,
      secondaryFile: newTabs.length > 0 ? newTabs[0] : undefined,
    };
  }

  workspaceStateStore.set({
    ...current,
    ...updates,
  });
  markWorkspaceChanged();
}

/**
 * Update file path in workspace state (when file is renamed)
 */
export function updateFilePathInWorkspace(oldPath: string, newPath: string): void {
  const current = workspaceStateStore.get();

  // Update tabs
  const newTabs = current.openTabs.map(tab => tab === oldPath ? newPath : tab);

  // Update scroll positions
  const newScrollPositions = { ...current.scrollPositions };
  if (newScrollPositions[oldPath]) {
    newScrollPositions[newPath] = newScrollPositions[oldPath];
    delete newScrollPositions[oldPath];
  }

  const updates: Partial<WorkspaceState> = {
    openTabs: newTabs,
    scrollPositions: newScrollPositions,
  };

  // Update active file if it was the renamed file
  if (current.activeFile === oldPath) {
    updates.activeFile = newPath;
  }

  // Update secondary file if it was the renamed file
  if (current.splitState.secondaryFile === oldPath) {
    updates.splitState = {
      ...current.splitState,
      secondaryFile: newPath,
    };
  }

  workspaceStateStore.set({
    ...current,
    ...updates,
  });
  markWorkspaceChanged();
}

// ==================== Settings Functions ====================

/**
 * Enable or disable workspace restore
 */
export function setWorkspaceRestoreEnabled(enabled: boolean): void {
  const current = workspaceSettingsStore.get();
  workspaceSettingsStore.set({
    ...current,
    restoreEnabled: enabled,
  });

  console.log(`[Workspace] Restore ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Update auto-save interval
 */
export function setWorkspaceAutoSaveInterval(intervalMs: number): void {
  const current = workspaceSettingsStore.get();
  workspaceSettingsStore.set({
    ...current,
    autoSaveInterval: intervalMs,
  });

  // Restart auto-save with new interval
  startAutoSave();
}

/**
 * Reset workspace settings to defaults
 */
export function resetWorkspaceSettings(): void {
  workspaceSettingsStore.set(DEFAULT_WORKSPACE_SETTINGS);
  startAutoSave();
}

// ==================== Utility Functions ====================

/**
 * Get workspace state for a specific project without setting it as current
 */
export function getWorkspaceState(projectId: string): WorkspaceState | null {
  return loadWorkspaceState(projectId);
}

/**
 * Check if a project has saved workspace state
 */
export function hasWorkspaceState(projectId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(getWorkspaceKey(projectId)) !== null;
}

/**
 * Get list of all projects with saved workspaces
 */
export function getAllSavedWorkspaces(): string[] {
  if (typeof window === 'undefined') return [];

  const workspaces: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(WORKSPACE_KEY_PREFIX)) {
      workspaces.push(key.replace(WORKSPACE_KEY_PREFIX, ''));
    }
  }
  return workspaces;
}

/**
 * Clear all saved workspaces
 */
export function clearAllWorkspaces(): void {
  if (typeof window === 'undefined') return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(WORKSPACE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log(`[Workspace] Cleared ${keysToRemove.length} saved workspaces`);
}

/**
 * Export current workspace state (for debugging)
 */
export function exportWorkspaceState(): WorkspaceState {
  return workspaceStateStore.get();
}

/**
 * Import workspace state (for debugging)
 */
export function importWorkspaceState(state: WorkspaceState): void {
  workspaceStateStore.set(state);
  if (currentProjectId) {
    saveCurrentWorkspace();
  }
}
