const { logger } = require('../utils/logger');

class IntegrationService {
  constructor() {
    this.integrations = new Map();
    this.loadIntegrations();
  }

  async loadIntegrations() {
    try {
      // Load AI integrations
      const openai = require('../integrations/openai');
      const anthropic = require('../integrations/anthropic');
      const mistral = require('../integrations/mistral');
      const ollama = require('../integrations/ollama');

      this.integrations.set('openai', openai);
      this.integrations.set('anthropic', anthropic);
      this.integrations.set('mistral', mistral);
      this.integrations.set('ollama', ollama);

      // Load cloud integrations
      const aws = require('../integrations/cloud/aws');
      const vercel = require('../integrations/cloud/vercel');
      
      this.integrations.set('aws', aws);
      this.integrations.set('vercel', vercel);

      logger.info('Integrations loaded successfully');
    } catch (error) {
      logger.error('Failed to load integrations:', error);
    }
  }

  async generateCode(options) {
    try {
      const { model, prompt, language, framework, context } = options;
      const provider = this.getProviderFromModel(model);
      
      const integration = this.integrations.get(provider);
      if (!integration) {
        throw new Error(`Integration not found for provider: ${provider}`);
      }

      const result = await integration.generateCode({
        model,
        prompt,
        language,
        framework,
        context
      });

      return {
        code: result.code,
        explanation: result.explanation,
        files: result.files,
        dependencies: result.dependencies
      };
    } catch (error) {
      logger.error('Code generation failed:', error);
      throw error;
    }
  }

  async chat(options) {
    try {
      const { model, messages, temperature, maxTokens } = options;
      const provider = this.getProviderFromModel(model);
      
      const integration = this.integrations.get(provider);
      if (!integration) {
        throw new Error(`Integration not found for provider: ${provider}`);
      }

      const result = await integration.chat({
        model,
        messages,
        temperature,
        maxTokens
      });

      return {
        response: result.response,
        tokens_used: result.tokens_used
      };
    } catch (error) {
      logger.error('Chat failed:', error);
      throw error;
    }
  }

  async analyze(options) {
    try {
      const { model, data, analysis_type, prompt } = options;
      const provider = this.getProviderFromModel(model);
      
      const integration = this.integrations.get(provider);
      if (!integration) {
        throw new Error(`Integration not found for provider: ${provider}`);
      }

      const result = await integration.analyze({
        model,
        data,
        analysis_type,
        prompt
      });

      return {
        analysis: result.analysis,
        insights: result.insights,
        recommendations: result.recommendations
      };
    } catch (error) {
      logger.error('Analysis failed:', error);
      throw error;
    }
  }

  async deploy(options) {
    try {
      const { environment, configuration, task } = options;
      const provider = configuration.provider || 'vercel';
      
      const integration = this.integrations.get(provider);
      if (!integration) {
        throw new Error(`Deployment integration not found for provider: ${provider}`);
      }

      const result = await integration.deploy({
        environment,
        configuration,
        task
      });

      return {
        status: result.status,
        url: result.url,
        logs: result.logs
      };
    } catch (error) {
      logger.error('Deployment failed:', error);
      throw error;
    }
  }

  getProviderFromModel(model) {
    if (model.startsWith('gpt-') || model.startsWith('text-')) {
      return 'openai';
    } else if (model.startsWith('claude-')) {
      return 'anthropic';
    } else if (model.startsWith('mistral-')) {
      return 'mistral';
    } else {
      return 'ollama'; // Default to Ollama for local models
    }
  }

  async getAvailableModels(provider) {
    try {
      const integration = this.integrations.get(provider);
      if (!integration) {
        throw new Error(`Integration not found for provider: ${provider}`);
      }

      return await integration.getAvailableModels();
    } catch (error) {
      logger.error('Failed to get available models:', error);
      throw error;
    }
  }

  async testIntegration(provider) {
    try {
      const integration = this.integrations.get(provider);
      if (!integration) {
        throw new Error(`Integration not found for provider: ${provider}`);
      }

      return await integration.test();
    } catch (error) {
      logger.error('Integration test failed:', error);
      throw error;
    }
  }
}

module.exports = { integrationService: new IntegrationService() };