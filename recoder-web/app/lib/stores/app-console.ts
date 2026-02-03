/**
 * App Console Store - Central state management for app console logs
 * Captures console.log, console.warn, console.error from the preview iframe
 * Uses nanostores for reactive state updates
 *
 * Inspired by dyad's Console implementation with additional features:
 * - Text search across logs
 * - Pin important logs
 * - Export logs to file
 * - Copy log to clipboard
 * - Configurable max log retention
 */

import { atom, computed } from 'nanostores';

// ============================================
// Types (inspired by dyad's ConsoleEntry)
// ============================================

export type ConsoleLogLevel = 'info' | 'warn' | 'error' | 'debug' | 'log';
export type ConsoleLogType = 'client' | 'server' | 'system';

export interface ConsoleEntry {
  id: string;
  type: ConsoleLogType;
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
  /** Optional source file/component name */
  sourceName?: string;
  /** Stack trace for errors */
  stack?: string;
  /** Whether this is a system message (e.g., HMR updates) */
  isSystem?: boolean;
  /** Whether this log is pinned */
  isPinned?: boolean;
}

// ============================================
// Atoms (Reactive State)
// ============================================

/** All console entries */
export const consoleEntriesAtom = atom<ConsoleEntry[]>([]);

/** Whether auto-scroll is enabled */
export const autoScrollEnabledAtom = atom<boolean>(true);

/** Whether system messages are collapsed */
export const systemMessagesCollapsedAtom = atom<boolean>(true);

/** Current level filter */
export const levelFilterAtom = atom<'all' | ConsoleLogLevel>('all');

/** Current type filter */
export const typeFilterAtom = atom<'all' | ConsoleLogType>('all');

/** Search query for filtering logs */
export const searchQueryAtom = atom<string>('');

/** Maximum number of entries to keep (configurable) */
export const maxEntriesAtom = atom<number>(1000);

/** Pinned entry IDs */
export const pinnedEntriesAtom = atom<Set<string>>(new Set());

/** Default maximum entries */
const DEFAULT_MAX_ENTRIES = 1000;

// ============================================
// Computed Values
// ============================================

/** Filtered console entries based on current filters */
export const filteredEntriesAtom = computed(
  [consoleEntriesAtom, levelFilterAtom, typeFilterAtom, systemMessagesCollapsedAtom, searchQueryAtom, pinnedEntriesAtom],
  (entries, levelFilter, typeFilter, systemCollapsed, searchQuery, pinnedIds) => {
    const query = searchQuery.toLowerCase().trim();

    return entries.filter((entry) => {
      // Always show pinned entries at the top (they bypass filters except search)
      const isPinned = pinnedIds.has(entry.id);

      // Apply search filter (applies to all including pinned)
      if (query && !entry.message.toLowerCase().includes(query)) {
        // Also check stack trace if available
        if (!entry.stack?.toLowerCase().includes(query)) {
          // Also check source name
          if (!entry.sourceName?.toLowerCase().includes(query)) {
            return false;
          }
        }
      }

      // Pinned entries bypass other filters (except search)
      if (isPinned) {
        return true;
      }

      // Filter out system messages if collapsed
      if (systemCollapsed && entry.isSystem) {
        return false;
      }

      // Apply level filter
      if (levelFilter !== 'all' && entry.level !== levelFilter) {
        return false;
      }

      // Apply type filter
      if (typeFilter !== 'all' && entry.type !== typeFilter) {
        return false;
      }

      return true;
    });
  }
);

/** Get pinned entries sorted by timestamp */
export const pinnedEntriesListAtom = computed(
  [consoleEntriesAtom, pinnedEntriesAtom],
  (entries, pinnedIds) => {
    return entries
      .filter((entry) => pinnedIds.has(entry.id))
      .sort((a, b) => b.timestamp - a.timestamp);
  }
);

/** Count of entries by level */
export const entriesByLevelAtom = computed(consoleEntriesAtom, (entries) => {
  const counts = { info: 0, warn: 0, error: 0, debug: 0, log: 0 };
  for (const entry of entries) {
    if (counts[entry.level] !== undefined) {
      counts[entry.level]++;
    }
  }
  return counts;
});

/** Total entry count */
export const entryCountAtom = computed(consoleEntriesAtom, (entries) => entries.length);

