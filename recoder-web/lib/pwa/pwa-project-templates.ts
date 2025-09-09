import { PWAConfig } from '@/lib/types';

export interface PWAProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: 'web' | 'mobile' | 'enterprise';
  complexity: 'simple' | 'medium' | 'complex' | 'enterprise';
  features: string[];
  pwaConfig: Partial<PWAConfig>;
  estimatedTime: string;
  technologies: string[];
}

export const PWA_PROJECT_TEMPLATES: PWAProjectTemplate[] = [
  {
    id: 'pwa-basic',
    name: 'Basic Progressive Web App',
    description: 'Simple PWA with offline support and install prompt',
    category: 'web',
    complexity: 'simple',
    features: ['Offline Support', 'Install Prompt', 'Service Worker', 'Web App Manifest'],
    estimatedTime: '2-4 hours',
    technologies: ['HTML5', 'CSS3', 'JavaScript', 'Service Worker', 'Web App Manifest'],
    pwaConfig: {
      display: 'standalone',
      orientation: 'any',
      features: {
        installPrompt: true,
        offlineSupport: true,
        backgroundSync: false,
        pushNotifications: false,
        fileSystemAccess: false,
        cameraAccess: false,
        geolocation: false,
        webShare: true,
        deviceVibration: false,
        screenWakeLock: false
      },
      serviceWorker: {
        enabled: true,
        fileName: 'sw.js',
        workboxVersion: '7.0.0',
        runtimeCaching: [],
        precachePatterns: ['/', '/manifest.json'],
        skipWaiting: true,
        clientsClaim: true
      },
      caching: {
        strategy: 'stale-while-revalidate',
        maxCacheSize: 50,
        maxAge: 86400,
        excludePatterns: [],
        includePatterns: ['/static/**']
      },
      offline: {
        enabled: true,
        fallbackPage: '/offline',
        offlineAssets: [],
        indexedDBEnabled: false,
        conflictResolution: 'client-wins'
      }
    }
  },
  {
    id: 'pwa-advanced',
    name: 'Advanced Progressive Web App',
    description: 'Feature-rich PWA with push notifications, background sync, and advanced offline capabilities',
    category: 'web',
    complexity: 'medium',
    features: ['Advanced Offline', 'Push Notifications', 'Background Sync', 'IndexedDB', 'File System Access'],
    estimatedTime: '1-2 days',
    technologies: ['HTML5', 'CSS3', 'JavaScript', 'Service Worker', 'Web App Manifest', 'IndexedDB', 'WebRTC'],
    pwaConfig: {
      display: 'standalone',
      orientation: 'any',
      features: {
        installPrompt: true,
        offlineSupport: true,
        backgroundSync: true,
        pushNotifications: true,
        fileSystemAccess: true,
        cameraAccess: false,
        geolocation: true,
        webShare: true,
        deviceVibration: true,
        screenWakeLock: false
      },
      serviceWorker: {
        enabled: true,
        fileName: 'sw.js',
        workboxVersion: '7.0.0',
        runtimeCaching: [
          {
            urlPattern: '/api/**',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 3600
              },
              networkTimeoutSeconds: 5
            }
          }
        ],
        precachePatterns: ['/', '/manifest.json', '/static/**'],
        skipWaiting: true,
        clientsClaim: true
      },
      caching: {
        strategy: 'network-first',
        maxCacheSize: 100,
        maxAge: 86400,
        excludePatterns: ['/api/admin/**'],
        includePatterns: ['/api/**', '/static/**']
      },
      offline: {
        enabled: true,
        fallbackPage: '/offline',
        offlineAssets: ['/css/app.css', '/js/app.js'],
        indexedDBEnabled: true,
        conflictResolution: 'client-wins'
      },
      notifications: {
        enabled: true,
        vapidKeys: {
          publicKey: '',
          privateKey: ''
        },
        subscriberEndpoint: '/api/notifications/subscribe',
        defaultIcon: '/icons/notification-icon.png',
        defaultBadge: '/icons/notification-badge.png'
      }
    }
  },
  {
    id: 'pwa-enterprise',
    name: 'Enterprise Progressive Web App',
    description: 'Full-featured enterprise PWA with all advanced capabilities and security features',
    category: 'enterprise',
    complexity: 'enterprise',
    features: ['Enterprise Security', 'Advanced Analytics', 'Multi-platform Support', 'Team Collaboration', 'Custom Branding'],
    estimatedTime: '1-2 weeks',
    technologies: ['TypeScript', 'React', 'Service Worker', 'Web App Manifest', 'IndexedDB', 'WebRTC', 'WebAssembly'],
    pwaConfig: {
      display: 'standalone',
      orientation: 'any',
      features: {
        installPrompt: true,
        offlineSupport: true,
        backgroundSync: true,
        pushNotifications: true,
        fileSystemAccess: true,
        cameraAccess: true,
        geolocation: true,
        webShare: true,
        deviceVibration: true,
        screenWakeLock: true
      },
      serviceWorker: {
        enabled: true,
        fileName: 'sw.js',
        workboxVersion: '7.0.0',
        runtimeCaching: [
          {
            urlPattern: '/api/**',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 1800
              },
              networkTimeoutSeconds: 3
            }
          },
          {
            urlPattern: '/assets/**',
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 86400
              }
            }
          }
        ],
        precachePatterns: ['/', '/manifest.json', '/static/**', '/assets/**'],
        skipWaiting: true,
        clientsClaim: true
      },
      caching: {
        strategy: 'stale-while-revalidate',
        maxCacheSize: 200,
        maxAge: 43200,
        excludePatterns: ['/api/admin/**', '/api/auth/**'],
        includePatterns: ['/api/**', '/static/**', '/assets/**']
      },
      offline: {
        enabled: true,
        fallbackPage: '/offline',
        offlineAssets: ['/css/app.css', '/js/app.js', '/fonts/**'],
        indexedDBEnabled: true,
        conflictResolution: 'manual'
      },
      notifications: {
        enabled: true,
        vapidKeys: {
          publicKey: '',
          privateKey: ''
        },
        subscriberEndpoint: '/api/notifications/subscribe',
        defaultIcon: '/icons/notification-icon.png',
        defaultBadge: '/icons/notification-badge.png'
      }
    }
  },
  {
    id: 'pwa-mobile-first',
    name: 'Mobile-First Progressive Web App',
    description: 'Mobile-optimized PWA with native app-like experience and device integrations',
    category: 'mobile',
    complexity: 'medium',
    features: ['Mobile Optimization', 'Device APIs', 'Touch Gestures', 'Camera Integration', 'Native Styling'],
    estimatedTime: '3-5 days',
    technologies: ['HTML5', 'CSS3', 'JavaScript', 'Service Worker', 'Web App Manifest', 'Camera API', 'Geolocation API'],
    pwaConfig: {
      display: 'fullscreen',
      orientation: 'portrait',
      features: {
        installPrompt: true,
        offlineSupport: true,
        backgroundSync: true,
        pushNotifications: true,
        fileSystemAccess: false,
        cameraAccess: true,
        geolocation: true,
        webShare: true,
        deviceVibration: true,
        screenWakeLock: true
      },
      serviceWorker: {
        enabled: true,
        fileName: 'sw.js',
        workboxVersion: '7.0.0',
        runtimeCaching: [
          {
            urlPattern: '/api/mobile/**',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mobile-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 1800
              },
              networkTimeoutSeconds: 5
            }
          }
        ],
        precachePatterns: ['/', '/manifest.json', '/mobile/**'],
        skipWaiting: true,
        clientsClaim: true
      },
      caching: {
        strategy: 'cache-first',
        maxCacheSize: 75,
        maxAge: 86400,
        excludePatterns: ['/api/real-time/**'],
        includePatterns: ['/api/mobile/**', '/static/**']
      },
      offline: {
        enabled: true,
        fallbackPage: '/offline',
        offlineAssets: ['/mobile/css/app.css', '/mobile/js/app.js'],
        indexedDBEnabled: true,
        conflictResolution: 'client-wins'
      },
      notifications: {
        enabled: true,
        vapidKeys: {
          publicKey: '',
          privateKey: ''
        },
        subscriberEndpoint: '/api/notifications/mobile/subscribe',
        defaultIcon: '/icons/mobile-notification-icon.png',
        defaultBadge: '/icons/mobile-notification-badge.png'
      }
    }
  }
];

export function getPWATemplateById(id: string): PWAProjectTemplate | undefined {
  return PWA_PROJECT_TEMPLATES.find(template => template.id === id);
}

export function getPWATemplatesByCategory(category: 'web' | 'mobile' | 'enterprise'): PWAProjectTemplate[] {
  return PWA_PROJECT_TEMPLATES.filter(template => template.category === category);
}

export function getPWATemplatesByComplexity(complexity: 'simple' | 'medium' | 'complex' | 'enterprise'): PWAProjectTemplate[] {
  return PWA_PROJECT_TEMPLATES.filter(template => template.complexity === complexity);
}
