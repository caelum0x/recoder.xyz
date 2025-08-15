/**
 * Professional Preload Script
 * Secure bridge between main process and renderer with comprehensive API
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose professional API to renderer process
contextBridge.exposeInMainWorld('recoderAPI', {
  // Application management
  app: {
    getState: () => ipcRenderer.invoke('app:get-state'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    
    // Event listeners
    onStateUpdate: (callback) => {
      ipcRenderer.on('app:state-update', callback);
      return () => ipcRenderer.removeListener('app:state-update', callback);
    },
    onNavigate: (callback) => {
      ipcRenderer.on('app:navigate', callback);
      return () => ipcRenderer.removeListener('app:navigate', callback);
    }
  },
  
  // Service management
  services: {
    getAll: () => ipcRenderer.invoke('services:get-all'),
    getStatus: () => ipcRenderer.invoke('services:get-status'),
    discover: () => ipcRenderer.invoke('services:discover'),
    healthCheck: (serviceId) => ipcRenderer.invoke('services:health-check', serviceId),
    
    // Event listeners
    onDiscoveryComplete: (callback) => {
      ipcRenderer.on('services:discovery-complete', callback);
      return () => ipcRenderer.removeListener('services:discovery-complete', callback);
    },
    onServiceDiscovered: (callback) => {
      ipcRenderer.on('services:service-discovered', callback);
      return () => ipcRenderer.removeListener('services:service-discovered', callback);
    },
    onServiceUnhealthy: (callback) => {
      ipcRenderer.on('services:service-unhealthy', callback);
      return () => ipcRenderer.removeListener('services:service-unhealthy', callback);
    },
    onHealthSummary: (callback) => {
      ipcRenderer.on('services:health-summary', callback);
      return () => ipcRenderer.removeListener('services:health-summary', callback);
    }
  },
  
  // Application loading
  apps: {
    load: (appName, options = {}) => ipcRenderer.invoke('app:load', appName, options),
    
    // Predefined app loaders
    loadChat: (options = {}) => ipcRenderer.invoke('app:load', 'recoder-chat', options),
    loadWeb: (options = {}) => ipcRenderer.invoke('app:load', 'recoder-web', options),
    loadExtension: (options = {}) => ipcRenderer.invoke('app:load', 'recoder-extension', options),
    
    // Panel loaders
    loadOfflineAI: () => ipcRenderer.invoke('app:load', 'offline-ai'),
    loadSettings: () => ipcRenderer.invoke('app:load', 'settings'),
    loadDashboard: () => ipcRenderer.invoke('app:load', 'dashboard')
  },
  
  // Authentication
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:get-status'),
    
    // Event listeners for auth state changes
    onStatusChange: (callback) => {
      ipcRenderer.on('auth:status-change', callback);
      return () => ipcRenderer.removeListener('auth:status-change', callback);
    },
    onLoginRequired: (callback) => {
      ipcRenderer.on('auth:login-required', callback);
      return () => ipcRenderer.removeListener('auth:login-required', callback);
    }
  },
  
  // Auto-update system
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    
    // Event listeners
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update:available', callback);
      return () => ipcRenderer.removeListener('update:available', callback);
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update:downloaded', callback);
      return () => ipcRenderer.removeListener('update:downloaded', callback);
    }
  },
  
  // Offline AI capabilities
  ai: {
    checkOllamaStatus: () => ipcRenderer.invoke('ai:check-ollama-status'),
    generateCode: (options) => ipcRenderer.invoke('ai:generate-code-offline', options),
    listModels: () => ipcRenderer.invoke('ai:list-ollama-models'),
    pullModel: (modelName) => ipcRenderer.invoke('ai:pull-ollama-model', modelName),
    
    // Event listeners
    onModelUpdate: (callback) => {
      ipcRenderer.on('ai:model-update', callback);
      return () => ipcRenderer.removeListener('ai:model-update', callback);
    }
  },
  
  // Utility functions
  utils: {
    // Generate unique IDs
    generateId: () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    
    // Format time
    formatTime: (timestamp) => new Date(timestamp).toLocaleString(),
    
    // Format bytes
    formatBytes: (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // Debounce function
    debounce: (func, wait) => {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },
    
    // Throttle function
    throttle: (func, limit) => {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }
  },
  
  // Debug and development helpers
  dev: {
    isDevMode: () => process.env.NODE_ENV === 'development',
    log: (...args) => console.log('[Recoder Desktop]', ...args),
    warn: (...args) => console.warn('[Recoder Desktop]', ...args),
    error: (...args) => console.error('[Recoder Desktop]', ...args),
    
    // Performance monitoring
    mark: (name) => performance.mark(name),
    measure: (name, startMark, endMark) => performance.measure(name, startMark, endMark),
    getEntriesByType: (type) => performance.getEntriesByType(type)
  },
  
  // Constants and configuration
  constants: {
    APP_NAME: 'Recoder Desktop',
    APP_VERSION: '1.0.0',
    SERVICE_CATEGORIES: {
      WEB_APP: 'web-app',
      API: 'api',
      AI_SERVICE: 'ai-service',
      DEV_SERVER: 'dev-server'
    },
    STATUS_TYPES: {
      HEALTHY: 'healthy',
      DEGRADED: 'degraded',
      UNHEALTHY: 'unhealthy',
      OFFLINE: 'offline'
    },
    PANEL_TYPES: {
      DASHBOARD: 'dashboard',
      SETTINGS: 'settings',
      OFFLINE_AI: 'offline-ai'
    }
  }
});

// Legacy API for backward compatibility
contextBridge.exposeInMainWorld('electronAPI', {
  loadApp: (appName) => ipcRenderer.invoke('app:load', appName),
  getAppList: () => ipcRenderer.invoke('services:get-all'),
  checkOllamaStatus: () => ipcRenderer.invoke('ai:check-ollama-status'),
  generateCodeOffline: (options) => ipcRenderer.invoke('ai:generate-code-offline', options),
  listOllamaModels: () => ipcRenderer.invoke('ai:list-ollama-models'),
  pullOllamaModel: (modelName) => ipcRenderer.invoke('ai:pull-ollama-model', modelName),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url)
});

// Performance monitoring
window.addEventListener('load', () => {
  console.log('🚀 Recoder Desktop UI loaded');
  
  // Mark performance metrics
  performance.mark('ui-loaded');
  
  // Report timing
  const navigationTiming = performance.getEntriesByType('navigation')[0];
  if (navigationTiming) {
    console.log('📊 UI Performance:', {
      domContentLoaded: navigationTiming.domContentLoadedEventEnd - navigationTiming.domContentLoadedEventStart,
      loadComplete: navigationTiming.loadEventEnd - navigationTiming.loadEventStart,
      totalTime: navigationTiming.loadEventEnd - navigationTiming.navigationStart
    });
  }
});

// Error handling
window.addEventListener('error', (event) => {
  console.error('🚨 UI Error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled Promise Rejection:', event.reason);
});

console.log('✅ Professional preload script initialized');