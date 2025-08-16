/**
 * RECODER.XYZ ENTERPRISE UI CONTROLLER
 * Production-grade interface controller for enterprise desktop application
 */

class RecoderEnterpriseUI {
    constructor() {
        this.currentApp = 'dashboard';
        this.services = new Map();
        this.appState = null;
        this.user = null;
        this.performanceTimer = null;
        this.healthCheckTimer = null;
        this.notifications = [];
        
        // Performance tracking
        this.performance = {
            startTime: Date.now(),
            serviceLoadTimes: new Map(),
            errorCount: 0,
            successfulLoads: 0
        };

        console.log('🏢 Initializing Recoder Enterprise UI...');
        this.initialize();
    }

    async initialize() {
        try {
            console.log('🚀 Enterprise UI initialization started...');
            
            // Force hide loading immediately for debugging
            this.hideLoading();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial application state
            await this.loadApplicationState();
            
            // Setup real-time monitoring
            this.setupRealTimeMonitoring();
            
            // Setup authentication
            await this.setupAuthentication();
            
            // Initialize dashboard
            await this.initializeDashboard();
            
            // Force show dashboard panel
            this.switchToApp('dashboard');
            
            console.log('✅ Enterprise UI initialization complete');
            this.showNotification('Enterprise Desktop Ready', 'Recoder Desktop Enterprise initialized successfully', 'success');
            
        } catch (error) {
            console.error('❌ Enterprise UI initialization failed:', error);
            this.hideLoading(); // Hide loading even on error
            this.showError('Initialization Failed', error.message);
        }
    }

    setupEventListeners() {
        console.log('📡 Setting up enterprise event listeners...');

        // Navigation tab handlers
        document.querySelector('.enterprise-nav').addEventListener('click', (event) => {
            const tab = event.target.closest('.nav-tab');
            if (tab) {
                const appName = tab.dataset.app;
                this.switchToApp(appName);
            }
        });

        // Authentication handler
        document.getElementById('auth-button').addEventListener('click', () => {
            this.handleAuthAction();
        });

        // Listen for app state updates from main process
        if (window.recoderAPI) {
            // Service updates
            window.recoderAPI.services?.onDiscoveryComplete?.((event, data) => {
                this.handleServiceDiscovery(data);
            });

            window.recoderAPI.services?.onServiceDiscovered?.((event, service) => {
                this.updateServiceInUI(service);
            });

            window.recoderAPI.services?.onServiceUnhealthy?.((event, status) => {
                this.handleServiceUnhealthy(status);
            });

            // Application state updates
            window.recoderAPI.app?.onStateUpdate?.((event, state) => {
                this.appState = state;
                this.updateUIFromState();
            });

            // Service updates from main process
            if (window.recoderAPI.dev) {
                window.addEventListener('service:updated', (event) => {
                    const { serviceId, status } = event.detail;
                    this.updateServiceInUI({ id: serviceId, ...status });
                });
            }
        }

        console.log('✅ Enterprise event listeners configured');
    }

    async loadApplicationState() {
        try {
            if (window.recoderAPI?.app?.getState) {
                this.appState = await window.recoderAPI.app.getState();
                this.updateUIFromState();
            }

            // Load app config
            if (window.recoderAPI?.app?.getConfig) {
                this.config = await window.recoderAPI.app.getConfig();
                console.log('📋 Enterprise config loaded:', this.config);
            }

            // Load version info
            if (window.recoderAPI?.app?.getVersion) {
                const version = await window.recoderAPI.app.getVersion();
                document.getElementById('app-version').textContent = version;
            }

            if (window.recoderAPI?.app?.getPlatform) {
                const platform = await window.recoderAPI.app.getPlatform();
                document.getElementById('app-platform').textContent = platform;
            }

        } catch (error) {
            console.error('Failed to load application state:', error);
        }
    }

