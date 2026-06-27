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

// ============== Cockpit Config ==============
// main.js passes the resolved { backendUrl, token } config via an
// `--recoder-cockpit-config=<base64-json>` process argument. We decode it and
// expose it as window.__RECODER_COCKPIT__ so the bundled cockpit renderer can
// read it synchronously at module load and authenticate its /api/conductor
// calls with `Authorization: Bearer <token>`.
(() => {
  try {
    const prefix = '--recoder-cockpit-config=';
    const arg = process.argv.find((a) => a.startsWith(prefix));
    if (!arg) return;
    const encoded = arg.slice(prefix.length);
    if (!encoded) return;
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const config = JSON.parse(decoded);
    if (!config || typeof config !== 'object' || !config.backendUrl) return;
    // Only expose the fields the renderer consumes, plus the auth bridge so the
    // cockpit's "Sign in to Recoder" panel can drive the EXISTING recoder.xyz
    // web auth flow in the main process (no new auth scheme, no fake token).
    contextBridge.exposeInMainWorld('__RECODER_COCKPIT__', {
      backendUrl: String(config.backendUrl),
      token: typeof config.token === 'string' && config.token ? config.token : undefined,
      defaults: config.defaults && typeof config.defaults === 'object' ? config.defaults : undefined,
      // Trigger the real web auth flow; resolves to { ok, token, tokenSource }.
      login: () => ipcRenderer.invoke('cockpit:login'),
      // Re-resolve the token without showing UI (env -> web session cookie -> API key).
      resolveToken: () => ipcRenderer.invoke('cockpit:resolveToken'),
    });
  } catch {
    // If config is missing/malformed the renderer falls back to its localhost default.
  }
})();

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

  /** Trigger delegated A2A task through desktop bridge */
  delegateTask: (payload) => ipcRenderer.invoke('agent:delegateTask', payload || {}),

  /** Get delegated task status by bridge job ID */
  getDelegatedTaskStatus: (payload) => ipcRenderer.invoke('agent:getDelegatedTaskStatus', payload || {}),

  /** Poll delegated task status until terminal state or timeout */
  pollDelegatedTaskStatus: (payload) => ipcRenderer.invoke('agent:pollDelegatedTaskStatus', payload || {}),

  // ============== A2A Task Visibility (SFA-020) ==============
  /** List delegated A2A tasks */
  listA2ATasks: (params) => ipcRenderer.invoke('a2a:listTasks', params || {}),

  /** Get a single A2A task by ID */
  getA2ATask: (params) => ipcRenderer.invoke('a2a:getTask', params || {}),

  /** Poll an A2A task until terminal state or timeout */
  pollA2ATask: (params) => ipcRenderer.invoke('a2a:pollTask', params || {}),

  /** Create a new delegated A2A task */
  createA2ATask: (params) => ipcRenderer.invoke('a2a:createTask', params || {}),

  /** Listen for "open tasks panel" event from main menu / tray */
  onOpenTasksPanel: (callback) => {
    const handler = (_event) => callback();
    ipcRenderer.on('a2a:openTasksPanel', handler);
    return () => ipcRenderer.removeListener('a2a:openTasksPanel', handler);
  },

  /** Listen for "refresh tasks" event from main menu */
  onRefreshTasks: (callback) => {
    const handler = (_event) => callback();
    ipcRenderer.on('a2a:refreshTasks', handler);
    return () => ipcRenderer.removeListener('a2a:refreshTasks', handler);
  },

  /** Listen for "create task dialog" event from main menu */
  onCreateTaskDialog: (callback) => {
    const handler = (_event) => callback();
    ipcRenderer.on('a2a:createTaskDialog', handler);
    return () => ipcRenderer.removeListener('a2a:createTaskDialog', handler);
  },

  /** Listen for activation events from main process */
  onActivationEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop:activationEvent', handler);
    return () => ipcRenderer.removeListener('desktop:activationEvent', handler);
  },

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

  // ============== Cockpit auth ==============
  /** Run the existing recoder.xyz web auth flow; resolves to { ok, token, tokenSource }. */
  login: () => ipcRenderer.invoke('cockpit:login'),

  /** Re-resolve the cockpit auth token (env -> web session cookie -> API key). */
  resolveToken: () => ipcRenderer.invoke('cockpit:resolveToken'),
});
