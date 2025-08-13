/**
 * Recoder Desktop - Unified Multi-App Main Process
 * Integrates Extension, Chat, and Web platforms into a single desktop experience
 */

const { 
  app, 
  BrowserWindow, 
  Menu, 
  Tray,
  ipcMain, 
  dialog, 
  shell,
  Notification,
  globalShortcut,
  nativeTheme,
  powerMonitor,
  systemPreferences
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const axios = require('axios');
const {
  getBestDesktopProvider,
  generateWithBestProvider,
  getDesktopProviderStatus,
  testLocalAI: testLocalAIStatus
} = require('./ai-providers');

// Keep references to all windows
let mainWindow;
let extensionWindow;
let chatWindow;
let webWindow;
let tray = null;
let forceQuit = false;
let localAIStatus = {
  ollama: false,
  lmStudio: false,
  lastCheck: 0
};

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// Application state
const appState = {
  isFirstLaunch: false,
  theme: 'system',
  notifications: true,
  autoLaunch: false,
  minimizeToTray: true,
  activeView: 'chat', // 'extension', 'chat', 'web'
  windowLayout: 'unified' // 'unified', 'separate'
};

// App URLs - try local bundles first, fallback to remote
function getAppUrls() {
  const bundlePath = path.join(__dirname, 'app-urls.json');
  let urls = {
    extension: isDev ? 'http://localhost:3000' : 'https://recoder.xyz/extension',
    chat: isDev ? 'http://localhost:3003' : 'https://recoder.xyz/chat',
    web: isDev ? 'http://localhost:3000' : 'https://recoder.xyz'
  };

  // Load configuration if available
  if (require('fs').existsSync(bundlePath)) {
    try {
      const config = JSON.parse(require('fs').readFileSync(bundlePath, 'utf8'));
      if (!isDev) {
        // Use local bundles in production
        urls = {
          extension: `file://${path.resolve(__dirname, config.extension)}`,
          chat: `file://${path.resolve(__dirname, config.chat)}`,
          web: `file://${path.resolve(__dirname, config.web)}`
        };
      } else if (config.development) {
        // Use development URLs if specified
        urls = { ...urls, ...config.development };
      }
    } catch (error) {
      console.warn('Failed to load app URLs config:', error.message);
    }
  }

  return urls;
}

const appUrls = getAppUrls();

/**
 * Create the unified main application window with integrated views
 */
function createUnifiedWindow() {
  // Create the main browser window
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1400,
    minHeight: 800,
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    show: false
  });

  // Load the unified interface
  mainWindow.loadFile(path.join(__dirname, 'unified-interface.html'));

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window events
  setupWindowEvents(mainWindow);

  // Setup integrated views after DOM is ready
  mainWindow.webContents.once('dom-ready', () => {
    setupIntegratedViews();
    injectUnifiedAIBridge();
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

/**
 * Create separate windows for each app (alternative layout)
 */
function createSeparateWindows() {
  // Main window serves as the hub
  createUnifiedWindow();
  
  // Extension window
  extensionWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../assets/icon.png'),
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    show: false
  });
  
  extensionWindow.loadURL(appUrls.extension);
  setupWindowEvents(extensionWindow);

  // Chat window  
  chatWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: path.join(__dirname, '../assets/icon.png'),
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    show: false
  });
  
  chatWindow.loadURL(appUrls.chat);
  setupWindowEvents(chatWindow);

  // Web platform window
  webWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, '../assets/icon.png'),
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    show: false
  });
  
  webWindow.loadURL(appUrls.web);
  setupWindowEvents(webWindow);
}

/**
 * Setup integrated views within the unified window
 */
