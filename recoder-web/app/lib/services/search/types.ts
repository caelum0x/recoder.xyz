/**
 * Search Types
 *
 * Type definitions for the comprehensive search system including
 * file search, code search, and command search functionality.
 */

// =============================================================================
// Base Search Types
// =============================================================================

/** Scope of the search operation */
export type SearchScope = 'project' | 'workspace' | 'open-files' | 'current-file';

/** Search result match type */
export type MatchType = 'exact' | 'fuzzy' | 'regex' | 'prefix';

/** Search result source */
export type SearchSource = 'file' | 'code' | 'command' | 'symbol' | 'project';

/** Base search result interface */
export interface SearchResult {
  /** Unique identifier for this result */
  id: string;
  /** Source type of the result */
  source: SearchSource;
  /** Display label for the result */
  label: string;
  /** Optional description or secondary text */
  description?: string;
  /** Relevance score (higher is better) */
  score: number;
  /** Type of match that produced this result */
  matchType: MatchType;
  /** Highlighted ranges in the label */
  highlights?: HighlightRange[];
  /** Icon identifier for this result */
  icon?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Range for highlighting matches */
export interface HighlightRange {
  start: number;
  end: number;
}

// =============================================================================
// Search Filters
// =============================================================================

/** Filter options for search operations */
export interface SearchFilter {
  /** File extensions to include (e.g., ['.ts', '.tsx']) */
  extensions?: string[];
  /** File extensions to exclude */
  excludeExtensions?: string[];
  /** Glob patterns to include */
  includePatterns?: string[];
  /** Glob patterns to exclude */
  excludePatterns?: string[];
  /** Maximum number of results */
  maxResults?: number;
  /** Search scope */
  scope?: SearchScope;
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Use regex */
  useRegex?: boolean;
  /** Search in hidden files */
  includeHidden?: boolean;
  /** Minimum score threshold */
  minScore?: number;
}

/** Default search filter values */
export const DEFAULT_SEARCH_FILTER: SearchFilter = {
  maxResults: 50,
  scope: 'project',
  caseSensitive: false,
  useRegex: false,
  includeHidden: false,
  minScore: 0,
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
  ],
};

// =============================================================================
// File Search Types
// =============================================================================

/** Result from file name search */
export interface FileSearchResult extends SearchResult {
  source: 'file';
  /** Full file path */
  filePath: string;
  /** File name only */
  fileName: string;
  /** Parent directory */
  directory: string;
  /** File extension */
  extension: string;
  /** File size in bytes (if available) */
  size?: number;
  /** Last modified timestamp */
  lastModified?: number;
  /** Whether the file is currently open */
  isOpen?: boolean;
  /** Frecency score for ranking */
  frecency?: number;
}

/** Recently opened file entry */
export interface RecentFile {
  /** Full file path */
  filePath: string;
  /** Timestamp of last access */
  lastAccessed: number;
  /** Number of times accessed */
  accessCount: number;
  /** Frecency score */
  frecency: number;
}

/** File search options */
export interface FileSearchOptions extends SearchFilter {
  /** Include recently opened files */
  includeRecent?: boolean;
  /** Boost recently opened files */
  boostRecent?: boolean;
  /** Sort by frecency instead of relevance */
  sortByFrecency?: boolean;
}

// =============================================================================
// Code Search Types
// =============================================================================

/** Result from code/content search */
export interface CodeSearchResult extends SearchResult {
  source: 'code';
  /** Full file path */
  filePath: string;
  /** Line number (1-indexed) */
  lineNumber: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matching line content */
  lineContent: string;
  /** Context lines before the match */
  contextBefore: string[];
  /** Context lines after the match */
  contextAfter: string[];
  /** The matched text */
  matchedText: string;
  /** Length of the match */
  matchLength: number;
}

/** Code search options */
export interface CodeSearchOptions extends SearchFilter {
  /** Number of context lines to include */
  contextLines?: number;
  /** Search only in comments */
  onlyComments?: boolean;
  /** Search only in strings */
  onlyStrings?: boolean;
  /** Word boundary matching */
  wholeWord?: boolean;
}

/** Search and replace operation */
export interface SearchReplaceOperation {
  /** Search pattern */
  search: string;
  /** Replacement text */
  replace: string;
  /** Whether search is regex */
  isRegex: boolean;
  /** Case sensitive */
  caseSensitive: boolean;
  /** Whole word matching */
  wholeWord: boolean;
  /** Preserve case in replacement */
  preserveCase: boolean;
}

/** Result of a replace preview */
export interface ReplacePreview {
  /** File path */
  filePath: string;
  /** Original line content */
  original: string;
  /** Content after replacement */
  replaced: string;
  /** Line number */
  lineNumber: number;
  /** Whether replacement would change the line */
  hasChange: boolean;
}

