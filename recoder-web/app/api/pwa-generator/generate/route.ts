import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { generateServiceWorker } from '@/lib/pwa/service-worker-generator';
import { generateManifest } from '@/lib/pwa/manifest-builder';
import { generateOfflineManager } from '@/lib/pwa/offline-manager';
import { generateNotificationService } from '@/lib/pwa/notification-service';
import { generateInstallPrompt } from '@/lib/pwa/install-prompt-generator';
import { PWAConfig } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const config: PWAConfig = await request.json();
    
    // Validate required fields
    if (!config.name || !config.shortName || !config.startUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: name, shortName, or startUrl' },
        { status: 400 }
      );
    }

    const zip = new JSZip();
    
    // Generate Web App Manifest
    const manifest = generateManifest(config);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    
    // Generate Service Worker
    if (config.serviceWorker.enabled) {
      const serviceWorkerCode = generateServiceWorker(config);
      zip.file(config.serviceWorker.fileName, serviceWorkerCode);
      
      // Generate Workbox config
      const workboxConfig = {
        globDirectory: 'public/',
        globPatterns: config.serviceWorker.precachePatterns,
        swDest: config.serviceWorker.fileName,
        runtimeCaching: config.serviceWorker.runtimeCaching.map(rule => ({
          urlPattern: new RegExp(rule.urlPattern),
          handler: rule.handler,
          options: rule.options
        })),
        skipWaiting: config.serviceWorker.skipWaiting,
        clientsClaim: config.serviceWorker.clientsClaim
      };
      zip.file('workbox-config.js', `module.exports = ${JSON.stringify(workboxConfig, null, 2)};`);
    }
    
    // Generate offline manager
    if (config.offline.enabled) {
      const offlineManagerCode = generateOfflineManager(config);
      zip.file('js/offline-manager.js', offlineManagerCode);
      
      if (config.offline.indexedDBEnabled) {
        const dbSchemaCode = generateIndexedDBSchema(config);
        zip.file('js/db-schema.js', dbSchemaCode);
      }
    }
    
    // Generate notification service
    if (config.notifications.enabled) {
      const notificationServiceCode = generateNotificationService(config);
      zip.file('js/notification-service.js', notificationServiceCode);
    }
    
    // Generate install prompt
    if (config.features.installPrompt) {
      const installPromptCode = generateInstallPrompt(config);
      zip.file('js/install-prompt.js', installPromptCode);
    }
    
    // Generate PWA utilities
    const pwaUtilsCode = generatePWAUtils(config);
    zip.file('js/pwa-utils.js', pwaUtilsCode);
    
    // Generate HTML template with PWA integration
    const htmlTemplate = generateHTMLTemplate(config);
    zip.file('index.html', htmlTemplate);
    
    // Generate CSS for PWA styling
    const pwaStyles = generatePWAStyles(config);
    zip.file('css/pwa-styles.css', pwaStyles);
    
    // Generate API endpoints for backend integration
    if (config.notifications.enabled || config.offline.enabled) {
      const apiEndpoints = generateAPIEndpoints(config);
      zip.file('api/pwa-endpoints.js', apiEndpoints);
    }
    
    // Generate documentation
    const documentation = generateDocumentation(config);
    zip.file('README.md', documentation);
    
    // Generate package.json for dependencies
    const packageJson = generatePackageJson(config);
    zip.file('package.json', JSON.stringify(packageJson, null, 2));
    
    // Generate deployment scripts
    const deploymentScripts = generateDeploymentScripts(config);
    zip.file('deploy.sh', deploymentScripts.deploy);
    zip.file('build.sh', deploymentScripts.build);
    
    // Generate testing files
    const testFiles = generateTestFiles(config);
    zip.file('tests/pwa.test.js', testFiles.pwaTest);
    zip.file('tests/service-worker.test.js', testFiles.serviceWorkerTest);
    
    // Generate the ZIP file
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Log generation for analytics
    console.log('PWA generated:', {
      name: config.name,
      features: Object.keys(config.features).filter(key => config.features[key as keyof typeof config.features]),
      timestamp: new Date().toISOString()
    });
    
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${config.shortName}-pwa.zip"`
      }
    });
    
  } catch (error) {
    console.error('PWA generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PWA', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function generateIndexedDBSchema(config: PWAConfig): string {
  return `
// IndexedDB Schema for ${config.name}
class PWADatabase {
  constructor() {
    this.dbName = '${config.shortName.toLowerCase()}-db';
    this.version = 1;
    this.db = null;
  }
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('offline-data')) {
          const store = db.createObjectStore('offline-data', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('sync-queue')) {
          const syncStore = db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('action', 'action', { unique: false });
          syncStore.createIndex('pending', 'pending', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('cache-metadata')) {
          const metaStore = db.createObjectStore('cache-metadata', { keyPath: 'url' });
          metaStore.createIndex('expiry', 'expiry', { unique: false });
        }
      };
    });
  }
  
  async addToSyncQueue(action, data) {
    const transaction = this.db.transaction(['sync-queue'], 'readwrite');
    const store = transaction.objectStore('sync-queue');
    
    return store.add({
      action,
      data,
      pending: true,
      timestamp: Date.now(),
      retryCount: 0
    });
  }
  
  async getOfflineData(type) {
    const transaction = this.db.transaction(['offline-data'], 'readonly');
    const store = transaction.objectStore('offline-data');
    const index = store.index('type');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(type);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async saveOfflineData(type, data) {
    const transaction = this.db.transaction(['offline-data'], 'readwrite');
    const store = transaction.objectStore('offline-data');
    
    return store.add({
      type,
      data,
      timestamp: Date.now(),
      synced: false
    });
  }
}

export default PWADatabase;
`;
}

function generatePWAUtils(config: PWAConfig): string {
  return `
// PWA Utilities for ${config.name}
class PWAUtils {
  constructor() {
    this.isOnline = navigator.onLine;
    this.installPromptEvent = null;
    
    // Listen for network changes
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.onNetworkChange('online');
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.onNetworkChange('offline');
    });
    
    // Listen for install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPromptEvent = e;
      this.showInstallButton();
    });
  }
  
  onNetworkChange(status) {
    console.log('Network status changed:', status);
    document.dispatchEvent(new CustomEvent('networkchange', { detail: { status } }));
    
    if (status === 'online') {
      this.syncOfflineData();
    }
  }
  
  async syncOfflineData() {
    ${config.offline.enabled && config.offline.indexedDBEnabled ? `
    try {
      const db = new PWADatabase();
      await db.init();
      
      const transaction = db.db.transaction(['sync-queue'], 'readonly');
      const store = transaction.objectStore('sync-queue');
      const index = store.index('pending');
      
      const request = index.getAll(true);
      request.onsuccess = async () => {
        const pendingItems = request.result;
        
        for (const item of pendingItems) {
          try {
            await this.processSyncItem(item);
            // Mark as synced
            const updateTransaction = db.db.transaction(['sync-queue'], 'readwrite');
            const updateStore = updateTransaction.objectStore('sync-queue');
            item.pending = false;
            item.syncedAt = Date.now();
            updateStore.put(item);
          } catch (error) {
            console.error('Sync failed for item:', item, error);
            // Increment retry count
            item.retryCount = (item.retryCount || 0) + 1;
            if (item.retryCount < 3) {
              const retryTransaction = db.db.transaction(['sync-queue'], 'readwrite');
              const retryStore = retryTransaction.objectStore('sync-queue');
              retryStore.put(item);
            }
          }
        }
      };
    } catch (error) {
      console.error('Background sync failed:', error);
    }
    ` : '// Background sync disabled'}
  }
  
  async processSyncItem(item) {
    const response = await fetch(item.data.url, {
      method: item.data.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...item.data.headers
      },
      body: JSON.stringify(item.data.body)
    });
    
    if (!response.ok) {
      throw new Error(\`Sync failed: \${response.status}\`);
    }
    
    return response.json();
  }
  
  async showInstallButton() {
    ${config.features.installPrompt ? `
    const installButton = document.getElementById('install-button');
    if (installButton) {
      installButton.style.display = 'block';
      installButton.addEventListener('click', () => this.promptInstall());
    }
    ` : '// Install prompt disabled'}
  }
  
  async promptInstall() {
    if (this.installPromptEvent) {
      const result = await this.installPromptEvent.prompt();
      console.log('Install prompt result:', result);
      
      if (result.outcome === 'accepted') {
        console.log('PWA installed');
        this.onInstalled();
      }
      
      this.installPromptEvent = null;
    }
  }
  
  onInstalled() {
    document.dispatchEvent(new CustomEvent('pwa-installed'));
    
    // Hide install button
    const installButton = document.getElementById('install-button');
    if (installButton) {
      installButton.style.display = 'none';
    }
    
    // Show welcome message
    this.showNotification('Welcome!', {
      body: '${config.name} has been installed successfully!',
      icon: '${config.notifications.defaultIcon}',
      badge: '${config.notifications.defaultBadge}'
    });
  }
  
  async showNotification(title, options = {}) {
    ${config.notifications.enabled ? `
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        icon: '${config.notifications.defaultIcon}',
        badge: '${config.notifications.defaultBadge}',
        ...options
      });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, options);
      }
    }
    ` : '// Push notifications disabled'}
  }
  
  async shareContent(data) {
    ${config.features.webShare ? `
    if (navigator.share) {
      try {
        await navigator.share(data);
        return true;
      } catch (error) {
        console.log('Sharing failed:', error);
        return false;
      }
    }
    ` : ''}
    
    // Fallback to clipboard
    if (navigator.clipboard && data.url) {
      try {
        await navigator.clipboard.writeText(data.url);
        this.showNotification('Link copied to clipboard!');
        return true;
      } catch (error) {
        console.error('Clipboard write failed:', error);
      }
    }
    
    return false;
  }
  
  async requestPermissions() {
    const permissions = {};
    
    ${config.features.pushNotifications ? `
    // Notification permission
    if ('Notification' in window) {
      permissions.notifications = await Notification.requestPermission();
    }
    ` : ''}
    
    ${config.features.geolocation ? `
    // Geolocation permission
    if ('geolocation' in navigator) {
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        permissions.geolocation = 'granted';
      } catch (error) {
        permissions.geolocation = 'denied';
      }
    }
    ` : ''}
    
    ${config.features.cameraAccess ? `
    // Camera permission
    if ('mediaDevices' in navigator) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        permissions.camera = 'granted';
      } catch (error) {
        permissions.camera = 'denied';
      }
    }
    ` : ''}
    
    return permissions;
  }
  
  ${config.features.deviceVibration ? `
  vibrate(pattern = [200]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }
  ` : ''}
  
  ${config.features.screenWakeLock ? `
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        const wakeLock = await navigator.wakeLock.request('screen');
        return wakeLock;
      }
    } catch (error) {
      console.error('Wake lock failed:', error);
    }
    return null;
  }
  ` : ''}
}

// Initialize PWA Utils
const pwaUtils = new PWAUtils();
window.pwaUtils = pwaUtils;

export default PWAUtils;
`;
}