function setupIntegratedViews() {
  const setupScript = `
    // Create container structure
    const container = document.createElement('div');
    container.className = 'unified-container';
    container.innerHTML = \`
      <div class="app-header">
        <div class="app-tabs">
          <button class="tab-btn active" data-app="chat">💬 Chat</button>
          <button class="tab-btn" data-app="web">🌐 Web Platform</button>
          <button class="tab-btn" data-app="extension">🔧 Extension</button>
        </div>
        <div class="app-controls">
          <button class="control-btn" id="layout-toggle">📐 Layout</button>
          <button class="control-btn" id="ai-status">🤖 AI Status</button>
        </div>
      </div>
      <div class="app-content">
        <webview id="chat-view" class="app-view active" src="${appUrls.chat}" preload="${path.join(__dirname, 'preload.js')}"></webview>
        <webview id="web-view" class="app-view" src="${appUrls.web}" preload="${path.join(__dirname, 'preload.js')}"></webview>
        <webview id="extension-view" class="app-view" src="${appUrls.extension}" preload="${path.join(__dirname, 'preload.js')}"></webview>
      </div>
    \`;

    // Add styles
    const styles = document.createElement('style');
    styles.textContent = \`
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        background: #1a1a1a;
        color: white;
        overflow: hidden;
      }
      
      .unified-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      
      .app-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 16px;
        background: #2a2a2a;
        border-bottom: 1px solid #333;
        -webkit-app-region: drag;
      }
      
      .app-tabs {
        display: flex;
        gap: 4px;
        -webkit-app-region: no-drag;
      }
      
      .tab-btn {
        padding: 8px 16px;
        background: transparent;
        border: 1px solid #444;
        color: #ccc;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;
      }
      
      .tab-btn:hover {
        background: #333;
        border-color: #555;
      }
      
      .tab-btn.active {
        background: #0066cc;
        border-color: #0066cc;
        color: white;
      }
      
      .app-controls {
        display: flex;
        gap: 8px;
        -webkit-app-region: no-drag;
      }
      
      .control-btn {
        padding: 6px 12px;
        background: #333;
        border: 1px solid #444;
        color: #ccc;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      
      .control-btn:hover {
        background: #444;
        border-color: #555;
      }
      
      .app-content {
        flex: 1;
        position: relative;
      }
      
      .app-view {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s;
      }
      
      .app-view.active {
        opacity: 1;
        pointer-events: all;
      }
    \`;
    
    // Clear existing content and setup new interface
    document.head.appendChild(styles);
    document.body.innerHTML = '';
    document.body.appendChild(container);
    
    // Setup tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const app = btn.dataset.app;
        switchToApp(app);
      });
    });
    
    // Setup controls
    document.getElementById('layout-toggle').addEventListener('click', () => {
      window.electronAPI.toggleLayout();
    });
    
    document.getElementById('ai-status').addEventListener('click', () => {
      window.electronAPI.showAIStatus();
    });
    
    function switchToApp(app) {
      // Update active tab
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.app === app);
      });
      
      // Update active view
      document.querySelectorAll('.app-view').forEach(view => {
        view.classList.toggle('active', view.id === app + '-view');
      });
      
      // Notify main process
      window.electronAPI.switchToApp(app);
    }
    
    // Initialize with chat view
    switchToApp('${appState.activeView}');
  `;

  mainWindow.webContents.executeJavaScript(setupScript);
}

/**
 * Inject unified AI bridge into all views
 */
function injectUnifiedAIBridge() {
  const bridgeScript = `
    // Enhanced Recoder Desktop Multi-App Bridge
    window.RecoderDesktop = {
      isDesktop: true,
      version: '${app.getVersion()}',
      activeApp: '${appState.activeView}',
      
      // Navigation between apps
      switchToApp(app) {
        return window.electronAPI.switchToApp(app);
      },
      
      // Layout management
      toggleLayout() {
        return window.electronAPI.toggleLayout();
      },
      
      // AI functionality (enhanced for multi-app)
      async testLocalAI() {
        return await window.electronAPI.testLocalAI();
      },
      
      async getLocalAIStatus() {
        return await window.electronAPI.getLocalAIStatus();
      },
      
      async generateWithLocalAI(messages, options = {}) {
        return await window.electronAPI.generateWithLocalAI(messages, options);
      },
      
      async generateWithBestProvider(messages, options = {}) {
        return await window.electronAPI.generateWithBestProvider(messages, options);
      },
      
      async getProviderStatus() {
        return await window.electronAPI.getProviderStatus();
      },
      
      async listLocalModels() {
        return await window.electronAPI.listLocalModels();
      },
      
      // Cross-app communication
      broadcastToApps(event, data) {
        return window.electronAPI.broadcastToApps(event, data);
      },
      
      // Window management
      openInSeparateWindow(app) {
        return window.electronAPI.openInSeparateWindow(app);
      }
    };
    
    // Notify about desktop readiness
    window.dispatchEvent(new CustomEvent('recoderDesktopReady', {
      detail: { 
        version: '${app.getVersion()}',
        mode: 'unified',
        activeApp: '${appState.activeView}'
      }
    }));
    
    console.log('🖥️ Recoder Desktop v${app.getVersion()} - Unified Multi-App Bridge Active');
  `;
  
  mainWindow.webContents.executeJavaScript(bridgeScript);
}

/**
 * Setup window event handlers
 */
