/**
 * Context Settings Store
 * Manages settings for AI context filtering using nanostores
 *
 * Features:
 * - Max files, max tokens, excluded patterns
 * - Custom exclusion rules
 * - Persist to localStorage
 */

import { atom, map } from 'nanostores';

// Storage key
const CONTEXT_SETTINGS_KEY = 'recoder_context_settings';

/**
 * Context filter settings interface
 */
export interface ContextSettings {
  /** Maximum number of files to include in context */
  maxFiles: number;
  /** Maximum estimated tokens for context */
  maxTokens: number;
  /** Maximum file size in bytes (default 10MB) */
  maxFileSize: number;
  /** Custom directories to exclude (in addition to defaults) */
  customExcludedDirs: string[];
  /** Custom file patterns to exclude (regex strings) */
  customExcludedPatterns: string[];
  /** Priority file patterns (regex strings) - files matching these get higher priority */
  priorityPatterns: string[];
  /** Whether to include file content or just structure */
  includeContent: boolean;
  /** Whether to include line numbers in content */
  includeLineNumbers: boolean;
  /** Maximum content length per file (0 = no limit) */
  maxContentLength: number;
  /** Whether to include type definition files (.d.ts) */
  includeTypeDefinitions: boolean;
  /** Whether to include test files */
  includeTestFiles: boolean;
  /** Whether to include markdown/documentation files */
  includeDocFiles: boolean;
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Default context settings
 */
export const DEFAULT_CONTEXT_SETTINGS: ContextSettings = {
  maxFiles: 100,
  maxTokens: 50000, // ~200K characters, reasonable for most LLMs
  maxFileSize: 10 * 1024 * 1024, // 10MB
  customExcludedDirs: [],
  customExcludedPatterns: [],
  priorityPatterns: [],
  includeContent: true,
  includeLineNumbers: false,
  maxContentLength: 0,
  includeTypeDefinitions: false,
  includeTestFiles: false,
  includeDocFiles: false,
  updatedAt: Date.now(),
};

/**
 * Preset configurations for different use cases
 */
export const CONTEXT_PRESETS = {
  minimal: {
    name: 'Minimal',
    description: 'Only essential files, low token usage',
    settings: {
      maxFiles: 30,
      maxTokens: 15000,
      includeTypeDefinitions: false,
      includeTestFiles: false,
      includeDocFiles: false,
    },
  },
  standard: {
    name: 'Standard',
    description: 'Balanced file inclusion',
    settings: {
      maxFiles: 100,
      maxTokens: 50000,
      includeTypeDefinitions: false,
      includeTestFiles: false,
      includeDocFiles: false,
    },
  },
  comprehensive: {
    name: 'Comprehensive',
    description: 'Include most relevant files',
    settings: {
      maxFiles: 200,
      maxTokens: 100000,
      includeTypeDefinitions: true,
      includeTestFiles: true,
      includeDocFiles: true,
    },
  },
  codeOnly: {
    name: 'Code Only',
    description: 'Source code files only',
    settings: {
      maxFiles: 150,
      maxTokens: 75000,
      includeTypeDefinitions: true,
      includeTestFiles: false,
      includeDocFiles: false,
      customExcludedPatterns: [
        '\\.md$',
        '\\.mdx$',
        '\\.txt$',
        '\\.json$', // Except package.json handled separately
        '\\.yaml$',
        '\\.yml$',
      ],
    },
  },
} as const;

export type ContextPresetName = keyof typeof CONTEXT_PRESETS;

/**
 * Load settings from localStorage
 */
function loadSettings(): ContextSettings {
  if (typeof window === 'undefined') return DEFAULT_CONTEXT_SETTINGS;

  try {
    const stored = localStorage.getItem(CONTEXT_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings
      return {
        ...DEFAULT_CONTEXT_SETTINGS,
        ...parsed,
        // Ensure arrays are properly merged
        customExcludedDirs: parsed.customExcludedDirs || [],
        customExcludedPatterns: parsed.customExcludedPatterns || [],
        priorityPatterns: parsed.priorityPatterns || [],
      };
    }
  } catch (e) {
    console.error('[ContextSettings] Failed to load settings:', e);
  }

  return DEFAULT_CONTEXT_SETTINGS;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: ContextSettings): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(CONTEXT_SETTINGS_KEY, JSON.stringify({
      ...settings,
      updatedAt: Date.now(),
    }));
  } catch (e) {
    console.error('[ContextSettings] Failed to save settings:', e);
  }
}