function generateHTMLTemplate(config: PWAConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.name}</title>
  <meta name="description" content="${config.description}">
  
  <!-- PWA Meta Tags -->
  <meta name="theme-color" content="${config.themeColor}">
  <meta name="background-color" content="${config.backgroundColor}">
  <meta name="display" content="${config.display}">
  <link rel="manifest" href="/manifest.json">
  
  <!-- iOS Meta Tags -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="${config.shortName}">
  ${config.icons.map(icon => 
    `<link rel="apple-touch-icon" sizes="${icon.sizes}" href="${icon.src}">`
  ).join('\n  ')}
  
  <!-- Favicon -->
  ${config.icons.length > 0 ? `<link rel="icon" href="${config.icons[0].src}">` : ''}
  
  <!-- Styles -->
  <link rel="stylesheet" href="/css/pwa-styles.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>${config.name}</h1>
      <p>${config.description}</p>
      ${config.features.installPrompt ? '<button id="install-button" style="display: none;">Install App</button>' : ''}
    </header>
    
    <main>
      <div id="content">
        <h2>Welcome to ${config.name}</h2>
        <p>This is a Progressive Web App with the following features:</p>
        <ul>
          ${config.features.offlineSupport ? '<li>✓ Offline Support</li>' : ''}
          ${config.features.backgroundSync ? '<li>✓ Background Sync</li>' : ''}
          ${config.features.pushNotifications ? '<li>✓ Push Notifications</li>' : ''}
          ${config.features.installPrompt ? '<li>✓ App Installation</li>' : ''}
          ${config.features.webShare ? '<li>✓ Web Share API</li>' : ''}
          ${config.features.fileSystemAccess ? '<li>✓ File System Access</li>' : ''}
          ${config.features.cameraAccess ? '<li>✓ Camera Access</li>' : ''}
          ${config.features.geolocation ? '<li>✓ Geolocation</li>' : ''}
        </ul>
        
        ${config.features.webShare ? `
        <button onclick="pwaUtils.shareContent({
          title: '${config.name}',
          text: '${config.description}',
          url: window.location.href
        })">Share This App</button>
        ` : ''}
        
        ${config.features.pushNotifications ? `
        <button onclick="pwaUtils.requestPermissions()">Enable Notifications</button>
        ` : ''}
      </div>
      
      <div id="offline-indicator" style="display: none;">
        <p>You are currently offline. Some features may be limited.</p>
      </div>
    </main>
    
    <footer>
      <p>Network Status: <span id="network-status">Online</span></p>
    </footer>
  </div>
  
  <!-- Scripts -->
  ${config.serviceWorker.enabled ? `
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/${config.serviceWorker.fileName}')
          .then(registration => {
            console.log('SW registered: ', registration);
          })
          .catch(registrationError => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  </script>
  ` : ''}
  
  <script src="/js/pwa-utils.js"></script>
  ${config.offline.enabled ? '<script src="/js/offline-manager.js"></script>' : ''}
  ${config.notifications.enabled ? '<script src="/js/notification-service.js"></script>' : ''}
  ${config.features.installPrompt ? '<script src="/js/install-prompt.js"></script>' : ''}
  
  <script>
    // Network status monitoring
    function updateNetworkStatus(status) {
      document.getElementById('network-status').textContent = status;
      document.getElementById('offline-indicator').style.display = status === 'offline' ? 'block' : 'none';
    }
    
    document.addEventListener('networkchange', (e) => {
      updateNetworkStatus(e.detail.status);
    });
    
    // Initialize
    updateNetworkStatus(navigator.onLine ? 'online' : 'offline');
  </script>
