/**
 * Editor Configuration Store
 * Manages advanced editor settings with localStorage persistence
 * Uses nanostores for state management
 */

import { atom, map, computed } from 'nanostores';

// Storage key
const EDITOR_CONFIG_KEY = 'recoder_editor_config';

// Type definitions
export type EditorTheme = 'dark' | 'light' | 'system';
export type TabSize = 2 | 4;
export type CursorBlinking = 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
export type CursorStyle = 'line' | 'block' | 'underline';
export type ScrollbarStyle = 'native' | 'thin' | 'hidden';
export type RenderWhitespace = 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
export type EditorPreset = 'minimal' | 'default' | 'full';

/**
 * Complete editor configuration options
 * Includes basic settings and advanced options for Monaco/CodeMirror
 */
export interface EditorConfig {
  // Theme and appearance
  theme: EditorTheme;
  fontSize: number;                   // 12-24
  tabSize: TabSize;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  folding: boolean;
  bracketPairColorization: boolean;

  // Display
  showDiagnostics: boolean;           // Show error/warning squiggles
  smoothScrolling: boolean;           // Enable smooth scrolling
  cursorBlinking: CursorBlinking;
  cursorStyle: CursorStyle;

  // Scrollbar
  scrollbarStyle: ScrollbarStyle;
  scrollbarSize: number;              // Scrollbar width in pixels (5-20)

  // Performance
  largeFileOptimizations: boolean;    // Enable optimizations for large files
  maxHighlightLength: number;         // Max line length for syntax highlighting

  // Code display
  renderWhitespace: RenderWhitespace;
  highlightActiveLine: boolean;
  highlightActiveLineGutter: boolean;
  matchBrackets: boolean;

  // Formatting
  formatOnSave: boolean;
  formatOnPaste: boolean;

  // Clean mode (disables visual noise)
  cleanMode: boolean;                 // Master toggle for clean appearance
}

export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  // Theme and appearance
  theme: 'dark',
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  minimap: false,
  folding: true,
  bracketPairColorization: true,

  // Display
  showDiagnostics: true,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorStyle: 'line',

  // Scrollbar
  scrollbarStyle: 'thin',
  scrollbarSize: 8,

  // Performance
  largeFileOptimizations: true,
  maxHighlightLength: 10000,

  // Code display
  renderWhitespace: 'selection',
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  matchBrackets: true,

  // Formatting
  formatOnSave: false,
  formatOnPaste: false,

  // Clean mode
  cleanMode: false,
};

/**
 * Preset configurations for quick setup
 */
const EDITOR_PRESETS: Record<EditorPreset, Partial<EditorConfig>> = {
  minimal: {
    minimap: false,
    folding: false,
    lineNumbers: false,
    showDiagnostics: false,
    renderWhitespace: 'none',
    scrollbarSize: 5,
    scrollbarStyle: 'hidden',
    highlightActiveLine: false,
    highlightActiveLineGutter: false,
  },
  default: {
    minimap: false,
    folding: true,
    lineNumbers: true,
    showDiagnostics: true,
    renderWhitespace: 'selection',
    scrollbarSize: 8,
    scrollbarStyle: 'thin',
    highlightActiveLine: true,
    highlightActiveLineGutter: true,
  },
  full: {
    minimap: true,
    folding: true,
    lineNumbers: true,
    showDiagnostics: true,
    bracketPairColorization: true,
    smoothScrolling: true,
    renderWhitespace: 'selection',
    scrollbarSize: 12,
    scrollbarStyle: 'native',
    highlightActiveLine: true,
    highlightActiveLineGutter: true,
  },
};

// Validation helpers
function clampFontSize(size: number): number {
  return Math.min(24, Math.max(12, Math.round(size)));
}

function validateTabSize(size: number): TabSize {
  return size === 4 ? 4 : 2;
}

function clampScrollbarSize(size: number): number {
  return Math.min(20, Math.max(5, Math.round(size)));
}

/**
 * Load editor config from localStorage
 */
function loadEditorConfig(): EditorConfig {
  if (typeof window === 'undefined') return DEFAULT_EDITOR_CONFIG;

  try {
    const stored = localStorage.getItem(EDITOR_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults and validate
      return {
        ...DEFAULT_EDITOR_CONFIG,
        ...parsed,
        // Validate specific fields
        fontSize: clampFontSize(parsed.fontSize ?? DEFAULT_EDITOR_CONFIG.fontSize),
        tabSize: validateTabSize(parsed.tabSize ?? DEFAULT_EDITOR_CONFIG.tabSize),
        scrollbarSize: clampScrollbarSize(parsed.scrollbarSize ?? DEFAULT_EDITOR_CONFIG.scrollbarSize),
      };
    }
  } catch (e) {
    console.error('[EditorConfig] Failed to load config:', e);
  }

  return DEFAULT_EDITOR_CONFIG;
}

