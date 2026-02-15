/**
 * Preview Settings Store
 * Manages preview UI state like fullscreen mode, status indicator, and polling settings.
 * Uses nanostores with localStorage persistence.
 */

import { atom, computed } from 'nanostores';

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewSettings');

// Storage key for persisting preferences
const PREVIEW_SETTINGS_KEY = 'recoder_preview_settings';

/** Preview status types */
export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error' | 'polling';

/** Device quick preset (simplified for toolbar buttons) */
export type QuickDevicePreset = 'desktop' | 'tablet' | 'mobile';

/** Preview settings state */
export interface PreviewSettingsState {
  /** Whether fullscreen mode is enabled */
  isFullscreen: boolean;
  /** Current preview status */
  status: PreviewStatus;
  /** Last error message (if any) */
  lastError: string | null;
  /** Polling interval in ms (0 = disabled) */
  pollingInterval: number;
  /** Whether auto-polling is enabled */
  autoPolling: boolean;
  /** Last healthy timestamp */
  lastHealthyTime: number | null;
  /** Quick device preset */
  quickDevicePreset: QuickDevicePreset;
}

// ==================== DEVICE PRESET MAPPINGS ====================

/** Map quick presets to actual device preset IDs */
export const QUICK_PRESET_DEVICE_MAP: Record<QuickDevicePreset, string> = {
  desktop: 'desktop-1080',
  tablet: 'ipad',
  mobile: 'iphone-se',
};

/** Quick preset dimensions for display */
export const QUICK_PRESET_DIMENSIONS: Record<QuickDevicePreset, { width: number; height: number }> = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

// ==================== DEFAULT STATE ====================

const DEFAULT_STATE: PreviewSettingsState = {
  isFullscreen: false,
  status: 'idle',
  lastError: null,
  pollingInterval: 5000,
  autoPolling: true,
  lastHealthyTime: null,
  quickDevicePreset: 'desktop',
};

// ==================== LOAD/SAVE STATE ====================

function loadState(): PreviewSettingsState {
  if (typeof window === 'undefined') return DEFAULT_STATE;

  try {
    const stored = localStorage.getItem(PREVIEW_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Only persist certain fields, reset transient state
      return {
        ...DEFAULT_STATE,
        pollingInterval: parsed.pollingInterval ?? DEFAULT_STATE.pollingInterval,
        autoPolling: parsed.autoPolling ?? DEFAULT_STATE.autoPolling,
        quickDevicePreset: parsed.quickDevicePreset ?? DEFAULT_STATE.quickDevicePreset,
        // Don't persist: isFullscreen, status, lastError, lastHealthyTime
      };
    }
  } catch (e) {
    logger.error('[PreviewSettings] Failed to load state:', e);
  }

  return DEFAULT_STATE;
}

function saveState(state: PreviewSettingsState): void {
  if (typeof window === 'undefined') return;

  try {
    // Only persist certain fields
    const toSave = {
      pollingInterval: state.pollingInterval,
      autoPolling: state.autoPolling,
      quickDevicePreset: state.quickDevicePreset,
    };
    localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(toSave));
  } catch (e) {
    logger.error('[PreviewSettings] Failed to save state:', e);
  }
}

// ==================== ATOMS ====================

/** Main preview settings state */
export const previewSettingsStore = atom<PreviewSettingsState>(loadState());

// Subscribe to state changes and persist
previewSettingsStore.subscribe((state) => {
  saveState(state);
});

// ==================== COMPUTED ====================

/** Check if preview is in a loading state */
export const isPreviewLoading = computed(
  previewSettingsStore,
  (state) => state.status === 'loading' || state.status === 'polling'
);

/** Check if preview is ready */
export const isPreviewReady = computed(
  previewSettingsStore,
  (state) => state.status === 'ready'
);

/** Check if preview has an error */
export const isPreviewError = computed(
  previewSettingsStore,
  (state) => state.status === 'error'
);

/** Get status indicator color */
export const statusIndicatorColor = computed(previewSettingsStore, (state) => {
  switch (state.status) {
    case 'ready':
      return 'bg-green-500';
    case 'loading':
    case 'polling':
      return 'bg-yellow-500 animate-pulse';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
});

/** Get status label */
export const statusLabel = computed(previewSettingsStore, (state) => {
  switch (state.status) {
    case 'ready':
      return 'Live';
    case 'loading':
      return 'Loading...';
    case 'polling':
      return 'Connecting...';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
});

// ==================== ACTIONS ====================

/**
 * Toggle fullscreen mode
 */
export function toggleFullscreen(): void {
  const state = previewSettingsStore.get();
  previewSettingsStore.set({
    ...state,
    isFullscreen: !state.isFullscreen,
  });
  logger.info(`[PreviewSettings] Fullscreen: ${!state.isFullscreen}`);
}

/**
 * Set fullscreen mode explicitly
 */
export function setFullscreen(isFullscreen: boolean): void {
  const state = previewSettingsStore.get();
  previewSettingsStore.set({
    ...state,
    isFullscreen,
  });
}

/**
 * Set preview status
 */
export function setPreviewStatus(status: PreviewStatus, error?: string): void {
  const state = previewSettingsStore.get();
  const newState: PreviewSettingsState = {
    ...state,
    status,
    lastError: error ?? null,
  };

  if (status === 'ready') {
    newState.lastHealthyTime = Date.now();
  }

  previewSettingsStore.set(newState);
}

/**
 * Set quick device preset
 */
export function setQuickDevicePreset(preset: QuickDevicePreset): void {
  const state = previewSettingsStore.get();
  previewSettingsStore.set({
    ...state,
    quickDevicePreset: preset,
  });
  logger.info(`[PreviewSettings] Quick preset: ${preset}`);
}

/**
 * Set polling interval
 */
export function setPollingInterval(interval: number): void {
  const state = previewSettingsStore.get();
  previewSettingsStore.set({
    ...state,
    pollingInterval: Math.max(0, Math.min(60000, interval)),
  });
}

/**
 * Toggle auto-polling
 */
export function toggleAutoPolling(): void {
  const state = previewSettingsStore.get();
  previewSettingsStore.set({
    ...state,
    autoPolling: !state.autoPolling,
  });
}

/**
 * Reset to default state
 */
export function resetPreviewSettings(): void {
  previewSettingsStore.set(DEFAULT_STATE);
  logger.info('[PreviewSettings] Reset to defaults');
}
