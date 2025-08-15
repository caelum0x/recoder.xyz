/**
 * Professional Desktop UI Controller
 * Manages the complete desktop application interface with real-time updates
 */

class RecoderDesktopUI {
  constructor() {
    this.currentApp = 'dashboard';
    this.loadedFrames = new Set();
    this.services = new Map();
    this.appState = null;
    this.user = null;
    
    this.initialize();
  }

  async initialize() {
    console.log('🚀 Initializing Recoder Desktop UI...');
    
    try {
      // Setup event listeners
      this.setupEventListeners();
      
      // Get initial app state
      await this.loadAppState();
      
      // Setup service monitoring
      this.setupServiceMonitoring();
      
      // Setup authentication
      this.setupAuthentication();
      
      // Initialize dashboard
      await this.initializeDashboard();
      
      console.log('✅ UI initialized successfully');
      
    } catch (error) {
      console.error('❌ UI initialization failed:', error);
      this.showError('Initialization Failed', error.message);
    }
  }

  setupEventListeners() {
    // Navigation tabs
    document.getElementById('nav-tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('.nav-tab');
      if (tab) {
        const appName = tab.dataset.app;
        this.switchToApp(appName);
      }
    });

    // Authentication button
    document.getElementById('auth-button').addEventListener('click', () => {
      this.handleAuthAction();
    });

    // Service discovery events
    if (window.recoderAPI) {
      window.recoderAPI.services.onDiscoveryComplete((event, data) => {
        this.handleServiceDiscovery(data);
      });

      window.recoderAPI.services.onServiceDiscovered((event, service) => {
        this.updateServiceInUI(service);
      });

      window.recoderAPI.services.onServiceUnhealthy((event, status) => {
        this.handleServiceUnhealthy(status);
      });

      window.recoderAPI.services.onHealthSummary((event, summary) => {
        this.updateHealthSummary(summary);
      });

      window.recoderAPI.app.onStateUpdate((event, state) => {
        this.appState = state;
        this.updateUIFromState();
      });
    }