function setupWindowEvents(window) {
  window.on('close', (event) => {
    if (!forceQuit && appState.minimizeToTray && process.platform !== 'darwin') {
      event.preventDefault();
      window.hide();
      
      if (appState.notifications) {
        showNotification('Recoder Desktop', 'Application minimized to tray', 'info');
      }
      
      return false;
    }
  });

  window.on('closed', () => {
    if (window === mainWindow) mainWindow = null;
    else if (window === extensionWindow) extensionWindow = null;
    else if (window === chatWindow) chatWindow = null;
    else if (window === webWindow) webWindow = null;
  });

  window.on('minimize', (event) => {
    if (appState.minimizeToTray && process.platform !== 'darwin') {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * Enhanced IPC handlers for multi-app functionality
 */
function setupEnhancedIPC() {
  // Existing AI handlers
  ipcMain.handle('test-local-ai', async () => {
    return await testLocalAI();
  });

  ipcMain.handle('generate-with-best-provider', async (event, messages, options) => {
    return await generateWithBestProvider(messages, options);
  });

  // New unified interface handlers
  ipcMain.handle('switch-to-app', async (event, app) => {
    appState.activeView = app;
    
    // If in separate window mode, focus the appropriate window
    if (appState.windowLayout === 'separate') {
      const windows = { extension: extensionWindow, chat: chatWindow, web: webWindow };
      const targetWindow = windows[app];
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.show();
        targetWindow.focus();
      }
    }
    
    return { success: true, activeApp: app };
  });

  ipcMain.handle('toggle-layout', async () => {
    if (appState.windowLayout === 'unified') {
      appState.windowLayout = 'separate';
      createSeparateWindows();
    } else {
      appState.windowLayout = 'unified';
      // Close separate windows
      [extensionWindow, chatWindow, webWindow].forEach(win => {
        if (win && !win.isDestroyed()) win.close();
      });
      createUnifiedWindow();
    }
    
    return { layout: appState.windowLayout };
  });

  ipcMain.handle('broadcast-to-apps', async (event, eventName, data) => {
    const windows = [mainWindow, extensionWindow, chatWindow, webWindow].filter(win => 
      win && !win.isDestroyed() && win !== event.sender
    );
    
    windows.forEach(win => {
      win.webContents.executeJavaScript(`
        window.dispatchEvent(new CustomEvent('${eventName}', {
          detail: ${JSON.stringify(data)}
        }));
      `);
    });
    
    return { broadcastCount: windows.length };
  });

  ipcMain.handle('open-in-separate-window', async (event, app) => {
    const windowConfigs = {
      extension: { width: 1200, height: 800, url: appUrls.extension },
      chat: { width: 1000, height: 700, url: appUrls.chat },
      web: { width: 1400, height: 900, url: appUrls.web }
    };
    
    const config = windowConfigs[app];
    if (!config) return { error: 'Invalid app' };
    
    const newWindow = new BrowserWindow({
      width: config.width,
      height: config.height,
      icon: path.join(__dirname, '../assets/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: !isDev
      }
    });
    
    newWindow.loadURL(config.url);
    setupWindowEvents(newWindow);
    
    return { success: true, app };
  });

  ipcMain.handle('show-ai-status', async () => {
    const status = await testLocalAI();
    const hasAI = status.ollama || status.lmStudio;
    
    dialog.showMessageBox(mainWindow, {
      type: hasAI ? 'info' : 'warning',
      title: 'AI Status',
      message: hasAI ? 'Local AI Connected' : 'No Local AI Found',
      detail: `Ollama: ${status.ollama ? '✅ Connected' : '❌ Not available'}\nLM Studio: ${status.lmStudio ? '✅ Connected' : '❌ Not available'}${!hasAI ? '\n\nPlease install and start Ollama or LM Studio.' : ''}`
    });
    
    return status;
  });

  // Additional IPC handlers for complete functionality
  ipcMain.handle('set-theme', async (event, theme) => {
    appState.theme = theme;
    updateTheme();
    return { theme: appState.theme };
  });

  ipcMain.handle('get-theme', async () => {
    return { theme: appState.theme };
  });

  ipcMain.handle('set-preference', async (event, key, value) => {
    appState[key] = value;
    saveAppState();
    return { success: true };
  });

  ipcMain.handle('get-preference', async (event, key) => {
    return { value: appState[key] };
  });

  ipcMain.handle('select-file', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result;
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result;
  });

  ipcMain.handle('save-file', async (event, content, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: options.filters || [
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled) {
      require('fs').writeFileSync(result.filePath, content);
      return { success: true, filePath: result.filePath };
    }
    
    return { success: false };
  });

  ipcMain.handle('track-event', async (event, eventName, properties) => {
    console.log('Analytics event:', eventName, properties);
    return { success: true };
  });

  ipcMain.handle('show-notification', async (event, title, body, options = {}) => {
    showNotification(title, body, options.type || 'info');
    return { success: true };
  });
}

/**
 * Create unified HTML interface
 */
function createUnifiedInterface() {
  const interfaceHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recoder Desktop - Unified Interface</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #1a1a1a;
            color: white;
            overflow: hidden;
        }
        
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            flex-direction: column;
            gap: 20px;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #333;
            border-top: 3px solid #0066cc;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .loading-text {
            color: #ccc;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div class="loading">
        <div class="spinner"></div>
        <div class="loading-text">Loading Recoder Desktop...</div>
    </div>
</body>
</html>
  `;

  require('fs').writeFileSync(
    path.join(__dirname, 'unified-interface.html'), 
    interfaceHtml
  );
}

// AI functionality (keep existing implementations)
async function testLocalAI() {
  const now = Date.now();
  if (now - localAIStatus.lastCheck < 30000) {
    return { ...localAIStatus };
  }

  const status = await testLocalAIStatus();
  localAIStatus = { ...status, lastCheck: now };
  return { ...localAIStatus };
}

async function generateWithLocalAI(messages, options = {}) {
  const status = await testLocalAI();
  if (!status.ollama && !status.lmStudio) {
    throw new Error('No local AI available. Please install and start Ollama or LM Studio.');
  }
  
  options.forceLocal = true;
  return await generateWithBestProvider(messages, options);
}

async function listLocalModels() {
  const models = [];
  const status = await testLocalAI();

  if (status.ollama) {
    try {
      const response = await axios.get('http://localhost:11434/api/tags');
      models.push(...response.data.models.map(model => ({
        provider: 'ollama',
        name: model.name,
        size: model.size,
        modified_at: model.modified_at
      })));
    } catch (error) {
      console.warn('Failed to get Ollama models:', error);
    }
  }

  if (status.lmStudio) {
    try {
      const response = await axios.get('http://localhost:1234/v1/models');
      models.push(...response.data.data.map(model => ({
        provider: 'lm-studio',
        name: model.id,
        size: null,
        modified_at: null
      })));
    } catch (error) {
      console.warn('Failed to get LM Studio models:', error);
    }
  }

  return models;
}

function showNotification(title, body, type = 'info') {
  if (!appState.notifications) return;

  const notification = new Notification({
    title: title,
    body: body,
    icon: path.join(__dirname, '../assets/icon.png'),
    sound: true,
    urgency: type === 'critical' ? 'critical' : 'normal'
  });

  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  notification.show();
}

function updateTheme() {
  let shouldUseDarkColors;
  
  switch (appState.theme) {
    case 'light':
      shouldUseDarkColors = false;
      break;
    case 'dark':
      shouldUseDarkColors = true;
      break;
    case 'system':
    default:
      shouldUseDarkColors = nativeTheme.shouldUseDarkColors;
      break;
  }

  nativeTheme.themeSource = appState.theme;

  // Notify all windows about theme change
  const windows = [mainWindow, extensionWindow, chatWindow, webWindow].filter(win => 
    win && !win.isDestroyed()
  );
  
  windows.forEach(win => {
    win.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('themeChanged', {
        detail: { 
          theme: '${appState.theme}',
          isDark: ${shouldUseDarkColors}
        }
      }));
    `);
  });
}

