/**
 * useAutoSave Hook - Debounced auto-save functionality for the code editor
 *
 * Features:
 * - Auto-saves after 2 seconds of inactivity (configurable)
 * - Optional: Skip save if file has syntax errors
 * - Visual status feedback: idle | saving | saved | error
 * - Persisted enable/disable preference
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { fileHasErrors, errorsAtom } from '~/lib/stores/errors';

// Storage key for auto-save preference
const AUTO_SAVE_ENABLED_KEY = 'recoder_auto_save_enabled';
const AUTO_SAVE_DELAY_KEY = 'recoder_auto_save_delay';
const AUTO_SAVE_SKIP_ERRORS_KEY = 'recoder_auto_save_skip_errors';

// Default values
const DEFAULT_AUTO_SAVE_DELAY = 2000; // 2 seconds
const DEFAULT_AUTO_SAVE_ENABLED = true;
const DEFAULT_SKIP_ON_ERRORS = false;

// Save status type
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'skipped';

// Global atoms for auto-save settings (reactive across components)
export const autoSaveEnabledAtom = atom<boolean>(loadAutoSaveEnabled());
export const autoSaveDelayAtom = atom<number>(loadAutoSaveDelay());
export const autoSaveSkipErrorsAtom = atom<boolean>(loadAutoSaveSkipErrors());

// Load settings from localStorage
function loadAutoSaveEnabled(): boolean {
  if (typeof window === 'undefined') return DEFAULT_AUTO_SAVE_ENABLED;
  try {
    const stored = localStorage.getItem(AUTO_SAVE_ENABLED_KEY);
    return stored !== null ? JSON.parse(stored) : DEFAULT_AUTO_SAVE_ENABLED;
  } catch {
    return DEFAULT_AUTO_SAVE_ENABLED;
  }
}

function loadAutoSaveDelay(): number {
  if (typeof window === 'undefined') return DEFAULT_AUTO_SAVE_DELAY;
  try {
    const stored = localStorage.getItem(AUTO_SAVE_DELAY_KEY);
    return stored !== null ? JSON.parse(stored) : DEFAULT_AUTO_SAVE_DELAY;
  } catch {
    return DEFAULT_AUTO_SAVE_DELAY;
  }
}

function loadAutoSaveSkipErrors(): boolean {
  if (typeof window === 'undefined') return DEFAULT_SKIP_ON_ERRORS;
  try {
    const stored = localStorage.getItem(AUTO_SAVE_SKIP_ERRORS_KEY);
    return stored !== null ? JSON.parse(stored) : DEFAULT_SKIP_ON_ERRORS;
  } catch {
    return DEFAULT_SKIP_ON_ERRORS;
  }
}

// Save settings to localStorage
function saveAutoSaveEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTO_SAVE_ENABLED_KEY, JSON.stringify(enabled));
  } catch (e) {
    console.error('[AutoSave] Failed to save enabled setting:', e);
  }
}

function saveAutoSaveDelay(delay: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTO_SAVE_DELAY_KEY, JSON.stringify(delay));
  } catch (e) {
    console.error('[AutoSave] Failed to save delay setting:', e);
  }
}

function saveAutoSaveSkipErrors(skip: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTO_SAVE_SKIP_ERRORS_KEY, JSON.stringify(skip));
  } catch (e) {
    console.error('[AutoSave] Failed to save skip errors setting:', e);
  }
}

// Subscribe to changes and persist
autoSaveEnabledAtom.subscribe((enabled) => saveAutoSaveEnabled(enabled));
autoSaveDelayAtom.subscribe((delay) => saveAutoSaveDelay(delay));
autoSaveSkipErrorsAtom.subscribe((skip) => saveAutoSaveSkipErrors(skip));

// Export functions to update settings
export function setAutoSaveEnabled(enabled: boolean): void {
  autoSaveEnabledAtom.set(enabled);
}

export function setAutoSaveDelay(delay: number): void {
  autoSaveDelayAtom.set(Math.max(500, Math.min(10000, delay))); // Clamp between 500ms and 10s
}

export function setAutoSaveSkipErrors(skip: boolean): void {
  autoSaveSkipErrorsAtom.set(skip);
}

// Hook options interface
interface UseAutoSaveOptions {
  /** Callback to perform the save operation */
  onSave: () => Promise<void> | void;
  /** Current file path (used for error checking) */
  filePath?: string;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Whether saving is currently blocked (e.g., during streaming) */
  disabled?: boolean;
}

