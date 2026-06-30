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

  // ============== Embedded backend ==============
  /** Get the embedded backend supervisor status (truthful: starting/ready/failed). */
  backendStatus: () => ipcRenderer.invoke('backend:status'),
});

// ============================================================================
// recoderTerminal — focused, session-oriented PTY bridge (RECODER-TERMINAL-VISION)
// ============================================================================
// A minimal, typed surface over the same terminal:* IPC channels as
// recoderDesktop, but shaped around a single embedded terminal instance:
// open() spawns the PTY and resolves its id; write/resize/close act on the
// most-recently-opened PTY (or an explicit id); onData/onExit subscribe and
// return an unsubscribe. contextIsolation-safe — no node, no remote, no
// ipcRenderer leaked into the renderer.
(() => {
  /** @type {string | null} The id of the PTY this bridge instance owns. */
  let currentId = null;

  contextBridge.exposeInMainWorld('recoderTerminal', {
    /**
     * Open a PTY for a session. Pass the tmux session command/args (e.g.
     * { command: tmuxBin, args: ['attach','-t', name], cwd, env, cols, rows }).
     * Resolves to { id, success, ptyUnavailable? } — ptyUnavailable is true when
     * no real TTY could be created (node-pty missing), so the caller can fall
     * back truthfully instead of attaching a fake terminal.
     */
    open: async (options) => {
      const res = await ipcRenderer.invoke('terminal:spawn', options || {});
      if (res && res.success && res.id) currentId = res.id;
      return res;
    },

    /** Write input to the open PTY (or an explicit id). */
    write: (data, id) => ipcRenderer.invoke('terminal:write', { id: id || currentId, data }),

    /** Resize the open PTY (or an explicit id) to cols×rows. */
    resize: (cols, rows, id) =>
      ipcRenderer.invoke('terminal:resize', { id: id || currentId, cols, rows }),

    /** Close/kill the open PTY (or an explicit id). */
    close: (id) => {
      const target = id || currentId;
      if (target === currentId) currentId = null;
      return ipcRenderer.invoke('terminal:kill', target);
    },

    /** Subscribe to PTY output. Returns an unsubscribe function. */
    onData: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },

    /** Subscribe to PTY exit. Returns an unsubscribe function. */
    onExit: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
  });
})();
