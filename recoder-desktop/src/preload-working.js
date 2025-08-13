const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadApp: (appName) => ipcRenderer.invoke('load-app', appName),
  getAppList: () => ipcRenderer.invoke('get-app-list')
});