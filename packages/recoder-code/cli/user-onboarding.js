#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * User Onboarding for Recoder Code
 * Handles first-time user setup with proper welcome flow
 */
class UserOnboarding {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.configDir = path.join(require('os').homedir(), '.recoder-code');
    this.configFile = path.join(this.configDir, 'config.json');
    this.defaultConfig = {
      apiKey: '',
      model: 'deepseek/deepseek-chat-v3.1:free',
      userName: '',
      setupCompleted: false,
      firstRun: true
    };
  }

  /**
   * Show ASCII logo and welcome message
   */
  showWelcome() {
    console.clear();
    console.log(chalk.cyan(`
██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗ 
██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗
██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗  ██████╔╝
██╔══██╗██╔══╝  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗
██║  ██║███████╗╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║
╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
                                                           
    `));
    
    console.log(chalk.white.bold('Welcome to Recoder Code v2.2.3'));
    console.log(chalk.gray('Your AI-powered development companion\n'));
  }

  /**
   * Check if user needs onboarding
   */
  needsOnboarding() {
    if (!fs.existsSync(this.configFile)) {
      return true;
    }
    
    try {
      const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      return !config.setupCompleted || !config.apiKey;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get user's name
   */
  async getUserName() {
    return new Promise((resolve) => {
      this.rl.question(chalk.cyan('👋 What\'s your name? '), (name) => {
        resolve(name.trim() || 'Developer');
      });
    });
  }

  /**
   * Test API key validity
   */
  async testApiKey(apiKey) {
    try {
      const https = require('https');

      return new Promise((resolve) => {
        const options = {
          hostname: 'openrouter.ai',
          port: 443,
          path: '/api/v1/models',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        };

        const req = https.request(options, (res) => {
          resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });

        req.end();
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Get API key from user
   */
  async getApiKey() {
    console.log(chalk.yellow('\n🔑 API Key Setup'));
    console.log(chalk.white('To use Recoder Code, you need an API key from OpenRouter.'));
    console.log(chalk.gray('💡 Get your free API key at: https://openrouter.ai/keys\n'));

    while (true) {
      const apiKey = await new Promise((resolve) => {
        this.rl.question(chalk.cyan('Enter your OpenRouter API key: '), (answer) => {
          resolve(answer.trim());
        });
      });

      if (!apiKey || apiKey.length === 0) {
        console.log(chalk.red('❌ API key cannot be empty\n'));
        continue;
      }

      if (!apiKey.startsWith('sk-or-v1-')) {
        console.log(chalk.red('❌ Invalid format. OpenRouter keys start with "sk-or-v1-"\n'));
        continue;
      }

      // Test the API key
      console.log(chalk.gray('🔄 Testing API key...'));
      const isValid = await this.testApiKey(apiKey);

      if (isValid) {
        console.log(chalk.green('✅ API key is valid!\n'));
        return apiKey;
      } else {
        console.log(chalk.red('❌ API key test failed. Please check and try again.\n'));
      }
    }
  }

  /**
   * Show model selection
   */
  async selectModel() {
    console.log(chalk.yellow('\n🤖 Model Selection'));
    console.log(chalk.white('Choose your preferred AI model:'));
    console.log(chalk.gray('1. DeepSeek Chat v3.1 (Free) - Recommended for most users'));
    console.log(chalk.gray('2. Claude 3.5 Sonnet - Advanced reasoning and coding'));
    console.log(chalk.gray('3. GPT-4 Turbo - OpenAI\'s latest model'));
    console.log(chalk.gray('4. Custom model - Enter your own model name\n'));
    
    return new Promise((resolve) => {
      this.rl.question(chalk.cyan('Select option (1-4) [1]: '), (choice) => {
        switch (choice.trim() || '1') {
          case '1':
            resolve('deepseek/deepseek-chat-v3.1:free');
            break;
          case '2':
            resolve('anthropic/claude-3.5-sonnet');
            break;
          case '3':
            resolve('openai/gpt-4-turbo');
            break;
          case '4':
            this.rl.question(chalk.cyan('Enter custom model name: '), (customModel) => {
              resolve(customModel.trim() || 'deepseek/deepseek-chat-v3.1:free');
            });
            break;
          default:
            resolve('deepseek/deepseek-chat-v3.1:free');
        }
      });
    });
  }

  /**
   * Save configuration
   */
  saveConfig(config) {
    try {
      // Create config directory if it doesn't exist
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      // Save configuration
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to save configuration: ${error.message}`));
      return false;
    }
  }

  /**
   * Load existing configuration
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      }
    } catch (error) {
      // Return default if config can't be loaded
    }
    return { ...this.defaultConfig };
  }

  /**
   * Show setup completion
   */
  showCompletion(userName, model) {
    console.log(chalk.green('\n✅ Setup Complete!'));
    console.log(chalk.white(`Welcome aboard, ${userName}! 🎉`));
    console.log(chalk.gray(`Model: ${model}`));
    console.log(chalk.gray('Configuration saved to ~/.recoder-code/config.json\n'));
    
    console.log(chalk.cyan('🚀 Quick Start:'));
    console.log(chalk.white('• Type your questions or requests'));
    console.log(chalk.white('• Use /help for available commands'));
    console.log(chalk.white('• Press Ctrl+C to exit anytime\n'));
  }

  /**
   * Run complete onboarding flow
   */
  async runOnboarding() {
    this.showWelcome();

    const userName = await this.getUserName();

    // Check if API key already exists in .env file
    const envFile = path.join(require('os').homedir(), '.recoder-code', '.env');
    let apiKey = null;

    if (fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const match = envContent.match(/OPENROUTER_API_KEY=(.+)/);
      if (match && match[1] && match[1].startsWith('sk-or-v1-')) {
        apiKey = match[1].trim();
        console.log(chalk.green('\n✅ Found existing API key in .env file'));
        console.log(chalk.gray('   Using: ' + apiKey.substring(0, 20) + '...'));
      }
    }

    if (!apiKey) {
      apiKey = await this.getApiKey();
    }
    
    if (!apiKey) {
      console.log(chalk.red('\n❌ API key is required to use Recoder Code.'));
      console.log(chalk.yellow('Get your free key at: https://openrouter.ai/keys'));
      this.rl.close();
      process.exit(1);
    }
    
    const model = await this.selectModel();
    
    const config = {
      ...this.defaultConfig,
      apiKey,
      model,
      userName,
      setupCompleted: true,
      firstRun: false,
      setupDate: new Date().toISOString()
    };
    
    if (this.saveConfig(config)) {
      this.showCompletion(userName, model);
    } else {
      console.log(chalk.red('\n❌ Setup failed. Please try again.'));
      this.rl.close();
      process.exit(1);
    }
    
    // Set environment variables for immediate use
    process.env.OPENROUTER_API_KEY = config.apiKey;
    process.env.OPENROUTER_MODEL = config.model;
    process.env.RECODER_USER_MODE = 'true'; // Suppress technical messages
    
    this.rl.close();
    return config;
  }

  /**
   * Quick start for returning users
   */
  async quickStart() {
    const config = this.loadConfig();
    
    if (!config.setupCompleted || !config.apiKey) {
      return await this.runOnboarding();
    }
    
    // Show welcome for returning users
    this.showWelcome();
    console.log(chalk.green(`Welcome back, ${config.userName || 'Developer'}! 👋`));
    console.log(chalk.gray(`Using model: ${config.model}\n`));
    
    // Set environment variables for immediate use
    process.env.OPENROUTER_API_KEY = config.apiKey;
    process.env.OPENROUTER_MODEL = config.model;
    process.env.RECODER_USER_MODE = 'true'; // Suppress technical messages
    
    return config;
  }

  /**
   * Close readline interface
   */
  close() {
    this.rl.close();
  }
}

module.exports = UserOnboarding;