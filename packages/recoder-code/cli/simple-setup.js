/**
 * Simple Setup - Minimal first-run experience
 * Gets users chatting with AI in under 30 seconds
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const SmartDefaults = require('./smart-defaults.js');

class SimpleSetup {
  constructor() {
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.smartDefaults = new SmartDefaults();
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Run the simplified setup process
   */
  async run() {
    try {
      console.clear();
      this.showWelcome();
      
      // Check if user already has config
      if (this.hasExistingConfig()) {
        const shouldReconfigure = await this.askReconfigure();
        if (!shouldReconfigure) {
          console.log(chalk.green('✅ Using existing configuration'));
          this.rl.close();
          return;
        }
      }
      
      // Step 1: Get API key (only required step)
      const apiKey = await this.getApiKey();
      
      // Step 2: Create smart configuration
      const config = await this.smartDefaults.createSmartDefaults();
      
      // Step 3: Save API key to environment
      await this.saveApiKey(apiKey);
      
      // Step 4: Show next steps
      this.showCompletion(config);
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Setup failed: ${error.message}`));
      console.log(chalk.gray('You can retry setup anytime with: recoder-code --setup'));
    } finally {
      this.rl.close();
    }
  }

  /**
   * Show welcome message
   */
  showWelcome() {
    console.log(chalk.bold.cyan('🚀 Welcome to Recoder-Code!'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white('The AI development platform that grows with you.\n'));
    
    console.log(chalk.green('✨ What you\'ll get:'));
    console.log(chalk.white('   • Chat with 32+ AI models'));
    console.log(chalk.white('   • Create and edit files'));  
    console.log(chalk.white('   • Build complete projects'));
    console.log(chalk.white('   • Free models included!\n'));
    
    console.log(chalk.cyan('⏱️  Setup takes less than 30 seconds.\n'));
  }

  /**
   * Check if user has existing configuration
   */
  hasExistingConfig() {
    const configFile = path.join(this.configDir, 'config.json');
    return fs.existsSync(configFile);
  }

  /**
   * Ask if user wants to reconfigure
   */
  async askReconfigure() {
    const answer = await this.question(
      chalk.yellow('🔧 Configuration already exists. Reconfigure? (y/N): ')
    );
    return answer.toLowerCase().startsWith('y');
  }

  /**
   * Get OpenRouter API key from user
   */
  async getApiKey() {
    console.log(chalk.bold.blue('🔐 API Key Setup'));
    console.log(chalk.gray('─'.repeat(20)));
    console.log(chalk.white('You need an OpenRouter API key to access AI models.'));
    console.log(chalk.cyan('🆓 Get your FREE key at: https://openrouter.ai/keys\n'));
    
    while (true) {
      const apiKey = await this.question(chalk.yellow('Enter your OpenRouter API key: '));
      
      if (!apiKey || apiKey.trim().length === 0) {
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
   * Save API key to environment file
   */
  async saveApiKey(apiKey) {
    try {
      // Create config directory
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      
      const envFile = path.join(this.configDir, '.env');
      const envContent = `# Recoder-Code Environment Configuration
# Generated on ${new Date().toISOString()}

OPENROUTER_API_KEY=${apiKey}
OPENROUTER_SITE_NAME=Recoder-Code
OPENROUTER_SITE_URL=https://github.com/recoder-code/recoder-code

# Advanced settings (optional)
# OPENROUTER_MODEL=anthropic/claude-sonnet-4
# OPENROUTER_SORT=throughput
# RECODER_LITE_MODE=false
`;
      
      fs.writeFileSync(envFile, envContent);
      console.log(chalk.green('✅ API key saved securely'));
    } catch (error) {
      throw new Error(`Failed to save API key: ${error.message}`);
    }
  }

  /**
   * Show completion message with next steps
   */
  showCompletion(config) {
    console.log(chalk.bold.green('\n🎉 Setup Complete!'));
    console.log(chalk.gray('─'.repeat(30)));
    
    if (config.mode === 'lite') {
      console.log(chalk.cyan('🚀 Running in Lite Mode'));
      console.log(chalk.gray('   Perfect for getting started!'));
    } else {
      console.log(chalk.cyan('🏢 Full Platform Mode'));
      console.log(chalk.gray('   All features enabled!'));
    }
    
    console.log(chalk.bold.yellow('\n⚡ Try these commands:'));
    console.log(chalk.white('   recoder-code                    # Start interactive chat'));
    console.log(chalk.white('   recoder-code "Hello world"      # One-shot command'));
    console.log(chalk.white('   recoder-code --help             # See all options'));
    
    if (config.mode === 'lite') {
      console.log(chalk.bold.cyan('\n🔧 Enable More Features:'));
      console.log(chalk.white('   recoder-code --enable-services  # Enable collaboration & ML training'));
    }
    
    console.log(chalk.bold.blue('\n📚 Learn More:'));
    console.log(chalk.white('   • GitHub: https://github.com/recoder-code/recoder-code'));
    console.log(chalk.white('   • Models: https://openrouter.ai/models'));
    console.log(chalk.white('   • Docs: Run recoder-code --help'));
    
    console.log(chalk.green('\n🚀 Happy coding with AI!\n'));
  }

  /**
   * Prompt user for input
   */
  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  /**
   * Quick setup for CI/automated environments
   */
  static async quickSetup(apiKey) {
    if (!apiKey) {
      throw new Error('API key required for quick setup');
    }
    
    const setup = new SimpleSetup();
    
    // Create smart defaults
    const config = await setup.smartDefaults.createSmartDefaults();
    
    // Save API key
    await setup.saveApiKey(apiKey);
    
    console.log(chalk.green('✅ Quick setup completed'));
    console.log(chalk.gray(`   Mode: ${config.mode}`));
    console.log(chalk.gray(`   Model: ${config.openrouter.defaultModel}`));
    
    return config;
  }

  /**
   * Check if setup is needed
   */
  static isSetupNeeded() {
    const configDir = path.join(os.homedir(), '.recoder-code');
    const envFile = path.join(configDir, '.env');
    const configFile = path.join(configDir, 'config.json');
    
    // Setup is needed if either file is missing
    return !fs.existsSync(envFile) || !fs.existsSync(configFile);
  }

  /**
   * Load configuration for use
   */
  static loadConfig() {
    const configDir = path.join(os.homedir(), '.recoder-code');
    const envFile = path.join(configDir, '.env');
    const configFile = path.join(configDir, 'config.json');
    
    let config = {};
    let env = {};
    
    // Load .env file
    if (fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const envLines = envContent.split('\n');
      
      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            env[key] = valueParts.join('=');
            process.env[key] = valueParts.join('=');
          }
        }
      }
    }
    
    // Load config file
    if (fs.existsSync(configFile)) {
      try {
        config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      } catch (error) {
        console.log(chalk.yellow('⚠️  Could not load configuration file'));
      }
    }
    
    return { config, env };
  }
}

module.exports = SimpleSetup;