</body>
</html>`;
}

function generatePWAStyles(config: PWAConfig): string {
  return `
/* PWA Styles for ${config.name} */
:root {
  --theme-color: ${config.themeColor};
  --background-color: ${config.backgroundColor};
  --text-color: ${config.themeColor === '#ffffff' ? '#000000' : '#ffffff'};
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  background-color: var(--background-color);
  color: var(--text-color);
  line-height: 1.6;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  background-color: var(--theme-color);
  color: var(--text-color);
  padding: 1rem;
  text-align: center;
}

header h1 {
  margin-bottom: 0.5rem;
}

#install-button {
  background-color: var(--background-color);
  color: var(--theme-color);
  border: 2px solid var(--theme-color);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 1rem;
  font-weight: bold;
}

#install-button:hover {
  background-color: var(--theme-color);
  color: var(--background-color);
}

main {
  flex: 1;
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

#content ul {
  margin: 1rem 0;
  padding-left: 2rem;
}

#content button {
  background-color: var(--theme-color);
  color: var(--text-color);
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  margin: 0.5rem;
  font-size: 1rem;
}

#content button:hover {
  opacity: 0.9;
}

#offline-indicator {
  background-color: #ff6b6b;
  color: white;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
  text-align: center;
}

footer {
  background-color: var(--theme-color);
  color: var(--text-color);
  padding: 1rem;
  text-align: center;
  margin-top: auto;
}