// =============================================================================
// Command Search Types
// =============================================================================

/** Command category for grouping */
export type CommandCategory =
  | 'file'
  | 'edit'
  | 'view'
  | 'go'
  | 'search'
  | 'terminal'
  | 'git'
  | 'debug'
  | 'help'
  | 'custom';

/** Result from command search */
export interface CommandSearchResult extends SearchResult {
  source: 'command';
  /** Command identifier */
  commandId: string;
  /** Command category */
  category: CommandCategory;
  /** Keyboard shortcut (e.g., 'Cmd+P') */
  shortcut?: string;
  /** Whether command is currently available */
  isAvailable: boolean;
  /** Action to execute the command */
  execute: () => void | Promise<void>;
}

/** Command definition */
export interface CommandDefinition {
  /** Unique command identifier */
  id: string;
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Category for grouping */
  category: CommandCategory;
  /** Keyboard shortcut */
  shortcut?: string;
  /** Icon identifier */
  icon?: string;
  /** Check if command is available */
  isAvailable?: () => boolean;
  /** Execute the command */
  execute: () => void | Promise<void>;
  /** Keywords for search */
  keywords?: string[];
}

/** Recent command entry */
export interface RecentCommand {
  /** Command ID */
  commandId: string;
  /** Last executed timestamp */
  lastExecuted: number;
  /** Execution count */
  executionCount: number;
}

// =============================================================================
// Project Search Types
// =============================================================================

/** Result from project/workspace search */
export interface ProjectSearchResult extends SearchResult {
  source: 'project';
  /** Project/chat ID */
  projectId: string;
  /** Project name */
  projectName: string;
  /** Project description */
  projectDescription?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  lastModified: number;
  /** Number of files */
  fileCount?: number;
}

// =============================================================================
// Symbol Search Types
// =============================================================================

/** Symbol type for go-to-symbol search */
export type SymbolKind =
  | 'file'
  | 'module'
  | 'namespace'
  | 'package'
  | 'class'
  | 'method'
  | 'property'
  | 'field'
  | 'constructor'
  | 'enum'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'key'
  | 'null'
  | 'struct'
  | 'event'
  | 'operator'
  | 'type-parameter';

/** Symbol search result */
export interface SymbolSearchResult extends SearchResult {
  source: 'symbol';
  /** Symbol name */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** File containing the symbol */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Column number */
  column: number;
  /** Container name (parent class/function) */
  containerName?: string;
}

// =============================================================================
// Unified Search Types
// =============================================================================

/** Combined search result type */
export type UnifiedSearchResult =
  | FileSearchResult
  | CodeSearchResult
  | CommandSearchResult
  | ProjectSearchResult
  | SymbolSearchResult;

/** Search mode for unified search */
export type SearchMode = 'all' | 'files' | 'code' | 'commands' | 'symbols';

/** Unified search options */
export interface UnifiedSearchOptions {
  /** Search modes to include */
  modes?: SearchMode[];
  /** Options for each search type */
  fileOptions?: FileSearchOptions;
  codeOptions?: CodeSearchOptions;
  commandOptions?: SearchFilter;
  /** Maximum results per category */
  maxPerCategory?: number;
}

/** Search state for UI */
export interface SearchState {
  /** Current search query */
  query: string;
  /** Current search mode */
  mode: SearchMode;
  /** Whether search is loading */
  isLoading: boolean;
  /** Current results */
  results: UnifiedSearchResult[];
  /** Selected result index */
  selectedIndex: number;
  /** Error message if any */
  error?: string;
  /** Total result count before limits */
  totalCount: number;
}

// =============================================================================
// Bookmark Types
// =============================================================================

/** Bookmarked location */
export interface Bookmark {
  /** Unique bookmark ID */
  id: string;
  /** File path */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Column number */
  column?: number;
  /** User-defined label */
  label?: string;
  /** Timestamp of creation */
  createdAt: number;
  /** Line content at time of bookmark */
  lineContent?: string;
}

// =============================================================================
// Navigation History Types
// =============================================================================

/** Navigation history entry */
export interface NavigationEntry {
  /** File path */
  filePath: string;
  /** Line number */
  lineNumber: number;
  /** Column number */
  column: number;
  /** Timestamp */
  timestamp: number;
  /** Source of navigation */
  source: 'user' | 'go-to-definition' | 'search' | 'bookmark';
}

/** Navigation state */
export interface NavigationState {
  /** History of visited locations */
  history: NavigationEntry[];
  /** Current position in history */
  currentIndex: number;
  /** Can go back */
  canGoBack: boolean;
  /** Can go forward */
  canGoForward: boolean;
}
