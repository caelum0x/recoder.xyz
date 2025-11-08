#!/usr/bin/env node
/**
 * Recoder Code - AI Development Platform
 * Production-ready main entry point for programmatic usage
 * 
 * For CLI usage: Use `recoder-code` command
 * For programmatic usage: require('recoder-code')
 */

const path = require('path');
const config = require('./config.js');

// Handle chalk properly for production
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

// Initialize unified error handling
const UnifiedErrorHandler = require('./cli/unified-error-handler.js');
const errorHandler = UnifiedErrorHandler.instance;

// Only initialize in non-test environments
if (process.env.NODE_ENV !== 'test') {
  errorHandler.initialize();
}

// Main RecoderCode class for programmatic usage
class RecoderCode {
  constructor(options = {}) {
    this.config = { ...config, ...options };
    this.initialized = false;
  }

  // Initialize the platform
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Dynamic import of CLI functionality
      const { RecoderCode: CLIRecoderCode } = require('./cli/run.js');
      this.cliInstance = new CLIRecoderCode();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Recoder Code:', error.message);
      throw error;
    }
  }

  // Process a conversation programmatically
  async chat(message, options = {}) {
    if (!this.initialized) await this.initialize();
    
    try {
      return await this.cliInstance.processConversation(
        message, 
        options.useAutoRouter, 
        options.enableStreaming, 
        options.sessionId
      );
    } catch (error) {
      console.error('Chat failed:', error.message);
      throw error;
    }
  }

  // Setup the platform programmatically
  async setup(apiKey) {
    const SimpleSetup = require('./cli/simple-setup.js');
    const setup = new SimpleSetup();
    
    if (apiKey) {
      return await SimpleSetup.quickSetup(apiKey);
    } else {
      return await setup.run();
    }
  }

  // Get available models
  async getModels() {
    if (!this.initialized) await this.initialize();
    const ModelManager = require('./cli/model-manager.js');
    const modelManager = new ModelManager();
    return await modelManager.listModels();
  }

  // Check services status
  async getServicesStatus() {
    const AutoServicesManager = require('./cli/auto-services.js');
    const serviceManager = new AutoServicesManager();
    return await serviceManager.getServicesStatus();
  }

  // Get user progress
  getUserProgress() {
    const ProgressiveDiscovery = require('./cli/progressive-discovery.js');
    const discovery = new ProgressiveDiscovery();
    return discovery.getProgressSummary();
  }

  // Todo management
  async getTodoManager() {
    const TodoManager = require('./cli/todo-manager.js');
    return new TodoManager({ user: this.currentUser || 'developer' });
  }

  // Production health check
  async healthCheck() {
    const checks = {
      dependencies: false,
      configuration: false,
      services: false,
      todos: false
    };

    try {
      // Check dependencies
      require('chalk');
      require('openai');
      checks.dependencies = true;
    } catch (error) {
      console.error('Dependency check failed:', error.message);
    }

    try {
      // Check configuration
      const config = require('./config.js');
      checks.configuration = !!config;
    } catch (error) {
      console.error('Configuration check failed:', error.message);
    }

    try {
      // Check services
      const status = await this.getServicesStatus();
      checks.services = true;
    } catch (error) {
      console.error('Services check failed:', error.message);
    }

    try {
      // Check todo system
      const todoManager = await this.getTodoManager();
      checks.todos = true;
    } catch (error) {
      console.error('Todo system check failed:', error.message);
    }

    return checks;
  }
}

// Legacy compatibility - simple OpenAI client function
async function legacyMain() {
  try {
    // Check if API key is configured
    if (!config.openRouterApiKey) {
      console.log(chalk.yellow('⚠️  No API key configured.'));
      console.log(chalk.white('To configure: export OPENROUTER_API_KEY="your-key"'));
      console.log(chalk.white('Or run: recoder-code setup'));
      return;
    }

    const OpenAI = require('openai');
    
    const openai = new OpenAI({
      baseURL: config.apiUrl,
      apiKey: config.openRouterApiKey,
      defaultHeaders: {
        'HTTP-Referer': config.siteUrl || 'https://recoder.xyz',
        'X-Title': config.siteName || 'Recoder-Code',
      },
    });

    const completion = await openai.chat.completions.create({
      model: config.model || 'deepseek/deepseek-chat',
      messages: [
        {
          role: 'user',
          content: 'What is the meaning of life?',
        },
      ],
    });

    console.log(completion.choices[0].message.content);
  } catch (error) {
    console.error(chalk.red('❌ API request failed:'), error.message);
    if (error.message.includes('credentials') || error.message.includes('apiKey')) {
      console.log(chalk.yellow('💡 Tip: Set your API key with: export OPENROUTER_API_KEY="your-key"'));
    }
  }
}

// Export for programmatic usage
module.exports = RecoderCode;

// If called directly (legacy compatibility)
if (require.main === module) {
  console.log('🚀 Recoder Code v2.0.0');
  console.log('For interactive usage: run "recoder-code" command');
  console.log('For programmatic usage: const RecoderCode = require("recoder-code")');
  console.log('');
  console.log('Running legacy demo...');
  legacyMain();
}