/**
 * Save editor config to localStorage
 */
function saveEditorConfig(config: EditorConfig): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(EDITOR_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('[EditorConfig] Failed to save config:', e);
  }
}

// Editor config store
export const editorConfigStore = map<EditorConfig>(loadEditorConfig());

// Subscribe to changes and persist
editorConfigStore.subscribe((config) => {
  saveEditorConfig(config);
});

// Computed stores for individual settings (for fine-grained subscriptions)
export const themeStore = computed(editorConfigStore, (config) => config.theme);
export const fontSizeStore = computed(editorConfigStore, (config) => config.fontSize);
export const tabSizeStore = computed(editorConfigStore, (config) => config.tabSize);
export const wordWrapStore = computed(editorConfigStore, (config) => config.wordWrap);
export const lineNumbersStore = computed(editorConfigStore, (config) => config.lineNumbers);
export const minimapStore = computed(editorConfigStore, (config) => config.minimap);
export const foldingStore = computed(editorConfigStore, (config) => config.folding);
export const bracketPairColorizationStore = computed(editorConfigStore, (config) => config.bracketPairColorization);
export const showDiagnosticsStore = computed(editorConfigStore, (config) => config.showDiagnostics);
export const smoothScrollingStore = computed(editorConfigStore, (config) => config.smoothScrolling);
export const cursorBlinkingStore = computed(editorConfigStore, (config) => config.cursorBlinking);
export const scrollbarSizeStore = computed(editorConfigStore, (config) => config.scrollbarSize);
export const formatOnSaveStore = computed(editorConfigStore, (config) => config.formatOnSave);
export const formatOnPasteStore = computed(editorConfigStore, (config) => config.formatOnPaste);

// Computed: resolved theme (handles 'system')
export const resolvedThemeStore = computed(editorConfigStore, (config) => {
  if (config.theme === 'system') {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark'; // Default to dark on server
  }
  return config.theme;
});

// Computed: Monaco-compatible options
export const monacoOptionsStore = computed(editorConfigStore, (config) => {
  const resolvedTheme = config.theme === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : config.theme;

  return {
    theme: resolvedTheme === 'dark' ? 'vs-dark' : 'vs',
    fontSize: config.fontSize,
    tabSize: config.tabSize,
    wordWrap: config.wordWrap ? 'on' as const : 'off' as const,
    lineNumbers: config.lineNumbers ? 'on' as const : 'off' as const,
    minimap: { enabled: config.minimap },
    folding: config.folding,
    'bracketPairColorization.enabled': config.bracketPairColorization,
    smoothScrolling: config.smoothScrolling,
    cursorBlinking: config.cursorBlinking,
    cursorStyle: config.cursorStyle,
    scrollbar: {
      verticalScrollbarSize: config.scrollbarSize,
      horizontalScrollbarSize: config.scrollbarSize,
      useShadows: config.scrollbarStyle !== 'hidden',
      vertical: config.scrollbarStyle === 'hidden' ? 'hidden' as const : 'visible' as const,
      horizontal: config.scrollbarStyle === 'hidden' ? 'hidden' as const : 'visible' as const,
    },
    renderWhitespace: config.renderWhitespace,
    formatOnPaste: config.formatOnPaste,
    matchBrackets: config.matchBrackets ? 'always' as const : 'never' as const,
    renderLineHighlight: config.highlightActiveLine ? 'all' as const : 'none' as const,
    // Additional recommended Monaco options
    automaticLayout: true,
    scrollBeyondLastLine: false,
    fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
    fontLigatures: true,
  };
});

// Computed: CodeMirror-compatible options
export const codeMirrorOptionsStore = computed(editorConfigStore, (config) => {
  return {
    theme: config.theme,
    fontSize: config.fontSize,
    tabSize: config.tabSize,
    lineWrapping: config.wordWrap,
    lineNumbers: config.lineNumbers,
    foldGutter: config.folding,
    bracketMatching: config.bracketPairColorization,
    highlightActiveLine: config.highlightActiveLine,
    scrollbarStyle: config.scrollbarStyle === 'hidden' ? 'null' : config.scrollbarStyle,
  };
});

// Convenience functions for updating config
export function updateEditorConfig(updates: Partial<EditorConfig>): void {
  const current = editorConfigStore.get();

  // Validate updates
  const validated: Partial<EditorConfig> = { ...updates };

  if (validated.fontSize !== undefined) {
    validated.fontSize = clampFontSize(validated.fontSize);
  }

  if (validated.tabSize !== undefined) {
    validated.tabSize = validateTabSize(validated.tabSize);
  }

  if (validated.scrollbarSize !== undefined) {
    validated.scrollbarSize = clampScrollbarSize(validated.scrollbarSize);
  }

  editorConfigStore.set({ ...current, ...validated });
}

export function resetEditorConfig(): void {
  editorConfigStore.set({ ...DEFAULT_EDITOR_CONFIG });
}

