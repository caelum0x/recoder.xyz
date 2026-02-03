/**
 * Error Store - Central state management for build/runtime errors
 * Uses nanostores for reactive state updates
 */

import { atom, computed, map } from 'nanostores';

// ============================================
// Types (matching backend ParsedBuildError)
// ============================================

export interface BuildError {
  id: string;
  type: 'syntax' | 'type' | 'reference' | 'module' | 'build' | 'npm' | 'runtime' | 'unknown';
  severity: 'error' | 'warning';
  message: string;
  shortMessage: string;
  filePath?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  source: 'typescript' | 'vite' | 'eslint' | 'npm' | 'runtime' | 'unknown';
  rawError: string;
  timestamp: number;
}

export interface ErrorsResponse {
  errors: BuildError[];
  hasBlockingErrors: boolean;
  devServerStatus: 'running' | 'crashed' | 'idle';
  errorCount: number;
  lastLogTimestamp: number;
}

export type ErrorsByFile = Record<string, BuildError[]>;

// ============================================
// Atoms (Reactive State)
// ============================================

/** All current build errors */
export const errorsAtom = atom<BuildError[]>([]);

/** Whether errors are blocking (prevent dev server from running) */
export const hasBlockingErrorsAtom = atom<boolean>(false);

/** Dev server status */
export const devServerStatusAtom = atom<'running' | 'crashed' | 'idle'>('idle');

/** Whether auto-fix is in progress */
export const isAutoFixingAtom = atom<boolean>(false);

/** Number of auto-fix attempts */
export const autoFixAttemptsAtom = atom<number>(0);

/** Maximum auto-fix attempts before requiring user confirmation */
export const MAX_AUTO_FIX_ATTEMPTS = 3;

/** Whether error panel is dismissed (user can dismiss but errors persist) */
export const isErrorPanelDismissedAtom = atom<boolean>(false);

/** Last time errors were updated */
export const lastErrorUpdateAtom = atom<number>(0);

/** Currently selected error (for highlighting in editor) */
export const selectedErrorAtom = atom<BuildError | null>(null);

// ============================================
// Computed Values
// ============================================

/** Errors grouped by file path */
export const errorsByFileAtom = computed(errorsAtom, (errors) => {
  const byFile: ErrorsByFile = {};

  for (const error of errors) {
    const filePath = error.filePath || '__no_file__';
    if (!byFile[filePath]) {
      byFile[filePath] = [];
    }
    byFile[filePath].push(error);
  }

  return byFile;
});

/** Total error count */
export const errorCountAtom = computed(errorsAtom, (errors) => errors.length);

/** Count of errors only (not warnings) */
export const criticalErrorCountAtom = computed(errorsAtom, (errors) =>
  errors.filter((e) => e.severity === 'error').length
);

/** Files that have errors */
export const filesWithErrorsAtom = computed(errorsAtom, (errors) => {
  const files = new Set<string>();
  for (const error of errors) {
    if (error.filePath) {
      files.add(error.filePath);
    }
  }
  return files;
});

// ============================================
// Actions
// ============================================

/**
 * Update errors from API response
 */
export function setErrors(response: ErrorsResponse): void {
  errorsAtom.set(response.errors);
  hasBlockingErrorsAtom.set(response.hasBlockingErrors);
  devServerStatusAtom.set(response.devServerStatus);
  lastErrorUpdateAtom.set(response.lastLogTimestamp);

  // Auto-show error panel when new blocking errors appear
  if (response.hasBlockingErrors && response.errors.length > 0) {
    isErrorPanelDismissedAtom.set(false);
  }
}

/**
 * Clear all errors (e.g., when build succeeds)
 */
export function clearErrors(): void {
  errorsAtom.set([]);
  hasBlockingErrorsAtom.set(false);
  devServerStatusAtom.set('running');
  autoFixAttemptsAtom.set(0);
  isErrorPanelDismissedAtom.set(false);
}

/**
 * Dismiss the error panel (errors persist but panel is hidden)
 */
export function dismissErrorPanel(): void {
  isErrorPanelDismissedAtom.set(true);
}

/**
 * Show the error panel again
 */
export function showErrorPanel(): void {
  isErrorPanelDismissedAtom.set(false);
}

/**
 * Get errors for a specific file
 */
export function getErrorsForFile(filePath: string): BuildError[] {
  const byFile = errorsByFileAtom.get();
  // Try both with and without /workspace prefix
  return byFile[filePath] || byFile[`/workspace/${filePath}`] || byFile[filePath.replace('/workspace/', '')] || [];
}

/**
 * Check if a file has errors
 */
export function fileHasErrors(filePath: string): boolean {
  return getErrorsForFile(filePath).length > 0;
}

/**
 * Get error count for a file
 */
export function getFileErrorCount(filePath: string): number {
  return getErrorsForFile(filePath).length;
}

/**
 * Set auto-fixing state
 */
export function setAutoFixing(isFixing: boolean): void {
  isAutoFixingAtom.set(isFixing);
  if (isFixing) {
    autoFixAttemptsAtom.set(autoFixAttemptsAtom.get() + 1);
  }
}

/**
 * Reset auto-fix attempts
 */
export function resetAutoFixAttempts(): void {
  autoFixAttemptsAtom.set(0);
}

/**
 * Check if more auto-fix attempts are allowed
 */
export function canAutoFix(): boolean {
  return autoFixAttemptsAtom.get() < MAX_AUTO_FIX_ATTEMPTS;
}

// ============================================
// Selectors (for components)
// ============================================

/**
 * Get the most critical error (first blocking error)
 */
export function getMostCriticalError(): BuildError | null {
  const errors = errorsAtom.get();
  return errors.find((e) => e.severity === 'error') || errors[0] || null;
}

/**
 * Get error icon based on severity
 */
export function getErrorIcon(severity: 'error' | 'warning'): string {
  return severity === 'error' ? 'i-ph:x-circle-fill' : 'i-ph:warning-fill';
}

/**
 * Get error color based on severity
 */
export function getErrorColor(severity: 'error' | 'warning'): string {
  return severity === 'error' ? 'text-red-500' : 'text-yellow-500';
}

/**
 * Get error background color based on severity
 */
export function getErrorBgColor(severity: 'error' | 'warning'): string {
  return severity === 'error' ? 'bg-red-500/10' : 'bg-yellow-500/10';
}

/**
 * Get error border color based on severity
 */
export function getErrorBorderColor(severity: 'error' | 'warning'): string {
  return severity === 'error' ? 'border-red-500/30' : 'border-yellow-500/30';
}

/**
 * Select an error (for highlighting in editor and Problems panel sync)
 */
export function selectError(error: BuildError | null): void {
  selectedErrorAtom.set(error);
}

/**
 * Clear selected error
 */
export function clearSelectedError(): void {
  selectedErrorAtom.set(null);
}