/**
 * Main context settings store
 */
export const contextSettingsStore = map<ContextSettings>(loadSettings());

// Subscribe to changes and persist
contextSettingsStore.subscribe((settings) => {
  saveSettings(settings);
});

/**
 * Current preset name (if any)
 */
export const currentPreset = atom<ContextPresetName | null>(null);

/**
 * Whether settings panel is open
 */
export const contextSettingsOpen = atom<boolean>(false);

/**
 * Get current context settings
 */
export function getContextSettings(): ContextSettings {
  return contextSettingsStore.get();
}

/**
 * Update context settings
 */
export function updateContextSettings(updates: Partial<ContextSettings>): void {
  const current = contextSettingsStore.get();
  contextSettingsStore.set({
    ...current,
    ...updates,
    updatedAt: Date.now(),
  });
  // Clear preset when manually updating
  currentPreset.set(null);
}

/**
 * Reset to default settings
 */
export function resetContextSettings(): void {
  contextSettingsStore.set({
    ...DEFAULT_CONTEXT_SETTINGS,
    updatedAt: Date.now(),
  });
  currentPreset.set(null);
}

/**
 * Apply a preset configuration
 */
export function applyPreset(presetName: ContextPresetName): void {
  const preset = CONTEXT_PRESETS[presetName];
  if (preset) {
    const current = contextSettingsStore.get();
    contextSettingsStore.set({
      ...current,
      ...preset.settings,
      updatedAt: Date.now(),
    } as ContextSettings);
    currentPreset.set(presetName);
  }
}

/**
 * Add a custom excluded directory
 */
export function addExcludedDir(dir: string): void {
  const current = contextSettingsStore.get();
  if (!current.customExcludedDirs.includes(dir)) {
    contextSettingsStore.set({
      ...current,
      customExcludedDirs: [...current.customExcludedDirs, dir],
      updatedAt: Date.now(),
    });
  }
}

/**
 * Remove a custom excluded directory
 */
export function removeExcludedDir(dir: string): void {
  const current = contextSettingsStore.get();
  contextSettingsStore.set({
    ...current,
    customExcludedDirs: current.customExcludedDirs.filter((d) => d !== dir),
    updatedAt: Date.now(),
  });
}

/**
 * Add a custom excluded pattern
 */
export function addExcludedPattern(pattern: string): void {
  // Validate regex
  try {
    new RegExp(pattern);
  } catch {
    console.error('[ContextSettings] Invalid regex pattern:', pattern);
    return;
  }

  const current = contextSettingsStore.get();
  if (!current.customExcludedPatterns.includes(pattern)) {
    contextSettingsStore.set({
      ...current,
      customExcludedPatterns: [...current.customExcludedPatterns, pattern],
      updatedAt: Date.now(),
    });
  }
}

/**
 * Remove a custom excluded pattern
 */
export function removeExcludedPattern(pattern: string): void {
  const current = contextSettingsStore.get();
  contextSettingsStore.set({
    ...current,
    customExcludedPatterns: current.customExcludedPatterns.filter((p) => p !== pattern),
    updatedAt: Date.now(),
  });
}

/**
 * Add a priority pattern
 */
