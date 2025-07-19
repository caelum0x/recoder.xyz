const axios = require('axios');
const { logger } = require('../utils/logger');

class MistralIntegration {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.MISTRAL_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.mistral.ai/v1';
    this.timeout = options.timeout || 60000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    if (!this.apiKey) {
      throw new Error('Mistral API key is required');
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Mistral request:', {
          method: config.method,
          url: config.url,
          data: config.data ? { 
            ...config.data, 
            messages: config.data.messages ? '[MESSAGES_HIDDEN]' : undefined,
            prompt: config.data.prompt ? config.data.prompt.substring(0, 100) + '...' : undefined
          } : undefined
        });
        return config;
      },
      (error) => {
        logger.error('Mistral request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Mistral response:', {
          status: response.status,
          usage: response.data?.usage,
          model: response.data?.model
        });
        return response;
      },
      (error) => {
        logger.error('Mistral response error:', {
          status: error.response?.status,
          message: error.message,
          error: error.response?.data?.error
        });
        return Promise.reject(error);
      }
    );
  }

  async createChatCompletion(options) {
    const {
      model = 'mistral-medium',
      messages,
      temperature = 0.7,
      top_p = 1,
      max_tokens,
      stream = false,
      safe_prompt = false,
      random_seed
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/chat/completions', {
          model,
          messages,
          temperature,
          top_p,
          max_tokens,
          stream,
          safe_prompt,
          random_seed
        });
      });

      return {
        success: true,
        id: response.data.id,
        object: response.data.object,
        created: response.data.created,
        model: response.data.model,
        choices: response.data.choices,
        usage: response.data.usage
      };
    } catch (error) {
      logger.error('Failed to create chat completion:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createCompletion(options) {
    const {
      model = 'mistral-medium',
      prompt,
      suffix,
      temperature = 0.7,
      top_p = 1,
      max_tokens,
      min_tokens = 0,
      stream = false,
      stop,
      random_seed
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/completions', {
          model,
          prompt,
          suffix,
          temperature,
          top_p,
          max_tokens,
          min_tokens,
          stream,
          stop,
          random_seed
        });
      });

      return {
        success: true,
        id: response.data.id,
        object: response.data.object,
        created: response.data.created,
        model: response.data.model,
        choices: response.data.choices,
        usage: response.data.usage
      };
    } catch (error) {
      logger.error('Failed to create completion:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createEmbedding(options) {
    const {
      model = 'mistral-embed',
      input,
      encoding_format = 'float'
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/embeddings', {
          model,
          input,
          encoding_format
        });
      });

      return {
        success: true,
        object: response.data.object,
        data: response.data.data,
        model: response.data.model,
        usage: response.data.usage
      };
    } catch (error) {
      logger.error('Failed to create embedding:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async listModels() {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.get('/models');
      });

      return {
        success: true,
        object: response.data.object,
        data: response.data.data
      };
    } catch (error) {
      logger.error('Failed to list models:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
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
        
        // Don't retry on client errors (4xx) except for rate limiting (429)
        if (error.response?.status && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
          throw error;
        }
        
        logger.warn(`Mistral request failed (attempt ${attempt}/${this.retryAttempts}):`, error.response?.data?.error || error.message);
        await this.delay(this.retryDelay * Math.pow(2, attempt - 1)); // Exponential backoff
      }
    }
    
    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for common coding tasks
  async generateCode(prompt, language = 'javascript', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert ${language} developer. Generate clean, well-documented, and efficient ${language} code based on the user's requirements. Only return the code without explanations unless specifically asked. Follow best practices and modern conventions.`
    };

    const userMessage = {
      role: 'user',
      content: prompt
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async reviewCode(code, language = 'javascript', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert code reviewer with extensive experience in ${language}. Analyze the provided code and provide comprehensive feedback on code quality, potential issues, security concerns, performance optimizations, and adherence to best practices.`
    };

    const userMessage = {
      role: 'user',
      content: `Please review this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.2,
      max_tokens: 1500
    });
  }

  async explainCode(code, language = 'javascript', model = 'mistral-small') {
    const systemMessage = {
      role: 'system',
      content: `You are a helpful programming instructor. Explain what the provided ${language} code does in clear, simple terms that a beginner could understand. Break down complex parts and explain the overall flow.`
    };

    const userMessage = {
      role: 'user',
      content: `Please explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.4,
      max_tokens: 1000
    });
  }

  async refactorCode(code, language = 'javascript', improvements = [], model = 'mistral-medium') {
    const improvementsText = improvements.length > 0 ? 
      `Focus on these specific improvements: ${improvements.join(', ')}. ` : 
      '';
    
    const systemMessage = {
      role: 'system',
      content: `You are an expert ${language} developer specializing in code refactoring. Refactor the provided code to improve its quality, readability, performance, and maintainability. ${improvementsText}Return only the refactored code with brief comments explaining major changes.`
    };

    const userMessage = {
      role: 'user',
      content: `Please refactor this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async generateTests(code, language = 'javascript', testFramework = 'jest', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert test writer specializing in ${language} and ${testFramework}. Generate comprehensive unit tests for the provided code including positive cases, negative cases, edge cases, and error scenarios. Ensure good test coverage and clear test descriptions.`
    };

    const userMessage = {
      role: 'user',
      content: `Generate ${testFramework} tests for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async generateDocumentation(code, language = 'javascript', format = 'JSDoc', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are a technical documentation expert. Generate comprehensive ${format} documentation for the provided ${language} code including function descriptions, parameter details, return values, usage examples, and any important notes or warnings.`
    };

    const userMessage = {
      role: 'user',
      content: `Generate ${format} documentation for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 1500
    });
  }

  async debugCode(code, error, language = 'javascript', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert debugger with deep knowledge of ${language}. Analyze the provided code and error message to identify the issue, explain the root cause, and provide a corrected version of the code.`
    };

    const userMessage = {
      role: 'user',
      content: `Debug this ${language} code that's producing the following error:

**Error:**
\`\`\`
${error}
\`\`\`

**Code:**
\`\`\`${language}
${code}
\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.2,
      max_tokens: 1500
    });
  }

  async optimizeCode(code, language = 'javascript', focusArea = 'performance', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are a ${language} optimization expert. Optimize the provided code focusing on ${focusArea}. Explain the optimizations made and provide the improved code with performance considerations.`
    };

    const userMessage = {
      role: 'user',
      content: `Optimize this ${language} code for ${focusArea}:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async convertCode(code, fromLanguage, toLanguage, model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert polyglot programmer. Convert the provided ${fromLanguage} code to ${toLanguage} while maintaining the same functionality. Ensure the converted code follows ${toLanguage} best practices and idioms.`
    };

    const userMessage = {
      role: 'user',
      content: `Convert this ${fromLanguage} code to ${toLanguage}:\n\n\`\`\`${fromLanguage}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async generateAPI(description, language = 'javascript', framework = 'express', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert API developer specializing in ${language} and ${framework}. Based on the provided description, generate a complete API implementation including routes, middleware, error handling, and proper HTTP status codes.`
    };

    const userMessage = {
      role: 'user',
      content: `Generate a ${framework} API in ${language} for: ${description}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2500
    });
  }

  async generateDatabase(description, database = 'postgresql', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are a database expert specializing in ${database}. Based on the provided description, generate database schema, including tables, relationships, indexes, and constraints. Also provide sample queries for common operations.`
    };

    const userMessage = {
      role: 'user',
      content: `Design a ${database} database schema for: ${description}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async generateFrontend(description, framework = 'react', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert frontend developer specializing in ${framework}. Based on the provided description, generate a complete frontend implementation including components, state management, and styling.`
    };

    const userMessage = {
      role: 'user',
      content: `Generate a ${framework} frontend for: ${description}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2500
    });
  }

  async analyzePerformance(code, language = 'javascript', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are a performance analysis expert for ${language}. Analyze the provided code for performance bottlenecks, memory usage issues, and optimization opportunities. Provide specific recommendations and potential improvements.`
    };

    const userMessage = {
      role: 'user',
      content: `Analyze the performance of this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.2,
      max_tokens: 1500
    });
  }

  async generateSecurityAudit(code, language = 'javascript', model = 'mistral-medium') {
    const systemMessage = {
      role: 'system',
      content: `You are a cybersecurity expert specializing in ${language} applications. Perform a security audit of the provided code, identifying potential vulnerabilities, security weaknesses, and providing recommendations for secure coding practices.`
    };

    const userMessage = {
      role: 'user',
      content: `Perform a security audit of this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.2,
      max_tokens: 1500
    });
  }

  // Configuration methods
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    this.client.defaults.timeout = timeout;
  }

  setRetryOptions(attempts, delay) {
    this.retryAttempts = attempts;
    this.retryDelay = delay;
  }

  // Helper method to extract text content from response
  extractTextContent(response) {
    if (!response.success || !response.choices || response.choices.length === 0) {
      return null;
    }

    const choice = response.choices[0];
    return choice.message ? choice.message.content : choice.text;
  }

  // Helper method to check if model supports function calling
  supportsFunctionCalling(model) {
    const functionCallingModels = ['mistral-large-latest', 'mistral-small-latest'];
    return functionCallingModels.includes(model);
  }

  // Helper method to get recommended model based on task
  getRecommendedModel(task) {
    const modelMap = {
      'code-generation': 'mistral-medium',
      'code-review': 'mistral-medium',
      'explanation': 'mistral-small',
      'documentation': 'mistral-medium',
      'debugging': 'mistral-medium',
      'optimization': 'mistral-medium',
      'security': 'mistral-large-latest',
      'architecture': 'mistral-large-latest'
    };

    return modelMap[task] || 'mistral-medium';
  }
}

module.exports = { MistralIntegration };