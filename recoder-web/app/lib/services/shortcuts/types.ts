/**
 * Keyboard Shortcuts Type Definitions
 *
 * Comprehensive type system for keyboard shortcuts with:
 * - Platform-aware key combinations
 * - Category-based organization
 * - Context-aware activation
 * - Customization support
 */

/**
 * Shortcut categories for organization and filtering
 */
export type ShortcutCategory =
  | 'navigation'
  | 'editor'
  | 'ai'
  | 'terminal'
  | 'general'
  | 'view'
  | 'file'
  | 'search'
  | 'git'
  | 'custom';

/**
 * Contexts where shortcuts can be active
 */
export type ShortcutContext =
  | 'global'
  | 'editor'
  | 'terminal'
  | 'chat'
  | 'file-tree'
  | 'preview'
  | 'modal';

/**
 * Modifier keys for shortcuts
 */
export interface ModifierKeys {
  /** Control key (Ctrl on all platforms) */
  ctrl?: boolean;
  /** Shift key */
  shift?: boolean;
  /** Alt key (Option on Mac) */
  alt?: boolean;
  /** Meta key (Cmd on Mac, Win on Windows) */
  meta?: boolean;
  /**
   * Cross-platform modifier: Cmd on Mac, Ctrl on Windows/Linux
   * When true, overrides ctrl and meta settings
   */
  ctrlOrMeta?: boolean;
}

/**
 * A single key combination (e.g., Cmd+S)
 */
export interface KeyCombo extends ModifierKeys {
  /** The main key (e.g., 's', 'Enter', 'F1') */
  key: string;
}

/**
 * A keyboard shortcut definition
 */
export interface Shortcut {
  /** Unique identifier for the shortcut */
  id: string;
  /** Key combination(s) - array for sequences like 'g g' */
  keys: KeyCombo | KeyCombo[];
  /** Human-readable description */
  description: string;
  /** Category for organization */
  category: ShortcutCategory;
  /** Contexts where this shortcut is active */
  contexts: ShortcutContext[];
  /** Handler function to execute */
  action: () => void | Promise<void>;
  /** Whether the shortcut is enabled (default: true) */
  enabled?: boolean;
  /** Whether to prevent default browser behavior (default: true) */
  preventDefault?: boolean;
  /** Whether to stop event propagation (default: true) */
  stopPropagation?: boolean;
  /** Human-readable name */
  name?: string;
  /** Icon class for display */
  icon?: string;
  /** Priority for conflict resolution (higher wins) */
  priority?: number;
  /** Whether this is a built-in shortcut (vs user-defined) */
  builtin?: boolean;
}

/**
 * User's custom key binding override
 */
export interface CustomBinding {
  /** Shortcut ID being customized */
  id: string;
  /** Custom key combination(s) */
  keys: KeyCombo | KeyCombo[];
  /** Whether the shortcut is enabled */
  enabled: boolean;
}

/**
 * Shortcut conflict information
 */
export interface ShortcutConflict {
  /** The shortcut that conflicts */
  shortcut: Shortcut;
  /** The contexts where conflict occurs */
  conflictingContexts: ShortcutContext[];
  /** Severity of the conflict */
  severity: 'warning' | 'error';
}

/**
 * Result of recording a new shortcut
 */
export interface RecordingResult {
  /** The recorded key combination */
  keys: KeyCombo;
  /** Any conflicts detected */
  conflicts: ShortcutConflict[];
  /** Whether the recording is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Platform information for display
 */
export interface PlatformInfo {
  /** Whether on macOS */
  isMac: boolean;
  /** Whether on Windows */
  isWindows: boolean;
  /** Whether on Linux */
  isLinux: boolean;
  /** Modifier key symbol for display (Cmd or Ctrl) */
  modKey: string;
  /** Alt key symbol (Option or Alt) */
  altKey: string;
}

/**
 * Category metadata for display
 */
export interface CategoryInfo {
  /** Category ID */
  id: ShortcutCategory;
  /** Display label */
  label: string;
  /** Icon class */
  icon: string;
  /** Description */
  description: string;
  /** Display order */
  order: number;
}

/**
 * Shortcut group for display
 */
export interface ShortcutGroup {
  /** Category info */
  category: CategoryInfo;
  /** Shortcuts in this category */
  shortcuts: Shortcut[];
}

/**
 * Search result for shortcuts
 */
export interface ShortcutSearchResult {
  /** The matching shortcut */
  shortcut: Shortcut;
  /** Match score (higher is better) */
  score: number;
  /** Highlighted name (with match indicators) */
  highlightedName?: string;
  /** Highlighted description */
  highlightedDescription?: string;
}

/**
 * Shortcut manager state
 */
export interface ShortcutManagerState {
  /** All registered shortcuts */
  shortcuts: Map<string, Shortcut>;
  /** Custom bindings (user overrides) */
  customBindings: Record<string, CustomBinding>;
  /** Current active context */
  activeContext: ShortcutContext;
  /** Whether shortcut recording is active */
  isRecording: boolean;
  /** ID of shortcut being recorded for */
  recordingForId: string | null;
  /** Sequence buffer for multi-key shortcuts */
  sequenceBuffer: KeyCombo[];
  /** Whether the system is initialized */
  initialized: boolean;
}

/**
 * Event types for shortcut manager
 */
export type ShortcutEventType =
  | 'shortcut-executed'
  | 'shortcut-registered'
  | 'shortcut-unregistered'
  | 'binding-changed'
  | 'context-changed'
  | 'recording-started'
  | 'recording-stopped'
  | 'conflict-detected';

/**
 * Shortcut event payload
 */
export interface ShortcutEvent {
  type: ShortcutEventType;
  shortcutId?: string;
  data?: unknown;
  timestamp: number;
}

/**
 * Export/import format for shortcuts
 */
export interface ShortcutExport {
  version: number;
  exportedAt: string;
  bindings: Record<string, CustomBinding>;
}
