const { BaseGenerator } = require('./baseGenerator');
const { logger } = require('../utils/logger');
const path = require('path');

class IntegrationGenerator extends BaseGenerator {
  constructor(options = {}) {
    super(options);
    this.registerIntegrationTemplates();
  }

  registerIntegrationTemplates() {
    // API Integration templates
    this.registerTemplate('restClient', (data) => this.generateRestClient(data));
    this.registerTemplate('graphqlClient', (data) => this.generateGraphQLClient(data));
    this.registerTemplate('websocketClient', (data) => this.generateWebSocketClient(data));

    // Database Integration templates
    this.registerTemplate('prismaConfig', (data) => this.generatePrismaConfig(data));
    this.registerTemplate('mongooseConfig', (data) => this.generateMongooseConfig(data));
    this.registerTemplate('redisConfig', (data) => this.generateRedisConfig(data));

    // Authentication Integration templates
    this.registerTemplate('authProvider', (data) => this.generateAuthProvider(data));
    this.registerTemplate('jwtHandler', (data) => this.generateJWTHandler(data));
    this.registerTemplate('oauth', (data) => this.generateOAuthHandler(data));

    // Third-party Service templates
    this.registerTemplate('emailService', (data) => this.generateEmailService(data));
    this.registerTemplate('smsService', (data) => this.generateSMSService(data));
    this.registerTemplate('paymentService', (data) => this.generatePaymentService(data));
    this.registerTemplate('storageService', (data) => this.generateStorageService(data));

    // Messaging Integration templates
    this.registerTemplate('queueService', (data) => this.generateQueueService(data));
    this.registerTemplate('pubsubService', (data) => this.generatePubSubService(data));
    this.registerTemplate('webhookHandler', (data) => this.generateWebhookHandler(data));

    // Cloud Integration templates
    this.registerTemplate('awsConfig', (data) => this.generateAWSConfig(data));
    this.registerTemplate('gcpConfig', (data) => this.generateGCPConfig(data));
    this.registerTemplate('azureConfig', (data) => this.generateAzureConfig(data));
  }

