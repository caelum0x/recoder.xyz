/**
 * Terminal History Persistence
 * Saves command history across sessions
 */

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
    console.error('[History] Save failed:', error);
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
    console.error('[History] Load failed:', error);
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
    console.error('[History] Clear failed:', error);
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
    console.error('[History] Import failed:', error);
  }
}
