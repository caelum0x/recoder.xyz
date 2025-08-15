/**
 * Professional Service Discovery and Health Monitoring
 * Automatically detects and monitors all Recoder.xyz services
 */

const { ipcMain } = require('electron');
const axios = require('axios');
const { EventEmitter } = require('events');

class ServiceDiscoveryManager extends EventEmitter {
  constructor() {
    super();
    
    this.services = new Map();
    this.healthCheckInterval = 30000; // 30 seconds
    this.discoveryInterval = 60000; // 1 minute
    this.timeoutMs = 5000; // 5 seconds
    
    this.serviceDefinitions = {
      'recoder-chat': {
        name: 'Chat Platform',
        defaultPorts: [3001, 3002, 3003, 3004],
        healthEndpoint: '/api/health',
        requiredEndpoints: ['/api/auth/guest'],
        category: 'web-app',
        icon: '💬'
      },
      'recoder-web': {
        name: 'Web Platform',
        defaultPorts: [3000, 3003, 3005, 3006],
        healthEndpoint: '/api/health',
        requiredEndpoints: ['/'],
        category: 'web-app',
        icon: '🌐'
      },
      'recoder-extension': {
        name: 'Extension Development',
        defaultPorts: [5173, 5174, 5175],
        healthEndpoint: '/',
        requiredEndpoints: ['/'],
        category: 'dev-server',
        icon: '🔧'
      },
      'backend-api': {
        name: 'Backend API',
        defaultPorts: [3001, 8001, 8000],
        healthEndpoint: '/health',
        requiredEndpoints: ['/api/status'],
        category: 'api',
        icon: '🔗'
      },
      'production-engine': {
        name: 'Production Engine',
        defaultPorts: [3002, 8002],
        healthEndpoint: '/health',
        requiredEndpoints: ['/api/generate'],
        category: 'api',
        icon: '⚙️'
      },
      'ollama': {
        name: 'Ollama AI',
        defaultPorts: [11434],
        healthEndpoint: '/api/tags',
        requiredEndpoints: ['/api/generate'],
        category: 'ai-service',
        icon: '🤖'
      }
    };
    
    // IPC handlers are setup in main-professional.js
    this.startDiscovery();
  }

  setupIPCHandlers() {
    ipcMain.handle('services:getAll', () => this.getAllServices());
    ipcMain.handle('services:getByCategory', (event, category) => this.getServicesByCategory(category));
    ipcMain.handle('services:checkHealth', (event, serviceId) => this.checkServiceHealth(serviceId));
    ipcMain.handle('services:discover', () => this.discoverServices());
    ipcMain.handle('services:getStatus', () => this.getOverallStatus());
  }

  /**
   * Start automatic service discovery and health monitoring
   */
  startDiscovery() {
    console.log('🔍 Starting service discovery...');
    
    // Initial discovery
    this.discoverServices();
    
    // Periodic discovery
    setInterval(() => {
      this.discoverServices();
    }, this.discoveryInterval);
    
    // Periodic health checks
    setInterval(() => {
      this.healthCheckAll();
    }, this.healthCheckInterval);
  }

  /**
   * Discover all available services
   */
  async discoverServices() {
    console.log('🔍 Discovering services...');
    
    const discoveryPromises = Object.entries(this.serviceDefinitions).map(
      ([serviceId, definition]) => this.discoverService(serviceId, definition)
    );
    
    const results = await Promise.allSettled(discoveryPromises);
    
    let discovered = 0;
    let healthy = 0;
    
    results.forEach((result, index) => {
      const serviceId = Object.keys(this.serviceDefinitions)[index];
      if (result.status === 'fulfilled' && result.value) {
        discovered++;
        if (result.value.status === 'healthy') {
          healthy++;
        }
      }
    });
    
    console.log(`✅ Discovery complete: ${discovered} services found, ${healthy} healthy`);
    
    this.emit('discovery:complete', {
      discovered,
      healthy,
      services: Array.from(this.services.values())
    });
    
    return this.getAllServices();
  }

