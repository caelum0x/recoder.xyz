#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const EventEmitter = require('events');
const WebSocket = require('ws');

/**
 * Model Context Protocol (MCP) Client
 * Advanced protocol for AI model integration and context sharing
 */
class MCPClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      timeout: 30000,
      retryAttempts: 3,
      heartbeatInterval: 30000,
      ...options
    };
    
    this.connections = new Map();
    this.servers = new Map();
    this.capabilities = new Map();
    this.contextCache = new Map();
    this.messageQueue = [];
    this.connectionStates = new Map();
    
    this.protocol = {
      version: '1.0.0',
      capabilities: {
        roots: true,
        sampling: true,
        completion: true,
        context: true,
        tools: true,
        resources: true,
        prompts: true
      }
    };
    
    this.initializeMCP();
  }

  /**
   * Initialize MCP client
   */
  async initialize() {
    return this.initializeMCP();
  }

  /**
   * Initialize MCP client implementation
   */
  async initializeMCP() {
    console.log(chalk.cyan('🔌 Initializing MCP Client...'));
    
    try {
      await this.loadServerConfigurations();
      await this.establishConnections();
      this.startHeartbeat();
      
      console.log(chalk.green('✅ MCP Client ready'));
      console.log(chalk.gray(`   Servers: ${this.servers.size}`));
      console.log(chalk.gray(`   Active connections: ${this.connections.size}`));
      
    } catch (error) {
      console.log(chalk.red(`❌ MCP initialization failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Load server configurations
   */
  async loadServerConfigurations() {
    console.log(chalk.gray('📋 Loading MCP server configurations...'));
    
    // Default configurations
    this.addServerConfig('claude', {
      type: 'anthropic',
      endpoint: 'wss://api.anthropic.com/v1/mcp',
      capabilities: ['completion', 'tools', 'context'],
      models: ['claude-3-sonnet', 'claude-3-opus', 'claude-3-haiku'],
      priority: 1
    });
    
    this.addServerConfig('openai', {
      type: 'openai',
      endpoint: 'wss://api.openai.com/v1/mcp',
      capabilities: ['completion', 'tools', 'context'],
      models: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'],
      priority: 2
    });
    
    this.addServerConfig('local-model', {
      type: 'local',
      endpoint: 'ws://localhost:8080/mcp',
      capabilities: ['completion', 'context'],
      models: ['llama-2', 'codellama', 'mistral'],
      priority: 3
    });
    
    this.addServerConfig('azure-openai', {
      type: 'azure',
      endpoint: 'wss://your-resource.openai.azure.com/mcp',
      capabilities: ['completion', 'tools', 'context'],
      models: ['gpt-4', 'gpt-35-turbo'],
      priority: 4
    });
    
    // Load custom configurations
    await this.loadCustomConfigurations();
  }

  /**
   * Add server configuration
   */
  addServerConfig(name, config) {
    this.servers.set(name, {
      name,
      ...config,
      status: 'disconnected',
      lastConnected: null,
      errorCount: 0
    });
  }

  /**
   * Load custom MCP configurations
   */
  async loadCustomConfigurations() {
    try {
      const configPath = path.join(process.cwd(), '.recoder', 'mcp-config.json');
      if (fs.existsSync(configPath)) {
        const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        if (customConfig.servers) {
          for (const [name, config] of Object.entries(customConfig.servers)) {
            this.addServerConfig(name, config);
          }
        }
        
        if (customConfig.protocol) {
          this.protocol = { ...this.protocol, ...customConfig.protocol };
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load custom MCP config: ${error.message}`));
    }
  }

  /**
   * Establish connections to MCP servers
   */
  async establishConnections() {
    console.log(chalk.gray('🔗 Establishing MCP connections...'));
    
    const connectionPromises = [];
    
    for (const [serverName, serverConfig] of this.servers.entries()) {
      connectionPromises.push(this.connectToServer(serverName, serverConfig));
    }
    
    const results = await Promise.allSettled(connectionPromises);
    
    let successCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        const serverName = Array.from(this.servers.keys())[index];
        console.log(chalk.yellow(`⚠️  Failed to connect to ${serverName}: ${result.reason.message}`));
      }
    });
    
    console.log(chalk.gray(`Connected to ${successCount}/${this.servers.size} servers`));
  }

  /**
   * Connect to an MCP server
   */
  async connectToServer(serverName, serverConfig) {
    return new Promise((resolve, reject) => {
      try {
        console.log(chalk.gray(`Connecting to ${serverName}...`));
        
        const ws = new WebSocket(serverConfig.endpoint, {
          headers: this.getAuthHeaders(serverConfig),
          timeout: this.options.timeout
        });
        
        ws.on('open', () => {
          console.log(chalk.green(`✅ Connected to ${serverName}`));
          
          this.connections.set(serverName, ws);
          this.connectionStates.set(serverName, 'connected');
          
          // Send initialization message
          this.sendMessage(serverName, {
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
              protocolVersion: this.protocol.version,
              capabilities: this.protocol.capabilities,
              clientInfo: {
                name: 'recoder-code',
                version: '1.0.0'
              }
            }
          });
          
          resolve(ws);
        });
        
        ws.on('message', (data) => {
          this.handleMessage(serverName, data);
        });
        
        ws.on('error', (error) => {
          // Gracefully handle connection errors - these are expected for external services
          this.connectionStates.set(serverName, 'error');
          
          // Only log in debug mode
          if (process.env.RECODER_DEBUG === 'true') {
            console.log(chalk.gray(`🔌 MCP service ${serverName} unavailable: ${error.message}`));
          }
          
          // Resolve with null instead of rejecting to allow graceful degradation
          resolve(null);
        });
        
        ws.on('close', () => {
          // Gracefully handle connection close
          this.connectionStates.set(serverName, 'disconnected');
          this.connections.delete(serverName);
          
          // Only log in debug mode
          if (process.env.RECODER_DEBUG === 'true') {
            console.log(chalk.gray(`🔌 MCP connection to ${serverName} closed`));
          }
          
          // Don't attempt automatic reconnection to avoid spam
        });
        
      } catch (error) {
        // Gracefully handle any connection setup errors
        this.connectionStates.set(serverName, 'error');
        if (process.env.RECODER_DEBUG === 'true') {
          console.log(chalk.gray(`🔌 MCP setup failed for ${serverName}: ${error.message}`));
        }
        resolve(null);
      }
    });
  }

  /**
   * Get authentication headers for server
   */
  getAuthHeaders(serverConfig) {
    const headers = {};
    
    switch (serverConfig.type) {
      case 'anthropic':
        if (process.env.ANTHROPIC_API_KEY) {
          headers['Authorization'] = `Bearer ${process.env.ANTHROPIC_API_KEY}`;
        }
        break;
        
      case 'openai':
        if (process.env.OPENAI_API_KEY) {
          headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
        }
        break;
        
      case 'azure':
        if (process.env.AZURE_OPENAI_API_KEY) {
          headers['api-key'] = process.env.AZURE_OPENAI_API_KEY;
        }
        break;
        
      case 'local':
        // Local servers might not need authentication
        break;
        
      default:
        if (process.env[`${serverConfig.type.toUpperCase()}_API_KEY`]) {
          headers['Authorization'] = `Bearer ${process.env[`${serverConfig.type.toUpperCase()}_API_KEY`]}`;
        }
    }
    
    return headers;
  }

  /**
   * Handle incoming messages
   */
  handleMessage(serverName, data) {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.method) {
        case 'initialized':
          this.handleInitialized(serverName, message);
          break;
          
        case 'completion/result':
          this.handleCompletionResult(serverName, message);
          break;
          
        case 'tools/list':
          this.handleToolsList(serverName, message);
          break;
          
        case 'context/update':
          this.handleContextUpdate(serverName, message);
          break;
          
        case 'notification':
          this.handleNotification(serverName, message);
          break;
          
        default:
          if (message.id) {
            this.emit('response', { serverName, message });
          }
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Error parsing message from ${serverName}: ${error.message}`));
    }
  }

  /**
   * Handle server initialization
   */
  handleInitialized(serverName, message) {
    console.log(chalk.green(`🔌 ${serverName} initialized`));
    
    if (message.result && message.result.capabilities) {
      this.capabilities.set(serverName, message.result.capabilities);
    }
    
    // Request available tools
    this.sendMessage(serverName, {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: this.generateId()
    });
    
    this.emit('serverReady', serverName);
  }

  /**
   * Handle tools list response
   */
  handleToolsList(serverName, message) {
    if (message.result && message.result.tools) {
      console.log(chalk.blue(`🔧 Tools available from ${serverName}: ${message.result.tools.length}`));
      
      // Store tools for this server
      const serverData = this.servers.get(serverName);
      if (serverData) {
        serverData.tools = message.result.tools;
      }
    }
  }

  /**
   * Handle context update
   */
  handleContextUpdate(serverName, message) {
    if (message.params && message.params.context) {
      const contextKey = this.generateContextKey(message.params.context);
      this.contextCache.set(contextKey, {
        serverName,
        context: message.params.context,
        timestamp: Date.now()
      });
      
      console.log(chalk.gray(`📝 Context updated from ${serverName}`));
    }
  }

  /**
   * Handle notifications
   */
  handleNotification(serverName, message) {
    switch (message.method) {
      case 'progress':
        if (message.params && message.params.progress) {
          console.log(chalk.cyan(`⏳ ${serverName}: ${message.params.progress.message || 'Processing...'}`));
        }
        break;
        
      case 'error':
        console.log(chalk.red(`❌ ${serverName} error: ${message.params.error || 'Unknown error'}`));
        break;
        
      case 'warning':
        console.log(chalk.yellow(`⚠️  ${serverName} warning: ${message.params.warning || 'Unknown warning'}`));
        break;
        
      default:
        console.log(chalk.gray(`📢 ${serverName} notification: ${message.method}`));
    }
  }

  /**
   * Send message to server
   */
  sendMessage(serverName, message) {
    const connection = this.connections.get(serverName);
    
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      console.log(chalk.yellow(`⚠️  Cannot send message to ${serverName}: not connected`));
      this.queueMessage(serverName, message);
      return false;
    }
    
    try {
      connection.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Error sending message to ${serverName}: ${error.message}`));
      return false;
    }
  }

  /**
   * Queue message for later delivery
   */
  queueMessage(serverName, message) {
    this.messageQueue.push({ serverName, message, timestamp: Date.now() });
    
    // Clean old messages
    const maxAge = 5 * 60 * 1000; // 5 minutes
    this.messageQueue = this.messageQueue.filter(
      item => Date.now() - item.timestamp < maxAge
    );
  }

  /**
   * Process queued messages
   */
  processQueuedMessages(serverName) {
    const serverMessages = this.messageQueue.filter(item => item.serverName === serverName);
    
    for (const item of serverMessages) {
      if (this.sendMessage(serverName, item.message)) {
        // Remove from queue if sent successfully
        const index = this.messageQueue.indexOf(item);
        this.messageQueue.splice(index, 1);
      }
    }
  }

  /**
   * Request completion from best available server
   */
  async requestCompletion(prompt, options = {}) {
    const serverName = this.selectBestServer('completion', options);
    
    if (!serverName) {
      throw new Error('No available servers for completion');
    }
    
    const message = {
      jsonrpc: '2.0',
      method: 'completion/request',
      id: this.generateId(),
      params: {
        prompt: prompt,
        model: options.model,
        maxTokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        context: await this.getRelevantContext(prompt, options)
      }
    };
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Completion request timeout'));
      }, this.options.timeout);
      
      const handler = (response) => {
        if (response.message.id === message.id) {
          clearTimeout(timeoutId);
          this.off('response', handler);
          
          if (response.message.error) {
            reject(new Error(response.message.error.message));
          } else {
            resolve(response.message.result);
          }
        }
      };
      
      this.on('response', handler);
      
      if (!this.sendMessage(serverName, message)) {
        clearTimeout(timeoutId);
        this.off('response', handler);
        reject(new Error(`Failed to send message to ${serverName}`));
      }
    });
  }

  /**
   * Select best server for capability
   */
  selectBestServer(capability, options = {}) {
    const availableServers = [];
    
    for (const [serverName, serverConfig] of this.servers.entries()) {
      if (this.connectionStates.get(serverName) === 'connected' &&
          serverConfig.capabilities.includes(capability)) {
        
        // Check model compatibility if specified
        if (options.model && !serverConfig.models.includes(options.model)) {
          continue;
        }
        
        availableServers.push({
          name: serverName,
          priority: serverConfig.priority || 999,
          config: serverConfig
        });
      }
    }
    
    if (availableServers.length === 0) {
      return null;
    }
    
    // Sort by priority (lower number = higher priority)
    availableServers.sort((a, b) => a.priority - b.priority);
    
    return availableServers[0].name;
  }

  /**
   * Get relevant context for request
   */
  async getRelevantContext(prompt, options = {}) {
    const context = {
      codebase: null,
      files: [],
      history: [],
      project: null
    };
    
    // Get cached context if available
    const contextKey = this.generateContextKey(prompt, options);
    if (this.contextCache.has(contextKey)) {
      return this.contextCache.get(contextKey);
    }
    
    // Build context from available sources
    if (this.contextEngine) {
      const codebaseContext = this.contextEngine.generateContext(prompt, {
        maxFiles: 10,
        maxTokens: 20000
      });
      
      context.codebase = codebaseContext.codebaseOverview;
      context.files = codebaseContext.relevantFiles.slice(0, 5);
    }
    
    if (this.projectManager) {
      context.project = this.projectManager.getProjectContext();
    }
    
    // Cache context for reuse
    this.contextCache.set(contextKey, context);
    
    return context;
  }

  /**
   * Request available tools from server
   */
  async requestTools(serverName) {
    const message = {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: this.generateId()
    };
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Tools request timeout'));
      }, this.options.timeout);
      
      const handler = (response) => {
        if (response.message.id === message.id) {
          clearTimeout(timeoutId);
          this.off('response', handler);
          
          if (response.message.error) {
            reject(new Error(response.message.error.message));
          } else {
            resolve(response.message.result.tools || []);
          }
        }
      };
      
      this.on('response', handler);
      this.sendMessage(serverName, message);
    });
  }

  /**
   * Execute tool on server
   */
  async executeTool(serverName, toolName, parameters = {}) {
    const message = {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: this.generateId(),
      params: {
        name: toolName,
        arguments: parameters
      }
    };
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Tool execution timeout'));
      }, this.options.timeout);
      
      const handler = (response) => {
        if (response.message.id === message.id) {
          clearTimeout(timeoutId);
          this.off('response', handler);
          
          if (response.message.error) {
            reject(new Error(response.message.error.message));
          } else {
            resolve(response.message.result);
          }
        }
      };
      
      this.on('response', handler);
      this.sendMessage(serverName, message);
    });
  }

  /**
   * Share context with server
   */
  async shareContext(serverName, context) {
    const message = {
      jsonrpc: '2.0',
      method: 'context/update',
      params: {
        context: context,
        timestamp: new Date().toISOString()
      }
    };
    
    this.sendMessage(serverName, message);
  }

  /**
   * Broadcast context to all connected servers
   */
  async broadcastContext(context) {
    const promises = [];
    
    for (const serverName of this.connections.keys()) {
      promises.push(this.shareContext(serverName, context));
    }
    
    await Promise.allSettled(promises);
  }

  /**
   * Start heartbeat to maintain connections
   */
  startHeartbeat() {
    setInterval(() => {
      for (const [serverName, connection] of this.connections.entries()) {
        if (connection.readyState === WebSocket.OPEN) {
          this.sendMessage(serverName, {
            jsonrpc: '2.0',
            method: 'ping',
            id: this.generateId()
          });
        }
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Reconnect to server
   */
  async reconnectToServer(serverName) {
    const serverConfig = this.servers.get(serverName);
    if (!serverConfig) return;
    
    if (serverConfig.errorCount >= this.options.retryAttempts) {
      console.log(chalk.red(`❌ Max retry attempts reached for ${serverName}`));
      return;
    }
    
    serverConfig.errorCount++;
    
    try {
      await this.connectToServer(serverName, serverConfig);
      serverConfig.errorCount = 0; // Reset on successful connection
      
      // Process any queued messages
      this.processQueuedMessages(serverName);
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Reconnection failed for ${serverName}: ${error.message}`));
    }
  }

  /**
   * Get server status
   */
  getServerStatus() {
    const status = {};
    
    for (const [serverName, serverConfig] of this.servers.entries()) {
      status[serverName] = {
        config: serverConfig,
        state: this.connectionStates.get(serverName) || 'unknown',
        capabilities: this.capabilities.get(serverName) || [],
        connected: this.connections.has(serverName)
      };
    }
    
    return status;
  }

  /**
   * Display server status
   */
  displayStatus() {
    console.log(chalk.bold.cyan('\n🔌 MCP Server Status\n'));
    
    const status = this.getServerStatus();
    
    for (const [serverName, info] of Object.entries(status)) {
      const stateColor = info.state === 'connected' ? 'green' : 
                        info.state === 'error' ? 'red' : 'yellow';
      
      console.log(chalk.bold[stateColor](`${serverName}: ${info.state}`));
      console.log(chalk.gray(`  Type: ${info.config.type}`));
      console.log(chalk.gray(`  Models: ${info.config.models.join(', ')}`));
      console.log(chalk.gray(`  Capabilities: ${info.config.capabilities.join(', ')}`));
      
      if (info.capabilities.length > 0) {
        console.log(chalk.gray(`  Server capabilities: ${Object.keys(info.capabilities).join(', ')}`));
      }
      
      console.log();
    }
  }

  /**
   * Send vision analysis request to MCP server
   */
  async sendVisionRequest(options = {}) {
    const { model, prompt, image, temperature = 0.3, max_tokens = 2000 } = options;
    
    // Find best server for vision models
    const visionServer = this.findBestServerForModel(model, 'vision');
    
    if (!visionServer) {
      throw new Error('No MCP server available for vision analysis');
    }
    
    const connection = this.connections.get(visionServer);
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      throw new Error(`No active connection to vision server: ${visionServer}`);
    }
    
    const requestId = this.generateId();
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'completion/complete',
      params: {
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mimeType,
                  data: image.data
                }
              }
            ]
          }
        ],
        temperature: temperature,
        max_tokens: max_tokens
      }
    };
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Vision request timeout'));
      }, this.options.timeout);
      
      // Store request callback
      this.pendingRequests = this.pendingRequests || new Map();
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      
      // Send request
      connection.send(JSON.stringify(request));
    });
  }

  /**
   * Find best server for model and capability
   */
  findBestServerForModel(model, capability = null) {
    for (const [serverName, serverConfig] of this.servers.entries()) {
      if (this.connectionStates.get(serverName) === 'connected') {
        // Check if server supports the model
        if (serverConfig.models.includes(model) || serverConfig.models.includes('*')) {
          // Check capability if specified
          if (!capability || serverConfig.capabilities.includes(capability) || serverConfig.capabilities.includes('multimodal')) {
            return serverName;
          }
        }
      }
    }
    return null;
  }

  /**
   * Handle completion result (including vision results)
   */
  handleCompletionResult(serverName, message) {
    const requestId = message.id;
    
    if (this.pendingRequests && this.pendingRequests.has(requestId)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(requestId);
      clearTimeout(timeout);
      this.pendingRequests.delete(requestId);
      
      if (message.error) {
        reject(new Error(message.error.message || 'Completion request failed'));
      } else {
        resolve({
          content: message.result.choices[0]?.message?.content || message.result.content,
          usage: message.result.usage,
          processingTime: message.result.processingTime
        });
      }
    }
  }

  /**
   * Utility methods
   */
  
  generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }
  
  generateContextKey(prompt, options) {
    return require('crypto').createHash('md5')
      .update(JSON.stringify({ prompt, options }))
      .digest('hex');
  }
  
  /**
   * Clean up resources
   */
  async shutdown() {
    console.log(chalk.gray('🔌 Shutting down MCP client...'));
    
    // Close all connections
    for (const [serverName, connection] of this.connections.entries()) {
      if (connection.readyState === WebSocket.OPEN) {
        connection.close();
      }
    }
    
    // Clear caches
    this.contextCache.clear();
    this.messageQueue.length = 0;
    
    console.log(chalk.gray('MCP client shutdown complete'));
  }
}

module.exports = MCPClient;