/**
 * File Search Service
 *
 * Provides fuzzy file name matching with frecency ranking,
 * recently opened file tracking, and intelligent scoring.
 */

import Fuse, { type FuseResultMatch } from 'fuse.js';
import { createScopedLogger } from '~/utils/logger';
import type {
  FileSearchResult,
  FileSearchOptions,
  RecentFile,
  HighlightRange,
  DEFAULT_SEARCH_FILTER,
} from './types';

const logger = createScopedLogger('FileSearch');

// =============================================================================
// Constants
// =============================================================================

const RECENT_FILES_KEY = 'recoder:recent-files';
const MAX_RECENT_FILES = 100;
const FRECENCY_DECAY_DAYS = 7;
const FRECENCY_WEIGHT_ACCESS = 2;
const FRECENCY_WEIGHT_RECENCY = 3;

// File extension icons mapping
const FILE_ICONS: Record<string, string> = {
  '.ts': 'i-ph-file-ts',
  '.tsx': 'i-ph-file-tsx',
  '.js': 'i-ph-file-js',
  '.jsx': 'i-ph-file-jsx',
  '.json': 'i-ph-file-json',
  '.css': 'i-ph-file-css',
  '.scss': 'i-ph-file-css',
  '.html': 'i-ph-file-html',
  '.md': 'i-ph-file-md',
  '.svg': 'i-ph-file-svg',
  '.png': 'i-ph-file-image',
  '.jpg': 'i-ph-file-image',
  '.jpeg': 'i-ph-file-image',
  '.gif': 'i-ph-file-image',
  '.vue': 'i-ph-file-vue',
  '.svelte': 'i-ph-file-code',
  '.py': 'i-ph-file-py',
  '.go': 'i-ph-file-code',
  '.rs': 'i-ph-file-code',
  '.yaml': 'i-ph-file-code',
  '.yml': 'i-ph-file-code',
  '.env': 'i-ph-file-lock',
  '.gitignore': 'i-ph-git-branch',
  '.dockerfile': 'i-ph-cube',
};

const DEFAULT_FILE_ICON = 'i-ph-file';

// =============================================================================
// Frecency Tracking
// =============================================================================

/** In-memory cache of recent files */
let recentFilesCache: Map<string, RecentFile> = new Map();

/**
 * Load recent files from localStorage
 */
function loadRecentFiles(): Map<string, RecentFile> {
  if (typeof window === 'undefined') return new Map();

  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    if (stored) {
      const entries = JSON.parse(stored) as RecentFile[];
      return new Map(entries.map((f) => [f.filePath, f]));
    }
  } catch (e) {
    logger.warn('[FileSearch] Failed to load recent files:', e);
  }
  return new Map();
}

/**
 * Save recent files to localStorage
 */
function saveRecentFiles(): void {
  if (typeof window === 'undefined') return;

  try {
    const entries = Array.from(recentFilesCache.values())
      .sort((a, b) => b.frecency - a.frecency)
      .slice(0, MAX_RECENT_FILES);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(entries));
  } catch (e) {
    logger.warn('[FileSearch] Failed to save recent files:', e);
  }
}

/**
 * Calculate frecency score for a file
 * Combines access count with recency weighting
 */
function calculateFrecency(accessCount: number, lastAccessed: number): number {
  const now = Date.now();
  const daysSinceAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24);
  const recencyMultiplier = Math.max(0, 1 - daysSinceAccess / FRECENCY_DECAY_DAYS);

  return (
    accessCount * FRECENCY_WEIGHT_ACCESS + recencyMultiplier * FRECENCY_WEIGHT_RECENCY * 10
  );
}

/**
 * Record a file access for frecency tracking
 */
