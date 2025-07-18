const { logger } = require('../utils/logger');
const { integrationService } = require('./integrationService');

class ModelService {
  constructor() {
    this.models = new Map();
    this.loadModels();
  }

  async loadModels() {
    try {
      const models = [
        // OpenAI models
        { id: 'gpt-4', provider: 'openai', type: 'chat', name: 'GPT-4', available: true },
        { id: 'gpt-4-turbo', provider: 'openai', type: 'chat', name: 'GPT-4 Turbo', available: true },
        { id: 'gpt-3.5-turbo', provider: 'openai', type: 'chat', name: 'GPT-3.5 Turbo', available: true },
        { id: 'text-embedding-ada-002', provider: 'openai', type: 'embedding', name: 'Text Embedding Ada', available: true },
        
        // Anthropic models
        { id: 'claude-3-opus', provider: 'anthropic', type: 'chat', name: 'Claude 3 Opus', available: true },
        { id: 'claude-3-sonnet', provider: 'anthropic', type: 'chat', name: 'Claude 3 Sonnet', available: true },
        { id: 'claude-3-haiku', provider: 'anthropic', type: 'chat', name: 'Claude 3 Haiku', available: true },
        
        // Mistral models
        { id: 'mistral-7b', provider: 'mistral', type: 'chat', name: 'Mistral 7B', available: true },
        { id: 'mistral-8x7b', provider: 'mistral', type: 'chat', name: 'Mistral 8x7B', available: true },
        
        // Ollama models
        { id: 'llama2', provider: 'ollama', type: 'chat', name: 'Llama 2', available: false },
        { id: 'codellama', provider: 'ollama', type: 'code', name: 'Code Llama', available: false }
      ];

      models.forEach(model => {
        this.models.set(model.id, model);
      });

      logger.info(`${models.length} models loaded`);
    } catch (error) {
      logger.error('Failed to load models:', error);
    }
  }

  async getAvailableModels(filters = {}) {
    try {
      const { provider, type, available } = filters;
      let models = Array.from(this.models.values());

      if (provider) {
        models = models.filter(model => model.provider === provider);
      }

      if (type) {
        models = models.filter(model => model.type === type);
      }

      if (available !== undefined) {
        models = models.filter(model => model.available === available);
      }

      return models;
    } catch (error) {
      logger.error('Failed to get available models:', error);
      throw error;
    }
  }

  async getModelDetails(modelId, userId) {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        return null;
      }

      // Check if user has access to this model
      const hasAccess = await this.checkModelAccess(userId, model);
      
      return {
        ...model,
        hasAccess,
        pricing: await this.getModelPricing(modelId),
        capabilities: await this.getModelCapabilities(modelId)
      };
    } catch (error) {
      logger.error('Failed to get model details:', error);
      throw error;
    }
  }

  async checkModelAccess(userId, model) {
    // Basic access control - all users can access free models
    const freeModels = ['gpt-3.5-turbo', 'claude-3-haiku', 'mistral-7b'];
    return freeModels.includes(model.id);
  }

  async getModelPricing(modelId) {
    const pricing = {
      'gpt-4': { input: 0.03, output: 0.06, unit: 'per 1K tokens' },
      'gpt-4-turbo': { input: 0.01, output: 0.03, unit: 'per 1K tokens' },
      'gpt-3.5-turbo': { input: 0.001, output: 0.002, unit: 'per 1K tokens' },
      'claude-3-opus': { input: 0.015, output: 0.075, unit: 'per 1K tokens' },
      'claude-3-sonnet': { input: 0.003, output: 0.015, unit: 'per 1K tokens' },
      'claude-3-haiku': { input: 0.00025, output: 0.00125, unit: 'per 1K tokens' }
    };

    return pricing[modelId] || { input: 0, output: 0, unit: 'free' };
  }

  async getModelCapabilities(modelId) {
    const capabilities = {
      'gpt-4': ['chat', 'code', 'analysis', 'reasoning'],
      'gpt-4-turbo': ['chat', 'code', 'analysis', 'reasoning', 'vision'],
      'gpt-3.5-turbo': ['chat', 'code', 'analysis'],
      'claude-3-opus': ['chat', 'code', 'analysis', 'reasoning', 'vision'],
      'claude-3-sonnet': ['chat', 'code', 'analysis', 'reasoning'],
      'claude-3-haiku': ['chat', 'analysis'],
      'codellama': ['code', 'programming']
    };

    return capabilities[modelId] || [];
  }

  async chatWithModel(modelId, messages, options = {}, userId) {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      const hasAccess = await this.checkModelAccess(userId, model);
      if (!hasAccess) {
        throw new Error('Access denied to this model');
      }

      const result = await integrationService.chat({
        model: modelId,
        messages,
        ...options
      });

      await this.trackUsage(userId, modelId, 'chat', result.tokens_used);

      return result;
    } catch (error) {
      logger.error('Chat with model failed:', error);
      throw error;
    }
  }

  async generateCode(modelId, options, userId) {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      if (model.type !== 'code' && !this.getModelCapabilities(modelId).includes('code')) {
        throw new Error('Model does not support code generation');
      }

      const hasAccess = await this.checkModelAccess(userId, model);
      if (!hasAccess) {
        throw new Error('Access denied to this model');
      }

      const result = await integrationService.generateCode({
        model: modelId,
        ...options
      });

      await this.trackUsage(userId, modelId, 'code_generation', result.tokens_used);

      return result;
    } catch (error) {
      logger.error('Code generation failed:', error);
      throw error;
    }
  }

  async generateEmbeddings(modelId, text, options = {}, userId) {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      if (model.type !== 'embedding') {
        throw new Error('Model does not support embeddings');
      }

      const hasAccess = await this.checkModelAccess(userId, model);
      if (!hasAccess) {
        throw new Error('Access denied to this model');
      }

      const result = await integrationService.generateEmbeddings({
        model: modelId,
        text,
        ...options
      });

      await this.trackUsage(userId, modelId, 'embedding', result.tokens_used);

      return result;
    } catch (error) {
      logger.error('Embedding generation failed:', error);
      throw error;
    }
  }

  async getModelStatus(modelId, userId) {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        return null;
      }

      const integration = integrationService.integrations.get(model.provider);
      if (!integration) {
        return { status: 'unavailable', message: 'Integration not available' };
      }

      const status = await integration.getModelStatus(modelId);
      const hasAccess = await this.checkModelAccess(userId, model);

      return {
        ...status,
        hasAccess,
        model: model.name,
        provider: model.provider
      };
    } catch (error) {
      logger.error('Failed to get model status:', error);
      throw error;
    }
  }

  async trackUsage(userId, modelId, operation, tokensUsed) {
    try {
      // Track usage in usage service
      logger.info(`Usage tracked: ${userId} used ${modelId} for ${operation}, ${tokensUsed} tokens`);
    } catch (error) {
      logger.error('Failed to track usage:', error);
    }
  }

  async calculateCost(modelId, tokensUsed) {
    try {
      const pricing = await this.getModelPricing(modelId);
      const inputCost = (tokensUsed * pricing.input) / 1000;
      const outputCost = (tokensUsed * pricing.output) / 1000;
      return inputCost + outputCost;
    } catch (error) {
      logger.error('Failed to calculate cost:', error);
      return 0;
    }
  }
}

module.exports = { modelService: new ModelService() };