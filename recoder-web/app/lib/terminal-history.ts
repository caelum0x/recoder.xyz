/**
 * Terminal History Persistence
 * Saves command history across sessions
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TerminalHistory');

const HISTORY_KEY_PREFIX = 'terminal_history_';
const MAX_HISTORY_SIZE = 1000;

export interface HistoryEntry {
  command: string;
  timestamp: number;
  projectId: string;
}

/**
 * Save command to history
 */
export function saveToHistory(projectId: string, command: string): void {
  if (!command.trim()) return;
  
  const history = getHistory(projectId);
  history.push({
    command: command.trim(),
    timestamp: Date.now(),
    projectId,
  });
  
  // Keep only last MAX_HISTORY_SIZE entries
  const trimmed = history.slice(-MAX_HISTORY_SIZE);
  
  try {
    localStorage.setItem(
      `${HISTORY_KEY_PREFIX}${projectId}`,
      JSON.stringify(trimmed)
    );
  } catch (error) {
    logger.error('[History] Save failed:', error);
  }
}

/**
 * Get command history for project
 */
export function getHistory(projectId: string): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(`${HISTORY_KEY_PREFIX}${projectId}`);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error('[History] Load failed:', error);
    return [];
  }
}

/**
 * Get command strings only (for terminal history navigation)
 */
export function getCommandHistory(projectId: string): string[] {
  return getHistory(projectId).map(entry => entry.command);
}

/**
 * Clear history for project
 */
export function clearHistory(projectId: string): void {
  try {
    localStorage.removeItem(`${HISTORY_KEY_PREFIX}${projectId}`);
  } catch (error) {
    logger.error('[History] Clear failed:', error);
  }
}

/**
 * Search history
 */
export function searchHistory(projectId: string, query: string): HistoryEntry[] {
  const history = getHistory(projectId);
  const lowerQuery = query.toLowerCase();

  return history.filter(entry =>
    entry.command.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Search history with reverse index (for Ctrl+R style search)
 * Returns matches in reverse order (most recent first) with their original index
 */
export function searchHistoryReverse(projectId: string, query: string): Array<HistoryEntry & { index: number }> {
  const history = getHistory(projectId);
  const lowerQuery = query.toLowerCase();

  const results: Array<HistoryEntry & { index: number }> = [];

  // Search from end to beginning (most recent first)
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].command.toLowerCase().includes(lowerQuery)) {
      results.push({ ...history[i], index: i });
    }
  }

  return results;
}

/**
 * Get unique commands from history (deduped, most recent first)
 */
export function getUniqueCommands(projectId: string, limit: number = 50): string[] {
  const history = getHistory(projectId);
  const seen = new Set<string>();
  const unique: string[] = [];

  // Start from most recent
  for (let i = history.length - 1; i >= 0 && unique.length < limit; i--) {
    const cmd = history[i].command;
    if (!seen.has(cmd)) {
      seen.add(cmd);
      unique.push(cmd);
    }
  }

  return unique;
}

/**
 * Get frequently used commands
 */
export function getFrequentCommands(projectId: string, limit: number = 10): Array<{ command: string; count: number }> {
  const history = getHistory(projectId);
  const counts = new Map<string, number>();

  for (const entry of history) {
    counts.set(entry.command, (counts.get(entry.command) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Export history to file
 */
export function exportHistory(projectId: string): string {
  const history = getHistory(projectId);
  return history.map(entry => entry.command).join('\n');
}

/**
 * Import history from file
 */
export function importHistory(projectId: string, content: string): void {
  const commands = content.split('\n').filter(Boolean);
  const history = getHistory(projectId);
  
  const newEntries: HistoryEntry[] = commands.map(command => ({
    command: command.trim(),
    timestamp: Date.now(),
    projectId,
  }));
  
  const combined = [...history, ...newEntries].slice(-MAX_HISTORY_SIZE);
  
  try {
    localStorage.setItem(
      `${HISTORY_KEY_PREFIX}${projectId}`,
      JSON.stringify(combined)
    );
  } catch (error) {
    logger.error('[History] Import failed:', error);
  }
}
