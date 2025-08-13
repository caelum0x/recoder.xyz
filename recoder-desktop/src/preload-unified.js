/**
 * Unified Preload Script for Recoder Desktop
 * Enhanced bridge for multi-app integration
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Existing AI functionality
  testLocalAI: () => ipcRenderer.invoke('test-local-ai'),
  getLocalAIStatus: () => ipcRenderer.invoke('get-local-ai-status'),
  generateWithLocalAI: (messages, options) => ipcRenderer.invoke('generate-with-local-ai', messages, options),
  generateWithBestProvider: (messages, options) => ipcRenderer.invoke('generate-with-best-provider', messages, options),
  getProviderStatus: () => ipcRenderer.invoke('get-provider-status'),
  listLocalModels: () => ipcRenderer.invoke('list-local-models'),
  
  // Enhanced unified interface functionality
  switchToApp: (app) => ipcRenderer.invoke('switch-to-app', app),
  toggleLayout: () => ipcRenderer.invoke('toggle-layout'),
  broadcastToApps: (event, data) => ipcRenderer.invoke('broadcast-to-apps', event, data),
  openInSeparateWindow: (app) => ipcRenderer.invoke('open-in-separate-window', app),
  showAIStatus: () => ipcRenderer.invoke('show-ai-status'),
  
  // System functionality
  showAbout: () => ipcRenderer.invoke('show-about'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  
  // Event listeners for cross-app communication
  onAppEvent: (callback) => {
    const handler = (event, ...args) => callback(...args);
    ipcRenderer.on('app-event', handler);
    return () => ipcRenderer.removeListener('app-event', handler);
  },
  
  // Theme and preferences
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setPreference: (key, value) => ipcRenderer.invoke('set-preference', key, value),
  getPreference: (key) => ipcRenderer.invoke('get-preference', key),
  
  // File operations (for extension integration)
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFile: (content, options) => ipcRenderer.invoke('save-file', content, options),
  
  // Development utilities
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),
  reloadApp: () => ipcRenderer.invoke('reload-app'),
  
  // Analytics and monitoring
  trackEvent: (event, properties) => ipcRenderer.invoke('track-event', event, properties),
  getAnalytics: () => ipcRenderer.invoke('get-analytics'),
  
  // Inter-app data sharing
  shareData: (targetApp, data) => ipcRenderer.invoke('share-data', targetApp, data),
  requestData: (sourceApp, dataType) => ipcRenderer.invoke('request-data', sourceApp, dataType),
  
  // Notification system
  showNotification: (title, body, options) => ipcRenderer.invoke('show-notification', title, body, options),
  
  // Window management
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
  
  // Enhanced webview communication
  sendToWebview: (webviewId, message) => ipcRenderer.invoke('send-to-webview', webviewId, message),
  receiveFromWebview: (callback) => {
    const handler = (event, ...args) => callback(...args);
    ipcRenderer.on('webview-message', handler);
    return () => ipcRenderer.removeListener('webview-message', handler);
  }
});

// Enhanced desktop detection and capabilities
contextBridge.exposeInMainWorld('RecoderDesktopCapabilities', {
  isUnifiedDesktop: true,
  version: process.env.npm_package_version || '1.0.0',
  platform: process.platform,
  
  // Feature detection
  hasLocalAI: true,
  hasFileSystem: true,
  hasNotifications: true,
  hasSystemIntegration: true,
  
  // App integration info
  supportedApps: ['extension', 'chat', 'web'],
  currentLayout: 'unified', // Will be updated by main process
  
  // AI capabilities
  aiProviders: ['ollama', 'lm-studio', 'anthropic', 'openai', 'groq'],
  localProviders: ['ollama', 'lm-studio'],
  
  // System features
  systemFeatures: {
    globalShortcuts: true,
    systemTray: true,
    notifications: true,
    fileAssociations: true,
    autoUpdater: true,
    powerMonitoring: true
  }
});

// Global event system for cross-app communication
window.addEventListener('DOMContentLoaded', () => {
  // Setup global message passing
  window.RecoderDesktopEvents = {
    // Emit event to other apps
    emit: (eventName, data) => {
      return window.electronAPI.broadcastToApps(eventName, data);
    },
    
    // Listen for events from other apps
    on: (eventName, callback) => {
      const handler = (event) => {
        if (event.detail && event.detail.eventName === eventName) {
          callback(event.detail.data);
        }
      };
      window.addEventListener('recoderDesktopEvent', handler);
      return () => window.removeEventListener('recoderDesktopEvent', handler);
    },
    
    // One-time event listener
    once: (eventName, callback) => {
      const removeListener = window.RecoderDesktopEvents.on(eventName, (data) => {
        removeListener();
        callback(data);
      });
      return removeListener;
    }
  };
  
  // Notify that preload is ready
  window.dispatchEvent(new CustomEvent('recoderDesktopPreloadReady', {
    detail: {
      timestamp: Date.now(),
      capabilities: window.RecoderDesktopCapabilities
    }
  }));
});

// Enhanced error handling and logging
window.addEventListener('error', (event) => {
  console.error('Renderer error:', event.error);
  
  // Optionally send to main process for logging
  if (window.electronAPI && window.electronAPI.trackEvent) {
    window.electronAPI.trackEvent('renderer-error', {
      message: event.error.message,
      stack: event.error.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  }
});

// Performance monitoring
if (typeof window.performance !== 'undefined') {
  window.addEventListener('load', () => {
    const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart;
    
    if (window.electronAPI && window.electronAPI.trackEvent) {
      window.electronAPI.trackEvent('page-load-performance', {
        loadTime: loadTime,
        domContentLoaded: window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart,
        url: window.location.href
      });
    }
  });
}

// Console override for better debugging in desktop context
const originalConsole = { ...console };

console.log = (...args) => {
  originalConsole.log('[Desktop]', ...args);
};

console.error = (...args) => {
  originalConsole.error('[Desktop Error]', ...args);
};

console.warn = (...args) => {
  originalConsole.warn('[Desktop Warning]', ...args);
};

console.info = (...args) => {
  originalConsole.info('[Desktop Info]', ...args);
};