// Individual setting update functions
export function setTheme(theme: EditorTheme): void {
  updateEditorConfig({ theme });
}

export function setFontSize(fontSize: number): void {
  updateEditorConfig({ fontSize });
}

export function setTabSize(tabSize: TabSize): void {
  updateEditorConfig({ tabSize });
}

export function setCursorBlinking(cursorBlinking: CursorBlinking): void {
  updateEditorConfig({ cursorBlinking });
}

export function setScrollbarSize(scrollbarSize: number): void {
  updateEditorConfig({ scrollbarSize });
}

// Toggle functions
export function toggleWordWrap(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ wordWrap: !current.wordWrap });
}

export function toggleLineNumbers(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ lineNumbers: !current.lineNumbers });
}

export function toggleMinimap(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ minimap: !current.minimap });
}

export function toggleFolding(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ folding: !current.folding });
}

export function toggleBracketPairColorization(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ bracketPairColorization: !current.bracketPairColorization });
}

export function toggleDiagnostics(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ showDiagnostics: !current.showDiagnostics });
}

export function toggleSmoothScrolling(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ smoothScrolling: !current.smoothScrolling });
}

export function toggleFormatOnSave(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ formatOnSave: !current.formatOnSave });
}

export function toggleFormatOnPaste(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ formatOnPaste: !current.formatOnPaste });
}

export function toggleCleanMode(): void {
  const current = editorConfigStore.get();
  const newCleanMode = !current.cleanMode;

  // When enabling clean mode, also disable diagnostics
  editorConfigStore.set({
    ...current,
    cleanMode: newCleanMode,
    showDiagnostics: newCleanMode ? false : current.showDiagnostics,
  });
}

export function toggleHighlightActiveLine(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ highlightActiveLine: !current.highlightActiveLine });
}

export function toggleMatchBrackets(): void {
  const current = editorConfigStore.get();
  updateEditorConfig({ matchBrackets: !current.matchBrackets });
}

// Computed values for clean mode
export function getEffectiveConfig(config: EditorConfig): EditorConfig {
  if (!config.cleanMode) return config;

  // Clean mode overrides
  return {
    ...config,
    showDiagnostics: false,
    renderWhitespace: 'none',
  };
}

/**
 * Apply a preset configuration
 */
export function applyEditorPreset(preset: EditorPreset): void {
  const presetConfig = EDITOR_PRESETS[preset];
  updateEditorConfig(presetConfig);
}

/**
 * Get Monaco or CodeMirror compatible options
 * @param editor - The editor type ('monaco' or 'codemirror')
 * @returns Editor-compatible options object
 */
export function getEditorOptions(editor: 'monaco' | 'codemirror' = 'monaco'): Record<string, unknown> {
  if (editor === 'monaco') {
    return monacoOptionsStore.get();
  }
  return codeMirrorOptionsStore.get();
}

// Cursor blinking options for UI
export const CURSOR_BLINKING_OPTIONS = [
  { value: 'blink', label: 'Blink' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'phase', label: 'Phase' },
  { value: 'expand', label: 'Expand' },
  { value: 'solid', label: 'Solid (no animation)' },
] as const;

// Cursor style options for UI
export const CURSOR_STYLE_OPTIONS = [
  { value: 'line', label: 'Line' },
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
] as const;

// Scrollbar style options for UI
export const SCROLLBAR_STYLE_OPTIONS = [
  { value: 'native', label: 'Native' },
  { value: 'thin', label: 'Thin' },
  { value: 'hidden', label: 'Hidden' },
] as const;

// Whitespace render options for UI
export const WHITESPACE_RENDER_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'boundary', label: 'Boundary' },
  { value: 'selection', label: 'Selection' },
  { value: 'trailing', label: 'Trailing' },
  { value: 'all', label: 'All' },
] as const;

// Theme options for UI
export const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
] as const;

// Tab size options for UI
export const TAB_SIZE_OPTIONS = [
  { value: 2, label: '2 spaces' },
  { value: 4, label: '4 spaces' },
] as const;

// Font size options for UI
export const FONT_SIZE_OPTIONS = [
  { value: 12, label: '12px' },
  { value: 13, label: '13px' },
  { value: 14, label: '14px' },
  { value: 15, label: '15px' },
  { value: 16, label: '16px' },
  { value: 18, label: '18px' },
  { value: 20, label: '20px' },
  { value: 22, label: '22px' },
  { value: 24, label: '24px' },
] as const;

// Preset options for UI
export const PRESET_OPTIONS = [
  { value: 'minimal', label: 'Minimal', description: 'Clean interface with minimal distractions' },
  { value: 'default', label: 'Default', description: 'Balanced settings for everyday use' },
  { value: 'full', label: 'Full', description: 'All features enabled including minimap' },
] as const;

// Export preset definitions for reference
export { EDITOR_PRESETS };
