/**
 * Project Settings Service
 * Handles loading/saving per-project configuration settings
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectSettings');
// ==================== TYPES ====================

export type SettingsCategory = 'general' | 'ai' | 'editor' | 'preview' | 'terminal';

export interface GeneralSettings {
  /** Display name for the project */
  projectName: string;
  /** Project description */
  description: string;
  /** Framework/template type */
  framework: string;
  /** Primary language */
  language: string;
  /** Custom tags for organization */
  tags: string[];
}

export interface AISettings {
  /** Model to use for this project */
  model: string;
  /** Temperature (0-2) */
  temperature: number;
  /** Custom system prompt override */
  systemPrompt: string;
  /** Max tokens for responses */
  maxTokens: number;
  /** Enable streaming responses */
  streamResponses: boolean;
  /** Include project context in prompts */
  includeContext: boolean;
  /** Auto-apply code suggestions */
  autoApply: boolean;
}

export interface EditorSettings {
  /** Editor theme */
  theme: 'dark' | 'light' | 'system';
  /** Font size in pixels */
  fontSize: number;
  /** Tab size (spaces) */
  tabSize: number;
  /** Use tabs instead of spaces */
  useTabs: boolean;
  /** Enable word wrap */
  wordWrap: boolean;
  /** Show line numbers */
  lineNumbers: boolean;
  /** Show minimap */
  minimap: boolean;
  /** Enable bracket pair colorization */
  bracketColors: boolean;
  /** Enable code folding */
  codeFolding: boolean;
  /** Enable format on save */
  formatOnSave: boolean;
}

export interface PreviewSettings {
  /** Auto-refresh on file changes */
  autoRefresh: boolean;
  /** Refresh delay in milliseconds */
  refreshDelay: number;
  /** Default device preset */
  defaultDevice: 'desktop' | 'tablet' | 'mobile' | 'custom';
  /** Custom width (for custom device) */
  customWidth: number;
  /** Custom height (for custom device) */
  customHeight: number;
  /** Default zoom level (percentage) */
  zoom: number;
  /** Show device frame */
  showDeviceFrame: boolean;
  /** Enable responsive mode */
  responsiveMode: boolean;
}

export interface TerminalSettings {
  /** Shell to use */
  shell: 'bash' | 'zsh' | 'sh' | 'fish' | 'powershell';
  /** Font size in pixels */
  fontSize: number;
  /** Font family */
  fontFamily: string;
  /** Scrollback buffer size (lines) */
  scrollback: number;
  /** Enable cursor blink */
  cursorBlink: boolean;
  /** Cursor style */
  cursorStyle: 'block' | 'underline' | 'bar';
  /** Enable terminal bell */
  bell: boolean;
  /** Copy on selection */
  copyOnSelect: boolean;
}

export interface ProjectSettings {
  /** Settings version for migrations */
  version: number;
  /** Project ID this settings belongs to */
  projectId: string;
  /** General project settings */
  general: GeneralSettings;
  /** AI-related settings */
  ai: AISettings;
  /** Editor preferences */
  editor: EditorSettings;
  /** Preview configuration */
  preview: PreviewSettings;
  /** Terminal configuration */
  terminal: TerminalSettings;
  /** Last updated timestamp */
  updatedAt: number;
}

// ==================== DEFAULTS ====================

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  projectName: '',
  description: '',
  framework: 'react',
  language: 'typescript',
  tags: [],
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  model: 'anthropic/claude-sonnet-4',
  temperature: 0.7,
  systemPrompt: '',
  maxTokens: 16000,
  streamResponses: true,
  includeContext: true,
  autoApply: false,
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: 'dark',
  fontSize: 14,
  tabSize: 2,
  useTabs: false,
  wordWrap: true,
  lineNumbers: true,
  minimap: false,
  bracketColors: true,
  codeFolding: true,
  formatOnSave: false,
};

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  autoRefresh: true,
  refreshDelay: 300,
  defaultDevice: 'desktop',
  customWidth: 1280,
  customHeight: 720,
  zoom: 100,
  showDeviceFrame: false,
  responsiveMode: true,
};

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  shell: 'bash',
  fontSize: 12,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  scrollback: 10000,
  cursorBlink: true,
  cursorStyle: 'block',
  bell: false,
  copyOnSelect: true,
};

export const CURRENT_SETTINGS_VERSION = 1;

export function createDefaultSettings(projectId: string): ProjectSettings {
  return {
    version: CURRENT_SETTINGS_VERSION,
    projectId,
    general: { ...DEFAULT_GENERAL_SETTINGS },
    ai: { ...DEFAULT_AI_SETTINGS },
    editor: { ...DEFAULT_EDITOR_SETTINGS },
    preview: { ...DEFAULT_PREVIEW_SETTINGS },
    terminal: { ...DEFAULT_TERMINAL_SETTINGS },
    updatedAt: Date.now(),
  };
}

// ==================== VALIDATION ====================

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate general settings
 */