#network-status {
  font-weight: bold;
}

/* Responsive Design */
@media (max-width: 768px) {
  main {
    padding: 1rem;
  }
  
  header {
    padding: 1rem 0.5rem;
  }
  
  #content button {
    display: block;
    width: 100%;
    margin: 0.5rem 0;
  }
}

/* PWA Display Modes */
@media (display-mode: standalone) {
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
}

/* Loading States */
.loading {
  opacity: 0.6;
  pointer-events: none;
}

.loading::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid var(--theme-color);
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Notification Styles */
.notification {
  position: fixed;
  top: 1rem;
  right: 1rem;
  background-color: var(--theme-color);
  color: var(--text-color);
  padding: 1rem;
  border-radius: 4px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
`;
}

function generateAPIEndpoints(config: PWAConfig): string {
  return `
// API Endpoints for ${config.name} PWA
const express = require('express');
const router = express.Router();

${config.notifications.enabled ? `
// Push Notification Subscription
router.post('/notifications/subscribe', async (req, res) => {
  try {
    const { subscription, userId } = req.body;
    
    // Save subscription to database
    // await saveSubscription(userId, subscription);
    
    res.json({ success: true, message: 'Subscription saved' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Send Push Notification
router.post('/notifications/send', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;
    
    // Get user subscription
    // const subscription = await getUserSubscription(userId);
    
    const payload = JSON.stringify({
      title,
      body,
      icon: '${config.notifications.defaultIcon}',
      badge: '${config.notifications.defaultBadge}',
      data
    });
    
    // Send notification using web-push
    // await webpush.sendNotification(subscription, payload);
    
    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});
` : ''}

${config.offline.enabled ? `
// Background Sync
router.post('/sync', async (req, res) => {
  try {
    const { action, data } = req.body;
    
    switch (action) {
      case 'sync-offline-data':
        // Process offline data
        // await processOfflineData(data);
        break;
      case 'sync-user-actions':
        // Process user actions
        // await processUserActions(data);
        break;
      default:
        throw new Error('Unknown sync action');
    }
    
    res.json({ success: true, message: 'Sync completed' });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Offline Data Storage
router.post('/offline-data', async (req, res) => {
  try {
    const { type, data, timestamp } = req.body;
    
    // Store offline data
    // await storeOfflineData(type, data, timestamp);
    
    res.json({ success: true, message: 'Data stored' });
  } catch (error) {
    console.error('Offline data storage error:', error);
    res.status(500).json({ error: 'Failed to store data' });
  }
});
` : ''}

// PWA Analytics
router.post('/analytics', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    // Log analytics event
    console.log('PWA Analytics:', { event, data, timestamp: new Date() });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Analytics failed' });
  }
});

