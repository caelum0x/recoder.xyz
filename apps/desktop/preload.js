/**
 * Preload Script - Exposes safe Electron APIs to the renderer via contextBridge
 *
 * This provides the web app with native desktop capabilities:
 * - File system access (open/save dialogs)
 * - Native terminal
 * - Clipboard
 * - App info
 * - Window controls
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recoderDesktop', {
  // ============== Platform Info ==============
  platform: process.platform,
  isDesktop: true,
  version: process.env.npm_package_version || '1.0.0',

  // ============== File System ==============
  /** Open a native file picker dialog */
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  /** Open a native folder picker dialog */
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  /** Save file with native dialog */
  saveFile: (defaultPath, content) =>
    ipcRenderer.invoke('dialog:saveFile', { defaultPath, content }),

  /** Read a file from the local file system */
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),

  /** Write a file to the local file system */
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('fs:writeFile', { filePath, content }),

  /** List files in a directory */
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),

  /** Check if a path exists */
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),

  /** Get file stats */
  stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),

  // ============== Terminal ==============
  /** Spawn a terminal process */
  spawnTerminal: (options) => ipcRenderer.invoke('terminal:spawn', options),

  /** Write to a terminal */
  terminalWrite: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),

  /** Resize a terminal */
  terminalResize: (id, cols, rows) =>
    ipcRenderer.invoke('terminal:resize', { id, cols, rows }),

  /** Kill a terminal */
  terminalKill: (id) => ipcRenderer.invoke('terminal:kill', id),

  /** Listen for terminal output */
  onTerminalData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },

  /** Listen for terminal exit */
  onTerminalExit: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  // ============== Clipboard ==============
  /** Copy text to clipboard */
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', text),

  /** Read text from clipboard */
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),

  // ============== Window ==============
  /** Minimize the window */
  minimize: () => ipcRenderer.invoke('window:minimize'),

  /** Maximize/restore the window */
  maximize: () => ipcRenderer.invoke('window:maximize'),

  /** Close the window */
  close: () => ipcRenderer.invoke('window:close'),

  /** Toggle fullscreen */
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),

  // ============== App ==============
  /** Get app version */
  getVersion: () => ipcRenderer.invoke('app:version'),

  /** Build a subagent workflow plan for multi-repo development */
  getAgentWorkflowPlan: (payload) => ipcRenderer.invoke('agent:getWorkflowPlan', payload || {}),

  /** Check for updates */
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),

  /** Listen for update events */
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },

  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },

  /** Install update and restart */
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),

  /** Open external URL in default browser */
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  /** Show item in file manager */
  showInFolder: (filePath) => ipcRenderer.invoke('app:showInFolder', filePath),
});