  /**
   * Discover a specific service across its possible ports
   */
  async discoverService(serviceId, definition) {
    const existingService = this.services.get(serviceId);
    
    // Try existing URL first if we have one
    if (existingService?.url) {
      try {
        const health = await this.checkServiceHealth(serviceId);
        if (health.status === 'healthy') {
          return existingService;
        }
      } catch (error) {
        console.log(`⚠️ Existing ${serviceId} service unhealthy, rediscovering...`);
      }
    }
    
    // Try to discover on default ports
    for (const port of definition.defaultPorts) {
      const baseUrl = `http://localhost:${port}`;
      
      try {
        const isHealthy = await this.testServiceEndpoint(baseUrl, definition);
        
        if (isHealthy) {
          const service = {
            id: serviceId,
            name: definition.name,
            url: baseUrl,
            port: port,
            category: definition.category,
            icon: definition.icon,
            status: 'healthy',
            lastCheck: Date.now(),
            responseTime: 0,
            version: null,
            endpoints: definition.requiredEndpoints
          };
          
          // Get additional service info
          await this.enrichServiceInfo(service, definition);
          
          this.services.set(serviceId, service);
          
          console.log(`✅ Discovered ${definition.name} at ${baseUrl}`);
          
          this.emit('service:discovered', service);
          return service;
        }
      } catch (error) {
        // Continue trying other ports
      }
    }
    
    // Service not found
    const offlineService = {
      id: serviceId,
      name: definition.name,
      url: null,
      port: null,
      category: definition.category,
      icon: definition.icon,
      status: 'offline',
      lastCheck: Date.now(),
      responseTime: -1,
      error: 'Service not found on any default port'
    };
    
    this.services.set(serviceId, offlineService);
    this.emit('service:offline', offlineService);
    
    return null;
  }

