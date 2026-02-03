/**
 * Settings Defaults
 *
 * Default values for all application settings.
 * These provide sensible defaults for new users.
 */

import type {
  EditorSettings,
  AISettings,
  AppSettings,
  NotificationSettings,
  TerminalSettings,
  KeyboardSettings,
  AccountSettings,
  WorkspaceSettings,
  UserPreferences,
} from './types';

// Current settings version - increment when schema changes
export const SETTINGS_VERSION = 1;

// ============================================================================
// Editor Defaults
// ============================================================================

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  // Theme & Appearance
  theme: 'vs-dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  lineHeight: 1.5,
  letterSpacing: 0,

  // Cursor
  cursorStyle: 'line',
  cursorBlinking: 'smooth',
  cursorWidth: 2,

  // Indentation
  tabSize: 2,
  indentStyle: 'spaces',
  detectIndentation: true,

  // Word Wrap
  wordWrap: 'off',
  wordWrapColumn: 80,

  // Line Numbers & Gutter
  lineNumbers: true,
  relativeLineNumbers: false,
  renderLineHighlight: true,
  renderWhitespace: 'none',

  // Minimap
  minimap: false,
  minimapScale: 1,
  minimapShowSlider: 'mouseover',
  minimapMaxColumn: 120,

  // Code Intelligence
  codeFolding: true,
  showFoldingControls: 'mouseover',
  bracketPairColorization: 'colorize',
  matchBrackets: true,

  // Scroll & View
  stickyScroll: true,
  stickyScrollMaxLines: 4,
  smoothScrolling: true,
  scrollBeyondLastLine: true,

  // Suggestions & Autocomplete
  quickSuggestions: true,
  quickSuggestionsDelay: 10,
  acceptSuggestionOnEnter: true,
  suggestOnTriggerCharacters: true,

  // Guides
  indentGuides: true,
  highlightActiveIndentGuide: true,

  // Formatting
  formatOnPaste: false,
  formatOnSave: false,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
};

// ============================================================================
// AI Defaults
// ============================================================================

export const DEFAULT_AI_SETTINGS: AISettings = {
  // Model Selection
  defaultModel: 'x-ai/grok-code-fast-1',
  preferredTier: 'balanced',

  // Generation Parameters
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 16000,
  streamResponses: true,

  // Behavior
  responseStyle: 'detailed',
  codeGenStyle: 'commented',
  includeExplanations: true,
  autoApplyFixes: false,

  // Context
  maxContextFiles: 10,
  includeImports: true,
  includeTypes: true,
  includeComments: false,

  // Safety
  codeReviewEnabled: true,
  maxAutoApplyLines: 100,
  confirmDestructiveChanges: true,

  // Auto-complete
  autoCompleteEnabled: true,
  autoCompleteDelay: 250,
  autoCompleteMaxSuggestions: 5,
};

// ============================================================================
// App Defaults
// ============================================================================

export const DEFAULT_APP_SETTINGS: AppSettings = {
  // Theme & Appearance
  theme: 'dark',
  accentColor: '#3B82F6', // Blue-500
  reducedMotion: false,
  compactMode: false,

  // Layout
  sidebarPosition: 'left',
  sidebarWidth: 280,
  panelLayout: 'horizontal',
  terminalHeight: 200,

  // Language & Region
  language: 'en',
  dateFormat: 'MMM d, yyyy',
  timeFormat: '12h',

  // Behavior
  confirmBeforeClose: true,
  autoSave: true,
  autoSaveDelay: 30000, // 30 seconds
  restoreLastSession: true,

  // Performance
  enableAnimations: true,
  enableHardwareAcceleration: true,
  maxOpenTabs: 20,

  // Privacy
  telemetryEnabled: false,
  crashReportsEnabled: true,
  usageDataEnabled: false,
};

// ============================================================================
// Notification Defaults
// ============================================================================

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  // Global
  enabled: true,
  position: 'bottom-right',
  duration: 5000,
  maxVisible: 3,

  // By Type
  showErrors: true,
  showWarnings: true,
  showInfo: true,
  showSuccess: true,

  // Sound
  soundEnabled: false,
  soundVolume: 50,

  // Specific Events
  buildNotifications: true,
  deployNotifications: true,
  gitNotifications: true,
  chatNotifications: true,
  systemNotifications: true,
};

// ============================================================================
// Terminal Defaults
// ============================================================================

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontSize: 13,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 10000,
  copyOnSelect: true,
  rightClickBehavior: 'contextMenu',
  bellStyle: 'none',
  defaultShell: '',
};