export function recordFileAccess(filePath: string): void {
  if (recentFilesCache.size === 0) {
    recentFilesCache = loadRecentFiles();
  }

  const existing = recentFilesCache.get(filePath);
  const now = Date.now();

  if (existing) {
    existing.accessCount += 1;
    existing.lastAccessed = now;
    existing.frecency = calculateFrecency(existing.accessCount, existing.lastAccessed);
  } else {
    recentFilesCache.set(filePath, {
      filePath,
      lastAccessed: now,
      accessCount: 1,
      frecency: calculateFrecency(1, now),
    });
  }

  // Trim old entries
  if (recentFilesCache.size > MAX_RECENT_FILES * 1.5) {
    const entries = Array.from(recentFilesCache.entries())
      .sort((a, b) => b[1].frecency - a[1].frecency)
      .slice(0, MAX_RECENT_FILES);
    recentFilesCache = new Map(entries);
  }

  saveRecentFiles();
}

/**
 * Get recent files sorted by frecency
 */
export function getRecentFiles(limit: number = 10): RecentFile[] {
  if (recentFilesCache.size === 0) {
    recentFilesCache = loadRecentFiles();
  }

  return Array.from(recentFilesCache.values())
    .sort((a, b) => b.frecency - a.frecency)
    .slice(0, limit);
}

/**
 * Clear recent files history
 */
export function clearRecentFiles(): void {
  recentFilesCache.clear();
  if (typeof window !== 'undefined') {
    localStorage.removeItem(RECENT_FILES_KEY);
  }
}

/**
 * Remove a file from recent history
 */
export function removeFromRecentFiles(filePath: string): void {
  recentFilesCache.delete(filePath);
  saveRecentFiles();
}

// =============================================================================
// File Search
// =============================================================================

/** File info for search indexing */
interface FileInfo {
  path: string;
  name: string;
  directory: string;
  extension: string;
}

/**
 * Parse file path into components
 */
function parseFilePath(filePath: string): FileInfo {
  const parts = filePath.split('/');
  const name = parts[parts.length - 1] || '';
  const directory = parts.slice(0, -1).join('/') || '/';
  const extMatch = name.match(/\.[^.]+$/);
  const extension = extMatch ? extMatch[0] : '';

  return { path: filePath, name, directory, extension };
}

/**
 * Get icon for file based on extension
 */
export function getFileIcon(filePath: string): string {
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  return FILE_ICONS[ext] || DEFAULT_FILE_ICON;
}

/**
 * Check if file should be excluded based on patterns
 */
function shouldExcludeFile(
  filePath: string,
  options: FileSearchOptions
): boolean {
  const { excludePatterns, excludeExtensions, extensions, includeHidden } = options;

  // Check hidden files
  if (!includeHidden && filePath.includes('/.')) {
    return true;
  }

  // Check excluded patterns
  if (excludePatterns) {
    for (const pattern of excludePatterns) {
      if (matchGlobPattern(filePath, pattern)) {
        return true;
      }
    }
  }

  // Check extension filters
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';

  if (excludeExtensions && excludeExtensions.includes(ext)) {
    return true;
  }

  if (extensions && extensions.length > 0 && !extensions.includes(ext)) {
    return true;
  }

  return false;
}

/**
 * Simple glob pattern matching
 */
function matchGlobPattern(path: string, pattern: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/{{GLOBSTAR}}/g, '.*');

  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  } catch {
    return false;
  }
}

/**
 * Create Fuse.js instance for file searching
 */
function createFileSearcher(files: FileInfo[]): Fuse<FileInfo> {
  return new Fuse(files, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'path', weight: 1 },
    ],
    threshold: 0.4,
    distance: 100,
    includeMatches: true,
    includeScore: true,
    minMatchCharLength: 1,
    ignoreLocation: true,
  });
}

/**
 * Convert Fuse matches to highlight ranges
 */
function fuseMatchesToHighlights(
  matches: readonly FuseResultMatch[] | undefined,
  key: string
): HighlightRange[] {
  if (!matches) return [];

  const keyMatches = matches.find((m) => m.key === key);
  if (!keyMatches) return [];

  return keyMatches.indices.map(([start, end]: [number, number]) => ({
    start,
    end: end + 1,
  }));
}