// Health Check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    pwa: '${config.name}',
    version: '1.0.0'
  });
});

module.exports = router;
`;
}

function generateDocumentation(config: PWAConfig): string {
  return `# ${config.name} - Progressive Web App

## Overview
${config.description}

## Features
${Object.entries(config.features)
  .filter(([_, enabled]) => enabled)
  .map(([feature, _]) => `- ✅ ${feature.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}`)
  .join('\n')}

## Installation

### Development
\`\`\`bash
npm install
npm run dev
\`\`\`

### Production
\`\`\`bash
npm run build
npm start
\`\`\`

### Deployment
\`\`\`bash
chmod +x deploy.sh
./deploy.sh
\`\`\`

## Configuration

### Manifest
The web app manifest is configured with:
- **Name**: ${config.name}
- **Short Name**: ${config.shortName}
- **Display Mode**: ${config.display}
- **Theme Color**: ${config.themeColor}
- **Background Color**: ${config.backgroundColor}

### Service Worker
${config.serviceWorker.enabled ? `
Service worker is enabled with:
- **Caching Strategy**: ${config.caching.strategy}
- **Precache Patterns**: ${config.serviceWorker.precachePatterns.join(', ')}
- **Runtime Caching**: ${config.serviceWorker.runtimeCaching.length} rules
` : 'Service worker is disabled.'}

### Offline Support
${config.offline.enabled ? `
Offline functionality includes:
- **Fallback Page**: ${config.offline.fallbackPage}
- **IndexedDB**: ${config.offline.indexedDBEnabled ? 'Enabled' : 'Disabled'}
- **Conflict Resolution**: ${config.offline.conflictResolution}
` : 'Offline support is disabled.'}

### Push Notifications
${config.notifications.enabled ? `
Push notifications are configured with:
- **VAPID Keys**: Configured
- **Subscriber Endpoint**: ${config.notifications.subscriberEndpoint}
- **Default Icon**: ${config.notifications.defaultIcon}
` : 'Push notifications are disabled.'}

## API Endpoints

${config.notifications.enabled ? `
### Notifications
- \`POST /api/notifications/subscribe\` - Subscribe to notifications
- \`POST /api/notifications/send\` - Send push notification
` : ''}

