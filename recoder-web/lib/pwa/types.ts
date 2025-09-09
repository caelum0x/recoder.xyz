// PWA Configuration Types
export interface PWAConfig {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  orientation: 'any' | 'natural' | 'landscape' | 'portrait';
  scope: string;
  startUrl: string;
  icons: PWAIcon[];
  shortcuts?: PWAShortcut[];
  categories?: string[];
  screenshots?: PWAScreenshot[];
  relatedApplications?: PWARelatedApp[];
  preferRelatedApplications?: boolean;
  shareTarget?: PWAShareTarget;
  fileHandler?: PWAFileHandler[];
  protocolHandlers?: PWAProtocolHandler[];
  cachingStrategy: 'networkFirst' | 'cacheFirst' | 'staleWhileRevalidate';
  offlinePages?: string[];
  precacheResources?: string[];
  runtimeCaching?: PWARuntimeCaching[];
  backgroundSync?: PWABackgroundSyncConfig;
  pushNotifications?: PWAPushConfig;
  webAppCapabilities?: PWACapabilities;
}

export interface PWAIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: 'any' | 'maskable' | 'monochrome';
}

export interface PWAShortcut {
  name: string;
  short_name?: string;
  description?: string;
  url: string;
  icons?: PWAIcon[];
}

export interface PWAScreenshot {
  src: string;
  sizes: string;
  type: string;
  platform?: 'wide' | 'narrow';
  label?: string;
}

export interface PWARelatedApp {
  platform: string;
  url: string;
  id?: string;
}

export interface PWAShareTarget {
  action: string;
  method?: 'GET' | 'POST';
  enctype?: 'application/x-www-form-urlencoded' | 'multipart/form-data';
  params: {
    title?: string;
    text?: string;
    url?: string;
    files?: PWAShareTargetFile[];
  };
}

export interface PWAShareTargetFile {
  name: string;
  accept: string[];
}

export interface PWAFileHandler {
  action: string;
  accept: {
    [mimeType: string]: string[];
  };
  icons?: PWAIcon[];
  launch_type?: 'single-client' | 'multiple-clients';
}

export interface PWAProtocolHandler {
  protocol: string;
  url: string;
}

export interface PWARuntimeCaching {
  urlPattern: string | RegExp;
  handler: 'CacheFirst' | 'NetworkFirst' | 'NetworkOnly' | 'CacheOnly' | 'StaleWhileRevalidate';
  options?: {
    cacheName?: string;
    expiration?: {
      maxEntries?: number;
      maxAgeSeconds?: number;
    };
    cacheKeyWillBeUsed?: string;
    cacheWillUpdate?: string;
    fetchDidFail?: string;
    fetchDidSucceed?: string;
    requestWillFetch?: string;
  };
}

export interface PWABackgroundSyncConfig {
  enabled: boolean;
  syncActions: PWASyncAction[];
  maxRetries?: number;
  retryDelay?: number;
}

export interface PWASyncAction {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  queue: string;
}

export interface PWAPushConfig {
  enabled: boolean;
  vapidKeys: {
    publicKey: string;
    privateKey: string;
    subject: string;
  };
  notificationOptions: {
    icon?: string;
    badge?: string;
    vibrate?: number[];
    silent?: boolean;
    requireInteraction?: boolean;
    actions?: PWANotificationAction[];
  };
}

export interface PWANotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface PWACapabilities {
  contactPicker?: boolean;
  deviceMemory?: boolean;
  geolocation?: boolean;
  mediaDevices?: boolean;
  notifications?: boolean;
  paymentRequest?: boolean;
  permissions?: boolean;
  persistentStorage?: boolean;
  wakeLock?: boolean;
  webShare?: boolean;
  webShareTarget?: boolean;
}

// Service Worker Configuration
export interface ServiceWorkerConfig {
  cacheName: string;
  cacheVersion: string;
  staticCacheUrls: string[];
  apiCacheRules: PWARuntimeCaching[];
  offlinePages: string[];
  backgroundSync: PWABackgroundSyncConfig;
  pushNotifications: PWAPushConfig;
  performanceMonitoring: boolean;
  debugMode: boolean;
}

// Manifest Builder Configuration
export interface ManifestBuilderConfig {
  base: PWAConfig;
  customizations?: {
    dynamicColors?: boolean;
    userPreferences?: boolean;
    adaptiveIcons?: boolean;
    languageSupport?: string[];
  };
}

// Offline Manager Configuration
export interface OfflineManagerConfig {
  cacheStrategies: {
    [key: string]: 'networkFirst' | 'cacheFirst' | 'staleWhileRevalidate';
  };
  offlinePages: string[];
  backgroundSync: PWABackgroundSyncConfig;
  storageQuota: number;
  cleanupStrategy: {
    maxAge: number;
    maxEntries: number;
  };
}

// Notification Service Configuration
export interface NotificationServiceConfig {
  vapidKeys: PWAPushConfig['vapidKeys'];
  defaultOptions: PWAPushConfig['notificationOptions'];
  subscriptionEndpoint: string;
  broadcastChannel?: string;
  templates: PWANotificationTemplate[];
}

export interface PWANotificationTemplate {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  actions?: PWANotificationAction[];
  data?: any;
}

// Install Prompt Configuration
export interface InstallPromptConfig {
  autoShow: boolean;
  showDelay: number;
  minVisits: number;
  daysToWaitBeforeShowing: number;
  customPrompt?: {
    title: string;
    message: string;
    installButtonText: string;
    cancelButtonText: string;
  };
  triggers: InstallPromptTrigger[];
  analytics: {
    trackShows: boolean;
    trackInstalls: boolean;
    trackDismissals: boolean;
  };
}

export interface InstallPromptTrigger {
  type: 'pageVisit' | 'timeSpent' | 'scrollDepth' | 'userAction';
  value: any;
  conditions?: any;
}

// PWA Analytics Events
export interface PWAAnalyticsEvent {
  event: string;
  category: 'pwa';
  action: string;
  label?: string;
  value?: number;
  custom_parameters?: {
    pwa_version?: string;
    cache_strategy?: string;
    offline_usage?: boolean;
    performance_score?: number;
    installation_source?: string;
  };
}

// Legacy types for compatibility with existing generators
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
  dir?: string;
  prefer_related_applications?: boolean;
  shortcuts?: PWAShortcut[];
  file_handlers?: PWAFileHandler[];
  protocol_handlers?: PWAProtocolHandler[];
  launch_handler?: {
    client_mode: string;
  };
  screenshots?: PWAScreenshot[];
}

// Extended PWAConfig to match generator expectations
export interface ExtendedPWAConfig extends PWAConfig {
  features: {
    installPrompt: boolean;
    fileSystemAccess: boolean;
    webShare: boolean;
  };
  offline: {
    enabled: boolean;
    conflictResolution: 'client-wins' | 'server-wins' | 'manual';
  };
  notifications: {
    enabled: boolean;
    vapidKeys: {
      publicKey: string;
      privateKey?: string;
      subject?: string;
    };
    subscriberEndpoint: string;
    defaultIcon: string;
    defaultBadge: string;
  };
}