function saveAppState() {
  // Save application state to preferences
  // For now, just log - in production, would save to file or registry
  console.log('App state saved:', appState);
}

// Keep existing menu, tray, and app handlers but update for unified interface
function createMenu() {
  const template = [
    {
      label: 'Recoder',
      submenu: [
        { label: 'About Recoder Desktop', click: () => ipcMain.emit('show-about') },
        { type: 'separator' },
        { label: 'Switch to Chat', click: () => switchToApp('chat') },
        { label: 'Switch to Web Platform', click: () => switchToApp('web') },
        { label: 'Switch to Extension', click: () => switchToApp('extension') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Toggle Layout', click: () => ipcMain.emit('toggle-layout') },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'AI',
      submenu: [
        { label: 'Test Local AI', click: async () => ipcMain.emit('show-ai-status') },
        { label: 'Install Ollama', click: () => shell.openExternal('https://ollama.ai') },
        { label: 'Install LM Studio', click: () => shell.openExternal('https://lmstudio.ai') }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function switchToApp(app) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`
      if (window.RecoderDesktop && window.RecoderDesktop.switchToApp) {
        window.RecoderDesktop.switchToApp('${app}');
      }
    `);
  }
}

// App initialization
app.whenReady().then(() => {
  createUnifiedInterface();
  setupEnhancedIPC();
  createMenu();
  
  if (appState.windowLayout === 'unified') {
    createUnifiedWindow();
  } else {
    createSeparateWindows();
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createUnifiedWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !appState.minimizeToTray) {
    app.quit();
  }
});

// Export for testing
module.exports = {
  createUnifiedWindow,
  createSeparateWindows,
  switchToApp,
  appState
};