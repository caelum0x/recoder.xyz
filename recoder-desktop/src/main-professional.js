/**
 * Professional Recoder Desktop - Main Process
 * Enterprise-grade desktop application with comprehensive service integration
 */

const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Professional service imports
const { DesktopAuthService } = require('./services/auth-service');
const { ServiceDiscoveryManager } = require('./services/service-discovery');
const { IframeSecurityManager } = require('./services/iframe-manager');

// Global variables
let mainWindow;
const isDev = process.argv.includes('--dev');
const isOfflineMode = process.argv.includes('--offline') || !isDev;

// Professional service instances
let authService;
let serviceDiscovery;
let iframeManager;

// Application state
const appState = {
  initialized: false,
  servicesReady: false,
  userAuthenticated: false,
  currentUser: null,
  serviceStatus: {}
};

/**
 * Initialize all professional services
 */
async function initializeServices() {
  console.log('🚀 Initializing Recoder Desktop Professional Services...');
  
  try {
    // Initialize authentication service
    authService = new DesktopAuthService();
    console.log('✅ Authentication service initialized');
    
    // Initialize service discovery
    serviceDiscovery = new ServiceDiscoveryManager();
    console.log('✅ Service discovery initialized');
    
    // Initialize iframe security manager
    iframeManager = new IframeSecurityManager(authService, serviceDiscovery);
    console.log('✅ Iframe security manager initialized');
    
    // Setup service event listeners
    setupServiceEventListeners();
    
    // Check authentication status
    const authStatus = await authService.checkAuthStatus();
    appState.userAuthenticated = authStatus.authenticated;
    appState.currentUser = authStatus.user;
    
    // Start service discovery
    await serviceDiscovery.discoverServices();
    
    appState.servicesReady = true;
    console.log('✅ All professional services initialized successfully');
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    return false;
  }
}

/**
 * Setup service event listeners for real-time updates
 */
function setupServiceEventListeners() {
  // Service discovery events
  serviceDiscovery.on('discovery:complete', (data) => {
    console.log(`🔍 Service discovery complete: ${data.discovered} services, ${data.healthy} healthy`);
    appState.serviceStatus = data;
    
    if (mainWindow) {
      mainWindow.webContents.send('services:discovery-complete', data);
    }
  });
  
  serviceDiscovery.on('service:discovered', (service) => {
    console.log(`✅ Service discovered: ${service.name} at ${service.url}`);
    
    if (mainWindow) {
      mainWindow.webContents.send('services:service-discovered', service);
    }
  });
  
  serviceDiscovery.on('service:unhealthy', (status) => {
    console.warn(`⚠️ Service unhealthy: ${status.id} - ${status.error}`);
    
    if (mainWindow) {
      mainWindow.webContents.send('services:service-unhealthy', status);
    }
  });
  
  serviceDiscovery.on('health:summary', (summary) => {
    appState.serviceStatus.healthSummary = summary;
    
    if (mainWindow) {
      mainWindow.webContents.send('services:health-summary', summary);
    }
  });
}

/**
 * Create the main application window
 */
function createWindow() {
  console.log('🪟 Creating main application window...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-professional.js'),
      webSecurity: false, // Required for localhost development
      allowRunningInsecureContent: true,
      experimentalFeatures: true
    },
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });
  
  // Load the professional UI
  mainWindow.loadFile(path.join(__dirname, 'ui-professional.html'));
  
  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
    
    // Configure web security for iframe embedding
    setupWebSecurity();
    
    // Send initial app state to renderer
    mainWindow.webContents.send('app:state-update', appState);
    
    // Check for updates (production only)
    if (!isDev) {
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
      }, 3000);
    }
    
    console.log('✅ Main window ready and visible');
  });
  
  // Development tools
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
  
  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Setup web security configuration for iframe embedding
 */
function setupWebSecurity() {
  const { session } = mainWindow.webContents;
  
  // Configure web request handlers for CORS and X-Frame-Options
  session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    
    // Remove restrictive headers for localhost
    if (details.url.includes('localhost')) {
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['Content-Security-Policy'];
      
      // Add permissive headers
      responseHeaders['X-Frame-Options'] = ['ALLOWALL'];
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET', 'POST', 'PUT', 'DELETE, OPTIONS'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    }
    
    callback({ responseHeaders });
  });
  
  console.log('🔒 Web security configured for iframe embedding');
}

/**
 * Setup auto-updater configuration
 */
