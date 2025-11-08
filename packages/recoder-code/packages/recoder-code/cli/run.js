#!/usr/bin/env node

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const config = require('../config.js');
const ProjectManager = require('./project-manager.js');
const ContextEngine = require('./context-engine.js');
const SlashCommandsEngine = require('./slash-commands.js');
const MCPClient = require('./mcp-client.js');
const ModelManager = require('./model-manager.js');
const RulesEngine = require('./rules-engine.js');
const TaskManager = require('./task-manager.js');
const DevToolsIntegration = require('./dev-tools-integration.js');
const VisionAnalyzer = require('./vision-analyzer.js');
const ServicesManager = require('./services-manager.js');
const AutoServicesManager = require('./auto-services.js');
const LiteMode = require('./lite-mode.js');
const ProgressiveDiscovery = require('./progressive-discovery.js');
const MonitoringManager = require('./monitoring-manager.js');
const InfrastructureManager = require('./infrastructure-manager.js');
const ScriptsManager = require('./scripts-manager.js');
const GitHubManager = require('./github-manager.js');
const WorkspaceManager = require('./workspace-manager.js');

// Initialize unified integration system
const { getInstance: getUnifiedIntegration } = require('./unified-integration.js');

// Initialize unified error handling
const UnifiedErrorHandler = require('./unified-error-handler.js');
const errorHandler = UnifiedErrorHandler.instance;
errorHandler.initialize();

