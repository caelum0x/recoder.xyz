/**
 * Recoder Desktop - Preload Script
 * Secure bridge between main process and renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Local AI methods
  testLocalAI: () => ipcRenderer.invoke('test-local-ai'),
  getLocalAIStatus: () => ipcRenderer.invoke('get-local-ai-status'),
  generateWithLocalAI: (messages, options) => ipcRenderer.invoke('generate-with-local-ai', messages, options),
  listLocalModels: () => ipcRenderer.invoke('list-local-models'),
  
  // App methods
  showAbout: () => ipcRenderer.invoke('show-about'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  
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
  
  // Enhanced features only available in desktop
  features: {
    directLocalAI: true,
    fileSystemAccess: true,
    systemIntegration: true,
    offlineCapable: true,
    autoUpdater: true
  },
  
  // Desktop-specific utilities
  utils: {
    // Copy text to clipboard
    copyToClipboard: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
      }
    },
    
    // Get system theme
    getSystemTheme: () => {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    
    // Listen for theme changes
    onSystemThemeChange: (callback) => {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        callback(e.matches ? 'dark' : 'light');
      });
      return () => mediaQuery.removeEventListener('change', callback);
    }
  }
});

console.log('🖥️ Recoder Desktop preload script loaded');