${config.offline.enabled ? `
### Offline Sync
- \`POST /api/sync\` - Background sync endpoint
- \`POST /api/offline-data\` - Store offline data
` : ''}

### General
- \`GET /api/health\` - Health check
- \`POST /api/analytics\` - Analytics tracking

## File Structure

\`\`\`
/
├── manifest.json           # Web app manifest
${config.serviceWorker.enabled ? '├── sw.js                   # Service worker' : ''}
├── index.html              # Main HTML file
├── css/
│   └── pwa-styles.css      # PWA styling
├── js/
│   ├── pwa-utils.js        # PWA utilities
${config.offline.enabled ? '│   ├── offline-manager.js   # Offline functionality' : ''}
${config.notifications.enabled ? '│   ├── notification-service.js # Push notifications' : ''}
${config.features.installPrompt ? '│   └── install-prompt.js   # Install prompt' : ''}
├── api/
│   └── pwa-endpoints.js    # Backend API
├── tests/
│   ├── pwa.test.js         # PWA tests
│   └── service-worker.test.js # SW tests
├── package.json            # Dependencies
├── deploy.sh              # Deployment script
└── README.md              # This file
\`\`\`

## Testing

### PWA Audit
Use Lighthouse to audit your PWA:
\`\`\`bash
npm install -g lighthouse
lighthouse http://localhost:3000 --view
\`\`\`

### Service Worker Testing
\`\`\`bash
npm test
\`\`\`

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Service Workers | ✅ | ✅ | ✅ | ✅ |
| Web App Manifest | ✅ | ✅ | ✅ | ✅ |
| Push Notifications | ✅ | ✅ | ❌ | ✅ |
| Background Sync | ✅ | ❌ | ❌ | ✅ |
| Install Prompt | ✅ | ❌ | ✅ | ✅ |

## Performance

### Lighthouse Scores
Target scores for this PWA:
- **Performance**: 90+
- **Accessibility**: 95+
- **Best Practices**: 95+
- **SEO**: 90+
- **PWA**: 100

### Optimization Tips
1. Minimize and compress assets
2. Use efficient caching strategies
3. Optimize images and icons
4. Implement lazy loading
5. Monitor Core Web Vitals

## Security

### Content Security Policy
Implement CSP headers:
\`\`\`
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
\`\`\`

### HTTPS
Always serve PWAs over HTTPS in production.

## Deployment

### Vercel
\`\`\`bash
npm install -g vercel
vercel --prod
\`\`\`

### Netlify
\`\`\`bash
npm run build
netlify deploy --prod --dir=dist
\`\`\`

### Custom Server
See \`deploy.sh\` for custom deployment script.

## Monitoring

### Analytics
Track PWA-specific events:
- App installs
- Offline usage
- Service worker updates
- Push notification engagement

### Error Tracking
Monitor service worker errors and offline failures.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

Generated by Recoder.xyz PWA Builder
`;
}

function generatePackageJson(config: PWAConfig): string {
  const dependencies: Record<string, string> = {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  };

  if (config.notifications.enabled) {
    dependencies["web-push"] = "^3.6.6";
  }

  if (config.serviceWorker.enabled) {
    dependencies["workbox-cli"] = "^7.0.0";
    dependencies["workbox-webpack-plugin"] = "^7.0.0";
  }

  return JSON.stringify({
    name: config.shortName.toLowerCase(),
    version: "1.0.0",
    description: config.description,
    main: "index.js",
    scripts: {
      dev: "node server.js",
      build: "./build.sh",
      start: "NODE_ENV=production node server.js",
      test: "jest",
      "test:pwa": "lighthouse http://localhost:3000 --output=json --output-path=./lighthouse-report.json",
      deploy: "./deploy.sh",
      ...(config.serviceWorker.enabled && {
        "build:sw": "workbox generateSW workbox-config.js"
      })
    },
    dependencies,
    devDependencies: {
      jest: "^29.7.0",
      lighthouse: "^11.4.0",
      "@types/node": "^20.10.0"
    },
    keywords: [
      "pwa",
      "progressive-web-app",
      "service-worker",
      "offline",
      ...(config.features.pushNotifications ? ["push-notifications"] : []),
      ...(config.features.backgroundSync ? ["background-sync"] : [])
    ],
    author: "Generated by Recoder.xyz",
    license: "MIT"
  }, null, 2);
}