    updateUIFromState() {
        if (!this.appState) return;

        // Update system status
        const statusIndicator = document.getElementById('system-status');
        const statusText = document.getElementById('system-status-text');
        
        if (this.appState.initialized && this.appState.connectionStatus === 'connected') {
            statusIndicator.className = 'status-indicator';
            statusText.textContent = 'All Systems Operational';
        } else if (this.appState.connectionStatus === 'connecting') {
            statusIndicator.className = 'status-indicator loading';
            statusText.textContent = 'Connecting to Services...';
        } else {
            statusIndicator.className = 'status-indicator error';
            statusText.textContent = 'System Issues Detected';
        }

        // Update authentication status
        if (this.appState.authenticated && this.appState.user) {
            this.updateAuthenticatedUI(this.appState.user);
        } else {
            this.updateUnauthenticatedUI();
        }
    }

    setupRealTimeMonitoring() {
        console.log('📊 Setting up real-time enterprise monitoring...');

        // Performance monitoring
        this.performanceTimer = setInterval(() => {
            this.updatePerformanceMetrics();
        }, 5000); // Update every 5 seconds

        // Health check timer
        this.healthCheckTimer = setInterval(async () => {
            await this.performHealthCheck();
        }, 30000); // Health check every 30 seconds

        console.log('✅ Real-time monitoring active');
    }

