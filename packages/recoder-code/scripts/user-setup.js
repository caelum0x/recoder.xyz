#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class UserSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.config = {
      version: '2.0.0',
      apiKey: '',
      model: 'anthropic/claude-sonnet-4',
      maxTokens: 4096,
      temperature: 0.7,
      setup_completed: false,
      user_preferences: {
        streaming: true,
        auto_save: true,
        verbose_logging: false
      }
    };
  }

  log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  async welcome() {
    console.clear();
    this.log('🚀 Welcome to Recoder Code Setup!', 'cyan');
    this.log('===============================', 'cyan');
    this.log('');
    this.log('This setup wizard will help you configure Recoder Code for optimal use.', 'bright');
    this.log('');
    
    const ready = await this.question('Ready to begin? (y/n): ');
    if (ready.toLowerCase() !== 'y') {
      this.log('Setup cancelled. You can run this again anytime with: npm run setup', 'yellow');
      process.exit(0);
    }
  }

  async checkSystemRequirements() {
    this.log('🔍 Checking system requirements...', 'blue');
    
    try {
      const { stdout: nodeVersion } = await execAsync('node --version');
      this.log(`✅ Node.js ${nodeVersion.trim()} detected`, 'green');
      
      const { stdout: npmVersion } = await execAsync('npm --version');
      this.log(`✅ npm ${npmVersion.trim()} detected`, 'green');
      
      // Check if OpenRouter is accessible
      try {
        await execAsync('curl -s https://openrouter.ai > /dev/null');
        this.log('✅ OpenRouter API accessible', 'green');
      } catch {
        this.log('⚠️  Could not verify OpenRouter API access', 'yellow');
      }
      
    } catch (error) {
      this.log('❌ System requirements check failed', 'red');
      throw error;
    }
  }

  async setupApiKey() {
    this.log('');
    this.log('🔑 API Key Configuration', 'blue');
    this.log('========================', 'blue');
    this.log('');
    this.log('Recoder Code uses OpenRouter to access multiple AI models.');
    this.log('You can get a free API key at: https://openrouter.ai/keys');
    this.log('');

    const hasKey = await this.question('Do you have an OpenRouter API key? (y/n): ');
    
    if (hasKey.toLowerCase() === 'y') {
      const apiKey = await this.question('Enter your OpenRouter API key: ');
      
      if (apiKey.trim()) {
        this.config.apiKey = apiKey.trim();
        
        // Test the API key
        this.log('🧪 Testing API key...', 'blue');
        try {
          // Simple test by trying to validate config
          process.env.OPENROUTER_API_KEY = apiKey.trim();
          await execAsync('node validate.js');
          this.log('✅ API key is valid!', 'green');
        } catch {
          this.log('⚠️  API key validation failed, but continuing setup...', 'yellow');
        }
      } else {
        this.log('⚠️  No API key provided. You can add it later.', 'yellow');
      }
    } else {
      this.log('');
      this.log('📝 No problem! Here\'s how to get started:', 'yellow');
      this.log('1. Visit: https://openrouter.ai/keys', 'yellow');
      this.log('2. Sign up for a free account', 'yellow');
      this.log('3. Generate an API key', 'yellow');
      this.log('4. Run: recoder-code --setup to configure it', 'yellow');
    }
  }

  async selectModel() {
    this.log('');
    this.log('🤖 Model Selection', 'blue');
    this.log('==================', 'blue');
    this.log('');
    
    const models = [
      { name: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4', description: 'Latest Claude model (Recommended)' },
      { name: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet', description: 'Fast and capable' },
      { name: 'GPT-4', value: 'openai/gpt-4', description: 'OpenAI\'s flagship model' },
      { name: 'GPT-3.5 Turbo', value: 'openai/gpt-3.5-turbo', description: 'Fast and cost-effective' }
    ];

    this.log('Available models:');
    models.forEach((model, index) => {
      this.log(`${index + 1}. ${model.name} - ${model.description}`, 'cyan');
    });
    this.log('');

    const choice = await this.question('Select a model (1-4, or press Enter for default): ');
    const modelIndex = parseInt(choice) - 1;
    
    if (modelIndex >= 0 && modelIndex < models.length) {
      this.config.model = models[modelIndex].value;
      this.log(`✅ Selected: ${models[modelIndex].name}`, 'green');
    } else {
      this.log(`✅ Using default: Claude Sonnet 4`, 'green');
    }
  }

  async configurePreferences() {
    this.log('');
    this.log('⚙️  User Preferences', 'blue');
    this.log('===================', 'blue');
    this.log('');

    // Streaming preference
    const streaming = await this.question('Enable streaming responses for faster feedback? (Y/n): ');
    this.config.user_preferences.streaming = streaming.toLowerCase() !== 'n';

    // Auto-save preference  
    const autoSave = await this.question('Auto-save conversations and sessions? (Y/n): ');
    this.config.user_preferences.auto_save = autoSave.toLowerCase() !== 'n';

    // Verbose logging
    const verbose = await this.question('Enable verbose logging for debugging? (y/N): ');
    this.config.user_preferences.verbose_logging = verbose.toLowerCase() === 'y';

    // Temperature setting
    const tempChoice = await this.question('Set creativity level - Lower=focused, Higher=creative (0.1-2.0, default 0.7): ');
    const temperature = parseFloat(tempChoice);
    if (!isNaN(temperature) && temperature >= 0.1 && temperature <= 2.0) {
      this.config.temperature = temperature;
    }

    this.log('✅ Preferences configured', 'green');
  }

  async saveConfiguration() {
    this.log('');
    this.log('💾 Saving configuration...', 'blue');

    // Create config directory
    const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder-code');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save main config
    const configPath = path.join(configDir, 'config.json');
    this.config.setup_completed = true;
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));

    // Create environment file template
    const envPath = path.join(configDir, '.env.template');
    const envContent = `# Recoder Code Environment Variables
OPENROUTER_API_KEY=${this.config.apiKey || 'your_api_key_here'}
OPENROUTER_MODEL=${this.config.model}
OPENROUTER_SITE_NAME=Recoder Code
OPENROUTER_SITE_URL=https://github.com/anthropics/claude-code

# Optional: Provider preferences
OPENROUTER_SORT=throughput
OPENROUTER_ALLOW_FALLBACKS=true
`;
    fs.writeFileSync(envPath, envContent);

    this.log('✅ Configuration saved to: ' + configDir, 'green');
  }

  async runFinalTests() {
    this.log('');
    this.log('🧪 Running final tests...', 'blue');

    try {
      // Test basic CLI functionality
      const { stdout } = await execAsync('node cli/run.js --version');
      this.log('✅ CLI functionality test passed', 'green');

      // Test configuration validation
      if (this.config.apiKey) {
        process.env.OPENROUTER_API_KEY = this.config.apiKey;
        await execAsync('node validate.js');
        this.log('✅ Configuration validation passed', 'green');
      }
    } catch (error) {
      this.log('⚠️  Some tests failed, but basic setup is complete', 'yellow');
    }
  }

  async showCompletionMessage() {
    this.log('');
    this.log('🎉 Setup Complete!', 'green');
    this.log('==================', 'green');
    this.log('');
    this.log('Recoder Code is now ready to use!', 'bright');
    this.log('');
    this.log('Quick start commands:', 'blue');
    this.log('• recoder-code --help                    # Show help', 'cyan');
    this.log('• recoder-code "your prompt here"        # One-shot mode', 'cyan');
    this.log('• recoder-code                           # Interactive mode', 'cyan');
    this.log('');
    this.log('Configuration saved to:', 'blue');
    this.log(path.join(process.env.HOME || process.env.USERPROFILE, '.recoder-code'), 'cyan');
    this.log('');
    this.log('Need help? Check out:', 'blue');
    this.log('• README.md for detailed documentation', 'cyan');
    this.log('• examples/ directory for usage examples', 'cyan');
    this.log('• https://github.com/anthropics/claude-code', 'cyan');
  }

  async run() {
    try {
      await this.welcome();
      await this.checkSystemRequirements();
      await this.setupApiKey();
      await this.selectModel();
      await this.configurePreferences();
      await this.saveConfiguration();
      await this.runFinalTests();
      await this.showCompletionMessage();
    } catch (error) {
      this.log('❌ Setup failed: ' + error.message, 'red');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new UserSetup();
  setup.run().catch(console.error);
}

module.exports = UserSetup;