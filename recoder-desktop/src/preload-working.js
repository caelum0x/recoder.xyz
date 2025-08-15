const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App management
  loadApp: (appName) => ipcRenderer.invoke('load-app', appName),
  getAppList: () => ipcRenderer.invoke('get-app-list'),
  
  // Offline AI with Ollama
  checkOllamaStatus: () => ipcRenderer.invoke('check-ollama-status'),
  generateCodeOffline: (options) => ipcRenderer.invoke('generate-code-offline', options),
  listOllamaModels: () => ipcRenderer.invoke('list-ollama-models'),
  pullOllamaModel: (modelName) => ipcRenderer.invoke('pull-ollama-model', modelName),
  
  // Auto-updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  
  // System info
  getVersion: () => process.env.npm_package_version || '1.0.0',
  getPlatform: () => process.platform,
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Event listeners for updates
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', callback);
    return () => ipcRenderer.removeListener('update-available', callback);
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', callback);
    return () => ipcRenderer.removeListener('update-downloaded', callback);
  },
  
  // Debug helpers
  getLoadedApps: () => ipcRenderer.invoke('get-loaded-apps'),
  clearCache: () => ipcRenderer.invoke('clear-cache')
});