interface UseAutoSaveReturn {
  /** Current save status */
  status: SaveStatus;
  /** Whether auto-save is enabled */
  isEnabled: boolean;
  /** Current delay in milliseconds */
  delay: number;
  /** Whether to skip save on syntax errors */
  skipOnErrors: boolean;
  /** Toggle auto-save on/off */
  toggleAutoSave: () => void;
  /** Set auto-save enabled state */
  setEnabled: (enabled: boolean) => void;
  /** Set delay in milliseconds */
  setDelay: (delay: number) => void;
  /** Set skip on errors preference */
  setSkipOnErrors: (skip: boolean) => void;
  /** Manually trigger save (bypasses debounce) */
  saveNow: () => void;
  /** Last save timestamp */
  lastSaved: number | null;
  /** Error message if save failed */
  errorMessage: string | null;
}

/**
 * Auto-save hook with debounced saving
 */
export function useAutoSave({
  onSave,
  filePath,
  hasUnsavedChanges,
  disabled = false,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const isEnabled = useStore(autoSaveEnabledAtom);
  const delay = useStore(autoSaveDelayAtom);
  const skipOnErrors = useStore(autoSaveSkipErrorsAtom);
  const errors = useStore(errorsAtom);

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  // Perform save operation
  const performSave = useCallback(async () => {
    if (disabled || !hasUnsavedChanges) {
      return;
    }

    // Check for syntax errors if option is enabled
    if (skipOnErrors && filePath) {
      const hasErrors = fileHasErrors(filePath);
      if (hasErrors) {
        setStatus('skipped');
        // Reset to idle after a brief display
        if (statusTimeoutRef.current) {
          clearTimeout(statusTimeoutRef.current);
        }
        statusTimeoutRef.current = setTimeout(() => {
          setStatus('idle');
        }, 2000);
        return;
      }
    }

    setStatus('saving');
    setErrorMessage(null);

    try {
      await onSave();
      setStatus('saved');
      setLastSaved(Date.now());

      // Reset to idle after showing "Saved" briefly
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      statusTimeoutRef.current = setTimeout(() => {
        setStatus('idle');
      }, 2000);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save');

      // Reset to idle after showing error
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      statusTimeoutRef.current = setTimeout(() => {
        setStatus('idle');
      }, 5000);
    }
  }, [onSave, filePath, hasUnsavedChanges, disabled, skipOnErrors]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!isEnabled || disabled || !hasUnsavedChanges) {
      // Clear any pending save when disabled or no changes
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for auto-save
    timeoutRef.current = setTimeout(() => {
      performSave();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isEnabled, delay, hasUnsavedChanges, disabled, performSave]);

  // Toggle auto-save
  const toggleAutoSave = useCallback(() => {
    setAutoSaveEnabled(!isEnabled);
  }, [isEnabled]);

  // Set enabled state
  const setEnabled = useCallback((enabled: boolean) => {
    setAutoSaveEnabled(enabled);
  }, []);

  // Set delay
  const setDelayCallback = useCallback((newDelay: number) => {
    setAutoSaveDelay(newDelay);
  }, []);

  // Set skip on errors
  const setSkipOnErrorsCallback = useCallback((skip: boolean) => {
    setAutoSaveSkipErrors(skip);
  }, []);

  // Manual save (bypasses debounce)
  const saveNow = useCallback(() => {
    // Clear any pending auto-save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    performSave();
  }, [performSave]);

  return {
    status,
    isEnabled,
    delay,
    skipOnErrors,
    toggleAutoSave,
    setEnabled,
    setDelay: setDelayCallback,
    setSkipOnErrors: setSkipOnErrorsCallback,
    saveNow,
    lastSaved,
    errorMessage,
  };
}

/**
 * Hook for just reading auto-save settings (no save functionality)
 * Useful for settings panel
 */
export function useAutoSaveSettings() {
  const isEnabled = useStore(autoSaveEnabledAtom);
  const delay = useStore(autoSaveDelayAtom);
  const skipOnErrors = useStore(autoSaveSkipErrorsAtom);

  return {
    isEnabled,
    delay,
    skipOnErrors,
    setEnabled: setAutoSaveEnabled,
    setDelay: setAutoSaveDelay,
    setSkipOnErrors: setAutoSaveSkipErrors,
    toggle: () => setAutoSaveEnabled(!isEnabled),
  };
}