function generateDeploymentScripts(config: PWAConfig): {
  deploy: string;
  build: string;
} {
  return {
    deploy: `#!/bin/bash
# Deployment script for ${config.name}

echo "🚀 Deploying ${config.name} PWA..."

# Build the application
npm run build

# Test PWA compliance
echo "🧪 Testing PWA compliance..."
npm run test:pwa

# Check for required files
if [ ! -f "manifest.json" ]; then
  echo "❌ manifest.json not found!"
  exit 1
fi

${config.serviceWorker.enabled ? `
if [ ! -f "${config.serviceWorker.fileName}" ]; then
  echo "❌ Service worker not found!"
  exit 1
fi
` : ''}

# Deploy to production
echo "📦 Deploying to production..."

# Add your deployment commands here
# Examples:
# rsync -avz ./ user@server:/var/www/html/
# aws s3 sync ./ s3://your-bucket/
# vercel --prod
# netlify deploy --prod

echo "✅ Deployment complete!"
echo "🌐 Your PWA is now live!"
`,
    build: `#!/bin/bash
# Build script for ${config.name}

echo "🔨 Building ${config.name} PWA..."

# Clean previous build
rm -rf dist/

# Create dist directory
mkdir -p dist/

# Copy static files
cp index.html dist/
cp manifest.json dist/
cp -r css/ dist/css/
cp -r js/ dist/js/

${config.serviceWorker.enabled ? `
# Generate service worker
npm run build:sw
cp ${config.serviceWorker.fileName} dist/
` : ''}

# Copy icons if they exist
if [ -d "icons" ]; then
  cp -r icons/ dist/icons/
fi

# Minify CSS and JS
if command -v terser &> /dev/null; then
  echo "🗜️  Minifying JavaScript..."
  find dist/js -name "*.js" -exec terser {} --compress --mangle --output {} \\;
fi

if command -v csso &> /dev/null; then
  echo "🗜️  Minifying CSS..."
  find dist/css -name "*.css" -exec csso {} --output {} \\;
fi

echo "✅ Build complete! Files are in dist/"
`
  };
}

