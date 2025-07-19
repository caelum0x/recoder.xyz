const axios = require('axios');
const { logger } = require('../utils/logger');

class OpenAIIntegration {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.timeout = options.timeout || 60000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.organization = options.organization;
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.organization && { 'OpenAI-Organization': this.organization })
      }
    });
    
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('OpenAI request:', {
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
        logger.error('OpenAI request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('OpenAI response:', {
          status: response.status,
          usage: response.data?.usage,
          model: response.data?.model
        });
        return response;
      },
      (error) => {
        logger.error('OpenAI response error:', {
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
      model = 'gpt-3.5-turbo',
      messages,
      temperature = 1,
      max_tokens,
      top_p = 1,
      frequency_penalty = 0,
      presence_penalty = 0,
      stop,
      stream = false,
      functions,
      function_call,
      tools,
      tool_choice,
      response_format,
      seed,
      user
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/chat/completions', {
          model,
          messages,
          temperature,
          max_tokens,
          top_p,
          frequency_penalty,
          presence_penalty,
          stop,
          stream,
          functions,
          function_call,
          tools,
          tool_choice,
          response_format,
          seed,
          user
        });
      });

      return {
        success: true,
        id: response.data.id,
        object: response.data.object,
        created: response.data.created,
        model: response.data.model,
        choices: response.data.choices,
        usage: response.data.usage,
        system_fingerprint: response.data.system_fingerprint
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
      model = 'gpt-3.5-turbo-instruct',
      prompt,
      suffix,
      max_tokens = 16,
      temperature = 1,
      top_p = 1,
      n = 1,
      stream = false,
      logprobs,
      echo = false,
      stop,
      presence_penalty = 0,
      frequency_penalty = 0,
      best_of = 1,
      logit_bias,
      user
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/completions', {
          model,
          prompt,
          suffix,
          max_tokens,
          temperature,
          top_p,
          n,
          stream,
          logprobs,
          echo,
          stop,
          presence_penalty,
          frequency_penalty,
          best_of,
          logit_bias,
          user
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
      model = 'text-embedding-ada-002',
      input,
      encoding_format = 'float',
      dimensions,
      user
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/embeddings', {
          model,
          input,
          encoding_format,
          dimensions,
          user
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

  async createImage(options) {
    const {
      prompt,
      model = 'dall-e-2',
      n = 1,
      quality = 'standard',
      response_format = 'url',
      size = '1024x1024',
      style = 'vivid',
      user
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/images/generations', {
          prompt,
          model,
          n,
          quality,
          response_format,
          size,
          style,
          user
        });
      });

      return {
        success: true,
        created: response.data.created,
        data: response.data.data
      };
    } catch (error) {
      logger.error('Failed to create image:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createImageEdit(options) {
    const {
      image,
      mask,
      prompt,
      model = 'dall-e-2',
      n = 1,
      size = '1024x1024',
      response_format = 'url',
      user
    } = options;

    try {
      const formData = new FormData();
      formData.append('image', image);
      if (mask) formData.append('mask', mask);
      formData.append('prompt', prompt);
      formData.append('model', model);
      formData.append('n', n.toString());
      formData.append('size', size);
      formData.append('response_format', response_format);
      if (user) formData.append('user', user);

      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/images/edits', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      });

      return {
        success: true,
        created: response.data.created,
        data: response.data.data
      };
    } catch (error) {
      logger.error('Failed to edit image:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createImageVariation(options) {
    const {
      image,
      model = 'dall-e-2',
      n = 1,
      response_format = 'url',
      size = '1024x1024',
      user
    } = options;

    try {
      const formData = new FormData();
      formData.append('image', image);
      formData.append('model', model);
      formData.append('n', n.toString());
      formData.append('response_format', response_format);
      formData.append('size', size);
      if (user) formData.append('user', user);

      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/images/variations', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      });

      return {
        success: true,
        created: response.data.created,
        data: response.data.data
      };
    } catch (error) {
      logger.error('Failed to create image variation:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createSpeech(options) {
    const {
      model = 'tts-1',
      input,
      voice = 'alloy',
      response_format = 'mp3',
      speed = 1.0
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/audio/speech', {
          model,
          input,
          voice,
          response_format,
          speed
        }, {
          responseType: 'arraybuffer'
        });
      });

      return {
        success: true,
        audio: response.data,
        contentType: response.headers['content-type']
      };
    } catch (error) {
      logger.error('Failed to create speech:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createTranscription(options) {
    const {
      file,
      model = 'whisper-1',
      language,
      prompt,
      response_format = 'json',
      temperature = 0,
      timestamp_granularities
    } = options;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', model);
      if (language) formData.append('language', language);
      if (prompt) formData.append('prompt', prompt);
      formData.append('response_format', response_format);
      formData.append('temperature', temperature.toString());
      if (timestamp_granularities) {
        formData.append('timestamp_granularities[]', timestamp_granularities.join(','));
      }

      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/audio/transcriptions', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      });

      return {
        success: true,
        ...response.data
      };
    } catch (error) {
      logger.error('Failed to create transcription:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createTranslation(options) {
    const {
      file,
      model = 'whisper-1',
      prompt,
      response_format = 'json',
      temperature = 0
    } = options;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', model);
      if (prompt) formData.append('prompt', prompt);
      formData.append('response_format', response_format);
      formData.append('temperature', temperature.toString());

      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/audio/translations', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      });

      return {
        success: true,
        ...response.data
      };
    } catch (error) {
      logger.error('Failed to create translation:', error);
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

  async retrieveModel(model) {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.get(`/models/${model}`);
      });

      return {
        success: true,
        ...response.data
      };
    } catch (error) {
      logger.error('Failed to retrieve model:', error);
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
        
        logger.warn(`OpenAI request failed (attempt ${attempt}/${this.retryAttempts}):`, error.response?.data?.error || error.message);
        await this.delay(this.retryDelay * Math.pow(2, attempt - 1)); // Exponential backoff
      }
    }
    
    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for common coding tasks
  async generateCode(prompt, language = 'javascript', model = 'gpt-4') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert ${language} developer. Generate clean, well-documented, and efficient ${language} code based on the user's requirements. Only return the code without explanations unless specifically asked.`
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

  async reviewCode(code, language = 'javascript', model = 'gpt-4') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert code reviewer. Analyze the provided ${language} code and provide detailed feedback on code quality, potential bugs, security issues, performance optimizations, and best practices.`
    };

    const userMessage = {
      role: 'user',
      content: `Please review this ${language} code:\n\n${code}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.2,
      max_tokens: 1500
    });
  }

  async explainCode(code, language = 'javascript', model = 'gpt-3.5-turbo') {
    const systemMessage = {
      role: 'system',
      content: `You are a helpful programming tutor. Explain what the provided ${language} code does in clear, simple terms that a beginner could understand.`
    };

    const userMessage = {
      role: 'user',
      content: `Please explain this ${language} code:\n\n${code}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.4,
      max_tokens: 1000
    });
  }

  async refactorCode(code, language = 'javascript', improvements = [], model = 'gpt-4') {
    const improvementsText = improvements.length > 0 ? 
      `Focus on these specific improvements: ${improvements.join(', ')}. ` : 
      '';
    
    const systemMessage = {
      role: 'system',
      content: `You are an expert ${language} developer. Refactor the provided code to improve its quality, readability, performance, and maintainability. ${improvementsText}Only return the refactored code.`
    };

    const userMessage = {
      role: 'user',
      content: `Please refactor this ${language} code:\n\n${code}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async generateTests(code, language = 'javascript', testFramework = 'jest', model = 'gpt-4') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert test writer. Generate comprehensive unit tests for the provided ${language} code using ${testFramework}. Include positive cases, negative cases, edge cases, and error scenarios.`
    };

    const userMessage = {
      role: 'user',
      content: `Generate ${testFramework} tests for this ${language} code:\n\n${code}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  async generateDocumentation(code, language = 'javascript', format = 'JSDoc', model = 'gpt-4') {
    const systemMessage = {
      role: 'system',
      content: `You are a technical documentation expert. Generate comprehensive ${format} documentation for the provided ${language} code including function descriptions, parameters, return values, examples, and usage notes.`
    };

    const userMessage = {
      role: 'user',
      content: `Generate ${format} documentation for this ${language} code:\n\n${code}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 1500
    });
  }

  async debugCode(code, error, language = 'javascript', model = 'gpt-4') {
    const systemMessage = {
      role: 'system',
      content: `You are an expert debugger. Analyze the provided ${language} code and error message to identify the issue and provide a solution with the corrected code.`
    };

    const userMessage = {
      role: 'user',
      content: `Debug this ${language} code that's producing the following error:\n\nError: ${error}\n\nCode:\n${code}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.2,
      max_tokens: 1500
    });
  }

  async optimizeCode(code, language = 'javascript', focusArea = 'performance', model = 'gpt-4') {
    const systemMessage = {
      role: 'system',
      content: `You are a ${language} optimization expert. Optimize the provided code focusing on ${focusArea}. Explain the optimizations made and provide the improved code.`
    };

    const userMessage = {
      role: 'user',
      content: `Optimize this ${language} code for ${focusArea}:\n\n${code}`
    };

    return await this.createChatCompletion({
      model,
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      max_tokens: 2000
    });
  }

  // Configuration methods
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  setOrganization(organization) {
    this.organization = organization;
    if (organization) {
      this.client.defaults.headers['OpenAI-Organization'] = organization;
    } else {
      delete this.client.defaults.headers['OpenAI-Organization'];
    }
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

module.exports = { OpenAIIntegration };