    updatePerformanceMetrics() {
        try {
            // Update memory usage
            if (performance.memory) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
                
                document.getElementById('memory-used').textContent = `${used} MB`;
                document.getElementById('memory-total').textContent = `${total} MB`;
            }

            // Update service metrics
            const healthyServices = Array.from(this.services.values()).filter(s => s.status === 'healthy').length;
            const totalServices = this.services.size;
            
            document.getElementById('services-online').textContent = `${healthyServices}/${totalServices}`;
            
            // Update last health check
            const lastCheck = this.appState?.lastHealthCheck;
            if (lastCheck) {
                const timeDiff = Date.now() - lastCheck;
                const seconds = Math.floor(timeDiff / 1000);
                document.getElementById('last-health-check').textContent = 
                    seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
            }

        } catch (error) {
            console.error('Performance metrics update failed:', error);
        }
    }

    async performHealthCheck() {
        try {
            if (window.recoderAPI?.services?.healthCheck) {
                const services = await window.recoderAPI.services.healthCheck();
                this.updateServicesDisplay(services);
            }
        } catch (error) {
            console.error('Health check failed:', error);
        }
    }

    async setupAuthentication() {
        try {
            if (window.recoderAPI?.auth?.getStatus) {
                const authStatus = await window.recoderAPI.auth.getStatus();
                
                if (authStatus.authenticated && authStatus.user) {
                    this.updateAuthenticatedUI(authStatus.user);
                } else {
                    this.updateUnauthenticatedUI();
                }
            }
        } catch (error) {
            console.error('Authentication setup failed:', error);
        }
    }

    async initializeDashboard() {
        try {
            console.log('📊 Initializing enterprise dashboard...');
            
            // Discover services
            await this.discoverServices();
            
            // Setup AI providers
            await this.setupAIProviders();
            
            console.log('✅ Enterprise dashboard initialized');
            
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
        }
    }

    async discoverServices() {
        try {
            console.log('🔍 Discovering enterprise services...');
            
            this.showNotification('Service Discovery', 'Scanning for available services...', 'info');
            
            if (window.recoderAPI?.services?.discover) {
                const services = await window.recoderAPI.services.discover();
                this.updateServicesDisplay(services);
                
                this.showNotification(
                    'Service Discovery Complete', 
                    `Found ${services.length} services, ${services.filter(s => s.status === 'healthy').length} healthy`, 
                    'success'
                );
            }
            
        } catch (error) {
            console.error('Service discovery failed:', error);
            this.showNotification('Service Discovery Failed', error.message, 'error');
        }
    }

    updateServicesDisplay(services) {
        const grid = document.getElementById('services-grid');
        if (!grid) return;

        // Clear existing services
        grid.innerHTML = '';

        // Update services map
        services.forEach(service => {
            this.services.set(service.id, service);
        });

        // Create service cards
        services.forEach(service => {
            const card = this.createEnterpriseServiceCard(service);
            grid.appendChild(card);
        });

        // Update navigation tab statuses
        this.updateNavigationTabStatuses(services);

        console.log(`📊 Updated ${services.length} services in dashboard`);
    }

    createEnterpriseServiceCard(service) {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.dataset.serviceId = service.id;

        const statusClass = this.getServiceStatusClass(service.status);
        const icon = this.getServiceIcon(service);
        const responseTime = service.responseTime ? `${service.responseTime}ms` : 'N/A';
        const lastCheck = service.lastCheck ? new Date(service.lastCheck).toLocaleTimeString() : 'Never';

        card.innerHTML = `
            <div class="service-header">
                <div class="service-info">
                    <div class="service-icon">${icon}</div>
                    <div class="service-details">
                        <h3>${service.name}</h3>
                        <p>${service.category || 'Service'} • ${service.url || 'No URL'}</p>
                    </div>
                </div>
                <div class="service-status ${statusClass}">${service.status}</div>
            </div>
            <div class="service-meta">
                <div class="meta-item">
                    <div class="meta-label">Response Time</div>
                    <div class="meta-value">${responseTime}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Last Check</div>
                    <div class="meta-value">${lastCheck}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Port</div>
                    <div class="meta-value">${service.port || 'N/A'}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Version</div>
                    <div class="meta-value">${service.version || 'Unknown'}</div>
                </div>
            </div>
        `;

        // Add click handler for healthy services
        if (service.status === 'healthy' && service.url) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                this.switchToApp(service.id);
            });
        }

        return card;
    }

    getServiceStatusClass(status) {
        switch (status?.toLowerCase()) {
            case 'healthy': return 'healthy';
            case 'degraded': return 'degraded';
            case 'unhealthy':
            case 'offline':
            case 'error':
                return 'error';
            default:
                return 'error';
        }
    }

    getServiceIcon(service) {
        const iconMap = {
            'chat': '💬',
            'web': '🌐',
            'extension': '🔧',
            'backend': '🔗',
            'ai-platform': '🤖',
            'web-platform': '🌐',
            'development-tools': '🔧',
            'api-service': '🔗'
        };
        
        return iconMap[service.id] || iconMap[service.category] || service.icon || '⚙️';
    }

    updateNavigationTabStatuses(services) {
        const serviceMap = new Map(services.map(s => [s.id, s]));
        
        document.querySelectorAll('.nav-tab').forEach(tab => {
            const appName = tab.dataset.app;
            const statusElement = tab.querySelector('.tab-status');
            
            if (['dashboard', 'settings', 'offline-ai'].includes(appName)) {
                // Internal panels - always healthy
                statusElement.className = 'tab-status';
                return;
            }

            const service = serviceMap.get(appName);
            if (service) {
                statusElement.className = `tab-status ${this.getServiceStatusClass(service.status)}`;
            } else {
                statusElement.className = 'tab-status error';
            }
        });
    }

    async setupAIProviders() {
        try {
            console.log('🤖 Setting up AI providers...');
            
            const aiGrid = document.getElementById('ai-providers');
            if (!aiGrid) return;

            // Check Ollama status
            let ollamaStatus = { available: false, models: [] };
            if (window.recoderAPI?.ai?.checkOllama) {
                ollamaStatus = await window.recoderAPI.ai.checkOllama();
            }

            const providers = [
                {
                    name: 'Ollama',
                    icon: '🦙',
                    description: 'Local AI models for offline development',
                    available: ollamaStatus.available,
                    models: ollamaStatus.models?.length || 0,
                    status: ollamaStatus.available ? 'Connected' : 'Not Available'
                },
                {
                    name: 'OpenAI',
                    icon: '🤖',
                    description: 'GPT models for advanced code generation',
                    available: !!window.OPENAI_AVAILABLE,
                    models: 'GPT-4, GPT-3.5',
                    status: 'Cloud Service'
                },
                {
                    name: 'Anthropic',
                    icon: '🧠',
                    description: 'Claude models for intelligent assistance',
                    available: !!window.ANTHROPIC_AVAILABLE,
                    models: 'Claude-3',
                    status: 'Cloud Service'
                },
                {
                    name: 'Groq',
                    icon: '⚡',
                    description: 'High-speed inference for rapid development',
                    available: !!window.GROQ_AVAILABLE,
                    models: 'Llama-3, Mixtral',
                    status: 'Cloud Service'
                }
            ];

            aiGrid.innerHTML = '';
            providers.forEach(provider => {
                const providerCard = document.createElement('div');
                providerCard.className = `ai-provider ${provider.available ? 'available' : ''}`;
                
                providerCard.innerHTML = `
                    <div class="ai-icon">${provider.icon}</div>
                    <div class="ai-name">${provider.name}</div>
                    <div class="ai-description">${provider.description}</div>
                    <div class="ai-models">
                        ${typeof provider.models === 'number' ? 
                            `${provider.models} models installed` : 
                            provider.models}
                    </div>
                    <div style="margin-top: 12px; font-size: 12px; color: var(--primary-400);">
                        Status: ${provider.status}
                    </div>
                `;
                
                aiGrid.appendChild(providerCard);
            });

        } catch (error) {
            console.error('AI providers setup failed:', error);
        }
    }

    async switchToApp(appName) {
        console.log(`🔄 Enterprise switching to app: ${appName}`);

        try {
            // Update active navigation tab
            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            const activeTab = document.querySelector(`[data-app="${appName}"]`);
            if (activeTab) {
                activeTab.classList.add('active');
                console.log(`✅ Tab activated: ${appName}`);
            }

            // Hide all panels and iframes
            document.querySelectorAll('.enterprise-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            
            document.querySelectorAll('.enterprise-iframe').forEach(iframe => {
                iframe.classList.remove('active');
            });

            // Handle internal panels
            if (['dashboard', 'settings', 'offline-ai', 'ai-editor'].includes(appName)) {
                this.showPanel(appName);
            } else {
                await this.loadEnterpriseApp(appName);
            }

            this.currentApp = appName;
            this.performance.successfulLoads++;

            console.log(`✅ Successfully switched to ${appName}`);

        } catch (error) {
            console.error(`❌ Failed to switch to ${appName}:`, error);
            this.performance.errorCount++;
            this.showError('App Loading Failed', `Could not load ${appName}: ${error.message}`);
        }
    }

    showPanel(panelName) {
        console.log(`🔧 Attempting to show panel: ${panelName}`);
        const panel = document.getElementById(`panel-${panelName}`);
        if (panel) {
            panel.classList.add('active');
            console.log(`✅ Panel activated: ${panelName}`);
            
            // Force visibility for debugging
            panel.style.display = 'block';
            panel.style.visibility = 'visible';
            panel.style.opacity = '1';
            
            // Refresh panel content
            if (panelName === 'dashboard') {
                console.log('🔄 Refreshing dashboard...');
                this.refreshDashboard();
            } else if (panelName === 'offline-ai') {
                console.log('🤖 Setting up AI providers...');
                this.setupAIProviders();
            } else if (panelName === 'ai-editor') {
                console.log('✨ AI Code Editor panel activated');
            }
        } else {
            console.error(`❌ Panel not found: panel-${panelName}`);
        }
    }

    async loadEnterpriseApp(appName) {
        try {
            const iframe = document.getElementById(`iframe-${appName}`);
            if (!iframe) {
                throw new Error(`No iframe found for ${appName}`);
            }

            // Show loading
            this.showLoading(`Loading ${appName}...`);

            const startTime = Date.now();
            
            // Load app using enterprise API
            const result = await window.recoderAPI.apps.load(appName);
            
            if (result.success) {
                iframe.src = result.config.url;
                
                if (result.config.allow) {
                    iframe.setAttribute('allow', result.config.allow);
                }
                
                if (result.config.sandbox) {
                    iframe.setAttribute('sandbox', result.config.sandbox);
                }

                // Show the iframe
                iframe.classList.add('active');
                
                // Hide loading
                this.hideLoading();
                
                // Track performance
                const loadTime = Date.now() - startTime;
                this.performance.serviceLoadTimes.set(appName, loadTime);
                
                console.log(`✅ Enterprise app loaded: ${appName} in ${loadTime}ms`);
                this.showNotification('App Loaded', `${appName} loaded successfully`, 'success');
                
            } else {
                throw new Error(result.error || 'Failed to load app');
            }

        } catch (error) {
            console.error(`❌ Enterprise app loading failed for ${appName}:`, error);
            this.hideLoading();
            this.showError('App Loading Failed', error.message);
        }
    }

    async refreshDashboard() {
        try {
            await this.discoverServices();
            await this.performHealthCheck();
            this.updatePerformanceMetrics();
        } catch (error) {
            console.error('Dashboard refresh failed:', error);
        }
    }

    async handleAuthAction() {
        try {
            if (window.recoderAPI?.auth?.getStatus) {
                const authStatus = await window.recoderAPI.auth.getStatus();
                
                if (authStatus.authenticated) {
                    // Logout
                    await window.recoderAPI.auth.logout();
                    this.updateUnauthenticatedUI();
                    this.showNotification('Signed Out', 'Successfully signed out of your account', 'info');
                } else {
                    // Login
                    const result = await window.recoderAPI.auth.login();
                    if (result.success) {
                        this.updateAuthenticatedUI(result.user);
                        this.showNotification('Signed In', `Welcome, ${result.user.name || result.user.email}`, 'success');
                    }
                }
            }
        } catch (error) {
            console.error('Authentication failed:', error);
            this.showNotification('Authentication Failed', error.message, 'error');
        }
    }

    updateAuthenticatedUI(user) {
        this.user = user;
        
        const userInfo = document.getElementById('user-info');
        const authButton = document.getElementById('auth-button');
        const userName = document.getElementById('user-name');
        const userAvatar = document.getElementById('user-avatar');
        
        if (userInfo && authButton && userName && userAvatar) {
            userName.textContent = user.name || user.email || 'User';
            userAvatar.textContent = (user.name || user.email || 'U')[0].toUpperCase();
            userInfo.style.display = 'flex';
            authButton.textContent = 'Sign Out';
        }
    }

    updateUnauthenticatedUI() {
        this.user = null;
        
        const userInfo = document.getElementById('user-info');
        const authButton = document.getElementById('auth-button');
        
        if (userInfo && authButton) {
            userInfo.style.display = 'none';
            authButton.textContent = 'Sign In';
        }
    }

    showLoading(message = 'Loading...') {
        const loading = document.getElementById('enterprise-loading');
        const loadingText = loading.querySelector('.loading-text');
        
        if (loadingText) {
            loadingText.textContent = message;
        }
        
        loading.style.display = 'flex';
    }

    hideLoading() {
        const loading = document.getElementById('enterprise-loading');
        loading.style.display = 'none';
    }

    showError(title, message) {
        const error = document.getElementById('enterprise-error');
        const errorTitle = error.querySelector('.error-title');
        const errorMessage = error.querySelector('.error-message');
        
        if (errorTitle) errorTitle.textContent = title;
        if (errorMessage) errorMessage.textContent = message;
        
        error.style.display = 'flex';
    }

    hideError() {
        const error = document.getElementById('enterprise-error');
        error.style.display = 'none';
    }

    showNotification(title, message, type = 'info') {
        const container = document.getElementById('enterprise-notifications');
        const notification = document.createElement('div');
        
        notification.className = `enterprise-notification ${type}`;
        notification.innerHTML = `
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        `;

        container.appendChild(notification);
        this.notifications.push(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
                this.notifications = this.notifications.filter(n => n !== notification);
            }
        }, 5000);
    }

    handleServiceDiscovery(data) {
        console.log('🔍 Enterprise service discovery complete:', data);
        this.showNotification(
            'Service Discovery Complete', 
            `Discovered ${data.total} services, ${data.healthy} healthy`, 
            'success'
        );
    }

    updateServiceInUI(service) {
        console.log('✅ Enterprise service update:', service);
        this.services.set(service.id, service);
        
        // Update service card if it exists
        const existingCard = document.querySelector(`[data-service-id="${service.id}"]`);
        if (existingCard) {
            const newCard = this.createEnterpriseServiceCard(service);
            existingCard.replaceWith(newCard);
        }
        
        // Update navigation tab status
        const tab = document.querySelector(`[data-app="${service.id}"]`);
        if (tab) {
            const statusElement = tab.querySelector('.tab-status');
            statusElement.className = `tab-status ${this.getServiceStatusClass(service.status)}`;
        }
    }

    handleServiceUnhealthy(status) {
        console.warn('⚠️ Enterprise service unhealthy:', status);
        this.showNotification('Service Issue', `${status.id} is experiencing issues: ${status.error}`, 'warning');
    }

    cleanup() {
        console.log('🧹 Cleaning up enterprise UI...');
        
        if (this.performanceTimer) {
            clearInterval(this.performanceTimer);
        }
        
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        
        console.log('✅ Enterprise UI cleanup complete');
    }
}