  async generate(input, context = {}) {
    try {
      this.validateInput(input, ['integrationType']);

      const result = await this.performAsyncGeneration(input, async () => {
        const config = this.mergeConfigurations(
          this.getDefaultIntegrationConfig(),
          input,
          context
        );

        const structure = await this.generateIntegrationStructure(config);
        return await this.generateFromStructure(structure);
      });

      return this.createGenerationResult(true, {
        integrationType: input.integrationType,
        services: input.services || [],
        patterns: input.patterns || []
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  getDefaultIntegrationConfig() {
    return {
      patterns: ['client', 'service', 'handler'],
      errorHandling: true,
      retry: true,
      caching: false,
      monitoring: true,
      testing: true,
      documentation: true
    };
  }

  async generateIntegrationStructure(config) {
    const structure = {
      'integrations': {}
    };

    // Generate based on integration types
    if (config.integrationType === 'api' || config.services?.includes('api')) {
      structure.integrations['api'] = {
        'rest-client.js': { template: 'restClient', data: config },
        'graphql-client.js': { template: 'graphqlClient', data: config },
        'websocket-client.js': { template: 'websocketClient', data: config }
      };
    }

    if (config.integrationType === 'database' || config.services?.includes('database')) {
      structure.integrations['database'] = {
        'prisma.js': { template: 'prismaConfig', data: config },
        'mongoose.js': { template: 'mongooseConfig', data: config },
        'redis.js': { template: 'redisConfig', data: config }
      };
    }

    if (config.integrationType === 'auth' || config.services?.includes('auth')) {
      structure.integrations['auth'] = {
        'auth-provider.js': { template: 'authProvider', data: config },
        'jwt-handler.js': { template: 'jwtHandler', data: config },
        'oauth-handler.js': { template: 'oauth', data: config }
      };
    }

    if (config.integrationType === 'services' || config.services?.includes('external')) {
      structure.integrations['services'] = {
        'email-service.js': { template: 'emailService', data: config },
        'sms-service.js': { template: 'smsService', data: config },
        'payment-service.js': { template: 'paymentService', data: config },
        'storage-service.js': { template: 'storageService', data: config }
      };
    }

    if (config.integrationType === 'messaging' || config.services?.includes('messaging')) {
      structure.integrations['messaging'] = {
        'queue-service.js': { template: 'queueService', data: config },
        'pubsub-service.js': { template: 'pubsubService', data: config },
        'webhook-handler.js': { template: 'webhookHandler', data: config }
      };
    }

    if (config.integrationType === 'cloud' || config.services?.includes('cloud')) {
      structure.integrations['cloud'] = {
        'aws-config.js': { template: 'awsConfig', data: config },
        'gcp-config.js': { template: 'gcpConfig', data: config },
        'azure-config.js': { template: 'azureConfig', data: config }
      };
    }

    // Common integration utilities
    structure.integrations['utils'] = {
      'retry.js': this.generateRetryUtility(config),
      'cache.js': this.generateCacheUtility(config),
      'monitor.js': this.generateMonitoringUtility(config)
    };

    // Tests
    if (config.testing) {
      structure['tests'] = {
        'integrations': {
          'api.test.js': this.generateAPITests(config),
          'database.test.js': this.generateDatabaseTests(config),
          'services.test.js': this.generateServiceTests(config)
        }
      };
    }

    return structure;
  }

  generateRestClient(data) {
    return `const axios = require('axios');
const { logger } = require('../utils/logger');
const { retryWithBackoff } = require('./utils/retry');
const { cacheManager } = require('./utils/cache');

class RestClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || process.env.API_BASE_URL;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.cache = options.cache || false;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': '${data.projectName || 'App'}/1.0'
      }
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = \`Bearer \${token}\`;
        }
        
        logger.debug('API Request', {
          method: config.method,
          url: config.url,
          headers: config.headers
        });
        
        return config;
      },
      (error) => {
        logger.error('Request Error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('API Response', {
          status: response.status,
          url: response.config.url,
          data: response.data
        });
        
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  getAuthToken() {
    return process.env.API_TOKEN || null;
  }

  handleError(error) {
    if (error.response) {
      logger.error('API Error Response', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      logger.error('API Network Error', {
        message: error.message,
        url: error.config?.url
      });
    } else {
      logger.error('API Request Setup Error', error.message);
    }
  }

  async get(url, options = {}) {
    const cacheKey = this.cache ? \`get:\${url}\` : null;
    
    if (cacheKey) {
      const cached = await cacheManager.get(cacheKey);
      if (cached) return cached;
    }

    const response = await retryWithBackoff(
      () => this.client.get(url, options),
      this.retries
    );

    if (cacheKey) {
      await cacheManager.set(cacheKey, response.data, options.ttl || 300);
    }

    return response.data;
  }

  async post(url, data, options = {}) {
    const response = await retryWithBackoff(
      () => this.client.post(url, data, options),
      this.retries
    );
    return response.data;
  }

  async put(url, data, options = {}) {
    const response = await retryWithBackoff(
      () => this.client.put(url, data, options),
      this.retries
    );
    return response.data;
  }

  async delete(url, options = {}) {
    const response = await retryWithBackoff(
      () => this.client.delete(url, options),
      this.retries
    );
    return response.data;
  }

  async patch(url, data, options = {}) {
    const response = await retryWithBackoff(
      () => this.client.patch(url, data, options),
      this.retries
    );
    return response.data;
  }

  // Bulk operations
  async getMultiple(urls) {
    const requests = urls.map(url => this.get(url));
    return Promise.allSettled(requests);
  }

  async postBatch(url, items, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(item => this.post(url, item));
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  // Health check
  async healthCheck() {
    try {
      await this.get('/health');
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { RestClient };`;
  }

  generateGraphQLClient(data) {
    return `const { GraphQLClient, gql } = require('graphql-request');
const { logger } = require('../utils/logger');
const { retryWithBackoff } = require('./utils/retry');

class GraphQLClientWrapper {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.GRAPHQL_ENDPOINT;
    this.retries = options.retries || 3;
    
    this.client = new GraphQLClient(this.endpoint, {
      headers: {
        'User-Agent': '${data.projectName || 'App'}/1.0'
      },
      ...options
    });
  }

  setAuthToken(token) {
    this.client.setHeader('Authorization', \`Bearer \${token}\`);
  }

  async query(query, variables = {}, options = {}) {
    try {
      logger.debug('GraphQL Query', { query: query.toString(), variables });
      
      const result = await retryWithBackoff(
        () => this.client.request(query, variables, options.headers),
        this.retries
      );
      
      logger.debug('GraphQL Response', { result });
      return result;
    } catch (error) {
      logger.error('GraphQL Error', {
        error: error.message,
        query: query.toString(),
        variables
      });
      throw error;
    }
  }

  async mutation(mutation, variables = {}, options = {}) {
    try {
      logger.debug('GraphQL Mutation', { mutation: mutation.toString(), variables });
      
      const result = await retryWithBackoff(
        () => this.client.request(mutation, variables, options.headers),
        this.retries
      );
      
      logger.debug('GraphQL Mutation Response', { result });
      return result;
    } catch (error) {
      logger.error('GraphQL Mutation Error', {
        error: error.message,
        mutation: mutation.toString(),
        variables
      });
      throw error;
    }
  }

  // Common queries
  async getUser(id) {
    const query = gql\`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          email
          createdAt
        }
      }
    \`;
    
    return this.query(query, { id });
  }

  async createUser(userData) {
    const mutation = gql\`
      mutation CreateUser($input: UserInput!) {
        createUser(input: $input) {
          id
          name
          email
          createdAt
        }
      }
    \`;
    
    return this.mutation(mutation, { input: userData });
  }

  async updateUser(id, userData) {
    const mutation = gql\`
      mutation UpdateUser($id: ID!, $input: UserUpdateInput!) {
        updateUser(id: $id, input: $input) {
          id
          name
          email
          updatedAt
        }
      }
    \`;
    
    return this.mutation(mutation, { id, input: userData });
  }

  // Subscription support
  createSubscription(subscription, variables = {}) {
    // Note: This requires a WebSocket-enabled GraphQL client
    logger.debug('GraphQL Subscription', { subscription: subscription.toString(), variables });
    return this.client.subscribe(subscription, variables);
  }

  // Batch queries
  async batchQuery(queries) {
    const batchRequest = queries.map(({ query, variables }) => ({
      document: query,
      variables
    }));
    
    return this.client.batchRequests(batchRequest);
  }
}

module.exports = { GraphQLClientWrapper };`;
  }

  generateWebSocketClient(data) {
    return `const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

class WebSocketClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.url = options.url || process.env.WEBSOCKET_URL;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.pingInterval = options.pingInterval || 30000;
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.shouldReconnect = true;
    this.pingTimer = null;
    
    this.messageQueue = [];
    this.isReady = false;
  }

  connect() {
    if (this.isConnecting) return;
    
    this.isConnecting = true;
    logger.info('Connecting to WebSocket', { url: this.url });
    
    try {
      this.ws = new WebSocket(this.url, {
        headers: {
          'User-Agent': '${data.projectName || 'App'}/1.0'
        }
      });
      
      this.setupEventHandlers();
    } catch (error) {
      logger.error('WebSocket connection error', error);
      this.handleReconnect();
    }
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      logger.info('WebSocket connected');
      this.isConnecting = false;
      this.isReady = true;
      this.reconnectAttempts = 0;
      
      this.startPing();
      this.flushMessageQueue();
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug('WebSocket message received', message);
        this.handleMessage(message);
      } catch (error) {
        logger.error('Error parsing WebSocket message', error);
      }
    });

    this.ws.on('close', (code, reason) => {
      logger.warn('WebSocket disconnected', { code, reason: reason.toString() });
      this.isReady = false;
      this.stopPing();
      this.emit('disconnected', code, reason);
      
      if (this.shouldReconnect) {
        this.handleReconnect();
      }
    });

    this.ws.on('error', (error) => {
      logger.error('WebSocket error', error);
      this.emit('error', error);
    });

    this.ws.on('pong', () => {
      logger.debug('WebSocket pong received');
    });
  }

  handleMessage(message) {
    const { type, data, id } = message;
    
    switch (type) {
      case 'ping':
        this.send({ type: 'pong', id });
        break;
      case 'auth_required':
        this.authenticate();
        break;
      case 'auth_success':
        this.emit('authenticated');
        break;
      case 'auth_error':
        this.emit('authError', data);
        break;
      default:
        this.emit('message', message);
        this.emit(type, data, id);
    }
  }

  send(message) {
    if (!this.isReady) {
      this.messageQueue.push(message);
      return;
    }
    
    try {
      const serialized = JSON.stringify(message);
      this.ws.send(serialized);
      logger.debug('WebSocket message sent', message);
    } catch (error) {
      logger.error('Error sending WebSocket message', error);
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  authenticate() {
    const token = process.env.WEBSOCKET_TOKEN;
    if (token) {
      this.send({
        type: 'auth',
        data: { token }
      });
    }
  }

  startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.pingInterval);
  }

  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }
    
    this.reconnectAttempts++;
    logger.info(\`Attempting to reconnect (\${this.reconnectAttempts}/\${this.maxReconnectAttempts})\`);
    
    setTimeout(() => {
      this.isConnecting = false;
      this.connect();
    }, this.reconnectInterval);
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopPing();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
  }

  // High-level methods
  subscribe(channel, callback) {
    this.send({
      type: 'subscribe',
      data: { channel }
    });
    
    this.on(\`channel:\${channel}\`, callback);
  }

  unsubscribe(channel) {
    this.send({
      type: 'unsubscribe',
      data: { channel }
    });
    
    this.removeAllListeners(\`channel:\${channel}\`);
  }

  publish(channel, data) {
    this.send({
      type: 'publish',
      data: { channel, message: data }
    });
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = { WebSocketClient };`;
  }

  generateAuthProvider(data) {
    return `const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { logger } = require('../utils/logger');

class AuthProvider {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
    this.jwtExpiry = options.jwtExpiry || '24h';
    this.refreshExpiry = options.refreshExpiry || '7d';
    this.saltRounds = options.saltRounds || 12;
  }

  async hashPassword(password) {
    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error) {
      logger.error('Password hashing failed', error);
      throw new Error('Password hashing failed');
    }
  }

  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password verification failed', error);
      return false;
    }
  }

  generateTokens(payload) {
    try {
      const accessToken = jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.jwtExpiry,
        issuer: '${data.projectName || 'app'}',
        audience: 'users'
      });

      const refreshToken = jwt.sign(
        { userId: payload.userId, type: 'refresh' },
        this.jwtSecret,
        {
          expiresIn: this.refreshExpiry,
          issuer: '${data.projectName || 'app'}',
          audience: 'users'
        }
      );

      return { accessToken, refreshToken };
    } catch (error) {
      logger.error('Token generation failed', error);
      throw new Error('Token generation failed');
    }
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: '${data.projectName || 'app'}',
        audience: 'users'
      });
    } catch (error) {
      logger.warn('Token verification failed', error.message);
      return null;
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const decoded = this.verifyToken(refreshToken);
      
      if (!decoded || decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      // Generate new access token
      const newPayload = { userId: decoded.userId };
      const { accessToken } = this.generateTokens(newPayload);
      
      return accessToken;
    } catch (error) {
      logger.error('Token refresh failed', error);
      throw new Error('Token refresh failed');
    }
  }

  extractTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    return req.cookies?.token || req.query?.token || null;
  }

  async authenticateRequest(req, res, next) {
    try {
      const token = this.extractTokenFromRequest(req);
      
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const decoded = this.verifyToken(token);
      
      if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      req.user = decoded;
      next();
    } catch (error) {
      logger.error('Authentication middleware error', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  }

  requireRole(roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];
      const hasRole = roles.some(role => userRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    };
  }

  async login(email, password, userLookup) {
    try {
      const user = await userLookup(email);
      
      if (!user) {
        throw new Error('Invalid credentials');
      }

      const isValidPassword = await this.verifyPassword(password, user.password);
      
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.roles || ['user']
      };

      const tokens = this.generateTokens(payload);
      
      logger.info('User logged in', { userId: user.id, email: user.email });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles
        },
        ...tokens
      };
    } catch (error) {
      logger.warn('Login attempt failed', { email, error: error.message });
      throw error;
    }
  }

  async register(userData, userCreate) {
    try {
      const hashedPassword = await this.hashPassword(userData.password);
      
      const user = await userCreate({
        ...userData,
        password: hashedPassword
      });

      const payload = {
        userId: user.id,
        email: user.email,
        roles: user.roles || ['user']
      };

      const tokens = this.generateTokens(payload);
      
      logger.info('User registered', { userId: user.id, email: user.email });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles
        },
        ...tokens
      };
    } catch (error) {
      logger.error('Registration failed', error);
      throw error;
    }
  }

  logout(token) {
    // In a production app, you might want to blacklist the token
    logger.info('User logged out');
    return true;
  }
}

module.exports = { AuthProvider };`;
  }

  generateEmailService(data) {
    return `const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

class EmailService {
  constructor(options = {}) {
    this.config = {
      host: options.host || process.env.SMTP_HOST,
      port: options.port || process.env.SMTP_PORT || 587,
      secure: options.secure || process.env.SMTP_SECURE === 'true',
      auth: {
        user: options.user || process.env.SMTP_USER,
        pass: options.password || process.env.SMTP_PASSWORD
      }
    };

    this.from = options.from || process.env.EMAIL_FROM || 'noreply@${data.domain || 'example.com'}';
    this.transporter = null;
    this.templates = new Map();
  }

  async initialize() {
    try {
      this.transporter = nodemailer.createTransporter(this.config);
      await this.transporter.verify();
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Email service initialization failed', error);
      throw error;
    }
  }

  registerTemplate(name, template) {
    this.templates.set(name, template);
  }

  renderTemplate(templateName, data) {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(\`Email template '\${templateName}' not found\`);
    }

    if (typeof template === 'function') {
      return template(data);
    }

    // Simple template interpolation
    return template.replace(/\\{\\{([^}]+)\\}\\}/g, (match, key) => {
      const value = data[key.trim()];
      return value !== undefined ? value : match;
    });
  }

  async sendEmail(options) {
    try {
      if (!this.transporter) {
        await this.initialize();
      }

      const mailOptions = {
        from: options.from || this.from,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        messageId: result.messageId,
        to: options.to,
        subject: options.subject
      });

      return result;
    } catch (error) {
      logger.error('Email sending failed', {
        error: error.message,
        to: options.to,
        subject: options.subject
      });
      throw error;
    }
  }

  async sendTemplateEmail(templateName, to, data, options = {}) {
    try {
      const content = this.renderTemplate(templateName, data);
      
      await this.sendEmail({
        to,
        subject: options.subject || data.subject,
        html: content,
        ...options
      });
    } catch (error) {
      logger.error('Template email sending failed', {
        template: templateName,
        to,
        error: error.message
      });
      throw error;
    }
  }

  // Common email templates
  async sendWelcomeEmail(to, userData) {
    const template = \`
      <h1>Welcome to \${userData.appName || '${data.projectName || 'Our App'}'}</h1>
      <p>Hello \${userData.name},</p>
      <p>Thank you for joining us! Your account has been created successfully.</p>
      <p>You can now log in with your email address: \${userData.email}</p>
      <p>Best regards,<br>The Team</p>
    \`;

    this.registerTemplate('welcome', template);
    
    await this.sendTemplateEmail('welcome', to, userData, {
      subject: \`Welcome to \${userData.appName || '${data.projectName || 'Our App'}'}\`
    });
  }

  async sendPasswordResetEmail(to, resetData) {
    const template = \`
      <h1>Password Reset Request</h1>
      <p>Hello,</p>
      <p>You have requested to reset your password. Click the link below to proceed:</p>
      <p><a href="\${resetData.resetUrl}">Reset Password</a></p>
      <p>This link will expire in \${resetData.expiryHours || 24} hours.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <p>Best regards,<br>The Team</p>
    \`;

    this.registerTemplate('passwordReset', template);
    
    await this.sendTemplateEmail('passwordReset', to, resetData, {
      subject: 'Password Reset Request'
    });
  }

  async sendVerificationEmail(to, verificationData) {
    const template = \`
      <h1>Email Verification</h1>
      <p>Hello \${verificationData.name},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="\${verificationData.verificationUrl}">Verify Email</a></p>
      <p>This link will expire in \${verificationData.expiryHours || 24} hours.</p>
      <p>Best regards,<br>The Team</p>
    \`;

    this.registerTemplate('verification', template);
    
    await this.sendTemplateEmail('verification', to, verificationData, {
      subject: 'Please verify your email address'
    });
  }

  async sendBulkEmails(emails, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(email => 
        this.sendEmail(email).catch(error => ({ error, email }))
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  async testConnection() {
    try {
      if (!this.transporter) {
        await this.initialize();
      }
      
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('Email service test failed', error);
      return false;
    }
  }
}

module.exports = { EmailService };`;
  }

  generateRetryUtility(data) {
    return `const { logger } = require('../../utils/logger');

class RetryUtility {
  static async retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000, backoffFactor = 2) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          logger.error(\`Operation failed after \${maxRetries} attempts\`, error);
          break;
        }
        
        const delay = initialDelay * Math.pow(backoffFactor, attempt - 1);
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
        const totalDelay = delay + jitter;
        
        logger.warn(\`Attempt \${attempt} failed, retrying in \${Math.round(totalDelay)}ms\`, {
          error: error.message,
          attempt,
          delay: totalDelay
        });
        
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
    
    throw lastError;
  }

  static async retryWithExponentialBackoff(fn, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      jitter = true,
      retryCondition = () => true
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries || !retryCondition(error)) {
          break;
        }
        
        let delay = Math.min(
          initialDelay * Math.pow(backoffFactor, attempt - 1),
          maxDelay
        );
        
        if (jitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }
        
        logger.warn(\`Retry attempt \${attempt} failed\`, {
          error: error.message,
          nextRetryIn: Math.round(delay)
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  static async retryUntilSuccess(fn, options = {}) {
    const {
      timeout = 30000,
      interval = 1000,
      retryCondition = () => true
    } = options;

    const startTime = Date.now();
    let lastError;

    while (Date.now() - startTime < timeout) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (!retryCondition(error)) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    throw new Error(\`Operation timed out after \${timeout}ms. Last error: \${lastError?.message}\`);
  }
}

// Export both class and convenience functions
const retryWithBackoff = RetryUtility.retryWithBackoff;
const retryWithExponentialBackoff = RetryUtility.retryWithExponentialBackoff;
const retryUntilSuccess = RetryUtility.retryUntilSuccess;

module.exports = {
  RetryUtility,
  retryWithBackoff,
  retryWithExponentialBackoff,
  retryUntilSuccess
};`;
  }

  generateCacheUtility(data) {
    return `const Redis = require('redis');
const { logger } = require('../../utils/logger');

class CacheManager {
  constructor(options = {}) {
    this.config = {
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || process.env.REDIS_PORT || 6379,
      password: options.password || process.env.REDIS_PASSWORD,
      db: options.db || process.env.REDIS_DB || 0,
      keyPrefix: options.keyPrefix || '${data.projectName || 'app'}:',
      defaultTTL: options.defaultTTL || 3600 // 1 hour
    };
    
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = Redis.createClient(this.config);
      
      this.client.on('error', (error) => {
        logger.error('Redis error', error);
        this.isConnected = false;
      });
      
      this.client.on('connect', () => {
        logger.info('Redis connected');
        this.isConnected = true;
      });
      
      this.client.on('disconnect', () => {
        logger.warn('Redis disconnected');
        this.isConnected = false;
      });
      
      await this.client.connect();
    } catch (error) {
      logger.error('Redis connection failed', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  getKey(key) {
    return \`\${this.config.keyPrefix}\${key}\`;
  }

  async get(key) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const value = await this.client.get(this.getKey(key));
      
      if (value === null) {
        return null;
      }
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return null;
    }
  }

  async set(key, value, ttl = this.config.defaultTTL) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const redisKey = this.getKey(key);
      
      if (ttl > 0) {
        await this.client.setEx(redisKey, ttl, serialized);
      } else {
        await this.client.set(redisKey, serialized);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error });
      return false;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const result = await this.client.del(this.getKey(key));
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error', { key, error });
      return false;
    }
  }

  async exists(key) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const result = await this.client.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error });
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const result = await this.client.expire(this.getKey(key), ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error', { key, ttl, error });
      return false;
    }
  }

  async ttl(key) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      return await this.client.ttl(this.getKey(key));
    } catch (error) {
      logger.error('Cache TTL error', { key, error });
      return -1;
    }
  }

  async flush() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const keys = await this.client.keys(\`\${this.config.keyPrefix}*\`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache flush error', error);
      return false;
    }
  }

  async mget(keys) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const redisKeys = keys.map(key => this.getKey(key));
      const values = await this.client.mGet(redisKeys);
      
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      logger.error('Cache mget error', { keys, error });
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs, ttl = this.config.defaultTTL) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const pipeline = this.client.multi();
      
      for (const [key, value] of keyValuePairs) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        const redisKey = this.getKey(key);
        
        if (ttl > 0) {
          pipeline.setEx(redisKey, ttl, serialized);
        } else {
          pipeline.set(redisKey, serialized);
        }
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error', { keyValuePairs, error });
      return false;
    }
  }

  // Cache with automatic refresh
  async getOrSet(key, fetchFunction, ttl = this.config.defaultTTL) {
    try {
      let value = await this.get(key);
      
      if (value !== null) {
        return value;
      }
      
      value = await fetchFunction();
      await this.set(key, value, ttl);
      
      return value;
    } catch (error) {
      logger.error('Cache getOrSet error', { key, error });
      throw error;
    }
  }

  // Cache with tags for group invalidation
  async setWithTags(key, value, tags = [], ttl = this.config.defaultTTL) {
    await this.set(key, value, ttl);
    
    // Store tags for this key
    for (const tag of tags) {
      const tagKey = \`tag:\${tag}\`;
      const taggedKeys = await this.get(tagKey) || [];
      taggedKeys.push(key);
      await this.set(tagKey, [...new Set(taggedKeys)], ttl);
    }
  }

  async invalidateByTag(tag) {
    const tagKey = \`tag:\${tag}\`;
    const taggedKeys = await this.get(tagKey) || [];
    
    if (taggedKeys.length > 0) {
      const pipeline = this.client.multi();
      taggedKeys.forEach(key => pipeline.del(this.getKey(key)));
      pipeline.del(this.getKey(tagKey));
      await pipeline.exec();
    }
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

module.exports = { CacheManager, cacheManager };`;
  }

  generateMonitoringUtility(data) {
    return `const { logger } = require('../../utils/logger');

class MonitoringUtility {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
    this.counters = new Map();
    this.gauges = new Map();
  }

  // Timer utilities
  startTimer(name) {
    this.timers.set(name, Date.now());
  }

  endTimer(name, logResult = true) {
    const startTime = this.timers.get(name);
    if (!startTime) {
      logger.warn(\`Timer '\${name}' was not started\`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(name);

    if (logResult) {
      logger.debug(\`Timer '\${name}' completed\`, { duration });
    }

    this.recordMetric(\`timer.\${name}\`, duration);
    return duration;
  }

  // Counter utilities
  incrementCounter(name, value = 1) {
    const current = this.counters.get(name) || 0;
    const newValue = current + value;
    this.counters.set(name, newValue);
    this.recordMetric(\`counter.\${name}\`, newValue);
    return newValue;
  }

  decrementCounter(name, value = 1) {
    return this.incrementCounter(name, -value);
  }

  getCounter(name) {
    return this.counters.get(name) || 0;
  }

  resetCounter(name) {
    this.counters.set(name, 0);
    this.recordMetric(\`counter.\${name}\`, 0);
  }

  // Gauge utilities
  setGauge(name, value) {
    this.gauges.set(name, value);
    this.recordMetric(\`gauge.\${name}\`, value);
  }

  getGauge(name) {
    return this.gauges.get(name);
  }

  // Generic metric recording
  recordMetric(name, value, labels = {}) {
    const metric = {
      name,
      value,
      labels,
      timestamp: Date.now()
    };

    const metrics = this.metrics.get(name) || [];
    metrics.push(metric);

    // Keep only last 1000 metrics per name
    if (metrics.length > 1000) {
      metrics.shift();
    }

    this.metrics.set(name, metrics);

    logger.debug('Metric recorded', metric);
  }

  // Performance monitoring
  async measureAsync(name, asyncFunction) {
    this.startTimer(name);
    try {
      const result = await asyncFunction();
      this.endTimer(name);
      this.incrementCounter(\`\${name}.success\`);
      return result;
    } catch (error) {
      this.endTimer(name);
      this.incrementCounter(\`\${name}.error\`);
      throw error;
    }
  }

  measureSync(name, syncFunction) {
    this.startTimer(name);
    try {
      const result = syncFunction();
      this.endTimer(name);
      this.incrementCounter(\`\${name}.success\`);
      return result;
    } catch (error) {
      this.endTimer(name);
      this.incrementCounter(\`\${name}.error\`);
      throw error;
    }
  }

  // Express middleware for request monitoring
  requestMonitoring() {
    return (req, res, next) => {
      const start = Date.now();
      const requestId = req.headers['x-request-id'] || \`req_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
      
      req.requestId = requestId;
      req.startTime = start;

      // Add request ID to response headers
      res.setHeader('X-Request-ID', requestId);

      this.incrementCounter('http.requests.total');
      this.incrementCounter(\`http.requests.\${req.method.toLowerCase()}\`);

      res.on('finish', () => {
        const duration = Date.now() - start;
        const statusClass = Math.floor(res.statusCode / 100) + 'xx';

        this.recordMetric('http.request.duration', duration, {
          method: req.method,
          route: req.route?.path || req.path,
          status: res.statusCode,
          statusClass
        });

        this.incrementCounter(\`http.responses.\${statusClass}\`);
        this.incrementCounter(\`http.responses.\${res.statusCode}\`);

        logger.info('HTTP Request', {
          requestId,
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });

      next();
    };
  }

  // Memory monitoring
  getMemoryUsage() {
    const usage = process.memoryUsage();
    
    Object.entries(usage).forEach(([key, value]) => {
      this.setGauge(\`memory.\${key}\`, value);
    });

    return usage;
  }

  // CPU monitoring
  getCPUUsage() {
    const usage = process.cpuUsage();
    
    Object.entries(usage).forEach(([key, value]) => {
      this.setGauge(\`cpu.\${key}\`, value);
    });

    return usage;
  }

  // Health check utilities
  async healthCheck(checks = {}) {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: this.getMemoryUsage(),
      cpu: this.getCPUUsage(),
      checks: {}
    };

    for (const [name, checkFunction] of Object.entries(checks)) {
      try {
        this.startTimer(\`healthcheck.\${name}\`);
        const checkResult = await checkFunction();
        const duration = this.endTimer(\`healthcheck.\${name}\`, false);

        results.checks[name] = {
          status: 'healthy',
          duration,
          ...(typeof checkResult === 'object' ? checkResult : { result: checkResult })
        };
      } catch (error) {
        this.endTimer(\`healthcheck.\${name}\`, false);
        results.checks[name] = {
          status: 'unhealthy',
          error: error.message
        };
        results.status = 'unhealthy';
      }
    }

    this.recordMetric('healthcheck.status', results.status === 'healthy' ? 1 : 0);
    return results;
  }

  // Get all metrics for reporting
  getAllMetrics() {
    return {
      metrics: Object.fromEntries(this.metrics),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      timers: Object.fromEntries(this.timers)
    };
  }

  // Clear all metrics
  clearMetrics() {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.timers.clear();
  }

  // Export metrics in Prometheus format
  exportPrometheusMetrics() {
    let output = '';

    // Export counters
    for (const [name, value] of this.counters) {
      output += \`# TYPE \${name} counter\\n\`;
      output += \`\${name} \${value}\\n\`;
    }

    // Export gauges
    for (const [name, value] of this.gauges) {
      output += \`# TYPE \${name} gauge\\n\`;
      output += \`\${name} \${value}\\n\`;
    }

    return output;
  }
}

// Create singleton instance
const monitoring = new MonitoringUtility();

module.exports = { MonitoringUtility, monitoring };`;
  }

  generateAPITests(data) {
    return `const request = require('supertest');
const { RestClient } = require('../integrations/api/rest-client');
const { GraphQLClientWrapper } = require('../integrations/api/graphql-client');

describe('API Integrations', () => {
  describe('REST Client', () => {
    let restClient;

    beforeEach(() => {
      restClient = new RestClient({
        baseURL: 'https://api.example.com',
        timeout: 5000
      });
    });

    test('should create client with correct configuration', () => {
      expect(restClient.baseURL).toBe('https://api.example.com');
      expect(restClient.timeout).toBe(5000);
    });

    test('should handle GET requests', async () => {
      // Mock the axios call
      jest.spyOn(restClient.client, 'get').mockResolvedValue({
        data: { id: 1, name: 'Test' }
      });

      const result = await restClient.get('/users/1');
      
      expect(result).toEqual({ id: 1, name: 'Test' });
      expect(restClient.client.get).toHaveBeenCalledWith('/users/1', {});
    });

    test('should handle POST requests', async () => {
      const userData = { name: 'John', email: 'john@example.com' };
      
      jest.spyOn(restClient.client, 'post').mockResolvedValue({
        data: { id: 1, ...userData }
      });

      const result = await restClient.post('/users', userData);
      
      expect(result).toEqual({ id: 1, ...userData });
      expect(restClient.client.post).toHaveBeenCalledWith('/users', userData, {});
    });

    test('should retry on failure', async () => {
      jest.spyOn(restClient.client, 'get')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ data: { success: true } });

      const result = await restClient.get('/test');
      
      expect(result).toEqual({ success: true });
      expect(restClient.client.get).toHaveBeenCalledTimes(3);
    });

    test('should handle authentication token', () => {
      process.env.API_TOKEN = 'test-token';
      
      const token = restClient.getAuthToken();
      
      expect(token).toBe('test-token');
    });
  });

  describe('GraphQL Client', () => {
    let graphqlClient;

    beforeEach(() => {
      graphqlClient = new GraphQLClientWrapper({
        endpoint: 'https://api.example.com/graphql'
      });
    });

    test('should create client with correct endpoint', () => {
      expect(graphqlClient.endpoint).toBe('https://api.example.com/graphql');
    });

    test('should set auth token', () => {
      graphqlClient.setAuthToken('test-token');
      
      // Verify token is set in headers
      expect(graphqlClient.client.options.headers.Authorization).toBe('Bearer test-token');
    });

    test('should execute queries', async () => {
      const mockQuery = 'query { user(id: "1") { id name } }';
      const mockResponse = { user: { id: '1', name: 'John' } };
      
      jest.spyOn(graphqlClient.client, 'request').mockResolvedValue(mockResponse);

      const result = await graphqlClient.query(mockQuery, { id: '1' });
      
      expect(result).toEqual(mockResponse);
      expect(graphqlClient.client.request).toHaveBeenCalledWith(
        mockQuery,
        { id: '1' },
        undefined
      );
    });

    test('should execute mutations', async () => {
      const mockMutation = 'mutation { createUser(input: $input) { id name } }';
      const mockResponse = { createUser: { id: '1', name: 'John' } };
      
      jest.spyOn(graphqlClient.client, 'request').mockResolvedValue(mockResponse);

      const result = await graphqlClient.mutation(mockMutation, {
        input: { name: 'John', email: 'john@example.com' }
      });
      
      expect(result).toEqual(mockResponse);
    });
  });
});`;
  }

  generateDatabaseTests(data) {
    return `const { PrismaClient } = require('@prisma/client');
const Redis = require('redis');

describe('Database Integrations', () => {
  describe('Prisma Integration', () => {
    let prisma;

    beforeEach(() => {
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: 'postgresql://test:test@localhost:5432/test'
          }
        }
      });
    });

    afterEach(async () => {
      await prisma.$disconnect();
    });

    test('should connect to database', async () => {
      await expect(prisma.$connect()).resolves.not.toThrow();
    });

    test('should perform CRUD operations', async () => {
      // Create
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User'
        }
      });

      expect(user.email).toBe('test@example.com');
      expect(user.id).toBeDefined();

      // Read
      const foundUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(foundUser).toEqual(user);

      // Update
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { name: 'Updated User' }
      });

      expect(updatedUser.name).toBe('Updated User');

      // Delete
      await prisma.user.delete({
        where: { id: user.id }
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(deletedUser).toBeNull();
    });
  });

  describe('Redis Integration', () => {
    let redis;

    beforeEach(async () => {
      redis = Redis.createClient({
        host: 'localhost',
        port: 6379,
        db: 1 // Use test database
      });
      await redis.connect();
    });

    afterEach(async () => {
      await redis.flushDb();
      await redis.disconnect();
    });

    test('should connect to Redis', async () => {
      const pong = await redis.ping();
      expect(pong).toBe('PONG');
    });

    test('should set and get values', async () => {
      await redis.set('test-key', 'test-value');
      const value = await redis.get('test-key');
      
      expect(value).toBe('test-value');
    });

    test('should handle JSON data', async () => {
      const data = { id: 1, name: 'Test' };
      
      await redis.set('test-json', JSON.stringify(data));
      const retrieved = await redis.get('test-json');
      
      expect(JSON.parse(retrieved)).toEqual(data);
    });

    test('should handle expiration', async () => {
      await redis.setEx('test-ttl', 1, 'value');
      
      let value = await redis.get('test-ttl');
      expect(value).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      value = await redis.get('test-ttl');
      expect(value).toBeNull();
    });
  });
});`;
  }

  generateServiceTests(data) {
    return `const { EmailService } = require('../integrations/services/email-service');
const { AuthProvider } = require('../integrations/auth/auth-provider');

describe('Service Integrations', () => {
  describe('Email Service', () => {
    let emailService;

    beforeEach(() => {
      emailService = new EmailService({
        host: 'smtp.test.com',
        port: 587,
        user: 'test@example.com',
        password: 'password'
      });
    });

    test('should initialize with correct configuration', () => {
      expect(emailService.config.host).toBe('smtp.test.com');
      expect(emailService.config.port).toBe(587);
    });

    test('should register and render templates', () => {
      const template = 'Hello {{name}}!';
      emailService.registerTemplate('greeting', template);
      
      const rendered = emailService.renderTemplate('greeting', { name: 'John' });
      expect(rendered).toBe('Hello John!');
    });

    test('should send email', async () => {
      // Mock the transporter
      emailService.transporter = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      };

      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'Test content'
      });

      expect(result.messageId).toBe('test-message-id');
      expect(emailService.transporter.sendMail).toHaveBeenCalled();
    });

    test('should send welcome email', async () => {
      emailService.transporter = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'welcome-message-id'
        })
      };

      await emailService.sendWelcomeEmail('user@example.com', {
        name: 'John',
        email: 'user@example.com',
        appName: 'Test App'
      });

      expect(emailService.transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome to Test App'
        })
      );
    });
  });

  describe('Auth Provider', () => {
    let authProvider;

    beforeEach(() => {
      authProvider = new AuthProvider({
        jwtSecret: 'test-secret',
        jwtExpiry: '1h',
        saltRounds: 10
      });
    });

    test('should hash passwords', async () => {
      const password = 'test-password';
      const hash = await authProvider.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    test('should verify passwords', async () => {
      const password = 'test-password';
      const hash = await authProvider.hashPassword(password);
      
      const isValid = await authProvider.verifyPassword(password, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await authProvider.verifyPassword('wrong-password', hash);
      expect(isInvalid).toBe(false);
    });

    test('should generate JWT tokens', () => {
      const payload = { userId: 1, email: 'test@example.com' };
      const tokens = authProvider.generateTokens(payload);
      
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    test('should verify JWT tokens', () => {
      const payload = { userId: 1, email: 'test@example.com' };
      const { accessToken } = authProvider.generateTokens(payload);
      
      const decoded = authProvider.verifyToken(accessToken);
      
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('test@example.com');
    });

    test('should handle invalid tokens', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = authProvider.verifyToken(invalidToken);
      
      expect(decoded).toBeNull();
    });

    test('should refresh access tokens', async () => {
      const payload = { userId: 1, email: 'test@example.com' };
      const { refreshToken } = authProvider.generateTokens(payload);
      
      const newAccessToken = await authProvider.refreshAccessToken(refreshToken);
      
      expect(newAccessToken).toBeDefined();
      expect(typeof newAccessToken).toBe('string');
      
      const decoded = authProvider.verifyToken(newAccessToken);
      expect(decoded.userId).toBe(1);
    });
  });
});`;
  }
}

module.exports = { IntegrationGenerator };