    console.log('✅ Event listeners setup complete');
  }

  async loadAppState() {
    try {
      if (window.recoderAPI) {
        this.appState = await window.recoderAPI.app.getState();
        this.updateUIFromState();
      }
    } catch (error) {
      console.error('Failed to load app state:', error);
    }
  }

  updateUIFromState() {
    if (!this.appState) return;

    // Update system status indicator
    const statusIndicator = document.getElementById('system-status');
    if (this.appState.servicesReady) {
      statusIndicator.className = 'status-indicator';
    } else {
      statusIndicator.className = 'status-indicator degraded';
    }

    // Update authentication UI
    if (this.appState.userAuthenticated && this.appState.currentUser) {
      this.updateAuthenticatedUI(this.appState.currentUser);
    } else {
      this.updateUnauthenticatedUI();
    }
  }

  async setupServiceMonitoring() {
    try {
      // Load initial services
      const services = await window.recoderAPI.services.getAll();
      this.updateServicesDisplay(services);

      // Start periodic health checks
      setInterval(async () => {
        try {
          const status = await window.recoderAPI.services.getStatus();
          this.updateOverallStatus(status);
        } catch (error) {
          console.warn('Health check failed:', error);
        }
      }, 30000); // Check every 30 seconds

    } catch (error) {
      console.error('Failed to setup service monitoring:', error);
    }
  }

  async setupAuthentication() {
    try {
      const authStatus = await window.recoderAPI.auth.getStatus();
      
      if (authStatus.authenticated && authStatus.user) {
        this.updateAuthenticatedUI(authStatus.user);
      } else {
        this.updateUnauthenticatedUI();
      }
    } catch (error) {
      console.error('Failed to setup authentication:', error);
    }
  }

  async initializeDashboard() {
    try {
      // Discover services
      await this.discoverServices();
      
      // Hide loading state
      document.getElementById('loading-container').style.display = 'none';
      
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
    }
  }

  async switchToApp(appName) {
    console.log(`🔄 Switching to app: ${appName}`);

    try {
      // Update active tab
      document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      const activeTab = document.querySelector(`[data-app="${appName}"]`);
      if (activeTab) {
        activeTab.classList.add('active');
      }

      // Handle panels vs iframe apps
      if (appName === 'dashboard' || appName === 'settings' || appName === 'offline-ai') {
        this.showPanel(appName);
      } else {
        await this.loadIframeApp(appName);
      }

      this.currentApp = appName;

    } catch (error) {
      console.error(`Failed to switch to ${appName}:`, error);
      this.showError('App Loading Failed', `Could not load ${appName}: ${error.message}`);
    }
  }

  showPanel(panelName) {
    // Hide all panels and frames
    document.querySelectorAll('.panel').forEach(panel => {
      panel.classList.remove('active');
    });
    
    document.querySelectorAll('.app-frame').forEach(frame => {
      frame.classList.remove('active');
    });

    // Show the requested panel
    const panel = document.getElementById(`panel-${panelName}`);
    if (panel) {
      panel.classList.add('active');
    }

    // Update panel content
    this.updatePanelContent(panelName);
  }

  async loadIframeApp(appName) {
    try {
      const frameId = `frame-${appName}`;
      const frame = document.getElementById(frameId);
      
      if (!frame) {
        throw new Error(`Frame not found for ${appName}`);
      }

      // Show loading
      this.showLoading(`Loading ${appName}...`);

      // Hide all panels and frames
      document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
      });
      
      document.querySelectorAll('.app-frame').forEach(iframe => {
        iframe.classList.remove('active');
      });

      // Load the app if not already loaded
      if (!this.loadedFrames.has(appName)) {
        const result = await window.recoderAPI.apps.load(appName);
        
        if (result.success) {
          frame.src = result.config.url;
          
          if (result.config.allow) {
            frame.setAttribute('allow', result.config.allow);
          }
          
          if (result.config.sandbox) {
            frame.setAttribute('sandbox', result.config.sandbox);
          }

          this.loadedFrames.add(appName);
          this.updateTabStatus(appName, 'healthy');
          
          console.log(`✅ Loaded ${appName} successfully`);
          
        } else {
          throw new Error(result.error || 'Failed to load app');
        }
      }

      // Show the frame
      frame.classList.add('active');
      
      // Hide loading
      this.hideLoading();

      // Update tab status
      this.updateTabStatus(appName, 'healthy');

    } catch (error) {
      console.error(`Failed to load iframe app ${appName}:`, error);
      this.hideLoading();
      this.updateTabStatus(appName, 'error');
      this.showError('App Loading Failed', `Could not load ${appName}: ${error.message}`);
    }
  }

  updatePanelContent(panelName) {
    switch (panelName) {
      case 'dashboard':
        this.updateDashboard();
        break;
      case 'settings':
        this.updateSettings();
        break;
      case 'offline-ai':
        this.updateOfflineAI();
        break;
    }
  }

  async updateDashboard() {
    try {
      const services = await window.recoderAPI.services.getAll();
      this.updateServicesDisplay(services);
      
      const status = await window.recoderAPI.services.getStatus();
      this.updateHealthSummary(status);
      
    } catch (error) {
      console.error('Failed to update dashboard:', error);
    }
  }

  async updateSettings() {
    try {
      const version = await window.recoderAPI.app.getVersion();
      const platform = await window.recoderAPI.app.getPlatform();
      
      document.getElementById('app-version').textContent = version;
      document.getElementById('app-platform').textContent = platform;
      
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  }

  async updateOfflineAI() {
    try {
      const status = await window.recoderAPI.ai.checkOllamaStatus();
      
      const statusElement = document.getElementById('ollama-status');
      if (status.available) {
        statusElement.innerHTML = `
          <div class="service-status healthy">✅ Ollama Available</div>
          <p>Models: ${status.models?.join(', ') || 'Loading...'}</p>
        `;
      } else {
        statusElement.innerHTML = `
          <div class="service-status unhealthy">❌ Ollama Not Available</div>
          <p>Please install Ollama from <a href="https://ollama.ai" target="_blank">ollama.ai</a></p>
        `;
      }
      
    } catch (error) {
      console.error('Failed to update offline AI:', error);
    }
  }

  updateServicesDisplay(services) {
    const grid = document.getElementById('services-grid');
    if (!grid) return;

    grid.innerHTML = '';

    services.forEach(service => {
      const card = this.createServiceCard(service);
      grid.appendChild(card);
      this.services.set(service.id, service);
    });

    // Update service summary
    this.updateServiceSummary(services);
  }

  createServiceCard(service) {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <div class="service-header">
        <div class="service-info">
          <span class="service-icon">${service.icon}</span>
          <span class="service-name">${service.name}</span>
        </div>
        <span class="service-status ${service.status}">${service.status.toUpperCase()}</span>
      </div>
      <div class="service-details">
        <p><strong>URL:</strong> ${service.url || 'Not available'}</p>
        <p><strong>Category:</strong> ${service.category}</p>
        ${service.responseTime ? `<p><strong>Response Time:</strong> ${service.responseTime}ms</p>` : ''}
        ${service.error ? `<p><strong>Error:</strong> ${service.error}</p>` : ''}
      </div>
    `;

    // Add click handler to load the service
    if (service.status === 'healthy' && service.url) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        this.switchToApp(service.id);
      });
    }

    return card;
  }

  updateServiceSummary(services) {
    const healthy = services.filter(s => s.status === 'healthy').length;
    const total = services.length;
    
    const summary = document.getElementById('service-summary');
    if (summary) {
      summary.textContent = `${healthy}/${total} services healthy`;
    }
  }

  updateHealthSummary(status) {
    const container = document.getElementById('health-summary');
    if (!container || !status) return;

    container.innerHTML = `
      <div class="health-overview">
        <h3>Overall Status: <span class="service-status ${status.overall}">${status.overall.toUpperCase()}</span></h3>
        <div class="health-categories">
          <div><strong>Web Apps:</strong> ${status.categories['web-apps']?.healthy || 0}/${status.categories['web-apps']?.total || 0}</div>
          <div><strong>APIs:</strong> ${status.categories['apis']?.healthy || 0}/${status.categories['apis']?.total || 0}</div>
          <div><strong>AI Services:</strong> ${status.categories['ai-services']?.healthy || 0}/${status.categories['ai-services']?.total || 0}</div>
        </div>
        <p><small>Last updated: ${new Date().toLocaleTimeString()}</small></p>
      </div>
    `;
  }

  updateTabStatus(appName, status) {
    const tab = document.querySelector(`[data-app="${appName}"]`);
    if (!tab) return;

    const statusIndicator = tab.querySelector('.tab-status');
    if (statusIndicator) {
      statusIndicator.className = `tab-status ${status}`;
    }
  }

  async handleAuthAction() {
    try {
      const authStatus = await window.recoderAPI.auth.getStatus();
      
      if (authStatus.authenticated) {
        // Logout
        await window.recoderAPI.auth.logout();
        this.updateUnauthenticatedUI();
        this.showNotification('Logged out successfully', 'success');
      } else {
        // Login
        const result = await window.recoderAPI.auth.login();
        if (result.success) {
          this.updateAuthenticatedUI(result.user);
          this.showNotification('Logged in successfully', 'success');
        }
      }
    } catch (error) {
      console.error('Auth action failed:', error);
      this.showNotification('Authentication failed: ' + error.message, 'error');
    }
  }

  updateAuthenticatedUI(user) {
    this.user = user;
    
    const userInfo = document.getElementById('user-info');
    const authButton = document.getElementById('auth-button');
    const userName = document.getElementById('user-name');
    
    if (userInfo && authButton && userName) {
      userName.textContent = user.name || user.email || 'User';
      userInfo.style.display = 'flex';
      authButton.textContent = 'Logout';
    }
  }

  updateUnauthenticatedUI() {
    this.user = null;
    
    const userInfo = document.getElementById('user-info');
    const authButton = document.getElementById('auth-button');
    
    if (userInfo && authButton) {
      userInfo.style.display = 'none';
      authButton.textContent = 'Login';
    }
  }

  async discoverServices() {
    try {
      this.showNotification('Discovering services...', 'info');
      const services = await window.recoderAPI.services.discover();
      this.updateServicesDisplay(services);
      this.showNotification('Service discovery complete', 'success');
    } catch (error) {
      console.error('Service discovery failed:', error);
      this.showNotification('Service discovery failed: ' + error.message, 'error');
    }
  }

  async checkForUpdates() {
    try {
      const result = await window.recoderAPI.updates.check();
      
      if (result.available) {
        this.showNotification(`Update available: v${result.latestVersion}`, 'info');
      } else {
        this.showNotification('You have the latest version', 'success');
      }
    } catch (error) {
      console.error('Update check failed:', error);
      this.showNotification('Update check failed: ' + error.message, 'error');
    }
  }

  showLoading(message = 'Loading...') {
    const container = document.getElementById('loading-container');
    const text = container.querySelector('.loading-text');
    
    if (text) {
      text.textContent = message;
    }
    
    container.style.display = 'flex';
  }

  hideLoading() {
    const container = document.getElementById('loading-container');
    container.style.display = 'none';
  }

  showError(title, message) {
    const container = document.getElementById('error-container');
    const titleElement = container.querySelector('.error-title');
    const messageElement = container.querySelector('.error-message');
    
    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;
    
    container.style.display = 'flex';
  }

  hideError() {
    const container = document.getElementById('error-container');
    container.style.display = 'none';
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div>${message}</div>
    `;

    const container = document.getElementById('notifications');
    container.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  handleServiceDiscovery(data) {
    console.log('🔍 Service discovery complete:', data);
    this.updateServicesDisplay(data.services);
    this.showNotification(`Discovered ${data.discovered} services, ${data.healthy} healthy`, 'success');
  }

  updateServiceInUI(service) {
    console.log('✅ Service discovered:', service);
    this.services.set(service.id, service);
    
    // Update the service card if it exists
    const existingCard = document.querySelector(`[data-service-id="${service.id}"]`);
    if (existingCard) {
      existingCard.replaceWith(this.createServiceCard(service));
    }
    
    // Update tab status if this service has a tab
    this.updateTabStatus(service.id, service.status);
  }

  handleServiceUnhealthy(status) {
    console.warn('⚠️ Service unhealthy:', status);
    this.updateTabStatus(status.id, 'error');
    this.showNotification(`${status.id} is unhealthy: ${status.error}`, 'warning');
  }

  updateOverallStatus(status) {
    const indicator = document.getElementById('system-status');
    if (!indicator) return;

    indicator.className = `status-indicator ${status.overall}`;
  }
}

// Global functions for HTML event handlers
window.discoverServices = async function() {
  if (window.desktopUI) {
    await window.desktopUI.discoverServices();
  }
};

window.retryConnection = function() {
  if (window.desktopUI) {
    window.desktopUI.hideError();
    window.desktopUI.switchToApp(window.desktopUI.currentApp);
  }
};

window.openInBrowser = async function() {
  const service = window.desktopUI?.services.get(window.desktopUI.currentApp);
  if (service?.url) {
    await window.recoderAPI.app.openExternal(service.url);
  }
};

window.checkForUpdates = async function() {
  if (window.desktopUI) {
    await window.desktopUI.checkForUpdates();
  }
};

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎨 Initializing Professional Desktop UI...');
  window.desktopUI = new RecoderDesktopUI();
});

// Performance monitoring
window.addEventListener('load', () => {
  console.log('📊 Professional UI Performance:', {
    loadTime: performance.now(),
    memory: performance.memory ? {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
    } : 'Not available'
  });
});

console.log('✅ Professional UI script loaded');