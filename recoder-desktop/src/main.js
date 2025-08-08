/**
 * Recoder Desktop - Main Process
 * Provides seamless local AI access without proxy setup
 */

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const axios = require('axios');
const {
  getBestDesktopProvider,
  generateWithBestProvider,
  getDesktopProviderStatus,
  testLocalAI: testLocalAIStatus
} = require('./ai-providers');

// Keep a global reference of the window object
let mainWindow;
let localAIStatus = {
  ollama: false,
  lmStudio: false,
  lastCheck: 0
};

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

/**
 * Create the main application window
 */
function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev // Disable web security in dev for localhost access
    }
  });

  // Load the app
  const startUrl = isDev 
    ? 'http://localhost:3003' // Chat platform server  
    : 'https://recoder.xyz/chat'; // Production

  mainWindow.loadURL(startUrl);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Inject local AI capabilities
  mainWindow.webContents.once('dom-ready', () => {
    injectLocalAIBridge();
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (!isDev) {
      // Check for updates
      autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

/**
 * Inject Local AI Bridge into the web app
 */
function injectLocalAIBridge() {
  const bridgeScript = `
    // Recoder Desktop Local AI Bridge
    window.RecoderDesktop = {
      isDesktop: true,
      version: '${app.getVersion()}',
      
      // Test local AI connections
      async testLocalAI() {
        return await window.electronAPI.testLocalAI();
      },
      
      // Get local AI status
      async getLocalAIStatus() {
        return await window.electronAPI.getLocalAIStatus();
      },
      
      // Generate with best available AI (local-first, then cloud with latest models)
      async generateWithLocalAI(messages, options = {}) {
        return await window.electronAPI.generateWithLocalAI(messages, options);
      },
      
      // Generate with best provider (prioritizes OpenRouter with latest models)
      async generateWithBestProvider(messages, options = {}) {
        return await window.electronAPI.generateWithBestProvider(messages, options);
      },
      
      // Get provider status with latest model info
      async getProviderStatus() {
        return await window.electronAPI.getProviderStatus();
      },
      
      // List available models
      async listLocalModels() {
        return await window.electronAPI.listLocalModels();
      }
    };
    
    // Notify the web app that desktop features are ready
    window.dispatchEvent(new CustomEvent('recoderDesktopReady', {
      detail: { version: '${app.getVersion()}' }
    }));
    
    console.log('🖥️ Recoder Desktop v${app.getVersion()} - Enhanced AI Bridge Active (Local + Cloud with Latest Models)');
  `;
  
  mainWindow.webContents.executeJavaScript(bridgeScript);
}

/**
 * Test local AI connections (delegated to ai-providers module)
 */
async function testLocalAI() {
  const now = Date.now();
  
  // Cache results for 30 seconds
  if (now - localAIStatus.lastCheck < 30000) {
    return { ...localAIStatus };
  }

  const status = await testLocalAIStatus();
  localAIStatus = {
    ...status,
    lastCheck: now
  };

  return { ...localAIStatus };
}

/**
 * Generate response with local AI (backward compatibility)
 */
async function generateWithLocalAI(messages, options = {}) {
  // For backward compatibility, force local-only generation
  const status = await testLocalAI();
  
  if (!status.ollama && !status.lmStudio) {
    throw new Error('No local AI available. Please install and start Ollama or LM Studio.');
  }

  // Use the enhanced provider system but force local-only
  options.forceLocal = true;
  return await generateWithBestProvider(messages, options);
}

/**
 * List available local models
 */
async function listLocalModels() {
  const models = [];
  const status = await testLocalAI();

  if (status.ollama) {
    try {
      const response = await axios.get('http://localhost:11434/api/tags');
      const data = response.data;
      
      models.push(...data.models.map(model => ({
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
      const data = response.data;
      
      models.push(...data.data.map(model => ({
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

/**
 * Set up IPC handlers
 */
function setupIPC() {
  ipcMain.handle('test-local-ai', async () => {
    return await testLocalAI();
  });

  ipcMain.handle('get-local-ai-status', async () => {
    return await testLocalAI();
  });

  ipcMain.handle('generate-with-local-ai', async (event, messages, options) => {
    return await generateWithLocalAI(messages, options);
  });

  ipcMain.handle('generate-with-best-provider', async (event, messages, options) => {
    return await generateWithBestProvider(messages, options);
  });

  ipcMain.handle('get-provider-status', async () => {
    const localStatus = await testLocalAI();
    return await getDesktopProviderStatus(localStatus);
  });

  ipcMain.handle('list-local-models', async () => {
    return await listLocalModels();
  });

  ipcMain.handle('show-about', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'About Recoder Desktop',
      message: 'Recoder Desktop',
      detail: `Version: ${app.getVersion()}\\n\\nThe ultimate AI-powered development environment with seamless local AI integration.\\n\\n© 2024 Recoder.xyz`
    });
  });

  ipcMain.handle('quit-app', () => {
    app.quit();
  });
}

/**
 * Create application menu
 */
function createMenu() {
  const template = [
    {
      label: 'Recoder',
      submenu: [
        {
          label: 'About Recoder Desktop',
          click: () => {
            ipcMain.emit('show-about');
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'AI',
      submenu: [
        {
          label: 'Test Local AI',
          click: async () => {
            const status = await testLocalAI();
            const hasAI = status.ollama || status.lmStudio;
            
            dialog.showMessageBox(mainWindow, {
              type: hasAI ? 'info' : 'warning',
              title: 'Local AI Status',
              message: hasAI ? 'Local AI Connected' : 'No Local AI Found',
              detail: `Ollama: ${status.ollama ? '✅ Connected' : '❌ Not available'}\\nLM Studio: ${status.lmStudio ? '✅ Connected' : '❌ Not available'}${!hasAI ? '\\n\\nPlease install and start Ollama or LM Studio.' : ''}`
            });
          }
        },
        {
          label: 'Install Ollama',
          click: () => {
            shell.openExternal('https://ollama.ai');
          }
        },
        {
          label: 'Install LM Studio',
          click: () => {
            shell.openExternal('https://lmstudio.ai');
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Recoder.xyz Website',
          click: () => {
            shell.openExternal('https://recoder.xyz');
          }
        },
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://docs.recoder.xyz');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/recoder-xyz/recoder-desktop/issues');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * App event handlers
 */

app.whenReady().then(() => {
  setupIPC();
  createMenu();
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up resources if needed
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available.');
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.');
});

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded and ready to install.',
    detail: 'The application will restart to apply the update.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// Handle certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    // In development, ignore certificate errors
    event.preventDefault();
    callback(true);
  } else {
    // In production, use default behavior
    callback(false);
  }
});