/**
 * RECODER.XYZ AI INTEGRATION SERVICE
 * Connects AI Code Editor with backend, web, and chat services
 */

const { EventEmitter } = require('events');
const axios = require('axios');

class AIIntegrationService extends EventEmitter {
    constructor(serviceManager, telemetryService) {
        super();
        this.serviceManager = serviceManager;
        this.telemetryService = telemetryService;
        this.connectedServices = new Map();
        this.syncInterval = null;
        
        console.log('🔗 AI Integration Service initialized');
    }

    async initialize() {
        try {
            console.log('🔗 Initializing AI Integration Service...');
            
            // Connect to available services
            await this.connectToServices();
            
            // Setup real-time synchronization
            this.setupRealTimeSync();
            
            // Setup cross-service communication
            this.setupServiceCommunication();
            
            console.log('✅ AI Integration Service ready');
            return true;
            
        } catch (error) {
            console.error('❌ AI Integration Service failed:', error);
            return false;
        }
    }

    async connectToServices() {
        const services = this.serviceManager.getHealthyServices();
        
        for (const service of services) {
            try {
                await this.connectToService(service);
            } catch (error) {
                console.error(`Failed to connect to ${service.name}:`, error);
            }
        }
    }

    async connectToService(service) {
        console.log(`🔌 Connecting to ${service.name}...`);
        
        const connection = {
            id: service.id,
            name: service.name,
            url: service.url,
            status: 'connected',
            capabilities: await this.discoverServiceCapabilities(service),
            lastSync: Date.now()
        };
        
        this.connectedServices.set(service.id, connection);
        
        // Track connection
        if (this.telemetryService) {
            this.telemetryService.trackEvent('service-connected', {
                serviceId: service.id,
                serviceName: service.name,
                capabilities: connection.capabilities
            });
        }
        
        this.emit('service-connected', connection);
    }

    async discoverServiceCapabilities(service) {
        const capabilities = [];
        
        try {
            // Test for AI endpoints
            if (service.id === 'chat') {
                capabilities.push('ai-chat', 'code-assistance', 'real-time-collaboration');
            }
            
            if (service.id === 'web') {
                capabilities.push('project-management', 'file-sharing', 'deployment');
            }
            
            if (service.id === 'backend') {
                capabilities.push('user-management', 'data-storage', 'api-integration');
            }
            
            // Test API endpoints
            const response = await axios.get(`${service.url}/api/capabilities`, {
                timeout: 3000,
                validateStatus: (status) => status < 500
            });
            
            if (response.status === 200 && response.data) {
                capabilities.push(...(response.data.capabilities || []));
            }
            
        } catch (error) {
            // Service doesn't have capabilities endpoint - use defaults
            console.log(`Service ${service.name} capabilities auto-detected`);
        }
        
        return capabilities;
    }

    setupRealTimeSync() {
        // Sync AI editor state with services every 30 seconds
        this.syncInterval = setInterval(async () => {
            await this.syncWithServices();
        }, 30000);
        
        console.log('⏰ Real-time service sync enabled');
    }

    async syncWithServices() {
        for (const [serviceId, connection] of this.connectedServices) {
            try {
                await this.syncWithService(serviceId, connection);
                connection.lastSync = Date.now();
            } catch (error) {
                console.error(`Sync failed with ${connection.name}:`, error);
                connection.status = 'sync-error';
            }
        }
    }

    async syncWithService(serviceId, connection) {
        // Sync AI editor projects with services
        const syncData = {
            timestamp: Date.now(),
            aiEditorState: await this.getAIEditorState(),
            userActivity: await this.getUserActivity()
        };
        
        if (connection.capabilities.includes('project-management')) {
            await this.syncProjects(connection, syncData);
        }
        
        if (connection.capabilities.includes('ai-chat')) {
            await this.syncAIConversations(connection, syncData);
        }
        
        if (connection.capabilities.includes('code-assistance')) {
            await this.syncCodeContext(connection, syncData);
        }
    }

    async syncProjects(connection, syncData) {
        try {
            await axios.post(`${connection.url}/api/sync/projects`, {
                projects: syncData.aiEditorState.openFiles,
                lastModified: syncData.timestamp
            }, { timeout: 5000 });
            
            console.log(`📁 Projects synced with ${connection.name}`);
        } catch (error) {
            console.error(`Project sync failed with ${connection.name}:`, error);
        }
    }

    async syncAIConversations(connection, syncData) {
        try {
            await axios.post(`${connection.url}/api/sync/ai-conversations`, {
                conversations: syncData.aiEditorState.chatHistory,
                context: syncData.aiEditorState.codeContext
            }, { timeout: 5000 });
            
            console.log(`💬 AI conversations synced with ${connection.name}`);
        } catch (error) {
            console.error(`AI sync failed with ${connection.name}:`, error);
        }
    }

