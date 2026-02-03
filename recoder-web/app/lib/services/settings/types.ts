/**
 * Settings Types
 *
 * Comprehensive type definitions for all application settings and preferences.
 * These types define the structure for editor, AI, app, and user preferences.
 */

// ============================================================================
// Editor Settings
// ============================================================================

export type EditorTheme =
  | 'vs-dark'
  | 'github-dark'
  | 'dracula'
  | 'one-dark-pro'
  | 'tokyo-night'
  | 'catppuccin'
  | 'nord'
  | 'material-dark'
  | 'monokai';

export type FontFamily =
  | 'JetBrains Mono'
  | 'Fira Code'
  | 'Source Code Pro'
  | 'Consolas'
  | 'Monaco'
  | 'Menlo'
  | 'Ubuntu Mono'
  | 'SF Mono'
  | 'Cascadia Code';

export type CursorStyle = 'line' | 'block' | 'underline';
export type CursorBlinkStyle = 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
export type WordWrapMode = 'off' | 'on' | 'wordWrapColumn' | 'bounded';
export type IndentStyle = 'spaces' | 'tabs';
export type BracketPairStyle = 'colorize' | 'rainbow' | 'off';

export interface EditorSettings {
  // Theme & Appearance
  theme: EditorTheme;
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: number;
  letterSpacing: number;

  // Cursor
  cursorStyle: CursorStyle;
  cursorBlinking: CursorBlinkStyle;
  cursorWidth: number;

  // Indentation
  tabSize: number;
  indentStyle: IndentStyle;
  detectIndentation: boolean;

  // Word Wrap
  wordWrap: WordWrapMode;
  wordWrapColumn: number;

  // Line Numbers & Gutter
  lineNumbers: boolean;
  relativeLineNumbers: boolean;
  renderLineHighlight: boolean;
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';

  // Minimap
  minimap: boolean;
  minimapScale: number;
  minimapShowSlider: 'always' | 'mouseover';
  minimapMaxColumn: number;

  // Code Intelligence
  codeFolding: boolean;
  showFoldingControls: 'always' | 'mouseover';
  bracketPairColorization: BracketPairStyle;
  matchBrackets: boolean;

  // Scroll & View
  stickyScroll: boolean;
  stickyScrollMaxLines: number;
  smoothScrolling: boolean;
  scrollBeyondLastLine: boolean;

  // Suggestions & Autocomplete
  quickSuggestions: boolean;
  quickSuggestionsDelay: number;
  acceptSuggestionOnEnter: boolean;
  suggestOnTriggerCharacters: boolean;

  // Guides
  indentGuides: boolean;
  highlightActiveIndentGuide: boolean;

  // Formatting
  formatOnPaste: boolean;
  formatOnSave: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
}

// ============================================================================
// AI Settings
// ============================================================================

export type AIModelTier = 'fast' | 'balanced' | 'powerful';
export type AIResponseStyle = 'concise' | 'detailed' | 'verbose';
export type CodeGenStyle = 'minimal' | 'commented' | 'documented';

export interface AISettings {
  // Model Selection
  defaultModel: string;
  preferredTier: AIModelTier;

  // Generation Parameters
  temperature: number;
  topP: number;
  maxTokens: number;
  streamResponses: boolean;

  // Behavior
  responseStyle: AIResponseStyle;
  codeGenStyle: CodeGenStyle;
  includeExplanations: boolean;
  autoApplyFixes: boolean;

  // Context
  maxContextFiles: number;
  includeImports: boolean;
  includeTypes: boolean;
  includeComments: boolean;

  // Safety
  codeReviewEnabled: boolean;
  maxAutoApplyLines: number;
  confirmDestructiveChanges: boolean;

  // Auto-complete
  autoCompleteEnabled: boolean;
  autoCompleteDelay: number;
  autoCompleteMaxSuggestions: number;
}

// ============================================================================
// App Settings
// ============================================================================

export type AppTheme = 'dark' | 'light' | 'system';
export type SidebarPosition = 'left' | 'right';
export type PanelLayout = 'horizontal' | 'vertical';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'ko' | 'pt' | 'ru';