// Global functions for HTML event handlers
window.refreshServices = async function() {
    if (window.enterpriseUI) {
        await window.enterpriseUI.discoverServices();
    }
};

window.retryConnection = function() {
    if (window.enterpriseUI) {
        window.enterpriseUI.hideError();
        window.enterpriseUI.switchToApp(window.enterpriseUI.currentApp);
    }
};

window.checkAIStatus = async function() {
    if (window.enterpriseUI) {
        await window.enterpriseUI.setupAIProviders();
    }
};

window.checkForUpdates = async function() {
    if (window.recoderAPI?.updates?.check) {
        try {
            const result = await window.recoderAPI.updates.check();
            if (result.available) {
                window.enterpriseUI?.showNotification(
                    'Update Available', 
                    `Version ${result.latestVersion} is available`, 
                    'info'
                );
            } else {
                window.enterpriseUI?.showNotification(
                    'Up to Date', 
                    'You have the latest version', 
                    'success'
                );
            }
        } catch (error) {
            window.enterpriseUI?.showNotification(
                'Update Check Failed', 
                error.message, 
                'error'
            );
        }
    }
};

// AI CODE EDITOR FUNCTIONS
window.openAIEditor = async function() {
    console.log('✨ Opening Ultimate AI Code Editor...');
    
    try {
        const result = await window.recoderAPI?.apps?.load('ai-editor');
        
        if (result?.success) {
            // Load AI editor in iframe
            const iframe = document.getElementById('iframe-ai-editor');
            if (iframe && result.config?.url) {
                iframe.src = `file://${result.config.url}`;
                iframe.classList.add('active');
                
                // Hide panels and show iframe
                document.querySelectorAll('.enterprise-panel').forEach(panel => {
                    panel.classList.remove('active');
                });
                
                // Update navigation
                document.querySelectorAll('.nav-tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                const editorTab = document.querySelector('[data-app="ai-editor"]');
                if (editorTab) {
                    editorTab.classList.add('active');
                }
                
                window.enterpriseUI.currentApp = 'ai-editor';
                window.enterpriseUI?.showNotification(
                    'AI Code Editor Launched', 
                    'Ultimate AI-powered coding experience ready!', 
                    'success'
                );
            }
        } else {
            throw new Error(result?.error || 'Failed to load AI editor');
        }
    } catch (error) {
        console.error('Failed to open AI editor:', error);
        window.enterpriseUI?.showNotification(
            'AI Editor Error', 
            `Failed to launch AI editor: ${error.message}`, 
            'error'
        );
    }
};

window.loadAISample = async function() {
    console.log('📝 Loading AI sample project...');
    
    window.enterpriseUI?.showNotification(
        'Sample Project', 
        'Loading AI-powered sample project with multi-language examples', 
        'info'
    );
    
    // Switch to AI editor first
    await window.openAIEditor();
    
    // The AI editor will automatically load with sample files
    setTimeout(() => {
        window.enterpriseUI?.showNotification(
            'Sample Ready', 
            'Sample project loaded with JS, TS, Python, CSS, and Markdown examples', 
            'success'
        );
    }, 2000);
};

window.aiProviderTest = async function() {
    console.log('🧪 Testing AI providers...');
    
    try {
        // Test Ollama
        const ollamaResult = await window.recoderAPI?.ai?.checkOllama();
        const ollamaStatus = ollamaResult?.available ? '✅ Online' : '❌ Offline';
        
        // Test other providers (placeholder)
        const openaiStatus = process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ No API Key';
        const anthropicStatus = process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ No API Key';
        const groqStatus = process.env.GROQ_API_KEY ? '✅ Configured' : '❌ No API Key';
        
        const testResults = `AI Provider Status:
        
🦙 Ollama: ${ollamaStatus}
🧠 OpenAI: ${openaiStatus}  
🎭 Anthropic: ${anthropicStatus}
⚡ Groq: ${groqStatus}

${ollamaResult?.available ? `Ollama Models: ${ollamaResult.models?.length || 0} available` : ''}`;
        
        window.enterpriseUI?.showNotification(
            'AI Provider Test Results', 
            testResults, 
            ollamaResult?.available ? 'success' : 'warning'
        );
        
    } catch (error) {
        window.enterpriseUI?.showNotification(
            'AI Test Failed', 
            `Provider test error: ${error.message}`, 
            'error'
        );
    }
};

window.showKeyboardShortcuts = function() {
    const shortcuts = `AI Code Editor Shortcuts:

🔥 Code Generation:
• Ctrl+Space - AI code completion
• Ctrl+Shift+G - Generate code from comment
• Ctrl+Shift+A - AI code analysis
• Ctrl+Shift+O - Optimize selected code

💬 AI Assistance:
• Ctrl+Shift+C - Open AI chat
• Ctrl+/ - Quick AI question
• F1 - AI command palette

⚡ Navigation:
• Ctrl+P - Quick file open
• Ctrl+Shift+P - Command palette
• Ctrl+` - Toggle terminal
• F12 - Go to definition (AI-powered)

🔍 Analysis:
• Alt+Shift+F - Format code with AI
• Ctrl+Shift+R - Refactor with AI
• Ctrl+Shift+T - Generate tests`;

    window.enterpriseUI?.showNotification(
        'AI Editor Shortcuts', 
        shortcuts, 
        'info'
    );
};

// Initialize enterprise UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏢 Initializing Recoder Enterprise UI...');
    window.enterpriseUI = new RecoderEnterpriseUI();
});

// Performance monitoring
window.addEventListener('load', () => {
    console.log('📊 Enterprise UI Performance Metrics:', {
        loadTime: performance.now(),
        memory: performance.memory ? {
            used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
            total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
            limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
        } : 'Not available',
        navigation: performance.getEntriesByType('navigation')[0]
    });
});

// Error handling
window.addEventListener('error', (event) => {
    console.error('🚨 Enterprise UI Error:', event.error);
    if (window.enterpriseUI) {
        window.enterpriseUI.performance.errorCount++;
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Unhandled Promise Rejection:', event.reason);
    if (window.enterpriseUI) {
        window.enterpriseUI.performance.errorCount++;
    }
});

console.log('✅ Enterprise UI controller loaded');