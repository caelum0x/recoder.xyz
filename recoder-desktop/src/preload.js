/**
 * Recoder Desktop - Preload Script
 * Enhanced bridge between main and renderer processes
 */

const { contextBridge, ipcRenderer, shell, clipboard } = require('electron');
const path = require('path');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Basic IPC
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // AI Functions
  testLocalAI: () => ipcRenderer.invoke('test-local-ai'),
  getLocalAIStatus: () => ipcRenderer.invoke('get-local-ai-status'),
  generateWithLocalAI: (messages, options) => ipcRenderer.invoke('generate-with-local-ai', messages, options),
  generateWithBestProvider: (messages, options) => ipcRenderer.invoke('generate-with-best-provider', messages, options),
  getProviderStatus: () => ipcRenderer.invoke('get-provider-status'),
  listLocalModels: () => ipcRenderer.invoke('list-local-models'),

  // Application Functions
  showAbout: () => ipcRenderer.invoke('show-about'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  
  // File System Operations
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFile: (content, defaultPath) => ipcRenderer.invoke('save-file', content, defaultPath),
  
  // Clipboard Operations
  writeClipboard: (text) => clipboard.writeText(text),
  readClipboard: () => clipboard.readText(),
  
  // External Operations
  openExternal: (url) => shell.openExternal(url),
  showItemInFolder: (fullPath) => shell.showItemInFolder(fullPath),
  openPath: (path) => shell.openPath(path),
  
  // Theme and Appearance
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  
  // Notifications
  showNotification: (title, body, options) => ipcRenderer.invoke('show-notification', title, body, options),
  
  // Enhanced AI Functions
  ai: {
    analyzeCode: (code, language, options) => ipcRenderer.invoke('ai-analyze-code', code, language, options),
    optimizeCode: (code, language, options) => ipcRenderer.invoke('ai-optimize-code', code, language, options),
    generateCode: (prompt, context) => ipcRenderer.invoke('ai-generate-code', prompt, context),
    explainCode: (code, language, options) => ipcRenderer.invoke('ai-explain-code', code, language, options),
    reviewCode: (code, language, options) => ipcRenderer.invoke('ai-review-code', code, language, options),
    generateTests: (code, language, framework) => ipcRenderer.invoke('ai-generate-tests', code, language, framework),
    fixBugs: (code, error, language) => ipcRenderer.invoke('ai-fix-bugs', code, error, language),
    generateDocs: (code, language, options) => ipcRenderer.invoke('ai-generate-docs', code, language, options),
    scanSecurity: (code, language, options) => ipcRenderer.invoke('ai-scan-security', code, language, options),
  },
  
  // Window Management
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    setAlwaysOnTop: (flag) => ipcRenderer.invoke('window-set-always-on-top', flag),
  },
  
  // Event Listeners
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  
  once: (channel, callback) => {
    ipcRenderer.once(channel, (event, ...args) => callback(...args));
  },
  
  // Platform info
  platform: process.platform,
  arch: process.arch,
  
  // Version info
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});

// Desktop-specific enhancements
contextBridge.exposeInMainWorld('recoderDesktop', {
  isDesktop: true,
  version: '2.0.0',
  
  // Enhanced features only available in desktop
  features: {
    directLocalAI: true,
    fileSystemAccess: true,
    systemIntegration: true,
    offlineCapable: true,
    autoUpdater: true,
    systemTray: true,
    globalShortcuts: true,
    nativeNotifications: true,
    powerMonitoring: true,
    themeDetection: true
  },
  
  // Quick AI assistant
  quickAI: {
    show: () => ipcRenderer.invoke('quick-ai-show'),
    hide: () => ipcRenderer.invoke('quick-ai-hide'),
    toggle: () => ipcRenderer.invoke('quick-ai-toggle'),
    query: (prompt) => ipcRenderer.invoke('quick-ai-query', prompt),
  },
  
  // Enhanced utilities
  utils: {
    // Copy text to clipboard (enhanced)
    copyToClipboard: async (text) => {
      try {
        clipboard.writeText(text);
        return true;
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
      }
    },
    
    // Paste from clipboard
    pasteFromClipboard: () => {
      try {
        return clipboard.readText();
      } catch (error) {
        console.error('Failed to read from clipboard:', error);
        return '';
      }
    },
    
    // File utilities
    getFileExtension: (filename) => path.extname(filename).toLowerCase().slice(1),
    sanitizeFilename: (filename) => filename.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
    generateId: () => Math.random().toString(36).substr(2, 9),
    
    // Format utilities
    formatBytes: (bytes, decimals = 2) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },
    
    formatTime: (timestamp) => new Date(timestamp).toLocaleString(),
    
    // Theme utilities
    getSystemTheme: () => {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    
    onSystemThemeChange: (callback) => {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        callback(e.matches ? 'dark' : 'light');
      });
      return () => mediaQuery.removeEventListener('change', callback);
    },
    
    // Validation utilities
    isValidUrl: (string) => {
      try {
        new URL(string);
        return true;
      } catch (_) {
        return false;
      }
    },
    
    isValidEmail: (email) => {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email);
    }
  },
  
  // System shortcuts (readonly info about available shortcuts)
  shortcuts: {
    toggleWindow: 'Cmd/Ctrl+Shift+R',
    quickAI: 'Cmd/Ctrl+Shift+A',
    newProject: 'Cmd/Ctrl+N',
    openProject: 'Cmd/Ctrl+O',
    saveProject: 'Cmd/Ctrl+S',
  },
  
  // Desktop-specific events
  events: {
    onThemeChange: (callback) => {
      return ipcRenderer.on('theme-changed', callback);
    },
    onAIStatusChange: (callback) => {
      return ipcRenderer.on('ai-status-changed', callback);
    },
    onWindowStateChange: (callback) => {
      return ipcRenderer.on('window-state-changed', callback);
    },
    onPowerChange: (callback) => {
      return ipcRenderer.on('power-changed', callback);
    }
  }
});

console.log('🖥️ Recoder Desktop v2.0.0 - Enhanced Native Features Loaded');