function validateGeneralSettings(settings: GeneralSettings): ValidationError[] {
  const errors: ValidationError[] = [];

  if (settings.projectName && settings.projectName.length > 100) {
    errors.push({ field: 'general.projectName', message: 'Project name must be 100 characters or less' });
  }

  if (settings.description && settings.description.length > 500) {
    errors.push({ field: 'general.description', message: 'Description must be 500 characters or less' });
  }

  if (settings.tags.length > 20) {
    errors.push({ field: 'general.tags', message: 'Maximum 20 tags allowed' });
  }

  return errors;
}

/**
 * Validate AI settings
 */
function validateAISettings(settings: AISettings): ValidationError[] {
  const errors: ValidationError[] = [];

  if (settings.temperature < 0 || settings.temperature > 2) {
    errors.push({ field: 'ai.temperature', message: 'Temperature must be between 0 and 2' });
  }

  if (settings.maxTokens < 100 || settings.maxTokens > 128000) {
    errors.push({ field: 'ai.maxTokens', message: 'Max tokens must be between 100 and 128,000' });
  }

  if (settings.systemPrompt && settings.systemPrompt.length > 10000) {
    errors.push({ field: 'ai.systemPrompt', message: 'System prompt must be 10,000 characters or less' });
  }

  return errors;
}

/**
 * Validate editor settings
 */
function validateEditorSettings(settings: EditorSettings): ValidationError[] {
  const errors: ValidationError[] = [];

  if (settings.fontSize < 8 || settings.fontSize > 32) {
    errors.push({ field: 'editor.fontSize', message: 'Font size must be between 8 and 32' });
  }

  if (settings.tabSize < 1 || settings.tabSize > 8) {
    errors.push({ field: 'editor.tabSize', message: 'Tab size must be between 1 and 8' });
  }

  return errors;
}

/**
 * Validate preview settings
 */
function validatePreviewSettings(settings: PreviewSettings): ValidationError[] {
  const errors: ValidationError[] = [];

  if (settings.refreshDelay < 0 || settings.refreshDelay > 5000) {
    errors.push({ field: 'preview.refreshDelay', message: 'Refresh delay must be between 0 and 5000ms' });
  }

  if (settings.customWidth < 320 || settings.customWidth > 3840) {
    errors.push({ field: 'preview.customWidth', message: 'Custom width must be between 320 and 3840' });
  }

  if (settings.customHeight < 240 || settings.customHeight > 2160) {
    errors.push({ field: 'preview.customHeight', message: 'Custom height must be between 240 and 2160' });
  }

  if (settings.zoom < 25 || settings.zoom > 200) {
    errors.push({ field: 'preview.zoom', message: 'Zoom must be between 25% and 200%' });
  }

  return errors;
}

/**
 * Validate terminal settings
 */
function validateTerminalSettings(settings: TerminalSettings): ValidationError[] {
  const errors: ValidationError[] = [];

  if (settings.fontSize < 8 || settings.fontSize > 24) {
    errors.push({ field: 'terminal.fontSize', message: 'Font size must be between 8 and 24' });
  }

  if (settings.scrollback < 100 || settings.scrollback > 100000) {
    errors.push({ field: 'terminal.scrollback', message: 'Scrollback must be between 100 and 100,000 lines' });
  }

  return errors;
}

/**
 * Validate complete project settings
 */
export function validateSettings(settings: ProjectSettings): ValidationResult {
  const errors: ValidationError[] = [
    ...validateGeneralSettings(settings.general),
    ...validateAISettings(settings.ai),
    ...validateEditorSettings(settings.editor),
    ...validatePreviewSettings(settings.preview),
    ...validateTerminalSettings(settings.terminal),
  ];

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== STORAGE ====================

const STORAGE_PREFIX = 'recoder_project_settings_';

/**
 * Get storage key for a project
 */
function getStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

/**
 * Load settings for a project from localStorage
 */
export function loadProjectSettings(projectId: string): ProjectSettings {
  if (typeof window === 'undefined') {
    return createDefaultSettings(projectId);
  }

  try {
    const key = getStorageKey(projectId);
    const stored = localStorage.getItem(key);

    if (stored) {
      const parsed = JSON.parse(stored) as ProjectSettings;
      // Migrate and merge with defaults to handle new fields
      return migrateSettings(parsed, projectId);
    }
  } catch (error) {
    logger.error('[ProjectSettings] Failed to load settings:', error);
  }

  return createDefaultSettings(projectId);
}

/**
 * Save settings for a project to localStorage
 */
export function saveProjectSettings(settings: ProjectSettings): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Validate before saving
  const validation = validateSettings(settings);
  if (!validation.valid) {
    logger.error('[ProjectSettings] Validation failed:', validation.errors);
    return false;
  }

  try {
    const key = getStorageKey(settings.projectId);
    const toSave = {
      ...settings,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(toSave));
    logger.info(`[ProjectSettings] Saved settings for project: ${settings.projectId}`);
    return true;
  } catch (error) {
    logger.error('[ProjectSettings] Failed to save settings:', error);
    return false;
  }
}

/**
 * Delete settings for a project
 */