const execAsync = promisify(exec);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class RecoderCode {
  constructor() {
    // Initialize lite mode first
    this.liteMode = new LiteMode();
    this.isLiteMode = this.liteMode.shouldUseLiteMode();
    
    if (this.isLiteMode) {
      this.liteMode.initializeLiteMode();
    }

    // Initialize progressive discovery system
    this.progressiveDiscovery = new ProgressiveDiscovery();

    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
    this.conversationHistory = [];
    this.sessionId = Date.now().toString();
    this.projectManager = new ProjectManager();
    
    // Initialize new systems
    this.contextEngine = null;
    this.slashCommands = null;
    this.mcpClient = null;
    this.modelManager = null;
    this.rulesEngine = null;
    this.taskManager = null;
    this.devTools = null;
    this.visionAnalyzer = null;
    // Only initialize services manager if not in lite mode
    this.servicesManager = this.isLiteMode ? null : new ServicesManager();
    
    // Initialize unified integration system (packages, scripts, devcontainer)
    this.unifiedIntegration = null;
    
    // Initialize systems after API key validation (async) - skip in lite mode
    if (!this.isLiteMode) {
      this.initializeSystems().catch(error => {
        console.log(chalk.yellow(`⚠️  Advanced features initialization failed: ${error.message}`));
      });
    }
    
    if (!this.apiKey) {
      // Don't exit in interactive mode - let interactive.js handle the prompt
      if (process.argv[1] && !process.argv[1].includes('interactive')) {
        console.log(chalk.bold.yellow('\n🔐 API Key Required'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(chalk.white('Recoder-Code needs an OpenRouter API key to work.\n'));
        console.log(chalk.cyan('🆓 Get your FREE key at: ') + chalk.magenta('https://openrouter.ai/keys'));
        console.log(chalk.gray('\nThen run setup:'));
        console.log(chalk.white('  recoder-code --setup\n'));
        process.exit(1);
      }
      // Don't return early - initialize with empty key and it will be set later
      this.apiKey = process.env.OPENROUTER_API_KEY || '';
    }

    // Always initialize OpenAI client (will use apiKey from config or empty string)
    this.openai = new OpenAI({
      baseURL: config.baseURL,
      apiKey: this.apiKey,
      defaultHeaders: {
        'HTTP-Referer': config.siteUrl,
        'X-Title': config.siteName,
      },
    });

    // Register API error handler with unified error system
    errorHandler.registerHandler('openrouter', (error) => {
      this.handleOpenRouterError(error);
    });

    // Initialize resource cleanup
    this.systemsInitialized = false;
    this.setupResourceCleanup();
  }

  /**
   * Setup resource cleanup handlers
   */
  setupResourceCleanup() {
    const cleanup = () => {
      try {
        // Stop any running services
        if (this.mcpClient && typeof this.mcpClient.cleanup === 'function') {
          this.mcpClient.cleanup();
        }
        
        // Clean up file watchers via manager
        const FileWatcherManager = require('./file-watcher-manager.js');
        FileWatcherManager.instance.cleanup();
        
        // Clean up context engine
        if (this.contextEngine && typeof this.contextEngine.cleanup === 'function') {
          this.contextEngine.cleanup();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    };

    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }

  /**
   * Initialize advanced systems with full integration
   */
  async initializeSystems() {
    // Prevent duplicate initialization
    if (this.systemsInitialized) {
      return;
    }
    
    try {
      // Only show in debug mode
      if (process.env.RECODER_DEBUG === 'true') {
        console.log(chalk.gray('🚀 Initializing enhanced AI CLI systems...'));
      }
      
      // Initialize unified integration first (silent mode for non-verbose)
      if (!this.unifiedIntegration) {
        this.unifiedIntegration = getUnifiedIntegration();
        await this.unifiedIntegration.initialize({
          verbose: process.env.RECODER_DEBUG === 'true' || process.argv.includes('--verbose')
        });
      }
      
      // Initialize context engine for codebase understanding
      if (!this.contextEngine) {
        this.contextEngine = new ContextEngine();
        await this.contextEngine.initialize();
      }
      
      // Initialize MCP client for model communication
      if (!this.mcpClient) {
        this.mcpClient = new MCPClient();
        await this.mcpClient.initialize();
      }
      
      // Initialize model manager with intelligent selection
      this.modelManager = new ModelManager(this.mcpClient, this.contextEngine);
      
      // Select optimal model for CLI usage
      const optimalModel = this.modelManager.selectDefaultModel();
      if (optimalModel && optimalModel !== this.model) {
        this.model = optimalModel;
        console.log(chalk.blue(`🎯 Using optimal model: ${this.modelManager.models.get(optimalModel)?.name}`));
      }
      
      // Initialize rules engine with project auto-discovery
      this.rulesEngine = new RulesEngine(this.projectManager);
      await this.rulesEngine.autoDiscoverProjectRules();
      
      // Initialize task manager with automation
      this.taskManager = new TaskManager(this.projectManager, this.contextEngine, this.rulesEngine);
      this.taskManager.setupSmartAutomationTriggers();
      
      // Initialize development tools integration
      this.devTools = new DevToolsIntegration(this.contextEngine, this.projectManager, this.taskManager);
      await this.devTools.setupGitIntegration();
      await this.devTools.setupDatabaseIntegration();
      
      // Initialize vision analyzer
      this.visionAnalyzer = new VisionAnalyzer(this.modelManager, this.contextEngine);
      
      // Initialize slash commands system
      this.slashCommands = new SlashCommandsEngine(this.contextEngine, this.projectManager, this.visionAnalyzer);
      
      // Setup system integrations
      this.setupSystemIntegrations();
      
      if (process.env.RECODER_DEBUG === 'true') {
        console.log(chalk.green('✅ Enhanced systems ready'));
      }
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Some advanced features may be limited: ${error.message}`));
    }
  }

  /**
   * Setup integrations between systems
   */
  setupSystemIntegrations() {
    try {
      // Connect model manager to automatic selection
      this.enableContextAwareModelSelection = true;
      
      // Connect rules engine to AI prompts
      if (this.rulesEngine) {
        this.rulesContextProvider = () => this.rulesEngine.generateAIPromptContext();
      }
      
      // Connect task manager to automated workflows
      if (this.taskManager) {
        this.taskManager.on('taskCreated', (task) => {
          console.log(chalk.cyan(`🎯 Automated task created: ${task.name}`));
        });
      }
      
      // Mark systems as initialized
      this.systemsInitialized = true;
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  System integration setup failed: ${error.message}`));
    }
  }

  logRequest(payload, response, error = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      sessionId: this.sessionId,
      model: payload.model,
      fallbackModels: payload.models,
      provider: payload.provider,
      tokensRequested: payload.max_tokens,
      actualModel: response?.model || null,
      tokensUsed: response?.usage || null,
      error: error ? error.message : null,
      success: !error
    };

    // Write to daily log file
    const logFile = path.join(logsDir, `recoder-${new Date().toISOString().split('T')[0]}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

    // Log usage info if available (only in debug mode)
    if (response?.usage && process.env.RECODER_DEBUG === 'true') {
      console.log(`💰 Tokens used: ${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion = ${response.usage.total_tokens} total`);
    }
  }

  async callOpenRouter(messages, tools = null, useAutoRouter = false, streamResponse = false, onChunkCallback = null) {
    const payload = {
      model: useAutoRouter ? 'openrouter/auto' : this.model,
      messages: messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: streamResponse
    };

    // Add fallback models using OpenRouter's 'models' parameter
    if (!useAutoRouter && config.fallbackModels && config.fallbackModels.length > 0) {
      payload.models = [this.model, ...config.fallbackModels];
    }

    // Add provider preferences
    if (config.providerPreferences) {
      payload.provider = {
        sort: config.providerPreferences.sort,
        allow_fallbacks: config.providerPreferences.allowFallbacks,
        data_collection: config.providerPreferences.dataCollection
      };

      // Add quantization preferences if specified
      if (config.providerPreferences.quantizations) {
        payload.provider.quantizations = config.providerPreferences.quantizations;
      }

      // Add max price preferences if specified
      if (config.providerPreferences.maxPrice) {
        payload.provider.max_price = config.providerPreferences.maxPrice;
      }
    }

    if (tools) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
      // Disable streaming when tools are used
      payload.stream = false;
    }

    try {
      if (process.env.RECODER_DEBUG === 'true') {
        console.log(`🔄 Using model: ${payload.model} ${payload.models ? `with fallbacks: ${payload.models.slice(1).join(', ')}` : ''}`);
      }

      if (streamResponse && !tools) {
        // Handle streaming response
        const stream = await this.openai.chat.completions.create(payload);
        let fullContent = '';
        let fullResponse = null;

        try {
          for await (const chunk of stream) {
            // Debug log the chunk structure
            if (process.env.RECODER_DEBUG === 'true') {
              console.log('\nDEBUG - Chunk:', JSON.stringify(chunk, null, 2));
            }

            if (chunk.choices && chunk.choices.length > 0 && chunk.choices[0]) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                // Call the callback if provided, otherwise write to stdout
                if (onChunkCallback) {
                  onChunkCallback(content);
                } else {
                  process.stdout.write(content);
                }
                fullContent += content;
              }

              // Store the full response structure from the last chunk
              if (chunk.choices[0]?.finish_reason) {
                fullResponse = {
                  choices: [{
                    message: {
                      content: fullContent,
                      role: 'assistant'
                    },
                    finish_reason: chunk.choices[0].finish_reason
                  }],
                  model: chunk.model,
                  usage: chunk.usage || null
                };
              }
            }
          }
        } catch (streamError) {
          console.error('\nStreaming error:', streamError);
          // Fallback to non-streaming
          payload.stream = false;
          const response = await this.openai.chat.completions.create(payload);
          this.logRequest(payload, response);
          return response;
        }

        // If no response was captured from streaming, create a basic one
        if (!fullResponse) {
          fullResponse = {
            choices: [{
              message: {
                content: fullContent,
                role: 'assistant'
              },
              finish_reason: 'stop'
            }],
            model: payload.model,
            usage: null
          };
        }

        if (!onChunkCallback) {
          console.log('\n'); // Add newline after streaming only if we wrote to stdout
        }
        this.logRequest(payload, fullResponse);
        return fullResponse;
      } else {
        // Handle non-streaming response
        const response = await this.openai.chat.completions.create(payload);
        
        // Log which model was actually used
        if (response.model && response.model !== payload.model) {
          console.log(`✅ Fallback used: ${response.model}`);
        }
        
        this.logRequest(payload, response);
        return response;
      }
    } catch (error) {
      this.logRequest(payload, null, error);

      // Show detailed error message to help user debug
      console.log(chalk.red('\n❌ API Request Failed in callOpenRouter:'));

      // Check for authentication errors specifically
      if (error.status === 401 || error.message?.includes('401')) {
        console.log(chalk.red('   Authentication failed - Invalid API key'));
        console.log(chalk.yellow('   Please check your OPENROUTER_API_KEY'));
      } else if (error.status === 402) {
        console.log(chalk.red('   Insufficient credits'));
        console.log(chalk.yellow('   Please add credits to your OpenRouter account'));
      } else {
        console.log(chalk.yellow('   Status:', error.status || 'N/A'));
        console.log(chalk.yellow('   Message:', error.message || 'N/A'));
        console.log(chalk.yellow('   Code:', error.code || 'N/A'));
      }

      // Let unified error handler manage the error instead of re-throwing
      // Return null for graceful degradation
      return null;
    }
  }

  handleOpenRouterError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          console.error('❌ Bad Request: Check your request parameters');
          if (data.error?.message) {
            console.error(`   Details: ${data.error.message}`);
          }
          break;
        case 401:
          console.error('❌ Authentication Error: Invalid or missing API key');
          console.error('   Please check your OPENROUTER_API_KEY environment variable');
          break;
        case 402:
          console.error('❌ Insufficient Credits: Your OpenRouter account has insufficient credits');
          console.error('   Please add credits to your OpenRouter account');
          break;
        case 403:
          console.error('❌ Forbidden: You don\'t have access to this model or feature');
          break;
        case 408:
          console.error('❌ Request Timeout: The request took too long to complete');
          console.error('   Try reducing the max_tokens or simplifying your request');
          break;
        case 429:
          console.error('❌ Rate Limited: Too many requests');
          console.error('   Please wait a moment before making another request');
          break;
        case 502:
          console.error('❌ Bad Gateway: OpenRouter service temporarily unavailable');
          console.error('   Please try again in a few moments');
          break;
        case 503:
          console.error('❌ Service Unavailable: All providers for this model are currently unavailable');
          console.error('   Try using a different model or enable fallbacks');
          break;
        default:
          console.error(`❌ OpenRouter API Error (${status}):`, data.error?.message || data);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection Error: Cannot connect to OpenRouter API');
      console.error('   Please check your internet connection');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ Network Error: DNS lookup failed');
      console.error('   Please check your internet connection');
    } else {
      console.error('❌ Unexpected Error:', error.message);
    }
  }

  async executeToolCall(toolCall) {
    const { name, arguments: args } = toolCall.function;
    
    try {
      const parsedArgs = JSON.parse(args);
      
      switch (name) {
        case 'str_replace_editor':
          return await this.handleFileOperation(parsedArgs);
        case 'bash':
          return await this.handleBashCommand(parsedArgs);
        case 'web_fetch':
          return await this.handleWebFetch(parsedArgs);
        case 'codebase_search':
          return await this.handleCodebaseSearch(parsedArgs);
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      return `Error executing ${name}: ${error.message}`;
    }
  }

  async handleFileOperation(args) {
    const { command, path: filePath, old_str, new_str, view_range } = args;
    
    try {
      switch (command) {
        case 'view':
          if (!fs.existsSync(filePath)) {
            return `File not found: ${filePath}`;
          }
          
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n');
          
          if (view_range && view_range.length === 2) {
            const [start, end] = view_range;
            const selectedLines = lines.slice(start - 1, end);
            return selectedLines.map((line, i) => `${start + i}: ${line}`).join('\n');
          }
          
          return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
          
        case 'create':
          if (fs.existsSync(filePath)) {
            return `File already exists: ${filePath}`;
          }
          
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          fs.writeFileSync(filePath, new_str || '');
          this.progressiveDiscovery.trackAction('file-operation');
          return `Created file: ${filePath}`;
          
        case 'str_replace':
          if (!fs.existsSync(filePath)) {
            return `File not found: ${filePath}`;
          }
          
          let fileContent = fs.readFileSync(filePath, 'utf8');
          
          if (!fileContent.includes(old_str)) {
            return `String not found in file: ${old_str}`;
          }
          
          fileContent = fileContent.replace(old_str, new_str);
          fs.writeFileSync(filePath, fileContent);
          this.progressiveDiscovery.trackAction('file-operation');
          return `Updated file: ${filePath}`;
          
        default:
          return `Unknown file operation: ${command}`;
      }
    } catch (error) {
      return `File operation error: ${error.message}`;
    }
  }

  async handleBashCommand(args) {
    const { command } = args;
    
    try {
      const { stdout, stderr } = await execAsync(command, { 
        maxBuffer: 1024 * 1024,
        cwd: process.cwd()
      });
      
      let result = '';
      if (stdout) result += `STDOUT:\n${stdout}`;
      if (stderr) result += `${result ? '\n' : ''}STDERR:\n${stderr}`;
      
      return result || 'Command executed successfully (no output)';
    } catch (error) {
      return `Bash error: ${error.message}`;
    }
  }

  async handleCodebaseSearch(args) {
    const { query, file_pattern = '*', search_type = 'content', context_lines = 3 } = args;
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      console.log(`🔍 Searching codebase: "${query}"`);
      
      let results = [];
      
      switch (search_type) {
        case 'content':
          try {
            const rgCommand = `rg -n -C ${context_lines} --type-not binary "${query}" ${file_pattern}`;
            const { stdout } = await execAsync(rgCommand, { 
              maxBuffer: 5 * 1024 * 1024,
              cwd: process.cwd()
            });
            
            if (stdout) {
              results.push(`Content search results for "${query}":\n${stdout}`);
            } else {
              results.push(`No content matches found for "${query}"`);
            }
          } catch (error) {
            try {
              const grepCommand = `find . -name "${file_pattern}" -type f -exec grep -n -C ${context_lines} "${query}" {} +`;
              const { stdout } = await execAsync(grepCommand, {
                maxBuffer: 5 * 1024 * 1024,
                cwd: process.cwd()
              });
              results.push(stdout || `No content matches found for "${query}"`);
            } catch (grepError) {
              results.push(`Search error: ${grepError.message}`);
            }
          }
          break;
          
        case 'filename':
          try {
            const findCommand = `find . -name "*${query}*" -type f | head -50`;
            const { stdout } = await execAsync(findCommand, { cwd: process.cwd() });
            results.push(stdout || `No files found matching "${query}"`);
          } catch (error) {
            results.push(`Filename search error: ${error.message}`);
          }
          break;
          
        case 'structure':
          try {
            const treeCommand = `find . -type f -name "${file_pattern}" | head -100 | sort`;
            const { stdout } = await execAsync(treeCommand, { cwd: process.cwd() });
            
            const wcCommand = `find . -name "${file_pattern}" -type f -exec wc -l {} + | tail -1`;
            const { stdout: wcOut } = await execAsync(wcCommand, { cwd: process.cwd() }).catch(() => ({stdout: ''}));
            
            results.push(`Project structure analysis:\n${stdout}\n\nFile statistics:\n${wcOut}`);
          } catch (error) {
            results.push(`Structure analysis error: ${error.message}`);
          }
          break;
      }
      
      return results.join('\n').substring(0, 8000) + (results.join('\n').length > 8000 ? '\n...[truncated]' : '');
      
    } catch (error) {
      return `Codebase search error: ${error.message}`;
    }
  }

  async handleWebFetch(args) {
    const { url, extract_text = true } = args;
    
    try {
      const https = require('https');
      const http = require('http');
      
      console.log(`🌐 Fetching: ${url}`);
      
      return new Promise((resolve, reject) => {
        const client = url.startsWith('https://') ? https : http;
        
        const request = client.get(url, {
          headers: {
            'User-Agent': 'RecorderCode/1.0 (Educational AI Assistant)'
          },
          timeout: 10000
        }, (response) => {
          let data = '';
          
          response.on('data', (chunk) => {
            data += chunk;
          });
          
          response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              if (extract_text) {
                // Simple text extraction - remove HTML tags and extra whitespace
                const text = data
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                  .replace(/<[^>]+>/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                resolve(text.substring(0, 5000) + (text.length > 5000 ? '...' : ''));
              } else {
                resolve(data.substring(0, 5000) + (data.length > 5000 ? '...' : ''));
              }
            } else {
              resolve(`HTTP Error: ${response.statusCode} ${response.statusMessage}`);
            }
          });
        });
        
        request.on('error', (error) => {
          resolve(`Fetch error: ${error.message}`);
        });
        
        request.on('timeout', () => {
          request.destroy();
          resolve('Fetch error: Request timeout');
        });
      });
      
    } catch (error) {
      return `Web fetch error: ${error.message}`;
    }
  }

  getProjectContextString() {
    const projectStatus = this.projectManager.getProjectStatus();
    
    if (!projectStatus.exists) {
      return "No Recoder project initialized in current directory. Consider running with --init to create project documentation.";
    }
    
    const context = projectStatus.context;
    return `
Project: ${context.name} (${context.type})
Description: ${context.description}
Framework: ${context.framework || 'Not specified'}
Language: ${context.language || 'Not specified'}
Pending Tasks: ${projectStatus.todos.pending}
Documentation: Plan=${projectStatus.files.plan ? '✓' : '✗'} Architecture=${projectStatus.files.architecture ? '✓' : '✗'} Notes=${projectStatus.files.notes ? '✓' : '✗'}`;
  }

  async processConversation(userMessage, useAutoRouter = false, enableStreaming = false, streamingOptions = null) {
    // streamingOptions can be:
    // - null/false: regular resumeSession string for backward compatibility
    // - object with { onChunk: callback }: streaming with callback
    // - true: enable streaming without callback

    let resumeSession = null;
    let onChunkCallback = null;

    if (streamingOptions) {
      if (typeof streamingOptions === 'object' && streamingOptions.onChunk) {
        // New streaming mode with callback
        onChunkCallback = streamingOptions.onChunk;
      } else if (typeof streamingOptions === 'string') {
        // Backward compatibility: string is resumeSession
        resumeSession = streamingOptions;
      }
    }

    // If resuming a session, restore conversation history
    if (resumeSession) {
      const session = this.projectManager.loadSession(resumeSession);
      if (session && session.conversationHistory) {
        this.conversationHistory = [...session.conversationHistory];
        console.log(chalk.cyan(`🔄 Resumed session: ${resumeSession}`));
        console.log(chalk.gray(`   Previous messages: ${this.conversationHistory.length}`));
      }
      // Silently ignore session resume failures - don't warn users
    }

    // Check if this is a slash command
    if (userMessage.trim().startsWith('/') && this.slashCommands) {
      try {
        const result = await this.slashCommands.executeCommand(userMessage.trim());
        if (result) {
          console.log('\n' + JSON.stringify(result, null, 2));
          return 'Slash command executed successfully.';
        }
      } catch (error) {
        console.log(chalk.red(`❌ Slash command error: ${error.message}`));
        return 'Slash command failed. Use /help for available commands.';
      }
    }

    // Auto-select best model if model manager is available
    if (this.modelManager && !useAutoRouter && this.enableContextAwareModelSelection) {
      try {
        const taskType = this.inferTaskType(userMessage);
        const context = this.buildEnhancedContext(userMessage);
        const bestModel = await this.modelManager.autoSwitchModel(taskType, context);
        if (bestModel && bestModel !== this.model) {
          const modelInfo = this.modelManager.models.get(bestModel);
          this.model = bestModel;
          console.log(chalk.blue(`🎯 Auto-switched to ${modelInfo?.name || bestModel} for ${taskType} task`));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Model auto-selection failed: ${error.message}`));
      }
    }

    // Apply project rules to enhance the prompt
    let enhancedUserMessage = userMessage;
    if (this.rulesEngine && this.rulesContextProvider) {
      try {
        const rulesContext = this.rulesContextProvider();
        if (rulesContext) {
          enhancedUserMessage = `${userMessage}\n\n${rulesContext}`;
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Rules context generation failed: ${error.message}`));
      }
    }

    this.conversationHistory.push({
      role: 'user',
      content: enhancedUserMessage
    });

    const systemMessage = {
      role: 'system',
      content: `You are Recoder Code, a powerful AI assistant that can help users with software development tasks. You have access to tools that allow you to:

1. View, create, and edit files using the str_replace_editor tool
2. Execute bash commands using the bash tool

IMPORTANT: When users request complex tasks (like "build an app", "create a project", etc.), you MUST:
1. First say "Let me create a todo list to track this implementation:"
2. Present a clear, numbered todo list breaking down the task into specific steps
3. Say "Now let's start with the first task:"
4. Work through each todo item systematically
5. Mark each task as completed when finished

Example response format:
"I'll help you build a blog app! Let me create a todo list to track this implementation:

📝 Todo List:
1. Set up Next.js project structure
2. Install required dependencies (tailwindcss, etc.)
3. Create basic layout components
4. Implement blog post listing page
5. Add individual blog post pages
6. Set up content management
7. Add styling and responsive design
8. Test the application

Now let's start with the first task: setting up the Next.js project structure."

When users ask you to build projects or write code:
1. Always create a todo list first for complex tasks
2. Break down the work into clear, actionable steps
3. Work through each step systematically
4. Create the necessary project structure
5. Write the code files
6. Set up configuration files
7. Create documentation (README, etc.)
8. Test the project if possible

Always be thorough and create complete, working solutions. Ask clarifying questions if the requirements are unclear.

Available tools:
- str_replace_editor: For file operations (view, create, edit)
- bash: For executing shell commands
- codebase_search: For searching through existing code
- web_fetch: For fetching documentation and resources

IMPORTANT PERSISTENCE RULES:
- Always update project documentation after completing tasks
- Add important findings to project notes
- Track progress in the project plan
- Save todos for future sessions
- Document architecture decisions

Current working directory: ${process.cwd()}
Project context: ${this.getProjectContextString()}${this.getRulesContextString()}`
    };

    const messages = [systemMessage, ...this.conversationHistory];

    let response = await this.callOpenRouter(messages, config.tools, useAutoRouter, enableStreaming, onChunkCallback);

    // Add safety checks for response structure
    if (!response || !response.choices || !response.choices[0]) {
      return 'Unable to process request. Please check your API key and try again.';
    }
    
    while (response.choices[0].message && response.choices[0].message.tool_calls) {
      const assistantMessage = response.choices[0].message;
      this.conversationHistory.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolResult = await this.executeToolCall(toolCall);
        
        this.conversationHistory.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id
        });
      }

      // Don't stream when there are tool calls, as we need to process them
      response = await this.callOpenRouter([systemMessage, ...this.conversationHistory], null, useAutoRouter, false, null);
      
      // Add safety check again
      if (!response || !response.choices || !response.choices[0]) {
        // API error already handled by unified error handler, provide graceful fallback
        return 'Unable to complete tool execution - API service unavailable. Please check your API key and credits.';
      }
    }

    const finalResponse = response.choices[0].message.content;
    this.conversationHistory.push({
      role: 'assistant',
      content: finalResponse
    });

    // Auto-save session if we have a project
    this.autoSaveSession();

    // Track user progress
    if (this.conversationHistory.length <= 3) {
      this.progressiveDiscovery.trackAction('first-chat');
    }

    return finalResponse;
  }

  /**
   * Infer task type from user message
   */
  inferTaskType(message) {
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('review') || messageLower.includes('analyze') || messageLower.includes('check')) {
      return 'analysis';
    } else if (messageLower.includes('code') || messageLower.includes('function') || messageLower.includes('class')) {
      return 'coding';
    } else if (messageLower.includes('document') || messageLower.includes('write') || messageLower.includes('explain')) {
      return 'writing';
    } else if (messageLower.includes('test') || messageLower.includes('debug') || messageLower.includes('fix')) {
      return 'coding';
    } else {
      return 'general';
    }
  }

  /**
   * Build enhanced context using available systems
   */
  buildEnhancedContext(message) {
    const context = {
      estimatedTokens: message.length * 1.5, // Rough estimation
      hasImages: false,
      needsTools: message.includes('create') || message.includes('build') || message.includes('generate')
    };

    // Add context from context engine if available
    if (this.contextEngine) {
      try {
        const codebaseContext = this.contextEngine.generateContext(message, {
          maxFiles: 5,
          maxTokens: 10000
        });
        context.codebaseSize = codebaseContext.codebaseOverview?.totalFiles || 0;
        context.relevantFiles = codebaseContext.relevantFiles?.length || 0;
      } catch (error) {
        // Ignore context generation errors
      }
    }

    return context;
  }

  /**
   * Get rules context for AI prompt
   */
  getRulesContextString() {
    if (this.rulesEngine) {
      try {
        return this.rulesEngine.generateAIPromptContext();
      } catch (error) {
        return '';
      }
    }
    return '';
  }

  // Auto-save current session state
  autoSaveSession() {
    try {
      const sessionData = {
        conversationHistory: this.conversationHistory,
        model: this.model,
        sessionId: this.sessionId,
        metadata: {
          messageCount: this.conversationHistory.length,
          lastActivity: new Date().toISOString(),
          workingDirectory: process.cwd()
        }
      };
      
      this.projectManager.saveSession(sessionData, this.sessionId);
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not auto-save session: ${error.message}`));
    }
  }

  // Get session continuation suggestions
  getSessionSuggestions() {
    const sessions = this.projectManager.listSessions();
    if (sessions.length === 0) return null;
    
    return {
      recent: sessions.slice(0, 3),
      total: sessions.length
    };
  }
}

