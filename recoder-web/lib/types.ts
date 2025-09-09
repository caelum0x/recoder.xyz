export interface PWAConfig {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  orientation: 'any' | 'natural' | 'landscape' | 'portrait';
  startUrl: string;
  scope: string;
  icons: PWAIcon[];
  serviceWorker: ServiceWorkerConfig;
  features: PWAFeatures;
  caching: CachingStrategy;
  offline: OfflineConfig;
  notifications: NotificationConfig;
}

export interface PWAIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: 'any' | 'maskable' | 'monochrome';
}

export interface ServiceWorkerConfig {
  enabled: boolean;
  fileName: string;
  workboxVersion: string;
  runtimeCaching: RuntimeCacheRule[];
  precachePatterns: string[];
  skipWaiting: boolean;
  clientsClaim: boolean;
}

export interface RuntimeCacheRule {
  urlPattern: string;
  handler: 'CacheFirst' | 'NetworkFirst' | 'StaleWhileRevalidate' | 'NetworkOnly' | 'CacheOnly';
  options: {
    cacheName?: string;
    expiration?: {
      maxEntries?: number;
      maxAgeSeconds?: number;
    };
    cacheKeyWillBeUsed?: boolean;
    networkTimeoutSeconds?: number;
  };
}

export interface PWAFeatures {
  installPrompt: boolean;
  offlineSupport: boolean;
  backgroundSync: boolean;
  pushNotifications: boolean;
  fileSystemAccess: boolean;
  cameraAccess: boolean;
  geolocation: boolean;
  webShare: boolean;
  deviceVibration: boolean;
  screenWakeLock: boolean;
}

export interface CachingStrategy {
  strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  maxCacheSize: number;
  maxAge: number;
  excludePatterns: string[];
  includePatterns: string[];
}

export interface OfflineConfig {
  enabled: boolean;
  fallbackPage: string;
  offlineAssets: string[];
  indexedDBEnabled: boolean;
  conflictResolution: 'client-wins' | 'server-wins' | 'manual';
}

export interface NotificationConfig {
  enabled: boolean;
  vapidKeys: {
    publicKey: string;
    privateKey: string;
  };
  subscriberEndpoint: string;
  defaultIcon: string;
  defaultBadge: string;
}

export interface PWAManifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  display: string;
  orientation: string;
  theme_color: string;
  background_color: string;
  scope: string;
  icons: PWAIcon[];
  categories?: string[];
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  iarc_rating_id?: string;
  prefer_related_applications?: boolean;
  related_applications?: Array<{
    platform: string;
    url?: string;
    id?: string;
  }>;
  shortcuts?: Array<{
    name: string;
    short_name?: string;
    description?: string;
    url: string;
    icons?: PWAIcon[];
  }>;
  screenshots?: Array<{
    src: string;
    sizes: string;
    type: string;
    platform?: 'wide' | 'narrow';
    label?: string;
  }>;
  edge_side_panel?: {
    preferred_width?: number;
  };
  launch_handler?: {
    client_mode?: 'auto' | 'focus-existing' | 'navigate-existing' | 'navigate-new';
  };
  protocol_handlers?: Array<{
    protocol: string;
    url: string;
  }>;
  file_handlers?: Array<{
    action: string;
    accept: Record<string, string[]>;
    icons?: PWAIcon[];
    launch_type?: 'single-client' | 'multiple-clients';
  }>;
}