export interface AppSettings {
  // Theme & Appearance
  theme: AppTheme;
  accentColor: string;
  reducedMotion: boolean;
  compactMode: boolean;

  // Layout
  sidebarPosition: SidebarPosition;
  sidebarWidth: number;
  panelLayout: PanelLayout;
  terminalHeight: number;

  // Language & Region
  language: Language;
  dateFormat: string;
  timeFormat: '12h' | '24h';

  // Behavior
  confirmBeforeClose: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
  restoreLastSession: boolean;

  // Performance
  enableAnimations: boolean;
  enableHardwareAcceleration: boolean;
  maxOpenTabs: number;

  // Privacy
  telemetryEnabled: boolean;
  crashReportsEnabled: boolean;
  usageDataEnabled: boolean;
}

// ============================================================================
// Notification Settings
// ============================================================================

export type NotificationPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface NotificationSettings {
  // Global
  enabled: boolean;
  position: NotificationPosition;
  duration: number;
  maxVisible: number;

  // By Type
  showErrors: boolean;
  showWarnings: boolean;
  showInfo: boolean;
  showSuccess: boolean;

  // Sound
  soundEnabled: boolean;
  soundVolume: number;

  // Specific Events
  buildNotifications: boolean;
  deployNotifications: boolean;
  gitNotifications: boolean;
  chatNotifications: boolean;
  systemNotifications: boolean;
}

// ============================================================================
// Terminal Settings
// ============================================================================

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorBlink: boolean;
  cursorStyle: CursorStyle;
  scrollback: number;
  copyOnSelect: boolean;
  rightClickBehavior: 'default' | 'paste' | 'contextMenu';
  bellStyle: 'none' | 'sound' | 'visual' | 'both';
  defaultShell: string;
}

// ============================================================================
// Keyboard Shortcut Settings
// ============================================================================

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  ctrlOrMeta?: boolean;
}

export interface ShortcutMapping {
  id: string;
  keys: KeyBinding[];
  enabled: boolean;
}

export interface KeyboardSettings {
  customBindings: Record<string, ShortcutMapping>;
  enableVimMode: boolean;
  enableEmacsBindings: boolean;
}

// ============================================================================
// Account Settings
// ============================================================================

export interface AccountSettings {
  displayName: string;
  email: string;
  avatarUrl: string | null;

  // Preferences
  defaultProjectVisibility: 'private' | 'public';
  showProfileBadges: boolean;

  // Integrations
  githubConnected: boolean;
  vercelConnected: boolean;
  netlifyConnected: boolean;

  // Privacy
  showOnlineStatus: boolean;
  allowProjectSharing: boolean;
}

// ============================================================================
// Workspace Settings
// ============================================================================

export interface WorkspaceSettings {
  restoreEnabled: boolean;
  autoSaveInterval: number;
  defaultFileEncoding: string;
  maxRecentFiles: number;
  excludePatterns: string[];
  searchExcludePatterns: string[];
}

// ============================================================================
// Combined User Preferences
// ============================================================================

export interface UserPreferences {
  version: number;
  lastUpdated: number;

  editor: EditorSettings;
  ai: AISettings;
  app: AppSettings;
  notifications: NotificationSettings;
  terminal: TerminalSettings;
  keyboard: KeyboardSettings;
  account: AccountSettings;
  workspace: WorkspaceSettings;
}

// ============================================================================
// Settings Change Events
// ============================================================================

export type SettingsCategory = keyof Omit<UserPreferences, 'version' | 'lastUpdated'>;

export interface SettingsChangeEvent<T extends SettingsCategory = SettingsCategory> {
  category: T;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

// ============================================================================
// Settings Sync
// ============================================================================

export interface SettingsSyncState {
  lastSyncedAt: number | null;
  syncEnabled: boolean;
  syncInProgress: boolean;
  syncError: string | null;
  pendingChanges: SettingsChangeEvent[];
}

// ============================================================================
// Settings Export/Import
// ============================================================================

export interface SettingsExport {
  version: number;
  exportedAt: number;
  settings: Partial<UserPreferences>;
  includeKeyboardShortcuts: boolean;
}
