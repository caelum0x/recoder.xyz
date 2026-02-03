/**
 * Preview Device Store
 * Manages state for mobile/responsive preview frames in the Preview panel.
 * Supports device presets, orientation toggle, zoom controls, and custom dimensions.
 */

import { atom, computed } from 'nanostores';

// Storage key for persisting preferences
const PREVIEW_DEVICE_KEY = 'recoder_preview_device';

/** Device orientation */
export type Orientation = 'portrait' | 'landscape';

/** Device frame style */
export type DeviceFrameStyle = 'iphone-notch' | 'iphone-dynamic-island' | 'iphone-home-button' | 'android-punch-hole' | 'android-pill' | 'tablet' | 'none';

/** Device preset configuration */
export interface DevicePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  deviceType: 'phone' | 'tablet' | 'desktop' | 'custom';
  /** Device pixel ratio (for display purposes) */
  pixelRatio?: number;
  /** User agent hint for the device */
  userAgent?: string;
  /** Frame style for device mockup */
  frameStyle?: DeviceFrameStyle;
  /** Device color */
  deviceColor?: 'black' | 'silver' | 'gold' | 'space-gray';
}

/** Current preview device state */
export interface PreviewDeviceState {
  /** Selected device preset ID */
  selectedDeviceId: string;
  /** Current orientation (portrait/landscape) */
  orientation: Orientation;
  /** Zoom level (0.25 to 2, where 1 = 100%) */
  zoom: number;
  /** Whether custom dimensions mode is enabled */
  customMode: boolean;
  /** Custom width (when customMode is true) */
  customWidth: number;
  /** Custom height (when customMode is true) */
  customHeight: number;
  /** Whether to show device frame/bezel */
  showFrame: boolean;
}

// ==================== DEVICE PRESETS ====================

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'responsive',
    name: 'Responsive',
    width: 0, // 0 means 100%
    height: 0,
    deviceType: 'desktop',
    frameStyle: 'none',
  },
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    width: 393,
    height: 852,
    deviceType: 'phone',
    pixelRatio: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    frameStyle: 'iphone-dynamic-island',
    deviceColor: 'space-gray',
  },
  {
    id: 'iphone-14-pro',
    name: 'iPhone 14 Pro',
    width: 393,
    height: 852,
    deviceType: 'phone',
    pixelRatio: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    frameStyle: 'iphone-dynamic-island',
    deviceColor: 'black',
  },
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    width: 375,
    height: 667,
    deviceType: 'phone',
    pixelRatio: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
    frameStyle: 'iphone-home-button',
    deviceColor: 'black',
  },
  {
    id: 'iphone-15-pro-max',
    name: 'iPhone 15 Pro Max',
    width: 430,
    height: 932,
    deviceType: 'phone',
    pixelRatio: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    frameStyle: 'iphone-dynamic-island',
    deviceColor: 'space-gray',
  },
  {
    id: 'iphone-12',
    name: 'iPhone 12/13',
    width: 390,
    height: 844,
    deviceType: 'phone',
    pixelRatio: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
    frameStyle: 'iphone-notch',
    deviceColor: 'black',
  },
  {
    id: 'ipad',
    name: 'iPad',
    width: 768,
    height: 1024,
    deviceType: 'tablet',
    pixelRatio: 2,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
    frameStyle: 'tablet',
    deviceColor: 'space-gray',
  },
  {
    id: 'ipad-pro-11',
    name: 'iPad Pro 11"',
    width: 834,
    height: 1194,
    deviceType: 'tablet',
    pixelRatio: 2,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
    frameStyle: 'tablet',
    deviceColor: 'space-gray',
  },
  {
    id: 'ipad-pro-12',
    name: 'iPad Pro 12.9"',
    width: 1024,
    height: 1366,
    deviceType: 'tablet',
    pixelRatio: 2,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
    frameStyle: 'tablet',
    deviceColor: 'space-gray',
  },
  {
    id: 'samsung-s24-ultra',
    name: 'Samsung Galaxy S24 Ultra',
    width: 384,
    height: 824,
    deviceType: 'phone',
    pixelRatio: 3,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B)',
    frameStyle: 'android-punch-hole',
    deviceColor: 'black',
  },
  {
    id: 'samsung-s21',
    name: 'Samsung Galaxy S21',
    width: 360,
    height: 800,
    deviceType: 'phone',
    pixelRatio: 3,
    userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B)',
    frameStyle: 'android-punch-hole',
    deviceColor: 'black',
  },
  {
    id: 'pixel-8',
    name: 'Pixel 8',
    width: 412,
    height: 915,
    deviceType: 'phone',
    pixelRatio: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
    frameStyle: 'android-pill',
    deviceColor: 'black',
  },
  {
    id: 'pixel-7',
    name: 'Pixel 7',
    width: 412,
    height: 915,
    deviceType: 'phone',
    pixelRatio: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
    frameStyle: 'android-punch-hole',
    deviceColor: 'black',
  },
  {
    id: 'pixel-tablet',
    name: 'Pixel Tablet',
    width: 800,
    height: 1280,
    deviceType: 'tablet',
    pixelRatio: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel Tablet)',
    frameStyle: 'tablet',
    deviceColor: 'black',
  },
  {
    id: 'samsung-tab-s9',
    name: 'Samsung Galaxy Tab S9',
    width: 800,
    height: 1280,
    deviceType: 'tablet',
    pixelRatio: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710)',
    frameStyle: 'tablet',
    deviceColor: 'black',
  },
  {
    id: 'desktop-1080',
    name: 'Desktop 1080p',
    width: 1920,
    height: 1080,
    deviceType: 'desktop',
    frameStyle: 'none',
  },
  {
    id: 'desktop-1440',
    name: 'Desktop 1440p',
    width: 2560,
    height: 1440,
    deviceType: 'desktop',
    frameStyle: 'none',
  },
  {
    id: 'custom',
    name: 'Custom',
    width: 400,
    height: 800,
    deviceType: 'custom',
    frameStyle: 'none',
  },
];