export function addPriorityPattern(pattern: string): void {
  // Validate regex
  try {
    new RegExp(pattern);
  } catch {
    console.error('[ContextSettings] Invalid regex pattern:', pattern);
    return;
  }

  const current = contextSettingsStore.get();
  if (!current.priorityPatterns.includes(pattern)) {
    contextSettingsStore.set({
      ...current,
      priorityPatterns: [...current.priorityPatterns, pattern],
      updatedAt: Date.now(),
    });
  }
}

/**
 * Remove a priority pattern
 */
export function removePriorityPattern(pattern: string): void {
  const current = contextSettingsStore.get();
  contextSettingsStore.set({
    ...current,
    priorityPatterns: current.priorityPatterns.filter((p) => p !== pattern),
    updatedAt: Date.now(),
  });
}

/**
 * Update token/file limits
 */
export function setLimits(maxFiles: number, maxTokens: number): void {
  const current = contextSettingsStore.get();
  contextSettingsStore.set({
    ...current,
    maxFiles: Math.max(1, maxFiles),
    maxTokens: Math.max(1000, maxTokens),
    updatedAt: Date.now(),
  });
}

/**
 * Update file size limit
 */
export function setMaxFileSize(sizeInBytes: number): void {
  const current = contextSettingsStore.get();
  contextSettingsStore.set({
    ...current,
    maxFileSize: Math.max(1024, sizeInBytes), // Minimum 1KB
    updatedAt: Date.now(),
  });
}

/**
 * Toggle content inclusion settings
 */
export function toggleContentSetting(
  setting: 'includeTypeDefinitions' | 'includeTestFiles' | 'includeDocFiles'
): void {
  const current = contextSettingsStore.get();
  contextSettingsStore.set({
    ...current,
    [setting]: !current[setting],
    updatedAt: Date.now(),
  });
}

/**
 * Open/close context settings panel
 */
export function openContextSettings(): void {
  contextSettingsOpen.set(true);
}

export function closeContextSettings(): void {
  contextSettingsOpen.set(false);
}

export function toggleContextSettings(): void {
  contextSettingsOpen.set(!contextSettingsOpen.get());
}

/**
 * Export settings for backup/sharing
 */
export function exportContextSettings(): string {
  return JSON.stringify(contextSettingsStore.get(), null, 2);
}

/**
 * Import settings from backup
 */
export function importContextSettings(jsonString: string): boolean {
  try {
    const imported = JSON.parse(jsonString);
    // Validate required fields
    if (typeof imported.maxFiles !== 'number' || typeof imported.maxTokens !== 'number') {
      throw new Error('Invalid settings format');
    }
    contextSettingsStore.set({
      ...DEFAULT_CONTEXT_SETTINGS,
      ...imported,
      updatedAt: Date.now(),
    });
    return true;
  } catch (e) {
    console.error('[ContextSettings] Failed to import settings:', e);
    return false;
  }
}

/**
 * Get settings summary for display
 */
export function getSettingsSummary(): string {
  const settings = contextSettingsStore.get();
  const lines: string[] = [];

  lines.push(`Max Files: ${settings.maxFiles}`);
  lines.push(`Max Tokens: ${settings.maxTokens.toLocaleString()}`);
  lines.push(`Max File Size: ${Math.round(settings.maxFileSize / 1024 / 1024)}MB`);

  if (settings.customExcludedDirs.length > 0) {
    lines.push(`Custom Excluded Dirs: ${settings.customExcludedDirs.length}`);
  }
  if (settings.customExcludedPatterns.length > 0) {
    lines.push(`Custom Excluded Patterns: ${settings.customExcludedPatterns.length}`);
  }

  const inclusions: string[] = [];
  if (settings.includeTypeDefinitions) inclusions.push('Type Defs');
  if (settings.includeTestFiles) inclusions.push('Tests');
  if (settings.includeDocFiles) inclusions.push('Docs');
  if (inclusions.length > 0) {
    lines.push(`Includes: ${inclusions.join(', ')}`);
  }

  return lines.join('\n');
}
