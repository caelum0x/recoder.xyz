/**
 * Condensation Store
 * Manages context condensation state and history
 */

import { atom, map } from 'nanostores';

/**
 * Condensation operation info
 */
export interface CondenseInfo {
  condenseId: string;
  timestamp: Date;
  messagesCondensed: number;
  tokensSaved: number;
  summary: string;
}

/**
 * Current condensation state
 */
export type CondenseState = 'idle' | 'checking' | 'condensing' | 'complete' | 'error';

/**
 * Store for condensation state
 */
export const condenseStore = map({
  /** Current state of condensation */
  state: 'idle' as CondenseState,

  /** Whether condensation is enabled */
  enabled: true,

  /** Threshold percentage (0-100) for triggering condensation */
  threshold: 80,

  /** Last error message */
  lastError: null as string | null,

  /** Progress message during condensation */
  progressMessage: null as string | null,

  /** Current token usage percentage */
  tokenUsagePercent: 0,

  /** Whether context limit warning is showing */
  showWarning: false,
});

/**
 * History of condensation operations for the current session
 */
export const condenseHistory = atom<CondenseInfo[]>([]);

/**
 * Set condensation state
 */
export function setCondenseState(state: CondenseState, progressMessage?: string) {
  condenseStore.setKey('state', state);
  if (progressMessage !== undefined) {
    condenseStore.setKey('progressMessage', progressMessage);
  }
  if (state === 'idle' || state === 'complete') {
    condenseStore.setKey('progressMessage', null);
  }
}

/**
 * Set error state
 */
export function setCondenseError(error: string | null) {
  condenseStore.setKey('lastError', error);
  if (error) {
    condenseStore.setKey('state', 'error');
  }
}

/**
 * Update token usage percentage
 */
export function updateTokenUsage(percent: number) {
  condenseStore.setKey('tokenUsagePercent', percent);

  // Show warning when approaching threshold
  const threshold = condenseStore.get().threshold;
  const warningThreshold = threshold - 10; // Warn 10% before threshold
  condenseStore.setKey('showWarning', percent >= warningThreshold);
}

/**
 * Toggle condensation enabled
 */
export function toggleCondenseEnabled(enabled?: boolean) {
  const current = condenseStore.get().enabled;
  condenseStore.setKey('enabled', enabled !== undefined ? enabled : !current);
}

/**
 * Set condensation threshold
 */
export function setCondenseThreshold(threshold: number) {
  condenseStore.setKey('threshold', Math.max(50, Math.min(95, threshold)));
}

/**
 * Add condensation to history
 */
export function addCondenseToHistory(info: CondenseInfo) {
  const current = condenseHistory.get();
  condenseHistory.set([...current, info]);
}

/**
 * Clear condensation history
 */
export function clearCondenseHistory() {
  condenseHistory.set([]);
}

/**
 * Get condensation statistics
 */
export function getCondenseStats() {
  const history = condenseHistory.get();
  const store = condenseStore.get();

  return {
    condensationCount: history.length,
    totalMessagesCondensed: history.reduce((sum, h) => sum + h.messagesCondensed, 0),
    totalTokensSaved: history.reduce((sum, h) => sum + h.tokensSaved, 0),
    currentUsagePercent: store.tokenUsagePercent,
    isEnabled: store.enabled,
    threshold: store.threshold,
  };
}

/**
 * Reset condensation state (e.g., when starting new chat)
 */
export function resetCondenseState() {
  condenseStore.set({
    state: 'idle',
    enabled: true,
    threshold: 80,
    lastError: null,
    progressMessage: null,
    tokenUsagePercent: 0,
    showWarning: false,
  });
  condenseHistory.set([]);
}
