'use client';

// PWA Initialization and Service Worker Registration
interface PWAInitOptions {
  enableNotifications?: boolean;
  enableBackgroundSync?: boolean;
  enablePerformanceMonitoring?: boolean;
  cacheStrategy?: 'networkFirst' | 'cacheFirst' | 'staleWhileRevalidate';
  debug?: boolean;
}

class PWAManager {
  private options: PWAInitOptions;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private updateAvailable = false;
  private beforeInstallPrompt: any = null;

  constructor(options: PWAInitOptions = {}) {
    this.options = {
      enableNotifications: true,
      enableBackgroundSync: true,
      enablePerformanceMonitoring: true,
      cacheStrategy: 'networkFirst',
      debug: process.env.NODE_ENV === 'development',
      ...options
    };
  }

  // Initialize PWA features
  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Register service worker
      await this.registerServiceWorker();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Initialize performance monitoring
      if (this.options.enablePerformanceMonitoring) {
        this.initPerformanceMonitoring();
      }

      // Check for notifications permission
      if (this.options.enableNotifications) {
        this.checkNotificationPermission();
      }

      this.log('PWA initialized successfully');
    } catch (error) {
      console.error('PWA initialization failed:', error);
    }
  }

  // Register service worker
  private async registerServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });

        this.log('Service Worker registered:', this.swRegistration.scope);

        // Listen for updates
        this.swRegistration.addEventListener('updatefound', () => {
          const installingWorker = this.swRegistration?.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.updateAvailable = true;
                this.notifyUpdateAvailable();
              }
            };
          }
        });

      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  // Setup PWA event listeners
  private setupEventListeners(): void {
    // Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.beforeInstallPrompt = e;
      this.log('Install prompt captured');
    });

    // App installed
    window.addEventListener('appinstalled', () => {
      this.beforeInstallPrompt = null;
      this.log('PWA was installed');
      this.trackInstallation();
    });

    // Online/offline events
    window.addEventListener('online', () => {
      this.log('Back online');
      this.syncWhenOnline();
    });

    window.addEventListener('offline', () => {
      this.log('Gone offline');
    });

    // Service worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });
    }

    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkForUpdates();
      }
    });
  }

  // Handle service worker messages
  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data || {};

    switch (type) {
      case 'SERVICE_WORKER_ACTIVATED':
        this.log('Service Worker activated:', data.version);
        break;
      case 'BACKGROUND_SYNC_SUCCESS':
        this.log('Background sync successful:', data.url);
        this.showNotification('Sync Complete', 'Your changes have been synchronized');
        break;
      case 'BACKGROUND_SYNC_FAILED':
        this.log('Background sync failed:', data.url, data.error);
        break;
      case 'PERFORMANCE_METRICS':
        this.handlePerformanceMetrics(data);
        break;
      case 'CACHES_CLEARED':
        this.log('Caches cleared');
        break;
    }
  }

  // Initialize performance monitoring
  private initPerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      // Monitor Core Web Vitals
      this.observeWebVitals();
      
      // Monitor resource loading
      this.observeResourceTiming();
      
      // Monitor navigation timing
      this.observeNavigationTiming();
    }
  }

  // Observe Core Web Vitals
  private observeWebVitals(): void {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        this.sendMetricToAPI(entry.name, entry.value, entry);
      });
    });

    // Observe paint and layout shift metrics
    observer.observe({ entryTypes: ['paint', 'layout-shift'] });

    // Observe largest contentful paint
    try {
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      // Not supported in all browsers
    }

    // Observe first input delay
    try {
      observer.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      // Not supported in all browsers
    }
  }

  // Observe resource timing
  private observeResourceTiming(): void {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.name.includes('recoder.xyz')) {
          this.sendResourceMetric(entry as PerformanceResourceTiming);
        }
      });
    });

    observer.observe({ entryTypes: ['resource'] });
  }

  // Observe navigation timing
  private observeNavigationTiming(): void {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.sendNavigationMetric(navigation);
      }
    });
  }

  // Send performance metrics to API
  private async sendMetricToAPI(name: string, value: number, entry: any): Promise<void> {
    try {
      await fetch('/api/pwa/performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          metrics: [{
            name,
            value,
            url: window.location.href,
            timestamp: Date.now(),
            connection: (navigator as any).connection?.effectiveType || 'unknown',
            deviceMemory: (navigator as any).deviceMemory || 'unknown',
            entry
          }],
          userAgent: navigator.userAgent
        })
      });
    } catch (error) {
      this.log('Failed to send performance metric:', error);
    }
  }

  // Send resource performance metrics
  private sendResourceMetric(entry: PerformanceResourceTiming): void {
    const metric = {
      name: 'resource-timing',
      value: entry.duration,
      resourceType: this.getResourceType(entry.name),
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      timestamp: Date.now()
    };

    this.sendMetricToAPI('resource-timing', entry.duration, metric);
  }

  // Send navigation performance metrics
  private sendNavigationMetric(entry: PerformanceNavigationTiming): void {
    const metrics = {
      'dom-content-loaded': entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
      'dom-complete': entry.domComplete - entry.navigationStart,
      'load-complete': entry.loadEventEnd - entry.loadEventStart,
      'first-byte': entry.responseStart - entry.requestStart,
      'dns-lookup': entry.domainLookupEnd - entry.domainLookupStart,
      'tcp-connect': entry.connectEnd - entry.connectStart
    };

    Object.entries(metrics).forEach(([name, value]) => {
      this.sendMetricToAPI(name, value, { type: 'navigation' });
    });
  }

  // Get resource type from URL
  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.includes('.png') || url.includes('.jpg') || url.includes('.svg')) return 'image';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  // Handle performance metrics from service worker
  private handlePerformanceMetrics(data: any): void {
    this.log('Performance metrics received:', data);
    
    // Update UI if performance component is mounted
    window.dispatchEvent(new CustomEvent('pwa-performance-update', {
      detail: data
    }));
  }

  // Check notification permission
  private checkNotificationPermission(): void {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        // Don't prompt immediately, let user choose
        this.log('Notification permission not requested yet');
      } else if (Notification.permission === 'granted') {
        this.log('Notifications enabled');
      } else {
        this.log('Notifications denied');
      }
    }
  }

  // Show notification
  private showNotification(title: string, body: string, options: NotificationOptions = {}): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/icons/manifest-icon-192.png',
        badge: '/icons/badge-72x72.png',
        ...options
      });
    }
  }

  // Check for app updates
  private async checkForUpdates(): Promise<void> {
    if (this.swRegistration) {
      try {
        await this.swRegistration.update();
      } catch (error) {
        this.log('Update check failed:', error);
      }
    }
  }

  // Notify about available update
  private notifyUpdateAvailable(): void {
    this.log('App update available');
    
    window.dispatchEvent(new CustomEvent('pwa-update-available', {
      detail: { updateAvailable: true }
    }));
  }

  // Sync data when back online
  private syncWhenOnline(): void {
    if (this.options.enableBackgroundSync && this.swRegistration) {
      // Trigger background sync
      this.swRegistration.sync?.register('recoder-background-sync').catch(() => {
        // Background sync not supported
        this.log('Background sync not supported');
      });
    }
  }

  // Track installation
  private trackInstallation(): void {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event: 'pwa_installed',
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        platform: navigator.platform
      })
    }).catch(error => {
      this.log('Failed to track installation:', error);
    });
  }

  // Public methods
  
  // Install the app
  async installApp(): Promise<boolean> {
    if (this.beforeInstallPrompt) {
      try {
        await this.beforeInstallPrompt.prompt();
        const result = await this.beforeInstallPrompt.userChoice;
        this.beforeInstallPrompt = null;
        return result.outcome === 'accepted';
      } catch (error) {
        this.log('Installation failed:', error);
        return false;
      }
    }
    return false;
  }

  // Update the app
  async updateApp(): Promise<void> {
    if (this.swRegistration?.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }

  // Enable notifications
  async enableNotifications(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  // Get cache statistics
  async getCacheStats(): Promise<any> {
    return new Promise((resolve) => {
      if (!this.swRegistration?.active) {
        resolve(null);
        return;
      }

      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      this.swRegistration.active.postMessage(
        { type: 'GET_CACHE_STATS' },
        [messageChannel.port2]
      );
    });
  }

  // Clear all caches
  async clearCaches(): Promise<void> {
    if (this.swRegistration?.active) {
      this.swRegistration.active.postMessage({ type: 'CLEAR_CACHE' });
    }
  }

  // Get app status
  getStatus(): any {
    return {
      isInstalled: window.matchMedia('(display-mode: standalone)').matches,
      canInstall: !!this.beforeInstallPrompt,
      updateAvailable: this.updateAvailable,
      swRegistered: !!this.swRegistration,
      swActive: !!this.swRegistration?.active,
      notificationsEnabled: 'Notification' in window && Notification.permission === 'granted',
      isOnline: navigator.onLine
    };
  }

  // Logging helper
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[PWA]', ...args);
    }
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  // Initialize on next tick to allow for setup
  setTimeout(() => {
    pwaManager.init().catch(console.error);
  }, 0);
}

export default PWAManager;