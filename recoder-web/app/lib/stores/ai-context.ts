/**
 * AI Context Store
 * Manages AI context configuration and state using nanostores
 *
 * Features:
 * - Manual file selections for AI context
 * - Auto-context settings (detect related files)
 * - Token budget management
 * - Context preview before sending
 * - Persist settings to localStorage
 */

import { atom, map } from 'nanostores';
import type { ContextFile } from '~/lib/hooks/useContextPaths';

// Storage keys
const AI_CONTEXT_SETTINGS_KEY = 'recoder_ai_context_settings';
const AI_CONTEXT_FILES_KEY = 'recoder_ai_context_files';

/**
 * Auto-context detection modes
 */
export type AutoContextMode = 'off' | 'imports' | 'related' | 'smart';

/**
 * AI Context settings interface
 */
export interface AIContextSettings {
  /** Whether auto-context detection is enabled */
  autoContextEnabled: boolean;
  /** Auto-context detection mode */
  autoContextMode: AutoContextMode;
  /** Maximum tokens allowed for context (default 50k) */
  tokenBudget: number;
  /** Warn when approaching token budget (percentage) */
  tokenWarningThreshold: number;
  /** Include imports of selected files */
  includeImports: boolean;
  /** Include files that import selected files */
  includeImportedBy: boolean;
  /** Include related test files */
  includeTests: boolean;
  /** Include configuration files */
  includeConfigs: boolean;
  /** Include type definition files */
  includeTypes: boolean;
  /** Maximum files to auto-include */
  maxAutoFiles: number;
  /** File patterns to exclude from auto-context */
  excludePatterns: string[];
  /** Priority patterns (files matching these get higher priority) */
  priorityPatterns: string[];
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Default AI context settings
 */
export const DEFAULT_AI_CONTEXT_SETTINGS: AIContextSettings = {
  autoContextEnabled: true,
  autoContextMode: 'imports',
  tokenBudget: 50000,
  tokenWarningThreshold: 80,
  includeImports: true,
  includeImportedBy: false,
  includeTests: false,
  includeConfigs: true,
  includeTypes: true,
  maxAutoFiles: 10,
  excludePatterns: [
    'node_modules/',
    '.git/',
    'dist/',
    'build/',
    '*.lock',
    '*.min.js',
    '*.map',
  ],
  priorityPatterns: [
    'package.json',
    'tsconfig.json',
    'index.ts',
    'index.tsx',
    'App.tsx',
    'main.tsx',
  ],
  updatedAt: Date.now(),
};

/**
 * Context file with additional metadata for AI
 */
export interface AIContextFile extends ContextFile {
  /** How this file was added (manual, auto-import, auto-related, etc.) */
  source: 'manual' | 'auto-import' | 'auto-importedBy' | 'auto-test' | 'auto-config' | 'auto-type' | 'auto-smart';
  /** Priority score for ordering (higher = more important) */
  priority: number;
  /** Whether to include in context (can be toggled off without removing) */
  included: boolean;
  /** Related file paths (imports, tests, etc.) */
  relatedFiles?: string[];
}

/**
 * Context preview state
 */
export interface ContextPreview {
  /** All files that will be included */
  files: AIContextFile[];
  /** Total estimated tokens */
  totalTokens: number;
  /** Whether budget is exceeded */
  budgetExceeded: boolean;
  /** Files excluded due to budget */
  excludedFiles: string[];
  /** Formatted context string preview */
  previewText: string;
  /** Breakdown by source */
  breakdown: {
    manual: number;
    autoImport: number;
    autoImportedBy: number;
    autoTest: number;
    autoConfig: number;
    autoType: number;
    autoSmart: number;
  };
}

/**
 * Load settings from localStorage
 */
function loadSettings(): AIContextSettings {
  if (typeof window === 'undefined') return DEFAULT_AI_CONTEXT_SETTINGS;

  try {
    const stored = localStorage.getItem(AI_CONTEXT_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_AI_CONTEXT_SETTINGS,
        ...parsed,
        excludePatterns: parsed.excludePatterns || DEFAULT_AI_CONTEXT_SETTINGS.excludePatterns,
        priorityPatterns: parsed.priorityPatterns || DEFAULT_AI_CONTEXT_SETTINGS.priorityPatterns,
      };
    }
  } catch (e) {
    console.error('[AIContext] Failed to load settings:', e);
  }

  return DEFAULT_AI_CONTEXT_SETTINGS;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: AIContextSettings): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(AI_CONTEXT_SETTINGS_KEY, JSON.stringify({
      ...settings,
      updatedAt: Date.now(),
    }));
  } catch (e) {
    console.error('[AIContext] Failed to save settings:', e);
  }
}