    async syncCodeContext(connection, syncData) {
        try {
            await axios.post(`${connection.url}/api/sync/code-context`, {
                currentFile: syncData.aiEditorState.currentFile,
                codeAnalysis: syncData.aiEditorState.analysisResults,
                suggestions: syncData.aiEditorState.aiSuggestions
            }, { timeout: 5000 });
            
            console.log(`🧠 Code context synced with ${connection.name}`);
        } catch (error) {
            console.error(`Code context sync failed with ${connection.name}:`, error);
        }
    }

    setupServiceCommunication() {
        // Setup cross-service event handling
        this.on('ai-code-generated', (data) => {
            this.broadcastToServices('ai-code-generated', data);
        });
        
        this.on('code-analysis-complete', (data) => {
            this.broadcastToServices('code-analysis-complete', data);
        });
        
        this.on('user-action', (data) => {
            this.broadcastToServices('user-action', data);
        });
        
        console.log('📡 Cross-service communication setup complete');
    }

    async broadcastToServices(eventName, data) {
        const message = {
            event: eventName,
            data,
            timestamp: Date.now(),
            source: 'ai-editor'
        };
        
        for (const [serviceId, connection] of this.connectedServices) {
            if (connection.status === 'connected') {
                try {
                    await axios.post(`${connection.url}/api/events`, message, {
                        timeout: 3000,
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    // Service doesn't support events - that's OK
                    console.log(`Service ${connection.name} doesn't support events`);
                }
            }
        }
    }

    // AI Editor Integration Methods
    async getAIEditorState() {
        // This would integrate with the AI editor to get current state
        return {
            currentFile: 'main.js',
            openFiles: ['main.js', 'components.tsx', 'api.py'],
            chatHistory: [],
            analysisResults: {},
            aiSuggestions: [],
            codeContext: {
                language: 'javascript',
                framework: 'node.js',
                project: 'recoder-ai-project'
            }
        };
    }

    async getUserActivity() {
        return {
            lastAction: Date.now(),
            actionsCount: 42,
            activeTime: 3600000, // 1 hour
            aiInteractions: 15
        };
    }

    // Public API for AI Editor
    async sendToChat(message, context) {
        const chatService = this.connectedServices.get('chat');
        if (chatService && chatService.capabilities.includes('ai-chat')) {
            try {
                const response = await axios.post(`${chatService.url}/api/ai/chat`, {
                    message,
                    context,
                    source: 'ai-editor'
                }, { timeout: 10000 });
                
                return response.data;
            } catch (error) {
                console.error('Chat service error:', error);
                throw error;
            }
        }
        
        throw new Error('Chat service not available');
    }

    async saveToBackend(projectData) {
        const backendService = this.connectedServices.get('backend');
        if (backendService && backendService.capabilities.includes('data-storage')) {
            try {
                const response = await axios.post(`${backendService.url}/api/projects`, {
                    ...projectData,
                    source: 'ai-editor',
                    timestamp: Date.now()
                }, { timeout: 10000 });
                
                return response.data;
            } catch (error) {
                console.error('Backend save error:', error);
                throw error;
            }
        }
        
        throw new Error('Backend service not available');
    }

    async deployToWeb(deploymentConfig) {
        const webService = this.connectedServices.get('web');
        if (webService && webService.capabilities.includes('deployment')) {
            try {
                const response = await axios.post(`${webService.url}/api/deploy`, {
                    ...deploymentConfig,
                    source: 'ai-editor',
                    timestamp: Date.now()
                }, { timeout: 30000 });
                
                return response.data;
            } catch (error) {
                console.error('Deployment error:', error);
                throw error;
            }
        }
        
        throw new Error('Web deployment service not available');
    }

    // Service Status and Management
    getServiceStatus() {
        const status = {};
        
        for (const [serviceId, connection] of this.connectedServices) {
            status[serviceId] = {
                name: connection.name,
                status: connection.status,
                capabilities: connection.capabilities,
                lastSync: connection.lastSync,
                connected: connection.status === 'connected'
            };
        }
        
        return status;
    }

    getIntegrationHealth() {
        const total = this.connectedServices.size;
        const connected = Array.from(this.connectedServices.values())
            .filter(s => s.status === 'connected').length;
        
        return {
            total,
            connected,
            health: connected / total,
            services: this.getServiceStatus()
        };
    }

    async reconnectService(serviceId) {
        const service = this.serviceManager.getService(serviceId);
        if (service) {
            await this.connectToService(service);
            return true;
        }
        return false;
    }

    cleanup() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        console.log('🧹 AI Integration Service cleanup complete');
    }
}

module.exports = { AIIntegrationService };