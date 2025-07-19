const axios = require('axios');
const { logger } = require('../utils/logger');

class AnthropicIntegration {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com';
    this.timeout = options.timeout || 60000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.version = options.version || '2023-06-01';
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': this.version
      }
    });
    
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Anthropic request:', {
          method: config.method,
          url: config.url,
          data: config.data ? { 
            ...config.data, 
            messages: config.data.messages ? '[MESSAGES_HIDDEN]' : undefined
          } : undefined
        });
        return config;
      },
      (error) => {
        logger.error('Anthropic request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Anthropic response:', {
          status: response.status,
          usage: response.data?.usage,
          model: response.data?.model
        });
        return response;
      },
      (error) => {
        logger.error('Anthropic response error:', {
          status: error.response?.status,
          message: error.message,
          error: error.response?.data?.error
        });
        return Promise.reject(error);
      }
    );
  }

  async createMessage(options) {
    const {
      model = 'claude-3-sonnet-20240229',
      max_tokens = 1024,
      messages,
      system,
      temperature = 1,
      top_p,
      top_k,
      stop_sequences,
      stream = false,
      metadata
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/v1/messages', {
          model,
          max_tokens,
          messages,
          system,
          temperature,
          top_p,
          top_k,
          stop_sequences,
          stream,
          metadata
        });
      });

      return {
        success: true,
        id: response.data.id,
        type: response.data.type,
        role: response.data.role,
        content: response.data.content,
        model: response.data.model,
        stop_reason: response.data.stop_reason,
        stop_sequence: response.data.stop_sequence,
        usage: response.data.usage
      };
    } catch (error) {
      logger.error('Failed to create message:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status
      };
    }
  }

  async createCompletion(options) {
    const {
      model = 'claude-2.1',
      prompt,
      max_tokens_to_sample = 100,
      temperature = 1,
      top_p = -1,
      top_k = -1,
      stop_sequences,
      stream = false
    } = options;

    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.post('/v1/complete', {
          model,
          prompt,
          max_tokens_to_sample,
          temperature,
          top_p,
          top_k,
          stop_sequences,
          stream
        });
      });

      return {
        success: true,
        completion: response.data.completion,
        stop_reason: response.data.stop_reason,
        model: response.data.model
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
        
        logger.warn(`Anthropic request failed (attempt ${attempt}/${this.retryAttempts}):`, error.response?.data?.error || error.message);
        await this.delay(this.retryDelay * Math.pow(2, attempt - 1)); // Exponential backoff
      }
    }
    
    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for common coding tasks
  async generateCode(prompt, language = 'javascript', model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are an expert ${language} developer. Generate clean, well-documented, and efficient ${language} code based on the user's requirements. Only return the code without explanations unless specifically asked. Follow best practices and include proper error handling where appropriate.`;

    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2000,
      messages,
      system: systemMessage,
      temperature: 0.3
    });
  }

  async reviewCode(code, language = 'javascript', model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are an expert code reviewer with deep knowledge of ${language}. Analyze the provided code and provide detailed feedback on:
    1. Code quality and readability
    2. Potential bugs and issues
    3. Security vulnerabilities
    4. Performance optimizations
    5. Best practices and design patterns
    6. Suggestions for improvement`;

    const messages = [
      {
        role: 'user',
        content: `Please review this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2000,
      messages,
      system: systemMessage,
      temperature: 0.2
    });
  }

  async explainCode(code, language = 'javascript', model = 'claude-3-haiku-20240307') {
    const systemMessage = `You are a helpful programming tutor. Explain what the provided ${language} code does in clear, simple terms that a beginner could understand. Break down complex concepts and explain the purpose of each major section.`;

    const messages = [
      {
        role: 'user',
        content: `Please explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 1500,
      messages,
      system: systemMessage,
      temperature: 0.4
    });
  }

  async refactorCode(code, language = 'javascript', improvements = [], model = 'claude-3-sonnet-20240229') {
    const improvementsText = improvements.length > 0 ? 
      `Focus on these specific improvements: ${improvements.join(', ')}. ` : 
      '';
    
    const systemMessage = `You are an expert ${language} developer specializing in code refactoring. Refactor the provided code to improve its quality, readability, performance, and maintainability. ${improvementsText}Return only the refactored code with brief comments explaining major changes.`;

    const messages = [
      {
        role: 'user',
        content: `Please refactor this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2500,
      messages,
      system: systemMessage,
      temperature: 0.3
    });
  }

  async generateTests(code, language = 'javascript', testFramework = 'jest', model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are an expert test writer specializing in ${language} and ${testFramework}. Generate comprehensive unit tests for the provided code including:
    1. Positive test cases (happy path)
    2. Negative test cases (error conditions)
    3. Edge cases and boundary conditions
    4. Mock dependencies where appropriate
    5. Clear test descriptions and assertions`;

    const messages = [
      {
        role: 'user',
        content: `Generate ${testFramework} tests for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2500,
      messages,
      system: systemMessage,
      temperature: 0.3
    });
  }

  async generateDocumentation(code, language = 'javascript', format = 'JSDoc', model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are a technical documentation expert. Generate comprehensive ${format} documentation for the provided ${language} code including:
    1. Function/method descriptions
    2. Parameter descriptions with types
    3. Return value descriptions
    4. Usage examples
    5. Any important notes or warnings
    6. Error conditions that may be thrown`;

    const messages = [
      {
        role: 'user',
        content: `Generate ${format} documentation for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2000,
      messages,
      system: systemMessage,
      temperature: 0.3
    });
  }

  async debugCode(code, error, language = 'javascript', model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are an expert debugger with deep knowledge of ${language}. Analyze the provided code and error message to:
    1. Identify the root cause of the issue
    2. Explain why the error is occurring
    3. Provide a corrected version of the code
    4. Suggest preventive measures to avoid similar issues`;

    const messages = [
      {
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
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2000,
      messages,
      system: systemMessage,
      temperature: 0.2
    });
  }

  async optimizeCode(code, language = 'javascript', focusArea = 'performance', model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are a ${language} optimization expert. Optimize the provided code focusing on ${focusArea}. Provide:
    1. The optimized code
    2. Explanation of what optimizations were made
    3. Performance impact analysis
    4. Any trade-offs to consider
    5. Benchmarking suggestions if applicable`;

    const messages = [
      {
        role: 'user',
        content: `Optimize this ${language} code for ${focusArea}:\n\n\`\`\`${language}\n${code}\n\`\`\``
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2500,
      messages,
      system: systemMessage,
      temperature: 0.3
    });
  }

  async generateArchitecture(requirements, technology = 'web', model = 'claude-3-opus-20240229') {
    const systemMessage = `You are a software architect with expertise in ${technology} technologies. Based on the provided requirements, design a comprehensive software architecture including:
    1. High-level system architecture
    2. Component breakdown
    3. Technology stack recommendations
    4. Database design considerations
    5. API design patterns
    6. Security considerations
    7. Scalability and performance considerations`;

    const messages = [
      {
        role: 'user',
        content: `Design a ${technology} architecture for the following requirements:\n\n${requirements}`
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 3000,
      messages,
      system: systemMessage,
      temperature: 0.4
    });
  }

  async generateProjectPlan(requirements, model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are a senior project manager and technical lead. Create a detailed project plan based on the provided requirements including:
    1. Project breakdown structure
    2. Development phases and milestones
    3. Task dependencies
    4. Time estimates
    5. Resource requirements
    6. Risk assessment
    7. Technology recommendations
    8. Testing strategy`;

    const messages = [
      {
        role: 'user',
        content: `Create a project plan for the following requirements:\n\n${requirements}`
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 3000,
      messages,
      system: systemMessage,
      temperature: 0.3
    });
  }

  async analyzeRequirements(requirements, model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are a business analyst and software architect. Analyze the provided requirements and provide:
    1. Clarifying questions for ambiguous requirements
    2. Functional requirements breakdown
    3. Non-functional requirements identification
    4. Potential challenges and risks
    5. Technology considerations
    6. Integration points
    7. User experience considerations`;

    const messages = [
      {
        role: 'user',
        content: `Analyze these project requirements:\n\n${requirements}`
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 2500,
      messages,
      system: systemMessage,
      temperature: 0.4
    });
  }

  async generateAPIDesign(description, model = 'claude-3-sonnet-20240229') {
    const systemMessage = `You are an API design expert. Based on the provided description, design a RESTful API including:
    1. Endpoint structure and naming
    2. HTTP methods and status codes
    3. Request/response schemas
    4. Authentication and authorization
    5. Error handling patterns
    6. Rate limiting considerations
    7. OpenAPI/Swagger specification
    8. Best practices implementation`;

    const messages = [
      {
        role: 'user',
        content: `Design an API for: ${description}`
      }
    ];

    return await this.createMessage({
      model,
      max_tokens: 3000,
      messages,
      system: systemMessage,
      temperature: 0.3
    });
  }

  // Configuration methods
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.client.defaults.headers['x-api-key'] = apiKey;
  }

  setVersion(version) {
    this.version = version;
    this.client.defaults.headers['anthropic-version'] = version;
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    this.client.defaults.timeout = timeout;
  }

  setRetryOptions(attempts, delay) {
    this.retryAttempts = attempts;
    this.retryDelay = delay;
  }

  // Helper method to format messages for the API
  formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
  }

  // Helper method to extract text content from response
  extractTextContent(response) {
    if (!response.success || !response.content) {
      return null;
    }

    const textContent = response.content.find(block => block.type === 'text');
    return textContent ? textContent.text : null;
  }
}

module.exports = { AnthropicIntegration };