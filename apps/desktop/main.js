const { app, BrowserWindow, clipboard, nativeImage, Menu, Tray, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Custom protocol scheme for deep linking
const PROTOCOL_SCHEME = 'recoder';

// Get URL from environment variable or default to production
const APP_URL = process.env.APP_URL || 'https://recoder.xyz/';

// Simple dev check without ES module dependency
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Normalize URL - ensure localhost uses http, not https
function normalizeUrl(url) {
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return url.replace(/^https:\/\//, 'http://');
  }
  return url;
}

// Check if URL is localhost
function isLocalhost(url) {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

const normalizedUrl = normalizeUrl(APP_URL);
const isLocal = isLocalhost(normalizedUrl);
const autoUpdateEnabled = process.env.DESKTOP_AUTO_UPDATE !== 'false';
const crashWebhookUrl = process.env.DESKTOP_CRASH_WEBHOOK_URL || '';
const dockerWorkflowApiUrl = process.env.DOCKER_BACKEND_URL || 'http://localhost:3100';
const desktopWorkflowRetryRaw = process.env.RECODER_WORKFLOW_FETCH_RETRIES || process.env.OPENCLAW_WORKFLOW_FETCH_RETRIES || '2';
const desktopWorkflowMaxAttempts = Number.isFinite(Number.parseInt(desktopWorkflowRetryRaw, 10))
  && Number.parseInt(desktopWorkflowRetryRaw, 10) > 0
  ? Number.parseInt(desktopWorkflowRetryRaw, 10)
  : 2;
const desktopStrictWorkflowContract = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECODER_WORKFLOW_STRICT_CONTRACT || process.env.OPENCLAW_WORKFLOW_STRICT_CONTRACT || '')
    .trim()
    .toLowerCase(),
);
const WORKFLOW_CONTRACT_VERSION = 'internal-agent-workflow-v1';
const PUBLIC_WORKFLOW_CONTRACT_VERSION = 'public-agent-workflow-v1';

const desktopSubagentWorkflowLanes = [
  { laneId: 'A1', title: 'Core app and web runtime', paths: ['/Users/arhansubasi/recoder.xyz/app', '/Users/arhansubasi/recoder.xyz/recoder-web'] },
  { laneId: 'A2', title: 'Desktop productization', paths: ['/Users/arhansubasi/recoder.xyz/apps/desktop'] },
  { laneId: 'A3', title: 'Frontend and mobile', paths: ['/Users/arhansubasi/recoder.xyz/apps/frontend', '/Users/arhansubasi/recoder.xyz/apps/mobile'] },
  { laneId: 'A4', title: 'Studio and UI apps', paths: ['/Users/arhansubasi/recoder.xyz/recoder-studio', '/Users/arhansubasi/recoder.xyz/apps/ui.giselles.ai'] },
  { laneId: 'A5', title: 'Python backend', paths: ['/Users/arhansubasi/recoder.xyz/backend'] },
  { laneId: 'A6', title: 'Docker backend', paths: ['/Users/arhansubasi/recoder.xyz/docker-backend'] },
  { laneId: 'A7', title: 'OpenClaw ecosystem', paths: ['/Users/arhansubasi/recoder.xyz/openclaw'] },
  { laneId: 'A8', title: 'Shared packages', paths: ['/Users/arhansubasi/recoder.xyz/packages'] },
  { laneId: 'A9', title: 'Agency product', paths: ['/Users/arhansubasi/recoder.xyz/recoder-agency'] },
  { laneId: 'A10', title: 'PM product', paths: ['/Users/arhansubasi/recoder.xyz/recoder-pm'] },
  { laneId: 'A11', title: 'Skill system', paths: ['/Users/arhansubasi/recoder.xyz/recoder-skill'] },
  { laneId: 'A12', title: 'Tools and evals', paths: ['/Users/arhansubasi/recoder.xyz/tools'] },
];

function appendDesktopLog(fileName, line) {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, fileName), `${line}${os.EOL}`, 'utf-8');
  } catch (error) {
    console.error('Failed to write desktop log:', error);
  }
}