// Interactive template creation helper
async function createDocumentFromTemplate(projectManager, templateName) {
  try {
    const inquirer = require('inquirer');
    
    // Check if template exists
    const templatePath = path.join(projectManager.templatesDir, `${templateName}.template`);
    if (!fs.existsSync(templatePath)) {
      console.log(chalk.red(`❌ Template not found: ${templateName}`));
      return;
    }
    
    // Get template content
    const template = fs.readFileSync(templatePath, 'utf8');
    
    // Extract variables from template ({{variable}})
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables = new Set();
    let match;
    while ((match = variablePattern.exec(template)) !== null) {
      variables.add(match[1]);
    }
    
    console.log(chalk.cyan(`🎯 Creating document from template: ${templateName}`));
    console.log(chalk.gray('Please provide values for the following variables:\n'));
    
    // Prompt for document name first
    const { documentName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'documentName',
        message: 'Document name (without .md extension):',
        validate: (input) => input.trim().length > 0 || 'Document name is required'
      }
    ]);
    
    // Create prompts for each variable
    const variablePrompts = Array.from(variables).map(variable => {
      const prompt = {
        type: 'input',
        name: variable,
        message: `${variable}:`
      };
      
      // Add default values for common variables
      switch (variable) {
        case 'timestamp':
          prompt.default = new Date().toISOString();
          break;
        case 'date':
          prompt.default = new Date().toLocaleDateString();
          break;
        case 'author':
        case 'reporter':
        case 'reviewer':
        case 'researcher':
          prompt.default = process.env.USER || process.env.USERNAME || 'User';
          break;
        case 'status':
          prompt.type = 'list';
          prompt.choices = ['Draft', 'In Progress', 'Review', 'Completed', 'Cancelled'];
          break;
        case 'severity':
          prompt.type = 'list';
          prompt.choices = ['Low', 'Medium', 'High', 'Critical'];
          break;
        case 'priority':
          prompt.type = 'list';
          prompt.choices = ['Low', 'Medium', 'High', 'Urgent'];
          break;
      }
      
      return prompt;
    });
    
    // Get variable values from user
    const variableValues = await inquirer.prompt(variablePrompts);
    
    // Create document with template and values
    const content = projectManager.applyTemplate(templateName, variableValues);
    const docPath = projectManager.createDocument(documentName.trim(), content);
    
    if (docPath) {
      console.log(chalk.green(`✅ Document created: ${documentName}.md`));
      console.log(chalk.gray(`   Path: ${docPath}`));
      
      // Ask if user wants to open the document
      const { openDoc } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'openDoc',
          message: 'Would you like to view the created document?',
          default: false
        }
      ]);
      
      if (openDoc) {
        console.log(chalk.cyan(`\n📄 ${documentName}.md`));
        console.log(chalk.gray('═'.repeat(50)));
        console.log(content);
      }
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Error creating document: ${error.message}`));
  }
}

function showUsageStats() {
  console.log('📊 Recoder Usage Statistics\n');
  
  const logFiles = fs.readdirSync(logsDir).filter(f => f.startsWith('recoder-') && f.endsWith('.jsonl'));
  
  if (logFiles.length === 0) {
    console.log('No usage data found. Run some requests first!');
    return;
  }

  let totalRequests = 0;
  let totalTokens = 0;
  let modelUsage = {};
  let errorCount = 0;
  let successCount = 0;

  logFiles.forEach(file => {
    const content = fs.readFileSync(path.join(logsDir, file), 'utf8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    
    lines.forEach(line => {
      try {
        const entry = JSON.parse(line);
        totalRequests++;
        
        if (entry.success) {
          successCount++;
          if (entry.tokensUsed && entry.tokensUsed.total_tokens) {
            totalTokens += entry.tokensUsed.total_tokens;
          }
          
          const model = entry.actualModel || entry.model;
          modelUsage[model] = (modelUsage[model] || 0) + 1;
        } else {
          errorCount++;
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    });
  });

  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Successful: ${successCount} | Failed: ${errorCount}`);
  console.log(`Success Rate: ${((successCount / totalRequests) * 100).toFixed(1)}%`);
  console.log(`Total Tokens Used: ${totalTokens.toLocaleString()}`);
  
  if (Object.keys(modelUsage).length > 0) {
    console.log('\nModel Usage:');
    Object.entries(modelUsage)
      .sort((a, b) => b[1] - a[1])
      .forEach(([model, count]) => {
        console.log(`  ${model}: ${count} requests`);
      });
  }
  
  console.log(`\nLog files: ${logFiles.length} (${logsDir})`);
}