// ============================================================================
// Keyboard Defaults
// ============================================================================

export const DEFAULT_KEYBOARD_SETTINGS: KeyboardSettings = {
  customBindings: {},
  enableVimMode: false,
  enableEmacsBindings: false,
};

// ============================================================================
// Account Defaults
// ============================================================================

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  displayName: '',
  email: '',
  avatarUrl: null,

  // Preferences
  defaultProjectVisibility: 'private',
  showProfileBadges: true,

  // Integrations
  githubConnected: false,
  vercelConnected: false,
  netlifyConnected: false,

  // Privacy
  showOnlineStatus: true,
  allowProjectSharing: true,
};

// ============================================================================
// Workspace Defaults
// ============================================================================

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  restoreEnabled: true,
  autoSaveInterval: 30000,
  defaultFileEncoding: 'utf-8',
  maxRecentFiles: 20,
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.cache/**',
  ],
  searchExcludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/*.min.js',
    '**/*.min.css',
  ],
};

// ============================================================================
// Combined User Preferences Defaults
// ============================================================================

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  version: SETTINGS_VERSION,
  lastUpdated: Date.now(),

  editor: DEFAULT_EDITOR_SETTINGS,
  ai: DEFAULT_AI_SETTINGS,
  app: DEFAULT_APP_SETTINGS,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  terminal: DEFAULT_TERMINAL_SETTINGS,
  keyboard: DEFAULT_KEYBOARD_SETTINGS,
  account: DEFAULT_ACCOUNT_SETTINGS,
  workspace: DEFAULT_WORKSPACE_SETTINGS,
};

// ============================================================================
// Theme Presets
// ============================================================================

export const EDITOR_THEME_INFO: Record<
  string,
  { name: string; description: string; preview: string }
> = {
  'vs-dark': {
    name: 'VS Dark',
    description: 'Classic Visual Studio Code dark theme',
    preview: '#1E1E1E',
  },
  'github-dark': {
    name: 'GitHub Dark',
    description: 'GitHub-style dark theme',
    preview: '#0D1117',
  },
  'dracula': {
    name: 'Dracula',
    description: 'Popular purple-tinted dark theme',
    preview: '#282A36',
  },
  'one-dark-pro': {
    name: 'One Dark Pro',
    description: 'Atom-inspired dark theme',
    preview: '#282C34',
  },
  'tokyo-night': {
    name: 'Tokyo Night',
    description: 'Elegant dark theme with subtle blues',
    preview: '#1A1B26',
  },
  'catppuccin': {
    name: 'Catppuccin',
    description: 'Soothing pastel theme',
    preview: '#1E1E2E',
  },
  'nord': {
    name: 'Nord',
    description: 'Arctic, north-bluish color palette',
    preview: '#2E3440',
  },
  'material-dark': {
    name: 'Material Dark',
    description: 'Material design-inspired dark theme',
    preview: '#263238',
  },
  'monokai': {
    name: 'Monokai',
    description: 'Classic Sublime Text theme',
    preview: '#272822',
  },
};

// ============================================================================
// Font Options
// ============================================================================

export const FONT_OPTIONS = [
  { value: 'JetBrains Mono', label: 'JetBrains Mono', ligatures: true },
  { value: 'Fira Code', label: 'Fira Code', ligatures: true },
  { value: 'Cascadia Code', label: 'Cascadia Code', ligatures: true },
  { value: 'Source Code Pro', label: 'Source Code Pro', ligatures: false },
  { value: 'SF Mono', label: 'SF Mono', ligatures: false },
  { value: 'Menlo', label: 'Menlo', ligatures: false },
  { value: 'Monaco', label: 'Monaco', ligatures: false },
  { value: 'Consolas', label: 'Consolas', ligatures: false },
  { value: 'Ubuntu Mono', label: 'Ubuntu Mono', ligatures: false },
];

// ============================================================================
// Language Options
// ============================================================================

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espanol' },
  { value: 'fr', label: 'Francais' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portugues' },
  { value: 'ru', label: 'Russian' },
];

// ============================================================================
// Accent Color Presets
// ============================================================================

export const ACCENT_COLOR_PRESETS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#EF4444', label: 'Red' },
  { value: '#F97316', label: 'Orange' },
  { value: '#EAB308', label: 'Yellow' },
  { value: '#22C55E', label: 'Green' },
  { value: '#06B6D4', label: 'Cyan' },
];