/** Error count only */
export const errorCountAtom = computed(consoleEntriesAtom, (entries) =>
  entries.filter((e) => e.level === 'error').length
);

/** Warning count only */
export const warningCountAtom = computed(consoleEntriesAtom, (entries) =>
  entries.filter((e) => e.level === 'warn').length
);

// ============================================
// Actions
// ============================================

/**
 * Generate unique ID for console entry
 */
function generateId(): string {
  return `console-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add a new console entry
 */
export function addConsoleEntry(entry: Omit<ConsoleEntry, 'id'>): void {
  const newEntry: ConsoleEntry = {
    ...entry,
    id: generateId(),
    isPinned: false,
  };

  const entries = consoleEntriesAtom.get();
  const maxEntries = maxEntriesAtom.get();
  const pinnedIds = pinnedEntriesAtom.get();
  let newEntries = [...entries, newEntry];

  // Trim to max entries, but keep pinned entries
  if (newEntries.length > maxEntries) {
    // Separate pinned and unpinned entries
    const pinned = newEntries.filter((e) => pinnedIds.has(e.id));
    const unpinned = newEntries.filter((e) => !pinnedIds.has(e.id));

    // Only trim unpinned entries
    const maxUnpinned = maxEntries - pinned.length;
    if (unpinned.length > maxUnpinned) {
      unpinned.splice(0, unpinned.length - maxUnpinned);
    }

    newEntries = [...pinned, ...unpinned].sort((a, b) => a.timestamp - b.timestamp);
  }

  consoleEntriesAtom.set(newEntries);
}

/**
 * Add a log message (shorthand)
 */
export function logMessage(
  level: ConsoleLogLevel,
  message: string,
  options?: {
    type?: ConsoleLogType;
    sourceName?: string;
    stack?: string;
    isSystem?: boolean;
  }
): void {
  addConsoleEntry({
    type: options?.type || 'client',
    level,
    message,
    timestamp: Date.now(),
    sourceName: options?.sourceName,
    stack: options?.stack,
    isSystem: options?.isSystem,
  });
}

/**
 * Add an info log
 */
export function logInfo(message: string, sourceName?: string): void {
  logMessage('info', message, { sourceName });
}

/**
 * Add a warning log
 */
export function logWarn(message: string, sourceName?: string): void {
  logMessage('warn', message, { sourceName });
}

/**
 * Add an error log
 */
export function logError(message: string, stack?: string, sourceName?: string): void {
  logMessage('error', message, { sourceName, stack });
}

/**
 * Add a system message (e.g., HMR updates)
 */
export function logSystem(message: string): void {
  logMessage('info', message, { type: 'system', isSystem: true });
}

/**
 * Clear all console entries (preserves pinned entries if keepPinned is true)
 */
export function clearConsole(keepPinned: boolean = false): void {
  if (keepPinned) {
    const entries = consoleEntriesAtom.get();
    const pinnedIds = pinnedEntriesAtom.get();
    const pinned = entries.filter((e) => pinnedIds.has(e.id));
    consoleEntriesAtom.set(pinned);
  } else {
    consoleEntriesAtom.set([]);
    pinnedEntriesAtom.set(new Set());
  }
}

/**
 * Set level filter
 */
export function setLevelFilter(level: 'all' | ConsoleLogLevel): void {
  levelFilterAtom.set(level);
}

/**
 * Set type filter
 */
export function setTypeFilter(type: 'all' | ConsoleLogType): void {
  typeFilterAtom.set(type);
}

/**
 * Toggle system messages visibility
 */
export function toggleSystemMessages(): void {
  systemMessagesCollapsedAtom.set(!systemMessagesCollapsedAtom.get());
}

/**
 * Set auto-scroll enabled state
 */
export function setAutoScroll(enabled: boolean): void {
  autoScrollEnabledAtom.set(enabled);
}

/**
 * Reset all filters
 */
export function resetFilters(): void {
  levelFilterAtom.set('all');
  typeFilterAtom.set('all');
  searchQueryAtom.set('');
}

/**
 * Set search query
 */
export function setSearchQuery(query: string): void {
  searchQueryAtom.set(query);
}

/**
 * Pin/unpin a log entry
 */
export function togglePinEntry(entryId: string): void {
  const pinnedIds = pinnedEntriesAtom.get();
  const newPinned = new Set(pinnedIds);

  if (newPinned.has(entryId)) {
    newPinned.delete(entryId);
  } else {
    newPinned.add(entryId);
  }

  pinnedEntriesAtom.set(newPinned);
}

/**
 * Check if an entry is pinned
 */
export function isEntryPinned(entryId: string): boolean {
  return pinnedEntriesAtom.get().has(entryId);
}

/**
 * Clear all pinned entries
 */
export function clearPinnedEntries(): void {
  pinnedEntriesAtom.set(new Set());
}

/**
 * Set max entries limit
 */
export function setMaxEntries(max: number): void {
  maxEntriesAtom.set(Math.max(100, Math.min(10000, max)));
}

/**
 * Copy entry to clipboard
 */
export async function copyEntryToClipboard(entry: ConsoleEntry): Promise<boolean> {
  const time = formatTimestamp(entry.timestamp);
  const prefix = entry.sourceName ? `[${entry.sourceName}]` : '';
  const formattedLog = `[${time}] ${entry.level.toUpperCase()} ${prefix}: ${entry.message}`;
  const fullText = entry.stack ? `${formattedLog}\n\nStack trace:\n${entry.stack}` : formattedLog;

  try {
    await navigator.clipboard.writeText(fullText);
    return true;
  } catch {
    return false;
  }
}

/**
 * Export all logs to a file
 */
export function exportLogsToFile(format: 'json' | 'txt' = 'txt'): void {
  const entries = consoleEntriesAtom.get();

  let content: string;
  let filename: string;
  let mimeType: string;

  if (format === 'json') {
    content = JSON.stringify(entries, null, 2);
    filename = `console-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    mimeType = 'application/json';
  } else {
    content = entries
      .map((entry) => {
        const time = formatTimestamp(entry.timestamp);
        const prefix = entry.sourceName ? `[${entry.sourceName}]` : '';
        const line = `[${time}] ${entry.level.toUpperCase()} ${entry.type} ${prefix}: ${entry.message}`;
        return entry.stack ? `${line}\n  Stack: ${entry.stack}` : line;
      })
      .join('\n');
    filename = `console-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    mimeType = 'text/plain';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export filtered logs to file
 */
export function exportFilteredLogsToFile(format: 'json' | 'txt' = 'txt'): void {
  const entries = filteredEntriesAtom.get();

  let content: string;
  let filename: string;
  let mimeType: string;

  if (format === 'json') {
    content = JSON.stringify(entries, null, 2);
    filename = `console-logs-filtered-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    mimeType = 'application/json';
  } else {
    content = entries
      .map((entry) => {
        const time = formatTimestamp(entry.timestamp);
        const prefix = entry.sourceName ? `[${entry.sourceName}]` : '';
        const line = `[${time}] ${entry.level.toUpperCase()} ${entry.type} ${prefix}: ${entry.message}`;
        return entry.stack ? `${line}\n  Stack: ${entry.stack}` : line;
      })
      .join('\n');
    filename = `console-logs-filtered-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    mimeType = 'text/plain';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get CSS class for log level color
 */
export function getLevelColorClass(level: ConsoleLogLevel): string {
  switch (level) {
    case 'error':
      return 'text-red-400';
    case 'warn':
      return 'text-yellow-400';
    case 'info':
      return 'text-blue-400';
    case 'debug':
      return 'text-gray-400';
    case 'log':
    default:
      return 'text-gray-200';
  }
}

/**
 * Get CSS class for log level background
 */
export function getLevelBgClass(level: ConsoleLogLevel): string {
  switch (level) {
    case 'error':
      return 'bg-red-500/10';
    case 'warn':
      return 'bg-yellow-500/10';
    case 'info':
      return 'bg-blue-500/5';
    case 'debug':
      return 'bg-gray-500/5';
    case 'log':
    default:
      return '';
  }
}

/**
 * Get icon class for log level
 */
export function getLevelIconClass(level: ConsoleLogLevel): string {
  switch (level) {
    case 'error':
      return 'i-ph:x-circle-fill text-red-500';
    case 'warn':
      return 'i-ph:warning-fill text-yellow-500';
    case 'info':
      return 'i-ph:info-fill text-blue-500';
    case 'debug':
      return 'i-ph:bug text-gray-500';
    case 'log':
    default:
      return 'i-ph:terminal text-gray-400';
  }
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}