function showHelp() {
  console.log('🚀 Recoder Code - AI-Powered Development Assistant');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('Usage:');
  console.log('  recoder                    # Start interactive chat mode');
  console.log('  recoder "your prompt"      # One-shot command mode');
  console.log('');
  console.log('Interactive Mode:');
  console.log('  - Persistent conversations with context');
  console.log('  - Automatic todo lists for complex tasks');
  console.log('  - File creation and editing');
  console.log('  - Shell command execution');
  console.log('  - Session management');
  console.log('');
  console.log('One-shot Options:');
  console.log('  --auto "prompt"           # Use OpenRouter Auto Router');
  console.log('  --model <name> "prompt"   # Use specific model from catalog');
  console.log('  --fast "prompt"          # Prioritize speed (throughput)');
  console.log('  --cheap "prompt"         # Prioritize cost (price)');
  console.log('  --stream "prompt"        # Enable streaming responses');
  console.log('  --stats                  # Show usage statistics');
  console.log('  --setup                  # Run configuration wizard');
  console.log('  --help, -h               # Show this help');
  console.log('');
  console.log('Project Management:');
  console.log('  --init [name]            # Initialize project documentation');
  console.log('  --init-template <type>   # Initialize from project template');
  console.log('  --templates              # Show available project templates');
  console.log('  --status                 # Show project status');
  console.log('  --plan                   # View project plan');
  console.log('  --notes                  # View project notes');
  console.log('  --todos                  # View project todos');
  console.log('  --export [--full]        # Export project data (basic or full)');
  console.log('  --export --share         # Create privacy-safe shareable export');
  console.log('  --import <file>          # Import project from export file');
  console.log('  --import <file> --collaborator <name>  # Import shared project');
  console.log('');
  console.log('Document Management:');
  console.log('  --doc-create <name>      # Create new document');
  console.log('  --doc-list               # List all documents');
  console.log('  --doc-view <name>        # View document content');
  console.log('  --doc-template <name>    # Create document from template');
  console.log('');
  console.log('Session Management:');
  console.log('  --sessions [--search]    # List/search saved sessions');
  console.log('  --session-stats          # Show session analytics');
  console.log('  --analytics              # Show comprehensive project analytics');
  console.log('  --search "query"         # Advanced search across all data');
  console.log('  --resume <id>            # Resume a saved session');
  console.log('  --backup [--message]     # Create project backup');
  console.log('  --backup --smart         # Create smart backup with rotation');
  console.log('  --backup --status        # Show backup schedule and status');
  console.log('  --restore <id>           # Restore from backup');
  console.log('  --cleanup                # Clean old sessions and backups');
  console.log('');
  console.log('Model Management:');
  console.log('  --models                 # List available models');
  console.log('  --model-info [name]      # Show detailed model information');
  console.log('  --model-picker           # Interactive model selection');
  console.log('  --model-switch <name>    # Switch to specific model');
  console.log('  --model-status           # Show current model and MCP status');
  console.log('');
  console.log('Vision Analysis:');
  console.log('  --analyze-image <path>   # Analyze image with auto-detection');
  console.log('  --vision-templates       # List available analysis templates');
  console.log('  --vision-history         # Show analysis history');
  console.log('  --batch-analyze <dir>    # Analyze all images in directory');
  console.log('');
  console.log('Slash Commands:');
  console.log('  /help                    # Show available slash commands');
  console.log('  /review                  # AI-powered code review');
  console.log('  /security                # Security vulnerability assessment');
  console.log('  /optimize                # Performance optimization analysis');
  console.log('  /docs                    # Generate documentation');
  console.log('  /test                    # Generate test strategies');
  console.log('  /refactor                # Code refactoring suggestions');
  console.log('');
  console.log('Rules & Task Management:');
  console.log('  --rules-status           # Show active project rules');
  console.log('  --task-status            # Show task manager status');
  console.log('  --task-create <template> # Create task from template');
  console.log('  --dev-tools-status       # Show development tools integration');
  console.log('');
  console.log('Workspace Management:');
  console.log('  --workspaces             # List all registered workspaces');
  console.log('  --workspace <id>         # Get info about a workspace');
  console.log('  --register-workspace     # Register current project as workspace');
  console.log('  --unregister <id>        # Remove workspace registration');
  console.log('');
  console.log('Examples:');
  console.log('  recoder-code');
  console.log('  recoder-code "Create a simple web server in Node.js"');
  console.log('  recoder-code --model openai/gpt-4o "Build a React todo app"');
  console.log('  recoder-code --auto "Write a Python script for data analysis"');
  console.log('  recoder-code --fast "Generate API documentation"');
  console.log('');
  console.log('Environment Variables:');
  console.log('  OPENROUTER_API_KEY       # Required: Your OpenRouter API key');
  console.log('  OPENROUTER_MODEL         # Optional: Default model to use');
  console.log('  OPENROUTER_SITE_NAME     # Optional: Site name for tracking');
  console.log('  OPENROUTER_SITE_URL      # Optional: Site URL for tracking');
  console.log('');
  console.log('📚 For detailed model selection guide, see: MODEL_SELECTION.md');
  console.log('🌐 Browse all models at: https://openrouter.ai/models');
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  
  // Check for lite mode flags
  if (args.includes('--lite')) {
    process.env.RECODER_LITE_MODE = 'true';
  }
  
  // Handle lite mode upgrade command
  if (args.includes('--enable-services') || (args[0] === 'services' && args[1] === 'enable')) {
    const liteMode = new LiteMode();
    const autoServices = new AutoServicesManager();
    
    console.log(chalk.cyan('🚀 Enabling full platform services...'));
    
    // First upgrade lite mode config
    await liteMode.upgradeToFullMode();
    
    // Then start services automatically
    const started = await autoServices.smartStart('full');
    
    if (started) {
      console.log(chalk.green('✅ Full platform enabled! All services are running.'));
      console.log(chalk.cyan('💡 Try: recoder-code collab create "My Project"'));
    } else {
      console.log(chalk.yellow('⚠️  Platform upgraded but some services failed to start.'));
      console.log(chalk.gray('   Run: recoder-code services status'));
    }
    
    return;
  }
  
  if (args.length === 0) {
    // Launch interactive mode with proper user onboarding
    const UserOnboarding = require('./user-onboarding.js');
    const onboarding = new UserOnboarding();
    
    if (onboarding.needsOnboarding()) {
      // First time user - run full onboarding
      await onboarding.runOnboarding();
    } else {
      // Returning user - quick start
      await onboarding.quickStart();
    }
    
    // Now launch interactive mode
    const InteractiveChat = require('./interactive.js');
    const chat = new InteractiveChat();
    chat.start();
    return;
  }
  
  // Handle help commands
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    const HelpSystem = require('./help-system');
    const helpSystem = new HelpSystem();
    const forceAdvanced = args.includes('--advanced');
    helpSystem.showCommandHelp(args[1] || args[0] === 'help' ? args[1] : null, forceAdvanced);
    return;
  }
  
  // Handle version command
  if (args.includes('--version') || args.includes('-v')) {
    const HelpSystem = require('./help-system');
    const helpSystem = new HelpSystem();
    helpSystem.showVersion();
    return;
  }
  
  // Handle system info command
  if (args.includes('--info')) {
    const HelpSystem = require('./help-system');
    const helpSystem = new HelpSystem();
    helpSystem.showSystemInfo();
    return;
  }

  // Handle unified integration commands
  const unifiedIntegration = getUnifiedIntegration();
  const integrationCommands = [
    '--packages-status', '--build-packages', '--packages-info',
    '--list-scripts', '--script', '--health-check', '--benchmark', '--security-audit',
    '--container-list', '--container-build', '--container-start', '--container-stop', '--container-status',
    '--integration-help'
  ];
  
  const hasIntegrationCommand = args.some(arg => integrationCommands.includes(arg));
  
  if (hasIntegrationCommand) {
    // Initialize integration
    await unifiedIntegration.initialize({ verbose: args.includes('--verbose') });
    
    // Find the command and its args
    for (let i = 0; i < args.length; i++) {
      if (integrationCommands.includes(args[i])) {
        const handled = await unifiedIntegration.handleCommand(args[i], args.slice(i + 1));
        if (handled) {
          return;
        }
      }
    }
  }

  // Check for setup command - use simple setup by default
  if (args.includes('--setup')) {
    if (args.includes('--advanced')) {
      const SetupWizard = require('./setup-wizard.js');
      const wizard = new SetupWizard();
      await wizard.run();
    } else {
      const SimpleSetup = require('./simple-setup.js');
      const setup = new SimpleSetup();
      await setup.run();
      
      // Track setup completion
      const discovery = new ProgressiveDiscovery();
      discovery.trackAction('setup-completed');
    }
    return;
  }

  // Handle service commands (collab, train, plugins, services, auth, config)
  // Check if lite mode is active and handle accordingly
  const liteMode = new LiteMode();
  const isLiteMode = liteMode.shouldUseLiteMode();
  
  const serviceCommands = ['train', 'collab', 'collaborate', 'plugins', 'services', 'auth', 'user', 'config'];
  const firstArg = args[0];
  
  // Handle new integrated commands
  if (firstArg === 'monitor') {
    const monitoringManager = new MonitoringManager();
    const subCommand = args[1] || 'help';
    
    switch (subCommand) {
      case 'setup':
        const options = {};
        if (args.includes('--grafana')) options.grafana = true;
        if (args.includes('--alertmanager')) options.alertmanager = true;
        const portIndex = args.indexOf('--port');
        if (portIndex > -1 && args[portIndex + 1]) options.port = parseInt(args[portIndex + 1]);
        await monitoringManager.setupMonitoring(options);
        break;
      case 'status':
        await monitoringManager.checkMonitoringStatus();
        break;
      case 'stop':
        await monitoringManager.stopMonitoring();
        break;
      case 'logs':
        const service = args[2] || 'prometheus';
        await monitoringManager.viewLogs(service);
        break;
      case 'dashboard':
        const dashboardService = args[2] || 'prometheus';
        await monitoringManager.openDashboard(dashboardService);
        break;
      default:
        await monitoringManager.showHelp();
    }
    return;
  }

  if (firstArg === 'infra' || firstArg === 'k8s') {
    const infraManager = new InfrastructureManager();
    const subCommand = args[1] || 'help';
    
    if (firstArg === 'infra') {
      switch (subCommand) {
        case 'init':
          await infraManager.initTerraform();
          break;
        case 'plan':
          const planOptions = { vars: {} };
          if (args.includes('--auto-approve')) planOptions.autoApprove = true;
          await infraManager.planTerraform(planOptions);
          break;
        case 'apply':
          const applyOptions = { vars: {} };
          if (args.includes('--auto-approve')) applyOptions.autoApprove = true;
          await infraManager.applyTerraform(applyOptions);
          break;
        case 'destroy':
          const destroyOptions = { force: args.includes('--force') };
          if (args.includes('--auto-approve')) destroyOptions.autoApprove = true;
          await infraManager.destroyTerraform(destroyOptions);
          break;
        case 'status':
          await infraManager.showInfraStatus();
          break;
        default:
          await infraManager.showHelp();
      }
    } else { // k8s
      switch (subCommand) {
        case 'deploy':
          await infraManager.deployKubernetes();
          break;
        case 'status':
          await infraManager.getKubernetesStatus();
          break;
        case 'logs':
          const podName = args[2];
          await infraManager.getKubernetesLogs(podName);
          break;
        case 'delete':
          await infraManager.deleteKubernetesDeployment();
          break;
        default:
          await infraManager.showHelp();
      }
    }
    return;
  }

  if (firstArg === 'scripts') {
    const scriptsManager = new ScriptsManager();
    const subCommand = args[1] || 'help';
    
    switch (subCommand) {
      case 'list':
        await scriptsManager.listScripts();
        break;
      case 'run':
        const scriptName = args[2];
        if (!scriptName) {
          console.log(chalk.red('❌ Script name required'));
          console.log(chalk.blue('Usage: recoder-code scripts run <script-name> [args...]'));
          return;
        }
        const scriptArgs = args.slice(3);
        await scriptsManager.runScript(scriptName, scriptArgs);
        break;
      case 'show':
        const showScript = args[2];
        if (!showScript) {
          console.log(chalk.red('❌ Script name required'));
          console.log(chalk.blue('Usage: recoder-code scripts show <script-name>'));
          return;
        }
        await scriptsManager.showScriptContent(showScript);
        break;
      case 'history':
        await scriptsManager.showHistory();
        break;
      case 'info':
        await scriptsManager.showSystemInfo();
        break;
      case 'utility':
        const utilityScript = args[2];
        if (!utilityScript) {
          console.log(chalk.red('❌ Utility script name required'));
          console.log(chalk.blue('Usage: recoder-code scripts utility <script-name> [args...]'));
          return;
        }
        const utilityArgs = args.slice(3);
        await scriptsManager.runUtilityScript(utilityScript, utilityArgs);
        break;
      default:
        await scriptsManager.showHelp();
    }
    return;
  }

  // GitHub CLI commands
  if (firstArg === 'github') {
    const githubManager = new GitHubManager();
    const subCommand = args[1] || 'help';
    
    switch (subCommand) {
      case 'list':
      case 'issues':
        await githubManager.listIssues();
        break;
      case 'pr':
        const prTitle = args[2];
        if (!prTitle) {
          console.log(chalk.red('❌ PR title required'));
          console.log(chalk.blue('Usage: recoder-code github pr <title> [body]'));
          return;
        }
        const prBody = args[3] || '';
        await githubManager.createPullRequest(prTitle, prBody);
        break;
      case 'clone':
        const repoUrl = args[2];
        if (!repoUrl) {
          console.log(chalk.red('❌ Repository URL required'));
          console.log(chalk.blue('Usage: recoder-code github clone <repo-url>'));
          return;
        }
        await githubManager.cloneRepo(repoUrl);
        break;
      case 'duplicates':
        await githubManager.closeDuplicates();
        break;
      case 'info':
        const repoInfo = args[2];
        if (!repoInfo || !repoInfo.includes('/')) {
          console.log(chalk.red('❌ Repository owner/name required'));
          console.log(chalk.blue('Usage: recoder-code github info <owner/repo>'));
          return;
        }
        const [owner, repo] = repoInfo.split('/');
        await githubManager.getRepoInfo(owner, repo);
        break;
      default:
        await githubManager.showHelp();
    }
    return;
  }

  // Workspace CLI commands  
  if (firstArg === 'workspace') {
    const workspaceManager = new WorkspaceManager();
    const subCommand = args[1] || 'help';
    
    switch (subCommand) {
      case 'create':
        const workspaceName = args[2];
        if (!workspaceName) {
          console.log(chalk.red('❌ Workspace name required'));
          console.log(chalk.blue('Usage: recoder-code workspace create <workspace-name>'));
          return;
        }
        await workspaceManager.createWorkspace(workspaceName);
        break;
      case 'list':
        await workspaceManager.listWorkspaces();
        break;
      case 'share':
        const shareWorkspace = args[2];
        if (!shareWorkspace) {
          console.log(chalk.red('❌ Workspace name required'));
          console.log(chalk.blue('Usage: recoder-code workspace share <workspace-name>'));
          return;
        }
        await workspaceManager.shareWorkspace(shareWorkspace);
        break;
      case 'join':
        const sessionId = args[2];
        if (!sessionId) {
          console.log(chalk.red('❌ Session ID required'));
          console.log(chalk.blue('Usage: recoder-code workspace join <session-id>'));
          return;
        }
        await workspaceManager.joinSession(sessionId);
        break;
      case 'delete':
        const deleteWorkspace = args[2];
        if (!deleteWorkspace) {
          console.log(chalk.red('❌ Workspace name required'));
          console.log(chalk.blue('Usage: recoder-code workspace delete <workspace-name>'));
          return;
        }
        await workspaceManager.deleteWorkspace(deleteWorkspace);
        break;
      default:
        await workspaceManager.showHelp();
    }
    return;
  }

  // Enhanced plugins command with registry support
  if (firstArg === 'plugins') {
    const PluginMarketplace = require('./plugin-marketplace.js');
    const marketplace = new PluginMarketplace();
    const subCommand = args[1] || 'help';
    
    switch (subCommand) {
      case 'search':
        const query = args[2] || '';
        await marketplace.searchPlugins(query);
        break;
      case 'install':
        const installPlugin = args[2];
        if (!installPlugin) {
          console.log(chalk.red('❌ Plugin name required'));
          console.log(chalk.blue('Usage: recoder-code plugins install <plugin-name>'));
          return;
        }
        await marketplace.installPlugin(installPlugin);
        break;
      case 'uninstall':
        const uninstallPlugin = args[2];
        if (!uninstallPlugin) {
          console.log(chalk.red('❌ Plugin name required'));
          console.log(chalk.blue('Usage: recoder-code plugins uninstall <plugin-name>'));
          return;
        }
        await marketplace.uninstallPlugin(uninstallPlugin);
        break;
      case 'list':
        await marketplace.listPlugins({ installedOnly: true });
        break;
      case 'update':
        const updatePlugin = args[2];
        if (updatePlugin) {
          await marketplace.updatePlugin(updatePlugin);
        } else {
          await marketplace.updateAllPlugins();
        }
        break;
      case 'registry':
        const registrySubCommand = args[2] || 'status';
        switch (registrySubCommand) {
          case 'start':
            const startOptions = { docker: !args.includes('--no-docker') };
            await marketplace.startRegistryService(startOptions);
            break;
          case 'stop':
            await marketplace.stopRegistryService();
            break;
          case 'status':
            await marketplace.getRegistryServiceStatus();
            break;
          case 'publish':
            const pluginPath = args[3] || process.cwd();
            await marketplace.publishPlugin(pluginPath);
            break;
          default:
            console.log(chalk.yellow('📋 Plugin Registry Commands:'));
            console.log('  start     Start the plugin registry service');
            console.log('  stop      Stop the plugin registry service');
            console.log('  status    Check registry service status');
            console.log('  publish   Publish a plugin to the registry');
        }
        break;
      default:
        console.log(chalk.cyan('🔌 Recoder-Code Plugin System'));
        console.log('');
        console.log(chalk.yellow('📋 PLUGIN COMMANDS:'));
        console.log('  search     Search for plugins');
        console.log('  install    Install a plugin');
        console.log('  uninstall  Remove a plugin');
        console.log('  list       List installed plugins');
        console.log('  update     Update plugins');
        console.log('  registry   Manage plugin registry service');
        console.log('');
        console.log(chalk.yellow('📝 EXAMPLES:'));
        console.log('  recoder-code plugins search "formatter"');
        console.log('  recoder-code plugins install code-formatter');
        console.log('  recoder-code plugins registry start');
        console.log('  recoder-code plugins registry publish ./my-plugin');
    }
    return;
  }

  if (serviceCommands.includes(firstArg)) {
    // Always handle services status even in lite mode
    if (firstArg === 'services') {
      const autoServicesManager = new AutoServicesManager();
      const handled = await autoServicesManager.handleCommand(args[1] || 'status', ...args.slice(2));
      if (handled) return;
    }
    
    // Handle service commands that require full mode
    if (isLiteMode && ['train', 'collab', 'plugins', 'auth'].includes(firstArg)) {
      const featureNames = {
        'train': 'ML Model Training',
        'collab': 'Real-time Collaboration', 
        'plugins': 'Plugin Marketplace',
        'auth': 'User Authentication'
      };
      
      if (liteMode.handleDisabledFeature(firstArg, featureNames[firstArg])) {
        return;
      }
    }
    
    // Handle other service commands with original manager
    if (!isLiteMode) {
      const servicesManager = new ServicesManager();
      const handled = await servicesManager.handleServiceCommand(firstArg, ...args.slice(1));
      if (handled) return;
    }
  }

  // Load user configuration if available
  const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder');
  const configFile = path.join(configDir, 'config.json');
  
  let userConfig = {};
  if (fs.existsSync(configFile)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      // Override config with user settings
      if (userConfig.apiKey && !config.apiKey) {
        config.apiKey = userConfig.apiKey;
      }
      if (userConfig.model) {
        config.model = userConfig.model;
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Warning: Could not load user configuration'));
    }
  }

  // Check for stats command first
  if (args.includes('--stats')) {
    showUsageStats();
    return;
  }

  // Check for progress command
  if (args.includes('--progress')) {
    const discovery = new ProgressiveDiscovery();
    discovery.showProgress();
    return;
  }

  // Handle project management commands
  const projectManager = new ProjectManager();
  
  if (args.includes('--init')) {
    const nameIndex = args.indexOf('--init') + 1;
    const projectName = nameIndex < args.length && !args[nameIndex].startsWith('--') ? args[nameIndex] : null;
    projectManager.initProject({ name: projectName });
    return;
  }
  
  if (args.includes('--init-template')) {
    const templateIndex = args.indexOf('--init-template') + 1;
    if (templateIndex < args.length && !args[templateIndex].startsWith('--')) {
      const templateId = args[templateIndex];
      const nameIndex = templateIndex + 1;
      const projectName = nameIndex < args.length && !args[nameIndex].startsWith('--') ? args[nameIndex] : null;
      projectManager.initProjectFromTemplate(templateId, projectName);
    } else {
      projectManager.showProjectTemplates();
    }
    return;
  }
  
  if (args.includes('--templates')) {
    projectManager.showProjectTemplates();
    return;
  }
  
  if (args.includes('--status')) {
    projectManager.showEnhancedProjectSummary();
    return;
  }
  
  if (args.includes('--plan')) {
    const status = projectManager.getProjectStatus();
    if (status.exists && fs.existsSync(projectManager.planFile)) {
      console.log(fs.readFileSync(projectManager.planFile, 'utf8'));
    } else {
      console.log(chalk.yellow('📂 No project plan found. Run --init to create one.'));
    }
    return;
  }
  
  if (args.includes('--notes')) {
    const status = projectManager.getProjectStatus();
    if (status.exists && fs.existsSync(projectManager.notesFile)) {
      console.log(fs.readFileSync(projectManager.notesFile, 'utf8'));
    } else {
      console.log(chalk.yellow('📂 No project notes found. Run --init to create one.'));
    }
    return;
  }
  
  if (args.includes('--todos')) {
    const todos = projectManager.loadTodos();
    if (todos.items.length > 0 || todos.completed.length > 0) {
      console.log(chalk.bold.cyan('📋 Project Todos'));
      console.log(chalk.gray('═'.repeat(30)));
      
      if (todos.items.length > 0) {
        console.log(chalk.yellow('\\n🔄 Pending:'));
        todos.items.forEach((todo, index) => {
          console.log(chalk.white(`  ${index + 1}. ${todo.text} (${todo.category})`));
        });
      }
      
      if (todos.completed.length > 0) {
        console.log(chalk.green('\\n✅ Completed:'));
        todos.completed.forEach((todo, index) => {
          console.log(chalk.gray(`  ${index + 1}. ${todo.text}`));
        });
      }
    } else {
      console.log(chalk.yellow('📂 No todos found. Run --init to create project.'));
    }
    return;
  }
  
  if (args.includes('--export')) {
    const fullExport = args.includes('--full');
    const forSharing = args.includes('--share');
    
    if (forSharing) {
      const options = {};
      if (args.includes('--no-conversations')) options.includeConversations = false;
      if (args.includes('--include-sensitive')) options.removeSensitive = false;
      projectManager.createShareableExport(options);
    } else {
      projectManager.exportProject(null, fullExport);
    }
    return;
  }
  
  if (args.includes('--import')) {
    const fileIndex = args.indexOf('--import') + 1;
    if (fileIndex < args.length && !args[fileIndex].startsWith('--')) {
      const importFile = args[fileIndex];
      const overwrite = args.includes('--overwrite');
      const collaboratorIndex = args.indexOf('--collaborator');
      const collaboratorName = collaboratorIndex !== -1 && collaboratorIndex + 1 < args.length ? 
        args[collaboratorIndex + 1] : null;
      
      if (collaboratorName) {
        projectManager.importSharedProject(importFile, collaboratorName);
      } else {
        projectManager.importProject(importFile, { overwrite });
      }
    } else {
      console.log(chalk.red('❌ Please specify import file: --import <file>'));
    }
    return;
  }
  
  // Document management commands
  if (args.includes('--doc-create')) {
    const nameIndex = args.indexOf('--doc-create') + 1;
    if (nameIndex < args.length && !args[nameIndex].startsWith('--')) {
      const docName = args[nameIndex];
      projectManager.createDocument(docName);
    } else {
      console.log(chalk.red('❌ Please specify document name: --doc-create <name>'));
    }
    return;
  }
  
  if (args.includes('--doc-list')) {
    const docs = projectManager.listDocuments();
    if (docs.length > 0) {
      console.log(chalk.bold.cyan('📄 Project Documents'));
      console.log(chalk.gray('═'.repeat(30)));
      docs.forEach((doc, index) => {
        console.log(chalk.white(`  ${index + 1}. ${doc}.md`));
      });
    } else {
      console.log(chalk.yellow('📂 No documents found.'));
    }
    return;
  }
  
  if (args.includes('--doc-view')) {
    const nameIndex = args.indexOf('--doc-view') + 1;
    if (nameIndex < args.length && !args[nameIndex].startsWith('--')) {
      const docName = args[nameIndex];
      const content = projectManager.loadDocument(docName);
      if (content) {
        console.log(content);
      } else {
        console.log(chalk.yellow(`📂 Document not found: ${docName}`));
      }
    } else {
      console.log(chalk.red('❌ Please specify document name: --doc-view <name>'));
    }
    return;
  }
  
  if (args.includes('--doc-template')) {
    const nameIndex = args.indexOf('--doc-template') + 1;
    if (nameIndex < args.length && !args[nameIndex].startsWith('--')) {
      const templateName = args[nameIndex];
      await createDocumentFromTemplate(projectManager, templateName);
    } else {
      // Show available templates
      const templateFiles = fs.readdirSync(projectManager.templatesDir).filter(f => f.endsWith('.template'));
      if (templateFiles.length === 0) {
        console.log(chalk.yellow('📂 No templates found. Run --init to create default templates.'));
        return;
      }
      
      console.log(chalk.cyan('📋 Available templates:'));
      templateFiles.forEach((file, index) => {
        const name = file.replace('.template', '');
        console.log(chalk.white(`  ${index + 1}. ${name}`));
      });
    }
    return;
  }
  
  // Session management commands
  if (args.includes('--sessions')) {
    const searchIndex = args.indexOf('--search');
    let searchQuery = null;
    if (searchIndex !== -1 && searchIndex + 1 < args.length) {
      searchQuery = args[searchIndex + 1];
    }
    
    const sessions = searchQuery ? 
      projectManager.searchSessions(searchQuery) : 
      projectManager.listSessions({ limit: 20 });
      
    if (sessions.length > 0) {
      console.log(chalk.bold.cyan(`💾 ${searchQuery ? 'Search Results' : 'Saved Sessions'}`));
      console.log(chalk.gray('═'.repeat(60)));
      if (searchQuery) {
        console.log(chalk.gray(`Search query: "${searchQuery}"\n`));
      }
      
      sessions.forEach(session => {
        console.log(chalk.white(`📅 ${session.id} - ${new Date(session.modified).toLocaleString()}`));
        console.log(chalk.gray(`   Messages: ${session.messageCount} | Model: ${session.model} | Size: ${(session.size / 1024).toFixed(1)}KB`));
        console.log();
      });
    } else {
      console.log(chalk.yellow(searchQuery ? 
        `📂 No sessions found matching "${searchQuery}"` : 
        '📂 No saved sessions found.'
      ));
    }
    return;
  }
  
  if (args.includes('--session-stats')) {
    const stats = projectManager.getSessionStats();
    if (stats.total === 0) {
      console.log(chalk.yellow('📂 No session data available'));
      return;
    }
    
    console.log(chalk.bold.cyan('📊 Session Statistics'));
    console.log(chalk.gray('═'.repeat(40)));
    console.log(chalk.white(`Total Sessions: ${stats.total}`));
    console.log(chalk.white(`Total Messages: ${stats.totalMessages.toLocaleString()}`));
    console.log(chalk.white(`Average Messages: ${stats.averageMessages}`));
    console.log(chalk.white(`Total Storage: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`));
    
    if (stats.dateRange) {
      console.log(chalk.white(`Date Range: ${new Date(stats.dateRange.earliest).toLocaleDateString()} - ${new Date(stats.dateRange.latest).toLocaleDateString()}`));
    }
    
    console.log(chalk.yellow('\\n🤖 Models Used:'));
    Object.entries(stats.models).forEach(([model, count]) => {
      const percentage = ((count / stats.total) * 100).toFixed(1);
      console.log(chalk.white(`  ${model}: ${count} sessions (${percentage}%)`));
    });
    
    return;
  }
  
  if (args.includes('--analytics')) {
    projectManager.showAnalytics();
    return;
  }
  
  if (args.includes('--search')) {
    const queryIndex = args.indexOf('--search') + 1;
    if (queryIndex < args.length && !args[queryIndex].startsWith('--')) {
      const query = args[queryIndex];
      const options = {};
      
      // Parse search options
      if (args.includes('--model')) options.model = args[args.indexOf('--model') + 1];
      if (args.includes('--date-from')) options.dateFrom = args[args.indexOf('--date-from') + 1];
      if (args.includes('--limit')) options.limit = parseInt(args[args.indexOf('--limit') + 1]) || 20;
      if (args.includes('--no-sessions')) options.includeSessions = false;
      if (args.includes('--no-documents')) options.includeDocuments = false;
      if (args.includes('--no-todos')) options.includeTodos = false;
      
      const results = projectManager.performAdvancedSearch(query, options);
      projectManager.showSearchResults(results);
    } else {
      console.log(chalk.red('❌ Please specify search query: --search "your query"'));
      console.log(chalk.gray('Options: --model <model> --date-from <date> --limit <num>'));
      console.log(chalk.gray('Filters: --no-sessions --no-documents --no-todos'));
    }
    return;
  }
  
  if (args.includes('--backup')) {
    const smart = args.includes('--smart');
    const status = args.includes('--status');
    
    if (status) {
      projectManager.showBackupStatus();
      return;
    }
    
    if (smart) {
      const reason = args.includes('--reason') ? args[args.indexOf('--reason') + 1] : 'manual';
      const backupId = projectManager.performSmartBackup(reason);
      if (backupId) {
        console.log(chalk.green(`✅ Smart backup completed: ${backupId}`));
      }
    } else {
      const description = args.includes('--message') ? args[args.indexOf('--message') + 1] : 'Manual backup';
      const backupId = projectManager.createBackup(description);
      if (backupId) {
        console.log(chalk.green(`✅ Backup created successfully: ${backupId}`));
      }
    }
    return;
  }
  
  if (args.includes('--restore')) {
    const idIndex = args.indexOf('--restore') + 1;
    if (idIndex < args.length && !args[idIndex].startsWith('--')) {
      const backupId = args[idIndex];
      const success = projectManager.restoreBackup(backupId);
      if (success) {
        console.log(chalk.green(`✅ Restored from backup: ${backupId}`));
      }
    } else {
      console.log(chalk.red('❌ Please specify backup ID: --restore <id>'));
    }
    return;
  }
  
  if (args.includes('--cleanup')) {
    console.log(chalk.cyan('🧹 Cleaning up old sessions and data...'));
    projectManager.cleanupSessions(10);
    console.log(chalk.green('✅ Cleanup completed'));
    return;
  }
  
  // Model management commands
  if (args.includes('--models')) {
    const recoder = new RecoderCode();
    // Wait a moment for initialization
    setTimeout(() => {
      if (recoder.modelManager) {
        recoder.modelManager.listModels();
      } else {
        console.log(chalk.yellow('⚠️  Model manager not available. Advanced features disabled.'));
      }
    }, 100);
    return;
  }
  
  if (args.includes('--model-info')) {
    const nameIndex = args.indexOf('--model-info') + 1;
    const modelName = nameIndex < args.length && !args[nameIndex].startsWith('--') ? args[nameIndex] : null;
    
    const recoder = new RecoderCode();
    if (recoder.modelManager) {
      recoder.modelManager.displayModelInfo(modelName);
    } else {
      console.log(chalk.yellow('⚠️  Model manager not available.'));
    }
    return;
  }
  
  if (args.includes('--model-picker')) {
    const recoder = new RecoderCode();
    if (recoder.modelManager) {
      await recoder.modelManager.pickModel();
    } else {
      console.log(chalk.yellow('⚠️  Model manager not available.'));
    }
    return;
  }
  
  if (args.includes('--model-switch')) {
    const nameIndex = args.indexOf('--model-switch') + 1;
    if (nameIndex < args.length && !args[nameIndex].startsWith('--')) {
      const modelName = args[nameIndex];
      const recoder = new RecoderCode();
      if (recoder.modelManager) {
        try {
          await recoder.modelManager.switchToModel(modelName, 'user-command');
          console.log(chalk.green(`✅ Switched to model: ${modelName}`));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to switch model: ${error.message}`));
        }
      } else {
        console.log(chalk.yellow('⚠️  Model manager not available.'));
      }
    } else {
      console.log(chalk.red('❌ Please specify model name: --model-switch <name>'));
    }
    return;
  }
  
  if (args.includes('--model-status')) {
    const recoder = new RecoderCode();
    
    console.log(chalk.bold.cyan('\n🤖 Model & System Status\n'));
    
    console.log(chalk.bold('Current Model:'));
    console.log(chalk.white(`  ${recoder.model}`));
    console.log();
    
    if (recoder.modelManager) {
      const currentModel = recoder.modelManager.models.get(recoder.model);
      if (currentModel) {
        console.log(chalk.bold('Model Details:'));
        console.log(chalk.gray(`  Provider: ${currentModel.provider}`));
        console.log(chalk.gray(`  Family: ${currentModel.family}`));
        console.log(chalk.gray(`  Performance: ${currentModel.performance.speed}/${currentModel.performance.quality}/${currentModel.performance.cost}`));
        console.log();
      }
    }
    
    if (recoder.mcpClient) {
      recoder.mcpClient.displayStatus();
    } else {
      console.log(chalk.yellow('⚠️  MCP client not available'));
    }
    
    if (recoder.contextEngine) {
      console.log(chalk.green('✅ Context Engine: Active'));
      console.log(chalk.gray(`   Indexed files: ${recoder.contextEngine.codebaseIndex.size}`));
    } else {
      console.log(chalk.yellow('⚠️  Context Engine: Not available'));
    }
    
    if (recoder.slashCommands) {
      console.log(chalk.green('✅ Slash Commands: Active'));
      console.log(chalk.gray(`   Available commands: ${recoder.slashCommands.commands.size}`));
    } else {
      console.log(chalk.yellow('⚠️  Slash Commands: Not available'));
    }
    
    return;
  }
  
  // Rules and task management commands
  if (args.includes('--rules-status')) {
    const recoder = new RecoderCode();
    if (recoder.rulesEngine) {
      recoder.rulesEngine.displayRulesStatus();
    } else {
      console.log(chalk.yellow('⚠️  Rules engine not available'));
    }
    return;
  }
  
  if (args.includes('--task-status')) {
    const recoder = new RecoderCode();
    if (recoder.taskManager) {
      recoder.taskManager.displayTaskStatus();
    } else {
      console.log(chalk.yellow('⚠️  Task manager not available'));
    }
    return;
  }
  
  if (args.includes('--task-create')) {
    const templateIndex = args.indexOf('--task-create') + 1;
    if (templateIndex < args.length && !args[templateIndex].startsWith('--')) {
      const template = args[templateIndex];
      const recoder = new RecoderCode();
      if (recoder.taskManager) {
        try {
          const taskId = recoder.taskManager.createTaskFromTemplate(template, {
            name: `Manual Task: ${template}`,
            mode: 'manual',
            creator: 'cli'
          });
          console.log(chalk.green(`✅ Created task: ${taskId}`));
          console.log(chalk.gray('Use --task-status to see task details'));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to create task: ${error.message}`));
        }
      } else {
        console.log(chalk.yellow('⚠️  Task manager not available'));
      }
    } else {
      console.log(chalk.red('❌ Please specify task template: --task-create <template>'));
      console.log(chalk.gray('Available templates: code-review, feature-development, bug-fix, deployment, security-audit, performance-optimization'));
    }
    return;
  }
  
  if (args.includes('--dev-tools-status')) {
    const recoder = new RecoderCode();
    if (recoder.devTools) {
      recoder.devTools.displayIntegrationStatus();
    } else {
      console.log(chalk.yellow('⚠️  Development tools integration not available'));
    }
    return;
  }
  
  // Workspace management commands
  if (args.includes('--workspaces')) {
    projectManager.showWorkspaces();
    return;
  }
  
  if (args.includes('--workspace')) {
    const idIndex = args.indexOf('--workspace') + 1;
    if (idIndex < args.length && !args[idIndex].startsWith('--')) {
      const workspaceId = args[idIndex];
      projectManager.switchToWorkspace(workspaceId);
    } else {
      projectManager.showWorkspaces();
    }
    return;
  }
  
  if (args.includes('--register-workspace')) {
    const nameIndex = args.indexOf('--register-workspace') + 1;
    const alias = nameIndex < args.length && !args[nameIndex].startsWith('--') ? args[nameIndex] : null;
    projectManager.registerWorkspace(alias);
    return;
  }
  
  if (args.includes('--unregister')) {
    const idIndex = args.indexOf('--unregister') + 1;
    if (idIndex < args.length && !args[idIndex].startsWith('--')) {
      const workspaceId = args[idIndex];
      projectManager.unregisterWorkspace(workspaceId);
    } else {
      console.log(chalk.red('❌ Please specify workspace ID: --unregister <id>'));
    }
    return;
  }
  
  // Vision analysis commands
  if (args.includes('--analyze-image')) {
    const pathIndex = args.indexOf('--analyze-image') + 1;
    if (pathIndex < args.length && !args[pathIndex].startsWith('--')) {
      const imagePath = args[pathIndex];
      const templateIndex = args.indexOf('--template');
      const template = templateIndex !== -1 && templateIndex + 1 < args.length ? args[templateIndex + 1] : 'auto-detect';
      
      const recoder = new RecoderCode();
      if (recoder.visionAnalyzer) {
        try {
          await recoder.visionAnalyzer.analyzeImage(imagePath, template, {
            detailed: args.includes('--detailed'),
            generateCode: args.includes('--code'),
            focus: args.includes('--focus') ? args[args.indexOf('--focus') + 1] : null
          });
          console.log(chalk.green('✅ Image analysis completed'));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to analyze image: ${error.message}`));
        }
      } else {
        console.log(chalk.yellow('⚠️  Vision analyzer not available'));
      }
    } else {
      console.log(chalk.red('❌ Please specify image path: --analyze-image <path>'));
      console.log(chalk.gray('Options: --template <type> --detailed --code --focus <area>'));
    }
    return;
  }
  
  if (args.includes('--vision-templates')) {
    const recoder = new RecoderCode();
    if (recoder.visionAnalyzer) {
      recoder.visionAnalyzer.listTemplates();
    } else {
      console.log(chalk.yellow('⚠️  Vision analyzer not available'));
    }
    return;
  }
  
  if (args.includes('--vision-history')) {
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 && limitIndex + 1 < args.length ? parseInt(args[limitIndex + 1]) : 10;
    
    const recoder = new RecoderCode();
    if (recoder.visionAnalyzer) {
      recoder.visionAnalyzer.showHistory(limit);
    } else {
      console.log(chalk.yellow('⚠️  Vision analyzer not available'));
    }
    return;
  }
  
  if (args.includes('--batch-analyze')) {
    const dirIndex = args.indexOf('--batch-analyze') + 1;
    if (dirIndex < args.length && !args[dirIndex].startsWith('--')) {
      const dirPath = args[dirIndex];
      const templateIndex = args.indexOf('--template');
      const template = templateIndex !== -1 && templateIndex + 1 < args.length ? args[templateIndex + 1] : 'auto-detect';
      
      const recoder = new RecoderCode();
      if (recoder.visionAnalyzer) {
        try {
          // Find all image files in directory
          if (!fs.existsSync(dirPath)) {
            console.log(chalk.red(`❌ Directory not found: ${dirPath}`));
            return;
          }
          
          const files = fs.readdirSync(dirPath)
            .filter(file => recoder.visionAnalyzer.supportedFormats.includes(path.extname(file).toLowerCase()))
            .map(file => path.join(dirPath, file));
          
          if (files.length === 0) {
            console.log(chalk.yellow(`⚠️  No supported image files found in: ${dirPath}`));
            console.log(chalk.gray(`Supported formats: ${recoder.visionAnalyzer.supportedFormats.join(', ')}`));
            return;
          }
          
          await recoder.visionAnalyzer.batchAnalyze(files, template, {
            detailed: args.includes('--detailed'),
            generateCode: args.includes('--code')
          });
          console.log(chalk.green('✅ Batch analysis completed'));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to perform batch analysis: ${error.message}`));
        }
      } else {
        console.log(chalk.yellow('⚠️  Vision analyzer not available'));
      }
    } else {
      console.log(chalk.red('❌ Please specify directory path: --batch-analyze <dir>'));
      console.log(chalk.gray('Options: --template <type> --detailed --code'));
    }
    return;
  }

  // Parse CLI flags
  let useAutoRouter = false;
  let customModel = null;
  let providerSort = null;
  let enableStreaming = false;
  let resumeSessionId = null;
  let prompt = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--auto') {
      useAutoRouter = true;
    } else if (arg === '--model' && i + 1 < args.length) {
      customModel = args[i + 1];
      i++; // Skip next argument
    } else if (arg === '--resume' && i + 1 < args.length) {
      resumeSessionId = args[i + 1];
      i++; // Skip next argument
    } else if (arg === '--fast') {
      providerSort = 'throughput';
    } else if (arg === '--cheap') {
      providerSort = 'price';
    } else if (arg === '--stream') {
      enableStreaming = true;
    } else if (!arg.startsWith('--')) {
      prompt += (prompt ? ' ' : '') + arg;
    }
  }

  if (!prompt) {
    console.error(chalk.red('❌ Error: No prompt provided'));
    console.log(chalk.yellow('💡 Usage examples:'));
    console.log(chalk.white('  recoder-code "Hello, how can you help me?"'));
    console.log(chalk.white('  recoder-code --help'));
    console.log(chalk.white('  recoder-code --setup'));
    console.log(chalk.gray('\nFor interactive mode, run: recoder-code'));
    process.exit(1);
  }

  // Check if setup is needed and offer to run it
  const SimpleSetup = require('./simple-setup.js');
  if (!config.apiKey && !userConfig.apiKey) {
    console.log(chalk.bold.yellow('\n🔧 First time using Recoder-Code?'));
    console.log(chalk.white('Let\'s get you set up in 30 seconds!'));
    console.log(chalk.gray('\nRun: recoder-code --setup'));
    console.log(chalk.gray('Or set: export OPENROUTER_API_KEY=your_key_here\n'));
    process.exit(1);
  }

  const recoder = new RecoderCode();
  
  // Override model if specified
  if (customModel) {
    recoder.model = customModel;
  }
  
  // Override provider sort if specified
  if (providerSort) {
    config.providerPreferences.sort = providerSort;
  }
  
  try {
    if (resumeSessionId) {
      console.log(chalk.cyan(`🔄 Resuming session: ${resumeSessionId}`));
    }
    console.log('🤖 Recoder Code is working on your request...\n');
    const response = await recoder.processConversation(prompt, useAutoRouter, enableStreaming, resumeSessionId);
    
    // Track streaming usage
    if (enableStreaming) {
      recoder.progressiveDiscovery.trackAction('streaming-used');
    }
    
    // Only print the response if streaming is disabled (streaming prints in real-time)
    if (!enableStreaming) {
      console.log(response);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { RecoderCode };