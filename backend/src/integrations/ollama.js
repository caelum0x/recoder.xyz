const axios = require('axios');
const { logger } = require('../utils/logger');

class OllamaIntegration {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Ollama request:', {
          method: config.method,
          url: config.url,
          data: config.data ? { ...config.data, prompt: config.data.prompt?.substring(0, 100) + '...' } : undefined
        });
        return config;
      },
      (error) => {
        logger.error('Ollama request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Ollama response:', {
          status: response.status,
          data: response.data ? { ...response.data, response: response.data.response?.substring(0, 100) + '...' } : undefined
        });
        return response;
      },
      (error) => {
        logger.error('Ollama response error:', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  async generateText(options) {
    const {
      model,
      prompt,
      system = '',
      template = '',
      context = [],
      stream = false,
      raw = false,
      format = '',
      options: modelOptions = {}
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/generate', {
          model,
          prompt,
          system,
          template,
          context,
          stream,
          raw,
          format,
          options: modelOptions
        });
      });

      return {
        success: true,
        response: response.data.response,
        model: response.data.model,
        createdAt: response.data.created_at,
        done: response.data.done,
        context: response.data.context,
        totalDuration: response.data.total_duration,
        loadDuration: response.data.load_duration,
        promptEvalCount: response.data.prompt_eval_count,
        promptEvalDuration: response.data.prompt_eval_duration,
        evalCount: response.data.eval_count,
        evalDuration: response.data.eval_duration
      };
    } catch (error) {
      logger.error('Failed to generate text with Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async chat(options) {
    const {
      model,
      messages,
      stream = false,
      format = '',
      options: modelOptions = {}
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/chat', {
          model,
          messages,
          stream,
          format,
          options: modelOptions
        });
      });

      return {
        success: true,
        message: response.data.message,
        model: response.data.model,
        createdAt: response.data.created_at,
        done: response.data.done,
        totalDuration: response.data.total_duration,
        loadDuration: response.data.load_duration,
        promptEvalCount: response.data.prompt_eval_count,
        promptEvalDuration: response.data.prompt_eval_duration,
        evalCount: response.data.eval_count,
        evalDuration: response.data.eval_duration
      };
    } catch (error) {
      logger.error('Failed to chat with Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async createModel(options) {
    const {
      name,
      modelfile,
      stream = false
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/create', {
          name,
          modelfile,
          stream
        });
      });

      return {
        success: true,
        status: response.data.status
      };
    } catch (error) {
      logger.error('Failed to create model with Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async listModels() {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.get('/api/tags');
      });

      return {
        success: true,
        models: response.data.models || []
      };
    } catch (error) {
      logger.error('Failed to list models from Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async showModel(name) {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/show', { name });
      });

      return {
        success: true,
        model: response.data
      };
    } catch (error) {
      logger.error('Failed to show model from Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async copyModel(source, destination) {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/copy', {
          source,
          destination
        });
      });

      return {
        success: true,
        status: response.status
      };
    } catch (error) {
      logger.error('Failed to copy model in Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async deleteModel(name) {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.delete('/api/delete', {
          data: { name }
        });
      });

      return {
        success: true,
        status: response.status
      };
    } catch (error) {
      logger.error('Failed to delete model from Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async pullModel(name, stream = false) {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/pull', {
          name,
          stream
        });
      });

      return {
        success: true,
        status: response.data.status
      };
    } catch (error) {
      logger.error('Failed to pull model from Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async pushModel(name, stream = false) {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/push', {
          name,
          stream
        });
      });

      return {
        success: true,
        status: response.data.status
      };
    } catch (error) {
      logger.error('Failed to push model to Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async embeddings(options) {
    const {
      model,
      prompt
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/api/embeddings', {
          model,
          prompt
        });
      });

      return {
        success: true,
        embedding: response.data.embedding
      };
    } catch (error) {
      logger.error('Failed to get embeddings from Ollama:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async isHealthy() {
    try {
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return {
        healthy: true,
        status: response.status,
        models: response.data.models?.length || 0
      };
    } catch (error) {
      logger.error('Ollama health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async executeWithRetry(operation) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retryAttempts) {
          throw error;
        }
        
        if (error.response?.status && error.response.status < 500) {
          throw error; // Don't retry client errors
        }
        
        logger.warn(`Ollama request failed (attempt ${attempt}/${this.retryAttempts}):`, error.message);
        await this.delay(this.retryDelay * attempt);
      }
    }
    
    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for common tasks
  async generateCode(prompt, language = 'javascript', model = 'codellama') {
    const systemPrompt = `You are a code generation assistant. Generate clean, well-documented ${language} code based on the user's requirements. Only return the code, no explanations.`;
    
    return await this.generateText({
      model,
      prompt,
      system: systemPrompt,
      options: {
        temperature: 0.3,
        top_p: 0.9
      }
    });
  }

  async analyzeCode(code, language = 'javascript', model = 'codellama') {
    const systemPrompt = `You are a code analysis assistant. Analyze the provided ${language} code and provide insights about its quality, potential issues, and suggestions for improvement.`;
    
    return await this.generateText({
      model,
      prompt: `Analyze this ${language} code:\n\n${code}`,
      system: systemPrompt,
      options: {
        temperature: 0.2,
        top_p: 0.8
      }
    });
  }

  async explainCode(code, language = 'javascript', model = 'llama2') {
    const systemPrompt = `You are a code explanation assistant. Explain what the provided ${language} code does in clear, simple terms.`;
    
    return await this.generateText({
      model,
      prompt: `Explain this ${language} code:\n\n${code}`,
      system: systemPrompt,
      options: {
        temperature: 0.4,
        top_p: 0.8
      }
    });
  }

  async generateDocumentation(code, language = 'javascript', model = 'llama2') {
    const systemPrompt = `You are a documentation assistant. Generate comprehensive documentation for the provided ${language} code including function descriptions, parameters, return values, and usage examples.`;
    
    return await this.generateText({
      model,
      prompt: `Generate documentation for this ${language} code:\n\n${code}`,
      system: systemPrompt,
      options: {
        temperature: 0.3,
        top_p: 0.8
      }
    });
  }

  async refactorCode(code, language = 'javascript', improvements = [], model = 'codellama') {
    const improvementsText = improvements.length > 0 ? 
      `Focus on these improvements: ${improvements.join(', ')}` : 
      'Focus on code quality, readability, and performance';
    
    const systemPrompt = `You are a code refactoring assistant. Refactor the provided ${language} code to improve its quality. ${improvementsText}. Only return the refactored code.`;
    
    return await this.generateText({
      model,
      prompt: `Refactor this ${language} code:\n\n${code}`,
      system: systemPrompt,
      options: {
        temperature: 0.3,
        top_p: 0.9
      }
    });
  }

  async reviewCode(code, language = 'javascript', model = 'llama2') {
    const systemPrompt = `You are a code review assistant. Provide a thorough code review for the ${language} code, highlighting strengths, weaknesses, security concerns, and suggestions for improvement.`;
    
    return await this.generateText({
      model,
      prompt: `Review this ${language} code:\n\n${code}`,
      system: systemPrompt,
      options: {
        temperature: 0.4,
        top_p: 0.8
      }
    });
  }

  // Configuration methods
  setBaseUrl(url) {
    this.baseUrl = url;
    this.client.defaults.baseURL = url;
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    this.client.defaults.timeout = timeout;
  }

  setRetryOptions(attempts, delay) {
    this.retryAttempts = attempts;
    this.retryDelay = delay;
  }
}

module.exports = { OllamaIntegration };