/**
 * Search files by name with fuzzy matching
 */
export function searchFiles(
  filePaths: string[],
  query: string,
  options: FileSearchOptions = {}
): FileSearchResult[] {
  const mergedOptions: FileSearchOptions = {
    maxResults: 50,
    scope: 'project',
    caseSensitive: false,
    includeHidden: false,
    includeRecent: true,
    boostRecent: true,
    sortByFrecency: false,
    excludePatterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
    ],
    ...options,
  };

  // Initialize recent files cache if needed
  if (recentFilesCache.size === 0) {
    recentFilesCache = loadRecentFiles();
  }

  // Filter and parse files
  const files: FileInfo[] = filePaths
    .filter((path) => !shouldExcludeFile(path, mergedOptions))
    .map(parseFilePath);

  // If no query, return recent files
  if (!query.trim()) {
    if (mergedOptions.includeRecent) {
      const recent = getRecentFiles(mergedOptions.maxResults);
      return recent
        .filter((r) => files.some((f) => f.path === r.filePath))
        .map((r) => {
          const fileInfo = files.find((f) => f.path === r.filePath)!;
          return createFileSearchResult(fileInfo, 1, [], r.frecency, true);
        });
    }
    return [];
  }

  // Create searcher and search
  const searcher = createFileSearcher(files);
  const results = searcher.search(query, { limit: mergedOptions.maxResults! * 2 });

  // Convert to FileSearchResult
  let searchResults = results.map((result) => {
    const score = 1 - (result.score ?? 0);
    const highlights = fuseMatchesToHighlights(result.matches, 'name');
    const frecency = recentFilesCache.get(result.item.path)?.frecency;
    const isRecent = frecency !== undefined;

    return createFileSearchResult(result.item, score, highlights, frecency, isRecent);
  });

  // Boost recent files if enabled
  if (mergedOptions.boostRecent) {
    searchResults = searchResults.map((result) => {
      if (result.frecency && result.frecency > 0) {
        return {
          ...result,
          score: result.score + result.frecency * 0.1,
        };
      }
      return result;
    });
  }

  // Sort by score or frecency
  if (mergedOptions.sortByFrecency) {
    searchResults.sort((a, b) => (b.frecency || 0) - (a.frecency || 0));
  } else {
    searchResults.sort((a, b) => b.score - a.score);
  }

  return searchResults.slice(0, mergedOptions.maxResults);
}

/**
 * Create a FileSearchResult from file info
 */
function createFileSearchResult(
  fileInfo: FileInfo,
  score: number,
  highlights: HighlightRange[],
  frecency?: number,
  isRecent?: boolean
): FileSearchResult {
  return {
    id: `file:${fileInfo.path}`,
    source: 'file',
    label: fileInfo.name,
    description: fileInfo.directory,
    score,
    matchType: 'fuzzy',
    highlights,
    icon: getFileIcon(fileInfo.path),
    filePath: fileInfo.path,
    fileName: fileInfo.name,
    directory: fileInfo.directory,
    extension: fileInfo.extension,
    isOpen: false,
    frecency,
    metadata: {
      isRecent,
    },
  };
}

/**
 * Get file paths from FileMap
 */
export function getFilePathsFromFileMap(
  files: Record<string, { type: string } | undefined>
): string[] {
  return Object.entries(files)
    .filter(([_, dirent]) => dirent?.type === 'file')
    .map(([path]) => path);
}

/**
 * Quick file search for command palette (Cmd+P)
 * Optimized for speed with smaller result set
 */
export function quickFileSearch(
  filePaths: string[],
  query: string,
  limit: number = 15
): FileSearchResult[] {
  return searchFiles(filePaths, query, {
    maxResults: limit,
    includeRecent: true,
    boostRecent: true,
  });
}