function setupAutoUpdater() {
  if (isDev) return;
  
  autoUpdater.checkForUpdatesAndNotify();
  
  autoUpdater.on('update-available', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: 'A new version is available. It will be downloaded in the background.',
      buttons: ['OK']
    });
  });
  
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The application will restart to apply the update.',
      buttons: ['Restart Now', 'Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
}

/**
 * Professional IPC handlers
 */
function setupIPCHandlers() {
  // Application state
  ipcMain.handle('app:get-state', () => appState);
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);
  
  // Service management
  ipcMain.handle('services:get-all', async () => {
    if (!serviceDiscovery) return [];
    return serviceDiscovery.getAllServices();
  });
  
  ipcMain.handle('services:get-status', async () => {
    if (!serviceDiscovery) return null;
    return serviceDiscovery.getOverallStatus();
  });
  
  ipcMain.handle('services:discover', async () => {
    if (!serviceDiscovery) return false;
    return await serviceDiscovery.discoverServices();
  });
  
  ipcMain.handle('services:health-check', async (event, serviceId) => {
    if (!serviceDiscovery) return null;
    return await serviceDiscovery.checkServiceHealth(serviceId);
  });
  
  // Application loading
  ipcMain.handle('app:load', async (event, appName, options = {}) => {
    console.log(`🔄 Professional app loading: ${appName}`);
    
    try {
      // Handle special panels
      if (appName === 'offline-ai' || appName === 'settings' || appName === 'dashboard') {
        return {
          success: true,
          type: 'panel',
          appName,
          config: { isPanel: true }
        };
      }
      
      // Direct URL mapping for known services (more reliable)
      const directUrls = {
        'recoder-chat': 'http://localhost:3001',
        'recoder-web': 'http://localhost:3003',
        'recoder-extension': 'http://localhost:5173'
      };
      
      const directUrl = directUrls[appName];
      if (directUrl) {
        // Test if the service is available
        try {
          const response = await axios.get(directUrl, { 
            timeout: 3000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500
          });
          
          console.log(`✅ Direct loading successful: ${appName} at ${directUrl}`);
          return {
            success: true,
            type: 'service',
            appName,
            config: {
              url: directUrl,
              allow: 'camera; microphone; clipboard-read; clipboard-write',
              sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads'
            }
          };
        } catch (error) {
          console.warn(`⚠️ Direct loading failed for ${appName}: ${error.message}`);
          // Continue to professional iframe manager fallback
        }
      }
      
      // Use professional iframe manager as fallback
      if (iframeManager && serviceDiscovery) {
        const result = await iframeManager.loadSecureIframe(appName, options);
        
        if (result.success) {
          console.log(`✅ Professional loading successful: ${appName}`);
          return {
            success: true,
            type: 'service',
            appName,
            config: result.config,
            service: result.service
          };
        } else {
          console.warn(`⚠️ Professional loading failed: ${appName} - ${result.error}`);
          return {
            success: false,
            type: 'error',
            appName,
            error: result.error || 'Service not available',
            fallback: directUrl ? {
              url: directUrl,
              message: 'Service may be starting up. Please try again.'
            } : null
          };
        }
      }
      
      // Final fallback
      return {
        success: false,
        type: 'error',
        appName,
        error: directUrl ? `Service at ${directUrl} is not responding` : 'Service not configured'
      };
      
    } catch (error) {
      console.error(`❌ App loading error for ${appName}:`, error);
      return {
        success: false,
        type: 'error',
        appName,
        error: error.message
      };
    }
  });
  
  // Authentication
  ipcMain.handle('auth:login', async () => {
    if (!authService) throw new Error('Auth service not initialized');
    return await authService.initiateLogin();
  });
  
  ipcMain.handle('auth:logout', async () => {
    if (!authService) throw new Error('Auth service not initialized');
    const result = await authService.logout();
    appState.userAuthenticated = false;
    appState.currentUser = null;
    return result;
  });
  
  ipcMain.handle('auth:get-status', async () => {
    if (!authService) return { authenticated: false };
    return await authService.checkAuthStatus();
  });
  
  // External links
  ipcMain.handle('app:open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // Auto-update
  ipcMain.handle('update:check', async () => {
    if (isDev) return { available: false, message: 'Updates not available in development' };
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        available: result.updateInfo.version !== app.getVersion(),
        currentVersion: app.getVersion(),
        latestVersion: result.updateInfo.version
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  });
  
  ipcMain.handle('update:install', async () => {
    if (isDev) return { success: false, message: 'Updates not available in development' };
    try {
      autoUpdater.quitAndInstall();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // AI Handlers for Ollama integration
  ipcMain.handle('ai:check-ollama-status', async () => {
    const available = await checkOllamaAvailability();
    return {
      available,
      baseUrl: 'http://localhost:11434',
      models: available ? ['llama3:latest', 'codellama:latest'] : []
    };
  });
  
  ipcMain.handle('ai:generate-code-offline', async (event, options) => {
    const ollamaAvailable = await checkOllamaAvailability();
    if (!ollamaAvailable) {
      return {
        success: false,
        error: 'Ollama is not available. Please install and start Ollama.'
      };
    }
    
    try {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: options.model || 'llama3:latest',
        prompt: options.prompt,
        stream: false
      }, { timeout: 60000 });
      
      return {
        success: true,
        code: response.data.response,
        model: response.data.model
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });
  
  ipcMain.handle('ai:list-ollama-models', async () => {
    const ollamaAvailable = await checkOllamaAvailability();
    if (!ollamaAvailable) {
      return { success: false, models: [] };
    }
    
    try {
      const response = await axios.get('http://localhost:11434/api/tags');
      return {
        success: true,
        models: response.data.models || []
      };
    } catch (error) {
      return { success: false, models: [], error: error.message };
    }
  });
  
  ipcMain.handle('ai:pull-ollama-model', async (event, modelName) => {
    const ollamaAvailable = await checkOllamaAvailability();
    if (!ollamaAvailable) {
      return { success: false, error: 'Ollama not available' };
    }
    
    try {
      await axios.post('http://localhost:11434/api/pull', {
        name: modelName,
        stream: false
      }, { timeout: 300000 });
      
      return {
        success: true,
        message: `Successfully pulled model: ${modelName}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  console.log('✅ Professional IPC handlers registered');
}

/**
 * Setup application menu
 */
function setupApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh Services',
          accelerator: 'CmdOrCtrl+R',
          click: async () => {
            if (serviceDiscovery) {
              await serviceDiscovery.discoverServices();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: async () => {
            if (!isDev) {
              autoUpdater.checkForUpdatesAndNotify();
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Authentication',
      submenu: [
        {
          label: 'Login',
          click: async () => {
            if (authService && !appState.userAuthenticated) {
              try {
                await authService.initiateLogin();
              } catch (error) {
                dialog.showErrorBox('Login Failed', error.message);
              }
            }
          }
        },
        {
          label: 'Logout',
          click: async () => {
            if (authService && appState.userAuthenticated) {
              try {
                await authService.logout();
                appState.userAuthenticated = false;
                appState.currentUser = null;
              } catch (error) {
                dialog.showErrorBox('Logout Failed', error.message);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'View Profile',
          enabled: appState.userAuthenticated,
          click: () => {
            if (appState.currentUser) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'User Profile',
                message: `Logged in as: ${appState.currentUser.name || appState.currentUser.email}`,
                buttons: ['OK']
              });
            }
          }
        }
      ]
    },
    {
      label: 'Services',
      submenu: [
        {
          label: 'Service Dashboard',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('app:navigate', 'dashboard');
            }
          }
        },
        {
          label: 'Discover Services',
          accelerator: 'CmdOrCtrl+D',
          click: async () => {
            if (serviceDiscovery) {
              await serviceDiscovery.discoverServices();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Health Check All',
          click: async () => {
            if (serviceDiscovery) {
              await serviceDiscovery.healthCheckAll();
            }
          }
        }
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
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  
  console.log('✅ Application menu configured');
}

/**
 * Check Ollama availability for offline AI
 */
async function checkOllamaAvailability() {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
    console.log('✅ Ollama is available for offline AI');
    return true;
  } catch (error) {
    console.log('ℹ️ Ollama not available:', error.message);
    return false;
  }
}

/**
 * Application lifecycle handlers
 */
app.whenReady().then(async () => {
  console.log('🚀 Recoder Desktop starting...');
  
  // Setup IPC handlers
  setupIPCHandlers();
  
  // Initialize professional services
  const servicesInitialized = await initializeServices();
  appState.initialized = servicesInitialized;
  
  // Check Ollama availability
  await checkOllamaAvailability();
  
  // Create main window
  createWindow();
  
  // Setup application menu
  setupApplicationMenu();
  
  // Setup auto-updater
  setupAutoUpdater();
  
  console.log('✅ Recoder Desktop started successfully');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle app certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Cleanup on exit
app.on('before-quit', () => {
  console.log('🧹 Cleaning up professional services...');
  
  if (iframeManager) {
    iframeManager.cleanup();
  }
  
  console.log('✅ Cleanup complete');
});

module.exports = {
  authService,
  serviceDiscovery,
  iframeManager,
  appState
};