export function deleteProjectSettings(projectId: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const key = getStorageKey(projectId);
    localStorage.removeItem(key);
    logger.info(`[ProjectSettings] Deleted settings for project: ${projectId}`);
    return true;
  } catch (error) {
    logger.error('[ProjectSettings] Failed to delete settings:', error);
    return false;
  }
}

/**
 * Check if a project has custom settings
 */
export function hasProjectSettings(projectId: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const key = getStorageKey(projectId);
  return localStorage.getItem(key) !== null;
}

/**
 * Get all project IDs that have settings
 */
export function getAllProjectSettingsIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const ids: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      ids.push(key.replace(STORAGE_PREFIX, ''));
    }
  }

  return ids;
}

// ==================== MIGRATIONS ====================

/**
 * Migrate settings to the latest version
 */
function migrateSettings(settings: ProjectSettings, projectId: string): ProjectSettings {
  const defaults = createDefaultSettings(projectId);

  // Deep merge with defaults to handle missing fields
  const migrated: ProjectSettings = {
    version: CURRENT_SETTINGS_VERSION,
    projectId,
    general: { ...defaults.general, ...settings.general },
    ai: { ...defaults.ai, ...settings.ai },
    editor: { ...defaults.editor, ...settings.editor },
    preview: { ...defaults.preview, ...settings.preview },
    terminal: { ...defaults.terminal, ...settings.terminal },
    updatedAt: settings.updatedAt || Date.now(),
  };

  // Future version migrations would go here
  // if (settings.version < 2) { ... }

  return migrated;
}

// ==================== UTILITIES ====================

/**
 * Reset a category to defaults
 */
export function resetCategoryToDefaults(
  settings: ProjectSettings,
  category: SettingsCategory
): ProjectSettings {
  const updated = { ...settings, updatedAt: Date.now() };

  switch (category) {
    case 'general':
      updated.general = { ...DEFAULT_GENERAL_SETTINGS };
      break;
    case 'ai':
      updated.ai = { ...DEFAULT_AI_SETTINGS };
      break;
    case 'editor':
      updated.editor = { ...DEFAULT_EDITOR_SETTINGS };
      break;
    case 'preview':
      updated.preview = { ...DEFAULT_PREVIEW_SETTINGS };
      break;
    case 'terminal':
      updated.terminal = { ...DEFAULT_TERMINAL_SETTINGS };
      break;
  }

  return updated;
}

/**
 * Export settings as JSON string
 */
export function exportSettings(settings: ProjectSettings): string {
  return JSON.stringify(settings, null, 2);
}

/**
 * Import settings from JSON string
 */
export function importSettings(json: string, projectId: string): ProjectSettings | null {
  try {
    const parsed = JSON.parse(json) as ProjectSettings;
    // Validate and migrate
    const migrated = migrateSettings(parsed, projectId);
    const validation = validateSettings(migrated);

    if (!validation.valid) {
      logger.error('[ProjectSettings] Import validation failed:', validation.errors);
      return null;
    }

    return migrated;
  } catch (error) {
    logger.error('[ProjectSettings] Failed to import settings:', error);
    return null;
  }
}

// ==================== CONSTANTS ====================

export const AVAILABLE_MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', provider: 'Anthropic' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google' },
  { id: 'meta/llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3', provider: 'DeepSeek' },
] as const;

export const AVAILABLE_FRAMEWORKS = [
  { id: 'react', name: 'React' },
  { id: 'nextjs', name: 'Next.js' },
  { id: 'vue', name: 'Vue' },
  { id: 'nuxt', name: 'Nuxt' },
  { id: 'svelte', name: 'Svelte' },
  { id: 'angular', name: 'Angular' },
  { id: 'remix', name: 'Remix' },
  { id: 'astro', name: 'Astro' },
  { id: 'express', name: 'Express' },
  { id: 'fastify', name: 'Fastify' },
  { id: 'vanilla', name: 'Vanilla JS/TS' },
  { id: 'other', name: 'Other' },
] as const;

export const AVAILABLE_LANGUAGES = [
  { id: 'typescript', name: 'TypeScript' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'python', name: 'Python' },
  { id: 'rust', name: 'Rust' },
  { id: 'go', name: 'Go' },
  { id: 'java', name: 'Java' },
  { id: 'csharp', name: 'C#' },
  { id: 'cpp', name: 'C++' },
  { id: 'other', name: 'Other' },
] as const;

export const AVAILABLE_SHELLS = [
  { id: 'bash', name: 'Bash' },
  { id: 'zsh', name: 'Zsh' },
  { id: 'sh', name: 'Sh' },
  { id: 'fish', name: 'Fish' },
  { id: 'powershell', name: 'PowerShell' },
] as const;

export const DEVICE_PRESETS = [
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080 },
  { id: 'tablet', name: 'Tablet', width: 768, height: 1024 },
  { id: 'mobile', name: 'Mobile', width: 375, height: 667 },
  { id: 'custom', name: 'Custom', width: 0, height: 0 },
] as const;