function generateTestFiles(config: PWAConfig): {
  pwaTest: string;
  serviceWorkerTest: string;
} {
  return {
    pwaTest: `
// PWA Tests for ${config.name}
describe('PWA Functionality', () => {
  beforeEach(() => {
    // Mock service worker
    global.navigator = {
      serviceWorker: {
        register: jest.fn(() => Promise.resolve()),
        ready: Promise.resolve({
          sync: {
            register: jest.fn(() => Promise.resolve())
          }
        })
      },
      onLine: true
    };
    
    global.window = {
      addEventListener: jest.fn(),
      location: { href: 'http://localhost:3000' }
    };
  });

  test('should have valid manifest', async () => {
    const manifest = require('../manifest.json');
    
    expect(manifest.name).toBe('${config.name}');
    expect(manifest.short_name).toBe('${config.shortName}');
    expect(manifest.start_url).toBe('${config.startUrl}');
    expect(manifest.display).toBe('${config.display}');
    expect(manifest.theme_color).toBe('${config.themeColor}');
    expect(manifest.background_color).toBe('${config.backgroundColor}');
    expect(manifest.icons).toHaveLength(${config.icons.length});
  });

  ${config.serviceWorker.enabled ? `
  test('should register service worker', async () => {
    const { registerServiceWorker } = require('../js/pwa-utils.js');
    
    await registerServiceWorker();
    
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/${config.serviceWorker.fileName}');
  });
  ` : ''}

  ${config.features.installPrompt ? `
  test('should handle install prompt', () => {
    const installEvent = new Event('beforeinstallprompt');
    installEvent.prompt = jest.fn(() => Promise.resolve({ outcome: 'accepted' }));
    
    window.dispatchEvent(installEvent);
    
    // Test install button appears
    const installButton = document.getElementById('install-button');
    expect(installButton).toBeTruthy();
  });
  ` : ''}

  ${config.offline.enabled ? `
  test('should handle offline state', () => {
    global.navigator.onLine = false;
    
    const offlineEvent = new Event('offline');
    window.dispatchEvent(offlineEvent);
    
    const offlineIndicator = document.getElementById('offline-indicator');
    expect(offlineIndicator.style.display).toBe('block');
  });
  ` : ''}

  ${config.features.webShare ? `
  test('should support web share', async () => {
    global.navigator.share = jest.fn(() => Promise.resolve());
    
    const { shareContent } = require('../js/pwa-utils.js');
    const result = await shareContent({
      title: '${config.name}',
      text: '${config.description}',
      url: 'http://localhost:3000'
    });
    
    expect(result).toBe(true);
    expect(navigator.share).toHaveBeenCalled();
  });
  ` : ''}
});
`,
    serviceWorkerTest: `
// Service Worker Tests for ${config.name}
${config.serviceWorker.enabled ? `
describe('Service Worker', () => {
  let sw;
  
  beforeEach(() => {
    // Mock service worker environment
    global.self = {
      addEventListener: jest.fn(),
      skipWaiting: jest.fn(() => Promise.resolve()),
      clients: {
        claim: jest.fn(() => Promise.resolve()),
        matchAll: jest.fn(() => Promise.resolve([]))
      },
      registration: {
        showNotification: jest.fn(() => Promise.resolve())
      }
    };
    
    global.caches = {
      open: jest.fn(() => Promise.resolve({
        match: jest.fn(),
        add: jest.fn(),
        addAll: jest.fn(),
        put: jest.fn(),
        delete: jest.fn()
      })),
      match: jest.fn(),
      delete: jest.fn()
    };
    
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      clone: () => ({})
    }));
  });

  test('should install and activate', async () => {
    // Load service worker
    require('../${config.serviceWorker.fileName}');
    
    expect(self.addEventListener).toHaveBeenCalledWith('install', expect.any(Function));
    expect(self.addEventListener).toHaveBeenCalledWith('activate', expect.any(Function));
    expect(self.addEventListener).toHaveBeenCalledWith('fetch', expect.any(Function));
  });

  test('should cache resources on install', async () => {
    const installEvent = {
      waitUntil: jest.fn()
    };
    
    // Simulate install event
    const installHandler = self.addEventListener.mock.calls
      .find(call => call[0] === 'install')[1];
    
    installHandler(installEvent);
    
    expect(installEvent.waitUntil).toHaveBeenCalled();
  });

  ${config.features.backgroundSync ? `
  test('should handle background sync', async () => {
    const syncEvent = {
      tag: 'background-sync',
      waitUntil: jest.fn()
    };
    
    const syncHandler = self.addEventListener.mock.calls
      .find(call => call[0] === 'sync')[1];
    
    if (syncHandler) {
      syncHandler(syncEvent);
      expect(syncEvent.waitUntil).toHaveBeenCalled();
    }
  });
  ` : ''}

  ${config.notifications.enabled ? `
  test('should handle push notifications', async () => {
    const pushEvent = {
      data: {
        json: () => ({
          title: 'Test Notification',
          body: 'Test Body',
          icon: '${config.notifications.defaultIcon}'
        })
      },
      waitUntil: jest.fn()
    };
    
    const pushHandler = self.addEventListener.mock.calls
      .find(call => call[0] === 'push')[1];
    
    if (pushHandler) {
      pushHandler(pushEvent);
      expect(pushEvent.waitUntil).toHaveBeenCalled();
    }
  });
  ` : ''}

  test('should respond to fetch events', async () => {
    const fetchEvent = {
      request: new Request('http://localhost:3000/'),
      respondWith: jest.fn()
    };
    
    const fetchHandler = self.addEventListener.mock.calls
      .find(call => call[0] === 'fetch')[1];
    
    fetchHandler(fetchEvent);
    
    expect(fetchEvent.respondWith).toHaveBeenCalled();
  });
});
` : `
// Service Worker is disabled
describe('Service Worker', () => {
  test('should not register service worker', () => {
    expect(true).toBe(true); // Service worker disabled
  });
});
`}
`
  };
}