async function notifyCrashWebhook(payload) {
  if (!crashWebhookUrl) {
    return;
  }
  try {
    await fetch(crashWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    appendDesktopLog('errors.log', `[webhook-error] ${new Date().toISOString()} ${String(error)}`);
  }
}

function logRuntimeError(kind, error, extra = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack || '' : '';
  const payload = {
    timestamp: new Date().toISOString(),
    kind,
    message,
    stack,
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    appUrl: normalizedUrl,
    ...extra,
  };
  appendDesktopLog('errors.log', JSON.stringify(payload));
  void notifyCrashWebhook(payload);
}

function buildDesktopWorkflowFallback(payload = {}) {
  const task = typeof payload.task === 'string' && payload.task.trim().length > 0
    ? payload.task.trim()
    : 'continuous subagent development';
  const continuous = payload.continuous !== false;
  const requestedPaths = Array.isArray(payload.paths)
    ? payload.paths.filter((repoPath) => typeof repoPath === 'string' && repoPath.trim().length > 0)
    : null;

  const lanes = requestedPaths
    ? desktopSubagentWorkflowLanes.filter((lane) =>
        lane.paths.some((lanePath) =>
          requestedPaths.some((requestedPath) =>
            lanePath === requestedPath || lanePath.startsWith(`${requestedPath}/`),
          ),
        ),
      )
    : desktopSubagentWorkflowLanes;

  return {
    mode: continuous ? 'continuous' : 'single-task',
    summary: `Task: ${task} | Active lanes: ${lanes.length}`,
    lanes,
    nextActions: [
      'Run lane tasks in parallel and keep ownership strict by repo path.',
      'Run lane validation commands after implementation batches.',
      'Record evidence in plan.md after every cycle.',
    ],
  };
}

async function getCookieHeaderForUrl(targetUrl) {
  try {
    const session = BrowserWindow.getAllWindows()[0]?.webContents?.session || null;
    if (!session) {
      return '';
    }
    const cookies = await session.cookies.get({ url: targetUrl });
    if (!cookies.length) {
      return '';
    }
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  } catch {
    return '';
  }
}

function resolveDesktopRecoderApiKeyFromCache() {
  try {
    const storePath = path.join(os.homedir(), '.openclaw', 'credentials', 'recoder-api-keys.json');
    if (!fs.existsSync(storePath)) {
      return '';
    }
    const raw = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const keys = parsed && parsed.keys && typeof parsed.keys === 'object'
      ? Object.values(parsed.keys)
      : [];
    for (const entry of keys) {
      if (entry && typeof entry.apiKey === 'string' && entry.apiKey.trim()) {
        return entry.apiKey.trim();
      }
    }
  } catch {
    // ignore cache read errors; caller handles fallback
  }
  return '';
}

function resolveDesktopRecoderApiKeyDetailed() {
  const envKey = process.env.RECODER_API_KEY || process.env.OPENCLAW_RECODER_API_KEY || '';
  if (envKey.trim()) {
    return { value: envKey.trim(), source: 'env' };
  }
  const cacheKey = resolveDesktopRecoderApiKeyFromCache();
  if (cacheKey.trim()) {
    return { value: cacheKey.trim(), source: 'cache' };
  }
  return { value: '', source: 'none' };
}

function resolveDesktopWorkflowAuthContext(params) {
  const sessionToken = (params.sessionToken || '').trim();
  if (sessionToken) {
    return {
      mode: 'session-token',
      source: 'env',
      token: sessionToken,
      endpointPath: '/api/agent/workflow',
      contract: WORKFLOW_CONTRACT_VERSION,
      headers: { Authorization: `Bearer ${sessionToken}` },
    };
  }
  const apiKey = (params.apiKey || '').trim();
  if (apiKey) {
    return {
      mode: 'api-key',
      source: params.apiKeySource === 'none' ? 'env' : params.apiKeySource,
      token: apiKey,
      endpointPath: '/api/v1/agent/workflow',
      contract: PUBLIC_WORKFLOW_CONTRACT_VERSION,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  }
  const cookie = (params.cookieHeader || '').trim();
  if (cookie) {
    return {
      mode: 'cookie-session',
      source: 'cookie',
      token: '',
      endpointPath: '/api/agent/workflow',
      contract: WORKFLOW_CONTRACT_VERSION,
      headers: { Cookie: cookie },
    };
  }
  return {
    mode: 'none',
    source: 'none',
    token: '',
    endpointPath: '/api/v1/agent/workflow',
    contract: PUBLIC_WORKFLOW_CONTRACT_VERSION,
    headers: {},
  };
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDesktopWorkflowFromBackend(payload = {}) {
  const baseUrl = dockerWorkflowApiUrl.replace(/\/+$/, '');
  const sessionToken =
    process.env.RECODER_SESSION_TOKEN
    || process.env.OPENCLAW_RECODER_SESSION_TOKEN
    || process.env.SESSION_TOKEN
    || '';
  const cookieHeader = await getCookieHeaderForUrl(normalizedUrl);
  const apiKey = resolveDesktopRecoderApiKeyDetailed();
  const auth = resolveDesktopWorkflowAuthContext({
    sessionToken,
    apiKey: apiKey.value,
    apiKeySource: apiKey.source,
    cookieHeader,
  });
  const strictContract = payload && payload.strict === true
    ? true
    : desktopStrictWorkflowContract;
  const endpoint = `${baseUrl}${auth.endpointPath}`;
  const warnings = [];
  if (auth.mode === 'none') {
    warnings.push('No session token, API key, or desktop cookie session found; backend may reject request.');
  }

  let attempts = 0;
  let lastError = null;

  for (let attempt = 1; attempt <= desktopWorkflowMaxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.headers,
        },
        body: JSON.stringify({
          task: payload.task,
          paths: Array.isArray(payload.paths) ? payload.paths : undefined,
          continuous: payload.continuous !== false,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const transient = response.status >= 500 || response.status === 429;
        const message = `workflow request failed: ${response.status}${text ? ` ${text.trim()}` : ''}`.trim();
        if (attempt < desktopWorkflowMaxAttempts && transient) {
          warnings.push(`attempt ${attempt}/${desktopWorkflowMaxAttempts} failed (${response.status}); retrying`);
          await sleepMs(attempt * 250);
          continue;
        }
        throw new Error(message);
      }

      const result = await response.json();
      const workflow = result?.workflow || result?.data?.workflow;
      const responseContract = typeof result?.contract === 'string'
        ? result.contract
        : typeof result?.data?.contract === 'string'
          ? result.data.contract
          : null;
      const contractStatus = responseContract
        ? responseContract === auth.contract
          ? 'match'
          : 'mismatch'
        : 'missing';
      if (!workflow) {
        throw new Error('workflow response missing payload');
      }
      if (!responseContract) {
        warnings.push(`response contract marker missing (expected ${auth.contract})`);
      } else if (responseContract !== auth.contract) {
        warnings.push(`response contract mismatch: expected ${auth.contract}, got ${responseContract}`);
      }
      if (strictContract && contractStatus !== 'match') {
        throw new Error(`strict contract check failed: expected ${auth.contract}, got ${responseContract || 'missing'}`);
      }

      return {
        workflow,
        meta: {
          endpoint,
          contract: auth.contract,
          responseContract,
          contractStatus,
          strictContract,
          authMode: auth.mode,
          authSource: auth.source,
          attempts,
          maxAttempts: desktopWorkflowMaxAttempts,
          warnings,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.startsWith('strict contract check failed')) {
        break;
      }
      if (attempt < desktopWorkflowMaxAttempts) {
        warnings.push(`attempt ${attempt}/${desktopWorkflowMaxAttempts} failed (${lastError.message}); retrying`);
        await sleepMs(attempt * 250);
        continue;
      }
    }
  }

  const finalError = new Error(
    `workflow backend unavailable after ${attempts}/${desktopWorkflowMaxAttempts} attempts (${lastError?.message || 'unknown'})`,
  );
  finalError.backendMeta = {
    endpoint,
    contract: auth.contract,
    responseContract: null,
    contractStatus: 'missing',
    strictContract,
    authMode: auth.mode,
    authSource: auth.source,
    attempts,
    maxAttempts: desktopWorkflowMaxAttempts,
    warnings,
  };
  throw finalError;
}

process.on('uncaughtException', (error) => {
  logRuntimeError('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  logRuntimeError('unhandledRejection', reason);
});

// Set app name for macOS menu bar
if (process.platform === 'darwin') {
  app.setName('Recoder');
}

// Register as default protocol handler for recoder://
// This allows magic links to open in the desktop app
if (process.defaultApp) {
  // Development mode - register with path to electron executable
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  // Production mode
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

// Store pending deep link URL (received before window is ready)
let pendingDeepLinkUrl = null;

// Handle deep link URL
function handleDeepLink(url) {
  console.log('📱 Received deep link:', url);
  
  if (!url || !url.startsWith(`${PROTOCOL_SCHEME}://`)) {
    return;
  }
  
  // Convert recoder://auth/callback?code=xxx to https://recoder.xyz/auth/callback?code=xxx
  const deepLinkPath = url.replace(`${PROTOCOL_SCHEME}://`, '');
  const webUrl = normalizedUrl.endsWith('/') 
    ? normalizedUrl + deepLinkPath 
    : normalizedUrl + '/' + deepLinkPath;
  
  console.log('🔗 Converted to web URL:', webUrl);
  
  // Get the main window
  const mainWindow = BrowserWindow.getAllWindows()[0];
  
  if (mainWindow) {
    // Load the auth callback URL
    mainWindow.loadURL(webUrl);
    
    // Focus the window
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  } else {
    // Window not ready yet, store for later
    pendingDeepLinkUrl = webUrl;
  }
}

// macOS: Handle protocol when app is already running
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: Handle protocol from command line args
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is running, quit this one
  app.quit();
} else {
  // Handle second instance (Windows/Linux deep link)
  app.on('second-instance', (event, commandLine) => {
    // Find the deep link URL in command line args
    const deepLinkUrl = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
    
    // Focus the main window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Ignore certificate errors for localhost (dev server) - must be called before app.whenReady()
if (isLocal) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.commandLine.appendSwitch('ignore-ssl-errors');
}

// Circular loading animation HTML
const loadingHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Recoder</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: #000000;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .loader-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    
    .circular-loader {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    .loader-text {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="loader-container">
    <div class="circular-loader"></div>
    <div class="loader-text">Loading...</div>
  </div>
</body>
</html>
`;

function createWindow() {
  // Use .icns for macOS (proper styling), PNG for other platforms
  const iconPath = process.platform === 'darwin' 
    ? path.resolve(__dirname, 'assets', 'icon.icns')
    : path.resolve(__dirname, 'assets', 'icon.png');
    
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    backgroundColor: '#000000',
    // Use default frame with native controls
    titleBarStyle: 'default',
    frame: true,
    transparent: false,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: !isLocal,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const { webContents } = mainWindow;

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logRuntimeError('render-process-gone', new Error(details.reason), {
      exitCode: details.exitCode,
    });
  });

  // Show loading animation immediately
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Set custom user agent to identify Electron app
  webContents.setUserAgent(webContents.getUserAgent() + ' Electron/Recoder-Desktop');

  // Create menu with back/forward navigation
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'Recoder',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { 
          label: 'Back',
          accelerator: 'CmdOrCtrl+Left',
          click: () => {
            if (webContents.navigationHistory.canGoBack()) {
              webContents.navigationHistory.goBack();
            }
          }
        },
        { 
          label: 'Forward',
          accelerator: 'CmdOrCtrl+Right',
          click: () => {
            if (webContents.navigationHistory.canGoForward()) {
              webContents.navigationHistory.goForward();
            }
          }
        },
        { 
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => webContents.reload()
        },
        { type: 'separator' },
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
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' }
        ] : [
          { role: 'close' }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Handle certificate errors for localhost
  if (isLocal) {
    webContents.on('certificate-error', (event, url, error, certificate, callback) => {
      if (isLocalhost(url)) {
        event.preventDefault();
        callback(true);
      } else {
        callback(false);
      }
    });
  }

  // Always load auth page directly for desktop app
  const authUrl = normalizedUrl.endsWith('/') 
    ? normalizedUrl + 'auth' 
    : normalizedUrl + '/auth';
  
  // Load the actual URL after the loading screen is shown
  setTimeout(() => {
    mainWindow.loadURL(authUrl);
  }, 100);

  // Intercept navigation to prevent going to homepage and handle OAuth
  webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const url = new URL(navigationUrl);
      
      // Check if this is an OAuth URL
      const isOAuthUrl = navigationUrl.includes('accounts.google.com') ||
                         navigationUrl.includes('github.com/login/oauth') ||
                         navigationUrl.includes('api.github.com') ||
                         navigationUrl.includes('/auth/callback') ||
                         navigationUrl.includes('oauth') ||
                         navigationUrl.includes('authorize');
      
      if (isOAuthUrl) {
        console.log('🚫 Preventing OAuth navigation in main window');
        console.log('✅ Opening OAuth in popup instead:', navigationUrl);
        event.preventDefault();
        
        // Create OAuth popup window with loading animation
        const oauthWindow = new BrowserWindow({
          width: 600,
          height: 800,
          parent: mainWindow,
          modal: false,
          autoHideMenuBar: true,
          title: 'Sign In',
          backgroundColor: '#000000',
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        
        // Show loading animation first, then load OAuth URL
        oauthWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
        oauthWindow.once('ready-to-show', () => {
          oauthWindow.show();
          oauthWindow.loadURL(navigationUrl);
        });
        
        // Handle OAuth callback - close popup and load callback in main window
        oauthWindow.webContents.on('will-navigate', (e, callbackUrl) => {
          if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
            console.log('✅ OAuth callback detected, closing popup');
            e.preventDefault();
            oauthWindow.close();
            mainWindow.loadURL(callbackUrl);
          }
        });
        
        oauthWindow.webContents.on('will-redirect', (e, callbackUrl) => {
          if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
            console.log('✅ OAuth redirect detected, closing popup');
            e.preventDefault();
            oauthWindow.close();
            mainWindow.loadURL(callbackUrl);
          }
        });
        
        return;
      }
      
      // Redirect homepage to auth
      if (url.pathname === '/' || url.pathname === '') {
        event.preventDefault();
        mainWindow.loadURL(authUrl);
        return;
      }
    } catch (e) {
      console.error('Navigation error:', e);
    }
  });

  // Inject homepage redirect protection on page load
  webContents.on('did-finish-load', () => {
    
    // Inject homepage redirect protection
    webContents.executeJavaScript(`
      (function() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function() {
          const url = arguments[2];
          if (url === '/' || url === '') {
            window.location.href = '/auth';
            return;
          }
          return originalPushState.apply(history, arguments);
        };
        
        history.replaceState = function() {
          const url = arguments[2];
          if (url === '/' || url === '') {
            window.location.href = '/auth';
            return;
          }
          return originalReplaceState.apply(history, arguments);
        };
        
        if (window.location.pathname === '/' || window.location.pathname === '') {
          window.location.href = '/auth';
        }
        
        window.addEventListener('popstate', function() {
          if (window.location.pathname === '/' || window.location.pathname === '') {
            window.location.href = '/auth';
          }
        });
        
        // Intercept links with target="_blank" to ensure they open in popups
        document.addEventListener('click', function(e) {
          const link = e.target.closest('a[target="_blank"]');
          if (link && link.href) {
            const href = link.href;
            // OAuth URLs should open via window.open() to trigger popup handler
            const isOAuthUrl = href.includes('accounts.google.com') ||
                               href.includes('github.com/login/oauth') ||
                               href.includes('api.github.com') ||
                               href.includes('/auth/callback') ||
                               href.includes('oauth') ||
                               href.includes('authorize');
            
            if (isOAuthUrl) {
              e.preventDefault();
              window.open(href, '_blank', 'width=500,height=700');
            }
          }
        }, true);
      })();
    `).catch(() => {});
  });

  webContents.on('did-navigate', (event, url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname === '/' || urlObj.pathname === '') {
        mainWindow.loadURL(authUrl);
        return;
      }
    } catch (e) {}
  });

  webContents.on('did-navigate-in-page', (event, url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname === '/' || urlObj.pathname === '') {
        mainWindow.loadURL(authUrl);
        return;
      }
    } catch (e) {}
  });

  // Handle all window.open() calls - OAuth and external links
  webContents.setWindowOpenHandler(({ url }) => {
    console.log('🔗 Window open requested:', url);
    
    // OAuth URLs that should open in a popup window
    const isOAuthUrl = url.includes('accounts.google.com') ||
                       url.includes('github.com/login/oauth') ||
                       url.includes('api.github.com') ||
                       url.includes('/auth/callback') ||
                       url.includes('oauth') ||
                       url.includes('authorize');
    
    if (isOAuthUrl) {
      console.log('✅ Opening OAuth in popup window');
      // Open OAuth in a popup window - Electron will create it
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 800,
          parent: mainWindow,
          modal: false,
          autoHideMenuBar: true,
          title: 'Sign In',
          backgroundColor: '#000000',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    
    console.log('🌐 Opening in system browser');
    // External links open in system browser
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  
  // Handle OAuth callback redirects from popup windows
  app.on('web-contents-created', (event, contents) => {
    // Only handle popup windows (not main window)
    if (contents !== webContents) {
      contents.on('will-navigate', (e, callbackUrl) => {
        if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
          e.preventDefault();
          // Close the popup
          const popupWindow = BrowserWindow.fromWebContents(contents);
          if (popupWindow) {
            popupWindow.close();
          }
          // Load callback in main window
          mainWindow.loadURL(callbackUrl);
        }
      });
      
      contents.on('will-redirect', (e, callbackUrl) => {
        if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
          e.preventDefault();
          // Close the popup
          const popupWindow = BrowserWindow.fromWebContents(contents);
          if (popupWindow) {
            popupWindow.close();
          }
          // Load callback in main window
          mainWindow.loadURL(callbackUrl);
        }
      });
    }
  });

  // Handle OAuth redirects back to the app in main window
  webContents.on('will-navigate', (event, url) => {
    // If navigating to our auth callback from OAuth, allow it
    if (url.includes('/auth/callback')) {
      // Re-inject nav bar after OAuth completes
      setTimeout(() => injectNavBar(), 500);
    }
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    // Use .icns for macOS dock icon - ensures proper styling with rounded corners
    const iconPath = path.resolve(__dirname, 'assets', 'icon.icns');
    console.log('🎨 Setting dock icon from:', iconPath);
    try {
      const icon = nativeImage.createFromPath(iconPath);
      console.log('🎨 Icon loaded, isEmpty:', icon.isEmpty(), 'size:', icon.getSize());
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
        console.log('✅ Dock icon set successfully');
      } else {
        console.error('❌ Icon is empty');
      }
    } catch (err) {
      console.error('❌ Error setting dock icon:', err);
    }
  }

  createWindow();

  // Handle pending deep link (received before window was ready)
  if (pendingDeepLinkUrl) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.loadURL(pendingDeepLinkUrl);
    }
    pendingDeepLinkUrl = null;
  }

  // Check command line args for deep link on startup (Windows/Linux)
  if (process.platform !== 'darwin') {
    const deepLinkUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  }

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

// ============================================================================
// IPC Handlers - File System
// ============================================================================

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Code', extensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'go', 'rs'] },
    ],
  });
  if (canceled || filePaths.length === 0) return null;
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { path: filePaths[0], content };
});

ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, { defaultPath, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return null;
  }
});

ipcMain.handle('fs:writeFile', async (_event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('fs:readDir', async (_event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      path: path.join(dirPath, e.name),
    }));
  } catch {
    return [];
  }
});

ipcMain.handle('fs:exists', async (_event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('fs:stat', async (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
    };
  } catch {
    return null;
  }
});

// ============================================================================
// IPC Handlers - Terminal (using node-pty when available)
// ============================================================================

const terminals = new Map();

ipcMain.handle('terminal:spawn', async (_event, options = {}) => {
  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

  try {
    // Try to use node-pty for native terminal
    const pty = require('node-pty');
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.env.HOME,
      env: { ...process.env, ...options.env },
    });

    term.onData((data) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:data', { id, data });
      }
    });

    term.onExit(({ exitCode }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:exit', { id, exitCode });
      }
      terminals.delete(id);
    });

    terminals.set(id, term);
    return { id, success: true };
  } catch {
    // node-pty not available - fall back to child_process
    const { spawn } = require('child_process');
    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';

    const proc = spawn(shell, [], {
      cwd: options.cwd || process.env.HOME,
      env: { ...process.env, ...options.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:data', { id, data: data.toString() });
      }
    });

    proc.stderr.on('data', (data) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:data', { id, data: data.toString() });
      }
    });

    proc.on('exit', (exitCode) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:exit', { id, exitCode });
      }
      terminals.delete(id);
    });

    terminals.set(id, proc);
    return { id, success: true, fallback: true };
  }
});

ipcMain.handle('terminal:write', async (_event, { id, data }) => {
  const term = terminals.get(id);
  if (!term) return false;
  if (term.write) {
    term.write(data); // node-pty
  } else if (term.stdin) {
    term.stdin.write(data); // child_process
  }
  return true;
});

ipcMain.handle('terminal:resize', async (_event, { id, cols, rows }) => {
  const term = terminals.get(id);
  if (term && term.resize) {
    term.resize(cols, rows); // node-pty only
  }
  return true;
});

ipcMain.handle('terminal:kill', async (_event, id) => {
  const term = terminals.get(id);
  if (term) {
    if (term.kill) term.kill();
    else if (term.destroy) term.destroy();
    terminals.delete(id);
  }
  return true;
});

// ============================================================================
// IPC Handlers - Clipboard
// ============================================================================

ipcMain.handle('clipboard:write', async (_event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('clipboard:read', async () => {
  return clipboard.readText();
});

// ============================================================================
// IPC Handlers - Window
// ============================================================================

ipcMain.handle('window:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});

ipcMain.handle('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});

ipcMain.handle('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});

ipcMain.handle('window:toggleFullscreen', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.setFullScreen(!win.isFullScreen());
});

// ============================================================================
// IPC Handlers - App
// ============================================================================

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('agent:getWorkflowPlan', async (_event, payload = {}) => {
  try {
    const remote = await fetchDesktopWorkflowFromBackend(payload);
    return { success: true, source: 'docker-backend', workflow: remote.workflow, backend: remote.meta, fallbackReason: null };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error);
    const backend = error && error.backendMeta ? error.backendMeta : null;
    logRuntimeError('desktopWorkflowFallback', error, { endpoint: dockerWorkflowApiUrl, backend, fallbackReason });
    return {
      success: true,
      source: 'local-fallback',
      workflow: buildDesktopWorkflowFallback(payload),
      backend,
      fallbackReason,
    };
  }
});

ipcMain.handle('app:openExternal', async (_event, url) => {
  try {
    const parsed = new URL(url);
    const allowedProtocols = ['http:', 'https:', 'mailto:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('app:showInFolder', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

// ============================================================================
// Auto-Updater
// ============================================================================

let autoUpdater;

try {
  if (!autoUpdateEnabled) {
    throw new Error('Auto-update disabled by DESKTOP_AUTO_UPDATE=false');
  }
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => {
    logRuntimeError('auto-updater-error', error);
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('update:downloaded', {
        version: info.version,
      });
    }
  });

  ipcMain.handle('app:checkForUpdates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result?.updateInfo };
    } catch {
      return { available: false };
    }
  });

  ipcMain.handle('app:installUpdate', () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates 10 seconds after launch
  app.whenReady().then(() => {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        logRuntimeError('auto-updater-check-failed', error);
      });
    }, 10000);
  });
} catch {
  // electron-updater not available (dev mode)
  ipcMain.handle('app:checkForUpdates', () => ({ available: false }));
  ipcMain.handle('app:installUpdate', () => {});
}

// ============================================================================
// System Tray
// ============================================================================

let tray = null;

app.whenReady().then(() => {
  // Create tray icon (use small version)
  const trayIconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'assets', 'icon.png')
    : path.join(__dirname, 'assets', 'icon.png');

  try {
    const trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Recoder',
        click: () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.show();
            win.focus();
          } else {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'New Project',
        click: () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.loadURL(normalizedUrl + 'new');
            win.show();
            win.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);

    tray.setToolTip('Recoder');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.show();
        win.focus();
      }
    });
  } catch (e) {
    console.warn('Failed to create tray:', e.message);
  }

  // Register global shortcut
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Kill all terminal processes
  for (const [id, term] of terminals) {
    if (term.kill) term.kill();
    else if (term.destroy) term.destroy();
  }
  terminals.clear();
});