/**
 * Load selected files from localStorage
 */
function loadSelectedFiles(): Map<string, AIContextFile> {
  if (typeof window === 'undefined') return new Map();

  try {
    const stored = localStorage.getItem(AI_CONTEXT_FILES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.error('[AIContext] Failed to load selected files:', e);
  }

  return new Map();
}

/**
 * Save selected files to localStorage
 */
function saveSelectedFiles(files: Map<string, AIContextFile>): void {
  if (typeof window === 'undefined') return;

  try {
    const obj = Object.fromEntries(files);
    localStorage.setItem(AI_CONTEXT_FILES_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('[AIContext] Failed to save selected files:', e);
  }
}

// ==================== STORES ====================

/**
 * AI context settings store
 */
export const aiContextSettingsStore = map<AIContextSettings>(loadSettings());

// Subscribe to changes and persist
aiContextSettingsStore.subscribe((settings) => {
  saveSettings(settings);
});

/**
 * Manually selected files store
 * Key: file path, Value: AIContextFile
 */
export const selectedFilesStore = map<Record<string, AIContextFile>>({});

/**
 * Auto-detected files store (separate from manual to distinguish)
 */
export const autoDetectedFilesStore = map<Record<string, AIContextFile>>({});

/**
 * Current active file (for auto-context detection)
 */
export const activeFileStore = atom<string | null>(null);

/**
 * Whether context preview panel is open
 */
export const contextPreviewOpen = atom<boolean>(false);

/**
 * Loading state for auto-detection
 */
export const autoDetectLoading = atom<boolean>(false);

/**
 * Last error from auto-detection
 */
export const autoDetectError = atom<string | null>(null);

// ==================== ACTIONS ====================

/**
 * Get current AI context settings
 */
export function getAIContextSettings(): AIContextSettings {
  return aiContextSettingsStore.get();
}

/**
 * Update AI context settings
 */
export function updateAIContextSettings(updates: Partial<AIContextSettings>): void {
  const current = aiContextSettingsStore.get();
  aiContextSettingsStore.set({
    ...current,
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Reset settings to defaults
 */
export function resetAIContextSettings(): void {
  aiContextSettingsStore.set({
    ...DEFAULT_AI_CONTEXT_SETTINGS,
    updatedAt: Date.now(),
  });
}

/**
 * Toggle auto-context
 */
export function toggleAutoContext(): void {
  const current = aiContextSettingsStore.get();
  aiContextSettingsStore.set({
    ...current,
    autoContextEnabled: !current.autoContextEnabled,
    updatedAt: Date.now(),
  });
}

/**
 * Set auto-context mode
 */
export function setAutoContextMode(mode: AutoContextMode): void {
  updateAIContextSettings({ autoContextMode: mode });
}

/**
 * Set token budget
 */
export function setTokenBudget(budget: number): void {
  updateAIContextSettings({ tokenBudget: Math.max(1000, budget) });
}

/**
 * Add a file to manual selection
 */
export function addSelectedFile(file: AIContextFile): void {
  const current = selectedFilesStore.get();
  selectedFilesStore.set({
    ...current,
    [file.path]: { ...file, source: 'manual' },
  });
}

/**
 * Add multiple files to manual selection
 */
export function addSelectedFiles(files: AIContextFile[]): void {
  const current = selectedFilesStore.get();
  const updates: Record<string, AIContextFile> = { ...current };

  for (const file of files) {
    updates[file.path] = { ...file, source: 'manual' };
  }

  selectedFilesStore.set(updates);
}

/**
 * Remove a file from manual selection
 */
export function removeSelectedFile(path: string): void {
  const current = selectedFilesStore.get();
  const { [path]: removed, ...rest } = current;
  selectedFilesStore.set(rest);
}

/**
 * Clear all manually selected files
 */
export function clearSelectedFiles(): void {
  selectedFilesStore.set({});
}

/**
 * Toggle file inclusion without removing
 */
export function toggleFileInclusion(path: string): void {
  const selected = selectedFilesStore.get();
  const auto = autoDetectedFilesStore.get();

  if (selected[path]) {
    selectedFilesStore.set({
      ...selected,
      [path]: { ...selected[path], included: !selected[path].included },
    });
  } else if (auto[path]) {
    autoDetectedFilesStore.set({
      ...auto,
      [path]: { ...auto[path], included: !auto[path].included },
    });
  }
}

/**
 * Set auto-detected files
 */
export function setAutoDetectedFiles(files: AIContextFile[]): void {
  const record: Record<string, AIContextFile> = {};
  for (const file of files) {
    record[file.path] = file;
  }
  autoDetectedFilesStore.set(record);
}

/**
 * Clear auto-detected files
 */
export function clearAutoDetectedFiles(): void {
  autoDetectedFilesStore.set({});
}

/**
 * Set the active file for auto-detection
 */
export function setActiveFile(path: string | null): void {
  activeFileStore.set(path);
}

/**
 * Add an exclude pattern
 */
export function addExcludePattern(pattern: string): void {
  const current = aiContextSettingsStore.get();
  if (!current.excludePatterns.includes(pattern)) {
    aiContextSettingsStore.set({
      ...current,
      excludePatterns: [...current.excludePatterns, pattern],
      updatedAt: Date.now(),
    });
  }
}

/**
 * Remove an exclude pattern
 */
export function removeExcludePattern(pattern: string): void {
  const current = aiContextSettingsStore.get();
  aiContextSettingsStore.set({
    ...current,
    excludePatterns: current.excludePatterns.filter(p => p !== pattern),
    updatedAt: Date.now(),
  });
}

/**
 * Add a priority pattern
 */
export function addPriorityPattern(pattern: string): void {
  const current = aiContextSettingsStore.get();
  if (!current.priorityPatterns.includes(pattern)) {
    aiContextSettingsStore.set({
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
  const current = aiContextSettingsStore.get();
  aiContextSettingsStore.set({
    ...current,
    priorityPatterns: current.priorityPatterns.filter(p => p !== pattern),
    updatedAt: Date.now(),
  });
}

/**
 * Open/close context preview panel
 */
export function openContextPreview(): void {
  contextPreviewOpen.set(true);
}

export function closeContextPreview(): void {
  contextPreviewOpen.set(false);
}

export function toggleContextPreview(): void {
  contextPreviewOpen.set(!contextPreviewOpen.get());
}

/**
 * Get all context files (manual + auto)
 */
export function getAllContextFiles(): AIContextFile[] {
  const manual = Object.values(selectedFilesStore.get());
  const auto = Object.values(autoDetectedFilesStore.get());

  // Combine, preferring manual selections
  const combined = new Map<string, AIContextFile>();

  for (const file of auto) {
    combined.set(file.path, file);
  }

  for (const file of manual) {
    combined.set(file.path, file);
  }

  // Sort by priority (higher first), then by source (manual first)
  return Array.from(combined.values())
    .filter(f => f.included)
    .sort((a, b) => {
      if (a.source === 'manual' && b.source !== 'manual') return -1;
      if (b.source === 'manual' && a.source !== 'manual') return 1;
      return b.priority - a.priority;
    });
}

/**
 * Get total token count for all included files
 */
export function getTotalTokens(): number {
  return getAllContextFiles().reduce((sum, file) => sum + file.tokenEstimate, 0);
}

/**
 * Check if token budget is exceeded
 */
export function isBudgetExceeded(): boolean {
  const settings = aiContextSettingsStore.get();
  return getTotalTokens() > settings.tokenBudget;
}

/**
 * Get budget usage percentage
 */
export function getBudgetUsagePercent(): number {
  const settings = aiContextSettingsStore.get();
  const total = getTotalTokens();
  return Math.round((total / settings.tokenBudget) * 100);
}

/**
 * Check if approaching budget warning threshold
 */
export function isApproachingBudget(): boolean {
  const settings = aiContextSettingsStore.get();
  return getBudgetUsagePercent() >= settings.tokenWarningThreshold;
}

/**
 * Export settings for backup
 */
export function exportAIContextSettings(): string {
  return JSON.stringify(aiContextSettingsStore.get(), null, 2);
}

/**
 * Import settings from backup
 */
export function importAIContextSettings(jsonString: string): boolean {
  try {
    const imported = JSON.parse(jsonString);
    if (typeof imported.tokenBudget !== 'number') {
      throw new Error('Invalid settings format');
    }
    aiContextSettingsStore.set({
      ...DEFAULT_AI_CONTEXT_SETTINGS,
      ...imported,
      updatedAt: Date.now(),
    });
    return true;
  } catch (e) {
    console.error('[AIContext] Failed to import settings:', e);
    return false;
  }
}

/**
 * Get a summary of current context state
 */
export function getContextSummary(): string {
  const settings = aiContextSettingsStore.get();
  const files = getAllContextFiles();
  const total = getTotalTokens();
  const percent = getBudgetUsagePercent();

  const lines: string[] = [];
  lines.push(`Files: ${files.length}`);
  lines.push(`Tokens: ${total.toLocaleString()} / ${settings.tokenBudget.toLocaleString()} (${percent}%)`);

  if (settings.autoContextEnabled) {
    lines.push(`Auto-context: ${settings.autoContextMode}`);
  } else {
    lines.push('Auto-context: disabled');
  }

  return lines.join('\n');
}
