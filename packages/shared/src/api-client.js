const axios = require('axios');
const { DEFAULT_CONFIG, API_ENDPOINTS, ERROR_CODES, TIMEOUTS } = require('./constants');
const { APIResponse } = require('./types');

class APIClient {
  constructor(config = {}) {
    this.config = {
      baseURL: config.apiUrl || DEFAULT_CONFIG.API_URL,
      timeout: config.timeout || TIMEOUTS.API_REQUEST,
      ...config
    };
    
    this.client = axios.create(this.config);
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add authentication token if available
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Add common headers
        config.headers['Content-Type'] = 'application/json';
        config.headers['X-Client'] = 'codecraft-cli';
        config.headers['X-Version'] = DEFAULT_CONFIG.CLI_VERSION;
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return new APIResponse({
          success: true,
          data: response.data,
          message: response.data?.message || 'Success',
          code: response.status
        });
      },
      (error) => {
        const errorResponse = new APIResponse({
          success: false,
          error: this.formatError(error),
          message: error.response?.data?.message || error.message,
          code: error.response?.status || 500
        });
        
        return Promise.reject(errorResponse);
      }
    );
  }

  formatError(error) {
    if (error.response) {
      // Server responded with error status
      return {
        type: 'api_error',
        code: error.response.data?.code || ERROR_CODES.INTERNAL_ERROR,
        message: error.response.data?.message || 'API Error',
        details: error.response.data?.details || null,
        status: error.response.status
      };
    } else if (error.request) {
      // Request was made but no response received
      return {
        type: 'network_error',
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Network error - please check your connection',
        details: null
      };
    } else {
      // Something else happened
      return {
        type: 'client_error',
        code: ERROR_CODES.INTERNAL_ERROR,
        message: error.message,
        details: null
      };
    }
  }

  getAuthToken() {
    // Implementation depends on storage mechanism
    // Could be from localStorage, file system, etc.
    return process.env.CODECRAFT_API_KEY || null;
  }

  setAuthToken(token) {
    process.env.CODECRAFT_API_KEY = token;
  }

  // Authentication methods
  async login(credentials) {
    const response = await this.client.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
    if (response.success && response.data.token) {
      this.setAuthToken(response.data.token);
    }
    return response;
  }

  async logout() {
    const response = await this.client.post(API_ENDPOINTS.AUTH.LOGOUT);
    if (response.success) {
      this.setAuthToken(null);
    }
    return response;
  }

  async getAuthStatus() {
    return await this.client.get(API_ENDPOINTS.AUTH.STATUS);
  }

  // Agent methods
  async listAgents(filters = {}) {
    return await this.client.get(API_ENDPOINTS.AGENTS.LIST, { params: filters });
  }

  async createAgent(agentConfig) {
    return await this.client.post(API_ENDPOINTS.AGENTS.CREATE, agentConfig);
  }

  async getAgent(agentId) {
    const url = API_ENDPOINTS.AGENTS.GET.replace(':id', agentId);
    return await this.client.get(url);
  }

  async updateAgent(agentId, updates) {
    const url = API_ENDPOINTS.AGENTS.UPDATE.replace(':id', agentId);
    return await this.client.put(url, updates);
  }

  async deleteAgent(agentId) {
    const url = API_ENDPOINTS.AGENTS.DELETE.replace(':id', agentId);
    return await this.client.delete(url);
  }

  async configureAgent(agentId, config) {
    const url = API_ENDPOINTS.AGENTS.CONFIGURE.replace(':id', agentId);
    return await this.client.post(url, config);
  }

  // Project methods
  async listProjects(filters = {}) {
    return await this.client.get(API_ENDPOINTS.PROJECTS.LIST, { params: filters });
  }

  async createProject(projectConfig) {
    return await this.client.post(API_ENDPOINTS.PROJECTS.CREATE, projectConfig);
  }

  async getProject(projectId) {
    const url = API_ENDPOINTS.PROJECTS.GET.replace(':id', projectId);
    return await this.client.get(url);
  }

  async updateProject(projectId, updates) {
    const url = API_ENDPOINTS.PROJECTS.UPDATE.replace(':id', projectId);
    return await this.client.put(url, updates);
  }

  async deleteProject(projectId) {
    const url = API_ENDPOINTS.PROJECTS.DELETE.replace(':id', projectId);
    return await this.client.delete(url);
  }

  // Planning methods
  async createPlan(requirements, options = {}) {
    return await this.client.post(API_ENDPOINTS.PLANNING.CREATE, {
      requirements,
      options
    });
  }

  async analyzeRequirements(description, options = {}) {
    return await this.client.post(API_ENDPOINTS.PLANNING.ANALYZE, {
      description,
      options
    });
  }

  async validatePlan(planConfig) {
    return await this.client.post(API_ENDPOINTS.PLANNING.VALIDATE, planConfig);
  }

  async getPlanningTemplates(type = null) {
    const params = type ? { type } : {};
    return await this.client.get(API_ENDPOINTS.PLANNING.TEMPLATES, { params });
  }

  // Generation methods
  async generateCode(planConfig, options = {}) {
    return await this.client.post(API_ENDPOINTS.GENERATION.GENERATE, {
      plan: planConfig,
      options
    });
  }

  async getGenerationStatus(generationId) {
    const url = API_ENDPOINTS.GENERATION.STATUS.replace(':id', generationId);
    return await this.client.get(url);
  }

  async downloadGeneration(generationId) {
    const url = API_ENDPOINTS.GENERATION.DOWNLOAD.replace(':id', generationId);
    return await this.client.get(url, { responseType: 'blob' });
  }

  // Validation methods
  async validateProject(projectPath, planConfig = null) {
    return await this.client.post(API_ENDPOINTS.VALIDATION.VALIDATE, {
      projectPath,
      plan: planConfig
    });
  }

  async getValidationChecks(type = null) {
    const params = type ? { type } : {};
    return await this.client.get(API_ENDPOINTS.VALIDATION.CHECKS, { params });
  }

  async getValidationResults(validationId) {
    const url = API_ENDPOINTS.VALIDATION.RESULTS.replace(':id', validationId);
    return await this.client.get(url);
  }

  // Integration methods
  async listIntegrations() {
    return await this.client.get(API_ENDPOINTS.INTEGRATIONS.LIST);
  }

  async getIntegrationProviders(type = null) {
    const params = type ? { type } : {};
    return await this.client.get(API_ENDPOINTS.INTEGRATIONS.PROVIDERS, { params });
  }

  async configureIntegration(integrationConfig) {
    return await this.client.post(API_ENDPOINTS.INTEGRATIONS.CONFIGURE, integrationConfig);
  }

  async testIntegration(integrationId, testConfig = {}) {
    return await this.client.post(API_ENDPOINTS.INTEGRATIONS.TEST, {
      integrationId,
      testConfig
    });
  }

  // Template methods
  async listTemplates(category = null) {
    const params = category ? { category } : {};
    return await this.client.get(API_ENDPOINTS.TEMPLATES.LIST, { params });
  }

  async getTemplate(templateId) {
    const url = API_ENDPOINTS.TEMPLATES.GET.replace(':id', templateId);
    return await this.client.get(url);
  }

  async getTemplateCategories() {
    return await this.client.get(API_ENDPOINTS.TEMPLATES.CATEGORIES);
  }

  // Model methods
  async listModels() {
    return await this.client.get(API_ENDPOINTS.MODELS.LIST);
  }

  async getModelCapabilities(modelId) {
    const url = API_ENDPOINTS.MODELS.CAPABILITIES.replace(':id', modelId);
    return await this.client.get(url);
  }

  // Utility methods
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response;
    } catch (error) {
      return new APIResponse({
        success: false,
        error: error.error || { message: 'Health check failed' },
        message: 'Service unavailable'
      });
    }
  }

  // WebSocket connection for real-time updates
  createWebSocketConnection(endpoint, handlers = {}) {
    const wsUrl = this.config.baseURL.replace('http', 'ws') + endpoint;
    const ws = new WebSocket(wsUrl);

    ws.onopen = handlers.onOpen || (() => console.log('WebSocket connected'));
    ws.onmessage = handlers.onMessage || ((event) => console.log('Message:', event.data));
    ws.onerror = handlers.onError || ((error) => console.error('WebSocket error:', error));
    ws.onclose = handlers.onClose || (() => console.log('WebSocket disconnected'));

    return ws;
  }
}

// Factory function for creating API client instances
function createAPIClient(config = {}) {
  return new APIClient(config);
}

module.exports = {
  APIClient,
  createAPIClient
};