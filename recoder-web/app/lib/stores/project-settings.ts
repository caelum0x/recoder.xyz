/**
 * Project Settings Store
 * Manages per-project configuration settings using nanostores
 */

import { atom, computed, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import {
  createDefaultSettings,
  loadProjectSettings,
  saveProjectSettings,
  resetCategoryToDefaults,
  validateSettings,
  type ProjectSettings,
  type SettingsCategory,
  type GeneralSettings,
  type AISettings,
  type EditorSettings,
  type PreviewSettings,
  type TerminalSettings,
  type ValidationResult,
} from '~/lib/services/project-settings';

const logger = createScopedLogger('ProjectSettingsStore');

// ==================== STATE ====================

/** Current project ID for settings */
export const currentProjectId = atom<string | null>(null);

/** Main settings store */
export const projectSettingsStore = map<ProjectSettings>(null as unknown as ProjectSettings);

/** Whether settings panel is open */
export const settingsPanelOpen = atom<boolean>(false);

/** Active settings tab */
export const activeSettingsTab = atom<SettingsCategory>('general');

/** Whether settings are being saved */
export const isSaving = atom<boolean>(false);

/** Whether settings have unsaved changes */
export const hasUnsavedChanges = atom<boolean>(false);

/** Last validation result */
export const validationResult = atom<ValidationResult | null>(null);

// ==================== COMPUTED ====================

/** Get general settings */
export const generalSettings = computed(projectSettingsStore, (settings) => {
  return settings?.general ?? null;
});

/** Get AI settings */
export const aiSettings = computed(projectSettingsStore, (settings) => {
  return settings?.ai ?? null;
});

/** Get editor settings */
export const editorSettings = computed(projectSettingsStore, (settings) => {
  return settings?.editor ?? null;
});

/** Get preview settings */
export const previewSettings = computed(projectSettingsStore, (settings) => {
  return settings?.preview ?? null;
});

/** Get terminal settings */
export const terminalSettings = computed(projectSettingsStore, (settings) => {
  return settings?.terminal ?? null;
});

/** Whether settings are valid */
export const isSettingsValid = computed(validationResult, (result) => {
  return result?.valid ?? true;
});

/** Settings validation errors */
export const settingsErrors = computed(validationResult, (result) => {
  return result?.errors ?? [];
});

// ==================== ACTIONS ====================

/**
 * Initialize settings for a project
 */
export function initProjectSettings(projectId: string): void {
  currentProjectId.set(projectId);
  const settings = loadProjectSettings(projectId);
  projectSettingsStore.set(settings);
  hasUnsavedChanges.set(false);
  validationResult.set(validateSettings(settings));
  logger.info(`[ProjectSettings] Initialized settings for project: ${projectId}`);
}

/**
 * Clear current settings (when leaving a project)
 */
export function clearProjectSettings(): void {
  currentProjectId.set(null);
  projectSettingsStore.set(null as unknown as ProjectSettings);
  hasUnsavedChanges.set(false);
  validationResult.set(null);
}

/**
 * Save current settings
 */
export function saveSettings(): boolean {
  const settings = projectSettingsStore.get();
  if (!settings) return false;

  isSaving.set(true);

  try {
    const result = saveProjectSettings(settings);
    if (result) {
      hasUnsavedChanges.set(false);
    }
    return result;
  } finally {
    isSaving.set(false);
  }
}

/**
 * Update general settings
 */
export function updateGeneralSettings(updates: Partial<GeneralSettings>): void {
  const current = projectSettingsStore.get();
  if (!current) return;

  const updated: ProjectSettings = {
    ...current,
    general: { ...current.general, ...updates },
    updatedAt: Date.now(),
  };

  projectSettingsStore.set(updated);
  hasUnsavedChanges.set(true);
  validationResult.set(validateSettings(updated));
}

/**
 * Update AI settings
 */
export function updateAISettings(updates: Partial<AISettings>): void {
  const current = projectSettingsStore.get();
  if (!current) return;

  const updated: ProjectSettings = {
    ...current,
    ai: { ...current.ai, ...updates },
    updatedAt: Date.now(),
  };

  projectSettingsStore.set(updated);
  hasUnsavedChanges.set(true);
  validationResult.set(validateSettings(updated));
}

/**
 * Update editor settings
 */
export function updateEditorSettings(updates: Partial<EditorSettings>): void {
  const current = projectSettingsStore.get();
  if (!current) return;

  const updated: ProjectSettings = {
    ...current,
    editor: { ...current.editor, ...updates },
    updatedAt: Date.now(),
  };

  projectSettingsStore.set(updated);
  hasUnsavedChanges.set(true);
  validationResult.set(validateSettings(updated));
}

/**
 * Update preview settings
 */
export function updatePreviewSettings(updates: Partial<PreviewSettings>): void {
  const current = projectSettingsStore.get();
  if (!current) return;

  const updated: ProjectSettings = {
    ...current,
    preview: { ...current.preview, ...updates },
    updatedAt: Date.now(),
  };

  projectSettingsStore.set(updated);
  hasUnsavedChanges.set(true);
  validationResult.set(validateSettings(updated));
}

/**
 * Update terminal settings
 */
export function updateTerminalSettings(updates: Partial<TerminalSettings>): void {
  const current = projectSettingsStore.get();
  if (!current) return;

  const updated: ProjectSettings = {
    ...current,
    terminal: { ...current.terminal, ...updates },
    updatedAt: Date.now(),
  };

  projectSettingsStore.set(updated);
  hasUnsavedChanges.set(true);
  validationResult.set(validateSettings(updated));
}

/**
 * Reset a category to defaults
 */
export function resetCategory(category: SettingsCategory): void {
  const current = projectSettingsStore.get();
  if (!current) return;

  const updated = resetCategoryToDefaults(current, category);
  projectSettingsStore.set(updated);
  hasUnsavedChanges.set(true);
  validationResult.set(validateSettings(updated));
}

/**
 * Reset all settings to defaults
 */
export function resetAllSettings(): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  const defaults = createDefaultSettings(projectId);
  projectSettingsStore.set(defaults);
  hasUnsavedChanges.set(true);
  validationResult.set(validateSettings(defaults));
}

/**
 * Discard unsaved changes
 */
export function discardChanges(): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  const settings = loadProjectSettings(projectId);
  projectSettingsStore.set(settings);
  hasUnsavedChanges.set(false);
  validationResult.set(validateSettings(settings));
}

// ==================== PANEL ACTIONS ====================

/**
 * Open settings panel
 */
export function openSettingsPanel(): void {
  settingsPanelOpen.set(true);
}

/**
 * Close settings panel
 */
export function closeSettingsPanel(): void {
  settingsPanelOpen.set(false);
}

/**
 * Toggle settings panel
 */
export function toggleSettingsPanel(): void {
  settingsPanelOpen.set(!settingsPanelOpen.get());
}

/**
 * Set active tab
 */
export function setActiveTab(tab: SettingsCategory): void {
  activeSettingsTab.set(tab);
}

// ==================== RE-EXPORTS ====================

// Re-export types and constants from service
export type {
  ProjectSettings,
  SettingsCategory,
  GeneralSettings,
  AISettings,
  EditorSettings,
  PreviewSettings,
  TerminalSettings,
  ValidationResult,
  ValidationError,
} from '~/lib/services/project-settings';

export {
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_PREVIEW_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  AVAILABLE_MODELS,
  AVAILABLE_FRAMEWORKS,
  AVAILABLE_LANGUAGES,
  AVAILABLE_SHELLS,
  DEVICE_PRESETS,
  exportSettings,
  importSettings,
} from '~/lib/services/project-settings';
