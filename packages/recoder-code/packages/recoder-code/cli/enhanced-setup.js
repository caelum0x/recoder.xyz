#!/usr/bin/env node

const inquirer = require('inquirer');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;;
const fs = require('fs');
const path = require('path');

class RecoderSetupWizard {
  constructor() {
    this.envPath = path.join(process.cwd(), '.env');
    this.envExamplePath = path.join(process.cwd(), '.env.example');
    this.currentConfig = this.loadExistingConfig();
  }

  loadExistingConfig() {
    try {
      if (fs.existsSync(this.envPath)) {
        const envContent = fs.readFileSync(this.envPath, 'utf8');
        const config = {};
        envContent.split('\n').forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) {
            config[key.trim()] = value.trim();
          }
        });
        return config;
      }
    } catch (error) {
      // Ignore errors, will create new config
    }
    return {};
  }

  async run() {
    console.clear();
    console.log(chalk.bold.blue('🚀 Welcome to Recoder Setup Wizard'));
    console.log(chalk.gray('═══════════════════════════════════════'));
    console.log(chalk.green('This wizard will help you configure Recoder for optimal performance.'));
    console.log('');

    const mode = await this.selectSetupMode();
    
    if (mode === 'quick') {
      await this.quickSetup();
    } else {
      await this.advancedSetup();
    }

    await this.testConfiguration();
    await this.showCompletionMessage();
  }

  async selectSetupMode() {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Choose setup mode:',
        choices: [
          {
            name: '⚡ Quick Setup (recommended for beginners)',
            value: 'quick'
          },
          {
            name: '🔧 Advanced Setup (full configuration)',
            value: 'advanced'
          },
          {
            name: '📝 Show current configuration',
            value: 'show'
          }
        ]
      }
    ]);

    if (mode === 'show') {
      this.showCurrentConfig();
      process.exit(0);
    }

    return mode;
  }

  async quickSetup() {
    console.log(chalk.yellow('\n⚡ Quick Setup'));
    console.log(chalk.gray('We only need your OpenRouter API key to get started.'));
    console.log('');

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your OpenRouter API key:',
        validate: (input) => {
          if (!input.trim()) {
            return 'API key is required';
          }
          if (input.length < 10) {
            return 'API key seems too short';
          }
          return true;
        },
        mask: '*'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Choose your preferred model:',
        choices: [
          {
            name: '🧠 Claude 3.5 Sonnet (recommended - balanced performance)',
            value: 'anthropic/claude-3.5-sonnet'
          },
          {
            name: '💨 Claude 3 Haiku (fastest, most economical)',
            value: 'anthropic/claude-3-haiku'
          },
          {
            name: '🤖 GPT-4o (OpenAI\'s latest)',
            value: 'openai/gpt-4o'
          },
          {
            name: '⚡ GPT-4o Mini (fast and affordable)',
            value: 'openai/gpt-4o-mini'
          }
        ]
      }
    ]);

    const config = {
      OPENROUTER_API_KEY: answers.apiKey,
      OPENROUTER_MODEL: answers.model,
      OPENROUTER_SITE_NAME: 'Recoder Code',
      OPENROUTER_SITE_URL: 'https://github.com/anthropics/claude-code'
    };

    await this.saveConfiguration(config);
  }

  async advancedSetup() {
    console.log(chalk.yellow('\n🔧 Advanced Setup'));
    console.log(chalk.gray('Configure all OpenRouter features for optimal performance.'));
    console.log('');

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'OpenRouter API key:',
        default: this.currentConfig.OPENROUTER_API_KEY,
        validate: (input) => input.trim() ? true : 'API key is required',
        mask: '*'
      },
      {
        type: 'input',
        name: 'model',
        message: 'Primary model:',
        default: this.currentConfig.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
        validate: (input) => input.trim() ? true : 'Model is required'
      },
      {
        type: 'input',
        name: 'fallbackModels',
        message: 'Fallback models (comma-separated):',
        default: this.currentConfig.OPENROUTER_FALLBACK_MODELS || 'openai/gpt-4o,anthropic/claude-3-haiku'
      },
      {
        type: 'list',
        name: 'sort',
        message: 'Provider optimization priority:',
        choices: [
          { name: '💰 Price (cheapest first)', value: 'price' },
          { name: '⚡ Throughput (fastest response)', value: 'throughput' },
          { name: '🏃 Latency (lowest delay)', value: 'latency' }
        ],
        default: this.currentConfig.OPENROUTER_SORT || 'price'
      },
      {
        type: 'confirm',
        name: 'allowFallbacks',
        message: 'Enable automatic fallbacks if primary model fails?',
        default: this.currentConfig.OPENROUTER_ALLOW_FALLBACKS !== 'false'
      },
      {
        type: 'list',
        name: 'dataCollection',
        message: 'Data collection preference:',
        choices: [
          { name: '✅ Allow (helps improve models)', value: 'allow' },
          { name: '❌ Deny (more private)', value: 'deny' }
        ],
        default: this.currentConfig.OPENROUTER_DATA_COLLECTION || 'allow'
      },
      {
        type: 'input',
        name: 'siteName',
        message: 'Site name (for tracking):',
        default: this.currentConfig.OPENROUTER_SITE_NAME || 'Recoder Code'
      },
      {
        type: 'input',
        name: 'siteUrl',
        message: 'Site URL (for tracking):',
        default: this.currentConfig.OPENROUTER_SITE_URL || 'https://github.com/anthropics/claude-code'
      },
      {
        type: 'input',
        name: 'quantizations',
        message: 'Preferred quantizations (e.g., fp16,bf16):',
        default: this.currentConfig.OPENROUTER_QUANTIZATIONS || ''
      },
      {
        type: 'input',
        name: 'maxPrice',
        message: 'Max price per request (JSON format, e.g., {"prompt": 5, "completion": 10}):',
        default: this.currentConfig.OPENROUTER_MAX_PRICE || '',
        validate: (input) => {
          if (!input.trim()) return true;
          try {
            JSON.parse(input);
            return true;
          } catch {
            return 'Must be valid JSON or empty';
          }
        }
      }
    ]);

    const config = {
      OPENROUTER_API_KEY: answers.apiKey,
      OPENROUTER_MODEL: answers.model,
      OPENROUTER_SITE_NAME: answers.siteName,
      OPENROUTER_SITE_URL: answers.siteUrl,
      OPENROUTER_FALLBACK_MODELS: answers.fallbackModels,
      OPENROUTER_SORT: answers.sort,
      OPENROUTER_ALLOW_FALLBACKS: answers.allowFallbacks.toString(),
      OPENROUTER_DATA_COLLECTION: answers.dataCollection
    };

    if (answers.quantizations.trim()) {
      config.OPENROUTER_QUANTIZATIONS = answers.quantizations.trim();
    }

    if (answers.maxPrice.trim()) {
      config.OPENROUTER_MAX_PRICE = answers.maxPrice.trim();
    }

    await this.saveConfiguration(config);
  }

  async saveConfiguration(config) {
    try {
      // Create .env file content
      const envContent = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      fs.writeFileSync(this.envPath, envContent);
      
      console.log(chalk.green('\n✅ Configuration saved to .env'));
      
      // Create .env.example if it doesn't exist
      if (!fs.existsSync(this.envExamplePath)) {
        const exampleContent = Object.entries(config)
          .map(([key, value]) => {
            if (key === 'OPENROUTER_API_KEY') {
              return `${key}=your_openrouter_api_key_here`;
            }
            return `${key}=${value}`;
          })
          .join('\n');
        
        fs.writeFileSync(this.envExamplePath, exampleContent);
        console.log(chalk.gray('📝 Created .env.example template'));
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Error saving configuration: ${error.message}`));
      process.exit(1);
    }
  }

  async testConfiguration() {
    console.log(chalk.blue('\n🧪 Testing Configuration'));
    console.log(chalk.gray('════════════════════════'));

    const { shouldTest } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldTest',
        message: 'Test the configuration with a simple API call?',
        default: true
      }
    ]);

    if (!shouldTest) return;

    try {
      // Load the configuration we just saved
      require('dotenv').config({ path: this.envPath });
      
      const OpenAI = require('openai');
      const config = require('../config.js');

      if (!config.apiKey) {
        console.log(chalk.red('❌ API key not found in configuration'));
        return;
      }

      console.log(chalk.yellow('⏳ Testing API connection...'));

      const openai = new OpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        defaultHeaders: {
          'HTTP-Referer': config.siteUrl,
          'X-Title': config.siteName,
        },
      });

      const response = await openai.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: 'Hello! Just testing the connection.' }],
        max_tokens: 50
      });

      if (response.choices && response.choices[0]) {
        console.log(chalk.green('✅ API connection successful!'));
        console.log(chalk.gray(`Model: ${response.model || config.model}`));
        console.log(chalk.gray(`Response: "${response.choices[0].message.content.trim()}"`));
      }

    } catch (error) {
      console.log(chalk.red('❌ API test failed:'));
      console.log(chalk.red(`   ${error.message}`));
      
      const { tryAgain } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'tryAgain',
          message: 'Would you like to reconfigure?',
          default: true
        }
      ]);

      if (tryAgain) {
        await this.run();
        return;
      }
    }
  }

  showCurrentConfig() {
    console.log(chalk.blue('\n📋 Current Configuration'));
    console.log(chalk.gray('═══════════════════════════'));
    
    if (Object.keys(this.currentConfig).length === 0) {
      console.log(chalk.yellow('No configuration found.'));
      console.log(chalk.gray('Run setup to create initial configuration.'));
      return;
    }

    Object.entries(this.currentConfig).forEach(([key, value]) => {
      if (key.includes('API_KEY')) {
        console.log(`${chalk.cyan(key)}: ${chalk.gray('***hidden***')}`);
      } else {
        console.log(`${chalk.cyan(key)}: ${chalk.white(value)}`);
      }
    });
    console.log('');
  }

  async showCompletionMessage() {
    console.log(chalk.green('\n🎉 Setup Complete!'));
    console.log(chalk.gray('═══════════════════'));
    console.log('');
    console.log(chalk.white('You can now use Recoder in two ways:'));
    console.log('');
    console.log(chalk.cyan('💬 Interactive Chat Mode:'));
    console.log(chalk.gray('  recoder'));
    console.log('');
    console.log(chalk.cyan('⚡ One-shot Command Mode:'));
    console.log(chalk.gray('  recoder "Create a web server"'));
    console.log('');
    console.log(chalk.yellow('Useful Commands:'));
    console.log(chalk.gray('  recoder --help           # Show help'));
    console.log(chalk.gray('  recoder --stats          # Show usage stats'));
    console.log(chalk.gray('  node cli/enhanced-setup.js  # Run setup again'));
    console.log('');
    console.log(chalk.white('Happy coding! 🚀'));
  }
}

// Run the setup wizard
async function main() {
  try {
    const wizard = new RecoderSetupWizard();
    await wizard.run();
  } catch (error) {
    if (error.isTtyError) {
      console.log(chalk.red('❌ This wizard requires an interactive terminal'));
    } else {
      console.log(chalk.red(`❌ Setup failed: ${error.message}`));
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = RecoderSetupWizard;