  /**
   * Test if a service endpoint is responsive
   */
  async testServiceEndpoint(baseUrl, definition) {
    try {
      const startTime = Date.now();
      
      // Test health endpoint
      const healthUrl = `${baseUrl}${definition.healthEndpoint}`;
      const response = await axios.get(healthUrl, {
        timeout: this.timeoutMs,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent': 'Recoder-Desktop/1.0.0'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      // Consider 2xx and 3xx as healthy, 4xx as functional but might need auth
      return response.status < 500 && responseTime < 10000;
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Enrich service information with version and capabilities
   */
  async enrichServiceInfo(service, definition) {
    try {
      // Try to get service version and info
      const infoEndpoints = ['/api/info', '/api/version', '/health', '/status'];
      
      for (const endpoint of infoEndpoints) {
        try {
          const response = await axios.get(`${service.url}${endpoint}`, {
            timeout: 3000,
            validateStatus: (status) => status < 400
          });
          
          if (response.data) {
            service.version = response.data.version || response.data.app?.version || null;
            service.info = response.data;
            break;
          }
        } catch (error) {
          // Continue trying other endpoints
        }
      }
      
      // Test required endpoints
      service.availableEndpoints = [];
      
      for (const endpoint of definition.requiredEndpoints) {
        try {
          const response = await axios.head(`${service.url}${endpoint}`, {
            timeout: 2000,
            validateStatus: (status) => status < 500
          });
          
          service.availableEndpoints.push({
            path: endpoint,
            status: response.status,
            available: response.status < 400
          });
        } catch (error) {
          service.availableEndpoints.push({
            path: endpoint,
            status: null,
            available: false,
            error: error.message
          });
        }
      }
      
    } catch (error) {
      console.warn(`Failed to enrich service info for ${service.id}:`, error.message);
    }
  }

  /**
   * Check health of a specific service
   */
  async checkServiceHealth(serviceId) {
    const service = this.services.get(serviceId);
    
    if (!service || !service.url) {
      return {
        id: serviceId,
        status: 'offline',
        error: 'Service not discovered',
        lastCheck: Date.now()
      };
    }
    
    const definition = this.serviceDefinitions[serviceId];
    const startTime = Date.now();
    
    try {
      const healthUrl = `${service.url}${definition.healthEndpoint}`;
      const response = await axios.get(healthUrl, {
        timeout: this.timeoutMs,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent': 'Recoder-Desktop/1.0.0'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      const healthStatus = {
        id: serviceId,
        status: response.status < 400 ? 'healthy' : 'degraded',
        responseTime,
        httpStatus: response.status,
        lastCheck: Date.now(),
        url: service.url
      };
      
      // Update service record
      service.status = healthStatus.status;
      service.responseTime = responseTime;
      service.lastCheck = healthStatus.lastCheck;
      service.error = null;
      
      this.emit('service:health', healthStatus);
      
      return healthStatus;
      
    } catch (error) {
      const errorStatus = {
        id: serviceId,
        status: 'unhealthy',
        error: error.message,
        lastCheck: Date.now(),
        url: service.url
      };
      
      // Update service record
      service.status = 'unhealthy';
      service.error = error.message;
      service.lastCheck = errorStatus.lastCheck;
      
      this.emit('service:unhealthy', errorStatus);
      
      return errorStatus;
    }
  }

  /**
   * Check health of all discovered services
   */
  async healthCheckAll() {
    const services = Array.from(this.services.keys());
    const healthPromises = services.map(serviceId => this.checkServiceHealth(serviceId));
    
    const results = await Promise.allSettled(healthPromises);
    
    const summary = {
      total: services.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      offline: 0
    };
    
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        summary[result.value.status]++;
      } else {
        summary.unhealthy++;
      }
    });
    
    this.emit('health:summary', summary);
    
    return summary;
  }

  /**
   * Get all discovered services
   */
  getAllServices() {
    return Array.from(this.services.values()).sort((a, b) => {
      // Sort by category, then by status, then by name
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      if (a.status !== b.status) {
        const statusOrder = { healthy: 0, degraded: 1, unhealthy: 2, offline: 3 };
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get services by category
   */
  getServicesByCategory(category) {
    return this.getAllServices().filter(service => service.category === category);
  }

  /**
   * Get overall system status
   */
  getOverallStatus() {
    const services = this.getAllServices();
    
    const webApps = services.filter(s => s.category === 'web-app');
    const apis = services.filter(s => s.category === 'api');
    const aiServices = services.filter(s => s.category === 'ai-service');
    
    const webAppsHealthy = webApps.filter(s => s.status === 'healthy').length;
    const apisHealthy = apis.filter(s => s.status === 'healthy').length;
    const aiHealthy = aiServices.filter(s => s.status === 'healthy').length;
    
    let overallStatus = 'healthy';
    
    if (webAppsHealthy === 0 && apisHealthy === 0) {
      overallStatus = 'critical';
    } else if (webAppsHealthy < webApps.length * 0.5 || apisHealthy < apis.length * 0.5) {
      overallStatus = 'degraded';
    } else if (webAppsHealthy < webApps.length || apisHealthy < apis.length) {
      overallStatus = 'warning';
    }
    
    return {
      overall: overallStatus,
      categories: {
        'web-apps': {
          total: webApps.length,
          healthy: webAppsHealthy,
          status: webAppsHealthy === webApps.length ? 'healthy' : 'degraded'
        },
        'apis': {
          total: apis.length,
          healthy: apisHealthy,
          status: apisHealthy === apis.length ? 'healthy' : 'degraded'
        },
        'ai-services': {
          total: aiServices.length,
          healthy: aiHealthy,
          status: aiHealthy === aiServices.length ? 'healthy' : 'degraded'
        }
      },
      services: services.length,
      lastUpdate: Date.now()
    };
  }

  /**
   * Get service URL for a specific service
   */
  getServiceUrl(serviceId) {
    const service = this.services.get(serviceId);
    return service?.status === 'healthy' ? service.url : null;
  }

  /**
   * Get authentication headers for a service
   */
  async getServiceHeaders(serviceId, authToken = null) {
    const headers = {
      'User-Agent': 'Recoder-Desktop/1.0.0',
      'Accept': 'application/json, text/html, */*'
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    return headers;
  }
}

module.exports = { ServiceDiscoveryManager };