// ==================== DEFAULT STATE ====================

const DEFAULT_STATE: PreviewDeviceState = {
  selectedDeviceId: 'responsive',
  orientation: 'portrait',
  zoom: 1,
  customMode: false,
  customWidth: 400,
  customHeight: 800,
  showFrame: true,
};

// ==================== LOAD/SAVE STATE ====================

function loadState(): PreviewDeviceState {
  if (typeof window === 'undefined') return DEFAULT_STATE;

  try {
    const stored = localStorage.getItem(PREVIEW_DEVICE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch (e) {
    console.error('[PreviewDevice] Failed to load state:', e);
  }

  return DEFAULT_STATE;
}

function saveState(state: PreviewDeviceState): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(PREVIEW_DEVICE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[PreviewDevice] Failed to save state:', e);
  }
}

// ==================== ATOMS ====================

/** Main preview device state */
export const previewDeviceState = atom<PreviewDeviceState>(loadState());

// Subscribe to state changes and persist
previewDeviceState.subscribe((state) => {
  saveState(state);
});

// ==================== COMPUTED ====================

/** Get the currently selected device preset */
export const selectedDevice = computed(previewDeviceState, (state) => {
  return DEVICE_PRESETS.find((d) => d.id === state.selectedDeviceId) || DEVICE_PRESETS[0];
});

/** Get effective dimensions based on current state */
export const effectiveDimensions = computed(previewDeviceState, (state) => {
  const device = DEVICE_PRESETS.find((d) => d.id === state.selectedDeviceId) || DEVICE_PRESETS[0];

  // Responsive mode - no fixed dimensions
  if (device.id === 'responsive') {
    return { width: 0, height: 0, isResponsive: true };
  }

  // Custom mode
  if (state.customMode || device.id === 'custom') {
    const w = state.orientation === 'portrait' ? state.customWidth : state.customHeight;
    const h = state.orientation === 'portrait' ? state.customHeight : state.customWidth;
    return { width: w, height: h, isResponsive: false };
  }

  // Standard device
  const w = state.orientation === 'portrait' ? device.width : device.height;
  const h = state.orientation === 'portrait' ? device.height : device.width;
  return { width: w, height: h, isResponsive: false };
});

/** Get zoom-adjusted dimensions */
export const zoomedDimensions = computed(
  [previewDeviceState, effectiveDimensions],
  (state, dims) => {
    if (dims.isResponsive) {
      return { width: 0, height: 0, isResponsive: true };
    }
    return {
      width: Math.round(dims.width * state.zoom),
      height: Math.round(dims.height * state.zoom),
      isResponsive: false,
    };
  }
);

/** Check if current device is a phone */
export const isPhoneDevice = computed(selectedDevice, (device) => device.deviceType === 'phone');

/** Check if current device is a tablet */
export const isTabletDevice = computed(selectedDevice, (device) => device.deviceType === 'tablet');

/** Check if current device is desktop/responsive */
export const isDesktopDevice = computed(
  selectedDevice,
  (device) => device.deviceType === 'desktop' || device.id === 'responsive'
);

// ==================== ACTIONS ====================

/**
 * Select a device preset
 */
export function selectDevice(deviceId: string): void {
  const state = previewDeviceState.get();
  previewDeviceState.set({
    ...state,
    selectedDeviceId: deviceId,
    customMode: deviceId === 'custom',
  });
  console.log(`[PreviewDevice] Selected: ${deviceId}`);
}

/**
 * Toggle orientation between portrait and landscape
 */
export function toggleOrientation(): void {
  const state = previewDeviceState.get();
  const newOrientation = state.orientation === 'portrait' ? 'landscape' : 'portrait';
  previewDeviceState.set({
    ...state,
    orientation: newOrientation,
  });
  console.log(`[PreviewDevice] Orientation: ${newOrientation}`);
}

/**
 * Set orientation explicitly
 */
export function setOrientation(orientation: Orientation): void {
  const state = previewDeviceState.get();
  previewDeviceState.set({
    ...state,
    orientation,
  });
}

/**
 * Set zoom level (0.25 to 2)
 */
export function setZoom(zoom: number): void {
  const clampedZoom = Math.max(0.25, Math.min(2, zoom));
  const state = previewDeviceState.get();
  previewDeviceState.set({
    ...state,
    zoom: clampedZoom,
  });
  console.log(`[PreviewDevice] Zoom: ${Math.round(clampedZoom * 100)}%`);
}

/**
 * Zoom in by 25%
 */
export function zoomIn(): void {
  const state = previewDeviceState.get();
  setZoom(state.zoom + 0.25);
}

/**
 * Zoom out by 25%
 */
export function zoomOut(): void {
  const state = previewDeviceState.get();
  setZoom(state.zoom - 0.25);
}

/**
 * Reset zoom to 100%
 */
export function resetZoom(): void {
  setZoom(1);
}

/**
 * Set custom dimensions
 */
export function setCustomDimensions(width: number, height: number): void {
  const state = previewDeviceState.get();
  previewDeviceState.set({
    ...state,
    customWidth: Math.max(100, Math.min(4000, width)),
    customHeight: Math.max(100, Math.min(4000, height)),
    customMode: true,
    selectedDeviceId: 'custom',
  });
  console.log(`[PreviewDevice] Custom dimensions: ${width}x${height}`);
}

/**
 * Toggle device frame visibility
 */
export function toggleFrame(): void {
  const state = previewDeviceState.get();
  previewDeviceState.set({
    ...state,
    showFrame: !state.showFrame,
  });
}

/**
 * Set frame visibility explicitly
 */
export function setShowFrame(show: boolean): void {
  const state = previewDeviceState.get();
  previewDeviceState.set({
    ...state,
    showFrame: show,
  });
}

/**
 * Reset to default state
 */
export function resetPreviewDevice(): void {
  previewDeviceState.set(DEFAULT_STATE);
  console.log('[PreviewDevice] Reset to defaults');
}

/**
 * Get grouped devices for UI display
 */
export function getGroupedDevices(): Record<string, DevicePreset[]> {
  return {
    'Phones': DEVICE_PRESETS.filter((d) => d.deviceType === 'phone'),
    'Tablets': DEVICE_PRESETS.filter((d) => d.deviceType === 'tablet'),
    'Desktop': DEVICE_PRESETS.filter((d) => d.deviceType === 'desktop'),
    'Other': DEVICE_PRESETS.filter((d) => d.deviceType === 'custom' || d.id === 'responsive'),
  };
}

/**
 * Calculate scale factor to fit device in container
 */
export function calculateFitScale(
  containerWidth: number,
  containerHeight: number,
  deviceWidth: number,
  deviceHeight: number,
  padding: number = 40
): number {
  if (deviceWidth === 0 || deviceHeight === 0) return 1;

  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;

  const scaleX = availableWidth / deviceWidth;
  const scaleY = availableHeight / deviceHeight;

  // Use the smaller scale to ensure device fits
  return Math.min(scaleX, scaleY, 1); // Cap at 1 to not scale up
}
