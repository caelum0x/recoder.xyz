#!/usr/bin/env node

const readline = require('readline');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;;
const fs = require('fs');
const path = require('path');

class SetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder');
    this.configFile = path.join(this.configDir, 'config.json');
  }

  async run() {
    console.clear();
    this.showWelcome();
    
    try {
      const config = await this.collectConfiguration();
      await this.saveConfiguration(config);
      await this.testConfiguration(config);
      this.showCompletionMessage();
    } catch (error) {
      console.error(chalk.red(`\n❌ Setup failed: ${error.message}`));
    } finally {
      this.rl.close();
    }
  }

  showWelcome() {
    console.log(chalk.bold.blue('██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗ '));
    console.log(chalk.bold.blue('██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗'));
    console.log(chalk.bold.blue('██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗  ██████╔╝'));
    console.log(chalk.bold.blue('██╔══██╗██╔══╝  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗'));
    console.log(chalk.bold.blue('██║  ██║███████╗╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║'));
    console.log(chalk.bold.blue('╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝'));
    console.log(chalk.gray(' ████████████████████████████████████████████████████████ '));
    console.log(chalk.bold.green('\n🚀 Welcome to Recoder Code Setup!'));
    console.log(chalk.gray('═══════════════════════════════════════════════════════════'));
    console.log(chalk.yellow('\n📝 This wizard will help you configure Recoder Code for first use.'));
    console.log(chalk.cyan('💡 You\'ll need an OpenRouter API key to get started.'));
    console.log(chalk.gray('🔗 Get your free API key at: https://openrouter.ai/keys\n'));
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async collectConfiguration() {
    const config = {};

    // API Key
    console.log(chalk.bold.cyan('🔐 API Key Configuration'));
    console.log(chalk.gray('────────────────────────────'));
    
    config.apiKey = await this.question(chalk.yellow('Enter your OpenRouter API key: '));
    
    if (!config.apiKey || !config.apiKey.startsWith('sk-or-v1-')) {
      throw new Error('Invalid OpenRouter API key format. Keys should start with "sk-or-v1-"');
    }

    // Model Selection
    console.log(chalk.bold.cyan('\n🤖 Model Selection'));
    console.log(chalk.gray('──────────────────'));
    console.log(chalk.green('🆓 Recommended FREE models:'));
    console.log(chalk.white('1. deepseek/deepseek-r1-distill-llama-70b (Best for coding)'));
    console.log(chalk.white('2. deepseek/deepseek-chat (General purpose)'));
    console.log(chalk.white('3. google/gemma-2-9b-it:free (Fast and efficient)'));
    console.log(chalk.white('4. meta-llama/llama-3.1-8b-instruct:free (Versatile)'));
    console.log(chalk.white('5. qwen/qwen-2.5-72b-instruct:free (Multilingual)'));
    console.log(chalk.white('6. Custom model from OpenRouter catalog'));
    console.log(chalk.gray('\n💡 Tip: Visit https://openrouter.ai/models to browse all models'));

    const modelChoice = await this.question(chalk.yellow('\nSelect model (1-6): '));
    
    switch (modelChoice) {
      case '1':
        config.model = 'deepseek/deepseek-r1-distill-llama-70b';
        break;
      case '2':
        config.model = 'deepseek/deepseek-chat';
        break;
      case '3':
        config.model = 'google/gemma-2-9b-it:free';
        break;
      case '4':
        config.model = 'meta-llama/llama-3.1-8b-instruct:free';
        break;
      case '5':
        config.model = 'qwen/qwen-2.5-72b-instruct:free';
        break;
      case '6':
        console.log(chalk.cyan('\n🌐 Browse models at: https://openrouter.ai/models'));
        console.log(chalk.gray('Format: provider/model-name (e.g., openai/gpt-4o, anthropic/claude-3.5-sonnet)'));
        config.model = await this.question(chalk.yellow('Enter model name: '));
        break;
      default:
        config.model = 'deepseek/deepseek-r1-distill-llama-70b';
    }

    // Additional Settings
    console.log(chalk.bold.cyan('\n⚙️  Additional Settings'));
    console.log(chalk.gray('─────────────────────'));
    
    const enableVoice = await this.question(chalk.yellow('Enable voice features? (y/N): '));
    config.voiceEnabled = enableVoice.toLowerCase() === 'y' || enableVoice.toLowerCase() === 'yes';
    
    const enableDebug = await this.question(chalk.yellow('Enable debug logging? (y/N): '));
    config.debugEnabled = enableDebug.toLowerCase() === 'y' || enableDebug.toLowerCase() === 'yes';

    return config;
  }

  async saveConfiguration(config) {
    console.log(chalk.bold.cyan('\n💾 Saving Configuration'));
    console.log(chalk.gray('────────────────────────'));
    
    // Create config directory
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      console.log(chalk.gray(`📁 Created config directory: ${this.configDir}`));
    }

    // Save config file
    const configData = {
      apiKey: config.apiKey,
      model: config.model,
      voiceEnabled: config.voiceEnabled,
      debugEnabled: config.debugEnabled,
      setupDate: new Date().toISOString(),
      version: '1.0.1'
    };

    fs.writeFileSync(this.configFile, JSON.stringify(configData, null, 2));
    console.log(chalk.green(`✅ Configuration saved to: ${this.configFile}`));
  }

  async testConfiguration(config) {
    console.log(chalk.bold.cyan('\n🧪 Testing Configuration'));
    console.log(chalk.gray('──────────────────────────'));
    
    try {
      const OpenAI = require('openai');
      
      const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/recoder-code',
          'X-Title': 'Recoder Code',
        },
      });

      console.log(chalk.yellow('🔄 Testing API connection...'));
      
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: 'Hello! Just testing the connection.' }],
        max_tokens: 50
      });

      if (response.choices && response.choices[0]) {
        console.log(chalk.green('✅ API connection successful!'));
        console.log(chalk.gray(`🤖 Model: ${config.model}`));
        console.log(chalk.gray(`📝 Test response: "${response.choices[0].message.content.substring(0, 50)}..."`));
      }
      
    } catch (error) {
      console.log(chalk.red('❌ API connection failed!'));
      console.log(chalk.gray(`Error: ${error.message}`));
      throw new Error('API test failed. Please check your API key and model selection.');
    }
  }

  showCompletionMessage() {
    console.log(chalk.bold.green('\n🎉 Setup Complete!'));
    console.log(chalk.gray('═══════════════════'));
    console.log(chalk.white('Your Recoder Code is now ready to use!'));
    console.log(chalk.yellow('\n📚 Quick Start:'));
    console.log(chalk.white('  recoder-code                    # Start interactive chat'));
    console.log(chalk.white('  recoder-code "build me an app"  # One-shot command'));
    console.log(chalk.white('  recoder-code --help             # Show all options'));
    
    console.log(chalk.cyan('\n💡 Pro Tips:'));
    console.log(chalk.white('  • Use natural language: "Create a React app with TypeScript"'));
    console.log(chalk.white('  • Voice commands: "Start recording" in interactive mode'));
    console.log(chalk.white('  • Search codebases: "Find all functions in this project"'));
    console.log(chalk.white('  • Web access: "Fetch the latest docs and implement"'));
    
    console.log(chalk.bold.blue('\n🚀 Happy coding with Recoder Code!'));
  }
}

// Run setup if called directly
if (require.main === module) {
  const wizard = new SetupWizard();
  wizard.run().catch(console.error);
}

module.exports = SetupWizard;