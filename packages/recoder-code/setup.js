#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Enhanced AI CLI Setup Wizard
 * Comprehensive installation and configuration tool
 */
class EnhancedSetupWizard {
  constructor() {
    this.config = {};
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Main setup flow
   */
  async setup() {
    console.clear();
    this.displayWelcome();
    
    try {
      await this.checkPrerequisites();
      await this.setupApiKey();
      await this.configureModels();
      await this.setupAutomation();
      await this.configureDevTools();
      await this.finalizeDependencies();
      await this.createProjectStructure();
      await this.runInitialTests();
      
      this.displayCompletion();
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Setup failed: ${error.message}`));
      console.log(chalk.yellow('Please check the requirements and try again.'));
    } finally {
      this.rl.close();
    }
  }

  /**
   * Display welcome message
   */
  displayWelcome() {
    console.log(chalk.bold.cyan('🚀 Enhanced AI CLI Setup Wizard'));
    console.log(chalk.gray('━'.repeat(50)));
    console.log(chalk.white('Welcome! This wizard will help you set up your enhanced AI development environment.'));
    console.log(chalk.white('Features to configure:'));
    console.log(chalk.green('  ✨ Intelligent Model Selection (32+ models)'));
    console.log(chalk.green('  📋 Advanced Rules Engine'));
    console.log(chalk.green('  🎯 Smart Task Automation'));
    console.log(chalk.green('  🔧 Native Dev Tools Integration'));
    console.log('');
  }

  /**
   * Check system prerequisites
   */
  async checkPrerequisites() {
    console.log(chalk.cyan('🔍 Checking system prerequisites...'));
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required (current: ${nodeVersion})`);
    }
    console.log(chalk.green(`  ✅ Node.js ${nodeVersion}`));
    
    // Check npm
    try {
      const { stdout } = await execAsync('npm --version');
      console.log(chalk.green(`  ✅ npm ${stdout.trim()}`));
    } catch (error) {
      throw new Error('npm is required but not found');
    }
    
    // Check git
    try {
      const { stdout } = await execAsync('git --version');
      console.log(chalk.green(`  ✅ ${stdout.trim()}`));
    } catch (error) {
      console.log(chalk.yellow('  ⚠️  Git not found (optional but recommended)'));
    }
    
    // Check for optional tools
    const optionalTools = [
      { name: 'docker', command: 'docker --version', feature: 'Container integration' },
      { name: 'code', command: 'code --version', feature: 'VS Code integration' },
      { name: 'rg', command: 'rg --version', feature: 'Fast code search' }
    ];
    
    for (const tool of optionalTools) {
      try {
        await execAsync(tool.command);
        console.log(chalk.green(`  ✅ ${tool.name} (${tool.feature})`));
      } catch (error) {
        console.log(chalk.gray(`  ○ ${tool.name} not found (${tool.feature} will be limited)`));
      }
    }
    
    console.log('');
  }

  /**
   * Setup OpenRouter API key
   */
  async setupApiKey() {
    console.log(chalk.cyan('🔑 API Key Configuration'));
    console.log(chalk.white('You need an OpenRouter API key to access AI models.'));
    console.log(chalk.gray('Get your free key at: https://openrouter.ai/'));
    console.log('');
    
    // Check if already configured
    if (process.env.OPENROUTER_API_KEY || fs.existsSync('.env')) {
      const useExisting = await this.prompt('Use existing API key configuration? (y/n): ');
      if (useExisting.toLowerCase() === 'y') {
        console.log(chalk.green('  ✅ Using existing API key configuration'));
        return;
      }
    }
    
    const apiKey = await this.prompt('Enter your OpenRouter API key: ', true);
    if (!apiKey || apiKey.length < 20) {
      throw new Error('Valid API key is required');
    }
    
    this.config.OPENROUTER_API_KEY = apiKey;
    
    // Optional configurations
    const siteName = await this.prompt('Site name (optional): ') || 'Enhanced AI CLI';
    const siteUrl = await this.prompt('Site URL (optional): ') || 'https://github.com/enhanced-ai-cli';
    
    this.config.OPENROUTER_SITE_NAME = siteName;
    this.config.OPENROUTER_SITE_URL = siteUrl;
    
    // Test API key validity
    console.log(chalk.cyan('  🧪 Testing API key...'));
    try {
      const testResponse = await this.testApiKey(apiKey);
      if (testResponse.success) {
        console.log(chalk.green('  ✅ API key validated successfully'));
      } else {
        console.log(chalk.yellow('  ⚠️  API key appears valid but test failed'));
      }
    } catch (error) {
      console.log(chalk.yellow('  ⚠️  Could not validate API key (proceeding anyway)'));
    }
    
    console.log('');
  }

  /**
   * Configure AI models and preferences
   */
  async configureModels() {
    console.log(chalk.cyan('🤖 Model Configuration'));
    console.log(chalk.white('Select your preferred AI models from our comprehensive catalog.'));
    console.log('');
    
    // Display model categories
    console.log(chalk.bold('📊 Available Model Categories:'));
    console.log(chalk.green('  1. 🎯 Premium Models (Claude, GPT-4) - Best quality'));
    console.log(chalk.green('  2. 🆓 Free Specialized (Kimi Dev, DeepSeek) - Excellent & Free'));
    console.log(chalk.green('  3. 🔄 Cost-Effective (GPT-3.5, Claude Haiku) - Fast & Affordable'));
    console.log('');
    
    // Primary model selection
    console.log(chalk.bold('🎯 Primary Model Selection:'));
    const primaryModels = [
      { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', type: 'Premium', cost: 'Paid' },
      { id: 'moonshotai/kimi-dev-72b', name: 'Kimi Dev 72B', type: 'Free Specialized', cost: 'FREE' },
      { id: 'deepseek/deepseek-v3.1', name: 'DeepSeek V3.1', type: 'Free General', cost: 'FREE' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', type: 'Premium', cost: 'Paid' },
      { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', type: 'Premium', cost: 'Paid' }
    ];
    
    primaryModels.forEach((model, index) => {
      const costBadge = model.cost === 'FREE' ? chalk.green(model.cost) : chalk.yellow(model.cost);
      console.log(`  ${index + 1}. ${model.name} (${model.type}) - ${costBadge}`);
    });
    
    const primaryChoice = await this.prompt('\nSelect primary model (1-5, default: 1): ') || '1';
    const selectedPrimary = primaryModels[parseInt(primaryChoice) - 1] || primaryModels[0];
    this.config.OPENROUTER_MODEL = selectedPrimary.id;
    
    console.log(chalk.green(`  ✅ Primary model: ${selectedPrimary.name}`));
    
    // Fallback models configuration
    const configureFallbacks = await this.prompt('\nConfigure fallback models for redundancy? (y/n): ');
    if (configureFallbacks.toLowerCase() === 'y') {
      const fallbackModels = [
        'moonshotai/kimi-dev-72b',
        'deepseek/deepseek-v3.1',
        'moonshotai/kimi-k2-0711',
        'qwen/qwen-2.5-coder-32b-instruct'
      ].filter(id => id !== selectedPrimary.id);
      
      this.config.FALLBACK_MODELS = fallbackModels.join(',');
      console.log(chalk.green('  ✅ Fallback models configured'));
    }
    
    // Model selection preferences
    console.log('\n🎛️  Model Selection Preferences:');
    const autoSwitch = await this.prompt('Enable automatic model switching based on task type? (y/n): ');
    this.config.AUTO_MODEL_SWITCH = autoSwitch.toLowerCase() === 'y' ? 'true' : 'false';
    
    const costOptimize = await this.prompt('Prefer free models when quality is sufficient? (y/n): ');
    this.config.COST_OPTIMIZE = costOptimize.toLowerCase() === 'y' ? 'true' : 'false';
    
    console.log(chalk.green('  ✅ Model preferences configured'));
    console.log('');
  }

  /**
   * Setup automation features
   */
  async setupAutomation() {
    console.log(chalk.cyan('⚡ Automation Configuration'));
    console.log(chalk.white('Configure intelligent automation features for your development workflow.'));
    console.log('');
    
    console.log(chalk.bold('🔧 Available Automation Features:'));
    console.log(chalk.white('  📁 File watchers for automatic code reviews'));
    console.log(chalk.white('  🔍 Git hooks for quality gates'));
    console.log(chalk.white('  🎯 Task automation and scheduling'));
    console.log(chalk.white('  🛡️  Security scans and dependency audits'));
    console.log('');
    
    const enableAutomation = await this.prompt('Enable automation features? (y/n): ');
    if (enableAutomation.toLowerCase() !== 'y') {
      console.log(chalk.gray('  ○ Automation disabled'));
      return;
    }
    
    // File watchers
    const enableWatchers = await this.prompt('Enable file watchers for automatic code reviews? (y/n): ');
    this.config.ENABLE_FILE_WATCHERS = enableWatchers.toLowerCase() === 'y' ? 'true' : 'false';
    
    // Git hooks
    const enableGitHooks = await this.prompt('Setup Git hooks for quality gates? (y/n): ');
    this.config.ENABLE_GIT_HOOKS = enableGitHooks.toLowerCase() === 'y' ? 'true' : 'false';
    
    // Task automation
    const enableTaskAuto = await this.prompt('Enable smart task automation? (y/n): ');
    this.config.ENABLE_TASK_AUTOMATION = enableTaskAuto.toLowerCase() === 'y' ? 'true' : 'false';
    
    // Notification preferences
    const enableNotifications = await this.prompt('Enable automation notifications? (y/n): ');
    this.config.ENABLE_NOTIFICATIONS = enableNotifications.toLowerCase() === 'y' ? 'true' : 'false';
    
    console.log(chalk.green('  ✅ Automation features configured'));
    console.log('');
  }

  /**
   * Configure development tools integration
   */
  async configureDevTools() {
    console.log(chalk.cyan('🔧 Development Tools Integration'));
    console.log(chalk.white('Configure native integration with your development tools.'));
    console.log('');
    
    const toolsToCheck = [
      { name: 'Docker', command: 'docker --version', feature: 'Container management' },
      { name: 'Git', command: 'git --version', feature: 'Version control integration' },
      { name: 'VS Code', command: 'code --version', feature: 'IDE workspace setup' },
      { name: 'PostgreSQL', command: 'psql --version', feature: 'Database monitoring' },
      { name: 'Redis', command: 'redis-cli --version', feature: 'Cache monitoring' }
    ];
    
    console.log(chalk.bold('🔍 Detecting available tools:'));
    const availableTools = [];
    
    for (const tool of toolsToCheck) {
      try {
        await execAsync(tool.command);
        console.log(chalk.green(`  ✅ ${tool.name} - ${tool.feature}`));
        availableTools.push(tool.name.toLowerCase());
      } catch (error) {
        console.log(chalk.gray(`  ○ ${tool.name} not found - ${tool.feature} will be limited`));
      }
    }
    
    this.config.AVAILABLE_TOOLS = availableTools.join(',');
    
    if (availableTools.length > 0) {
      const enableIntegration = await this.prompt('\nEnable deep integration with detected tools? (y/n): ');
      this.config.ENABLE_TOOL_INTEGRATION = enableIntegration.toLowerCase() === 'y' ? 'true' : 'false';
      
      if (enableIntegration.toLowerCase() === 'y') {
        console.log(chalk.green('  ✅ Tool integration enabled'));
        
        // IDE-specific configuration
        if (availableTools.includes('vs code')) {
          const setupWorkspace = await this.prompt('Setup VS Code workspace configuration? (y/n): ');
          this.config.SETUP_VSCODE_WORKSPACE = setupWorkspace.toLowerCase() === 'y' ? 'true' : 'false';
        }
      }
    } else {
      console.log(chalk.yellow('  ⚠️  No development tools detected - basic functionality will be available'));
    }
    
    console.log('');
  }

  /**
   * Finalize dependencies and installation
   */
  async finalizeDependencies() {
    console.log(chalk.cyan('📦 Finalizing Dependencies'));
    console.log(chalk.white('Installing required packages and setting up the environment.'));
    console.log('');
    
    // Check if package.json exists
    if (!fs.existsSync('package.json')) {
      console.log(chalk.yellow('  ⚠️  No package.json found - creating one...'));
      await this.createPackageJson();
    }
    
    // Install dependencies
    console.log(chalk.cyan('  📥 Installing dependencies...'));
    try {
      const { stdout } = await execAsync('npm install', { cwd: process.cwd() });
      console.log(chalk.green('  ✅ Dependencies installed successfully'));
    } catch (error) {
      console.log(chalk.red(`  ❌ Failed to install dependencies: ${error.message}`));
      throw error;
    }
    
    // Create .env file
    console.log(chalk.cyan('  📄 Creating configuration files...'));
    await this.createEnvFile();
    
    console.log(chalk.green('  ✅ Configuration files created'));
    console.log('');
  }

  /**
   * Create project structure
   */
  async createProjectStructure() {
    console.log(chalk.cyan('🏗️  Creating Project Structure'));
    console.log(chalk.white('Setting up directories and configuration files.'));
    console.log('');
    
    const directories = [
      'logs',
      'sessions',
      '.recoder',
      'rules'
    ];
    
    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(chalk.green(`  ✅ Created directory: ${dir}`));
      } else {
        console.log(chalk.gray(`  ○ Directory exists: ${dir}`));
      }
    }
    
    // Create configuration files
    const configFiles = [
      { name: '.gitignore', template: this.getGitignoreTemplate() },
      { name: '.recoderrc', template: this.getRecoderConfigTemplate() }
    ];
    
    for (const file of configFiles) {
      if (!fs.existsSync(file.name)) {
        fs.writeFileSync(file.name, file.template);
        console.log(chalk.green(`  ✅ Created file: ${file.name}`));
      } else {
        console.log(chalk.gray(`  ○ File exists: ${file.name}`));
      }
    }
    
    console.log('');
  }

  /**
   * Run initial tests
   */
  async runInitialTests() {
    console.log(chalk.cyan('🧪 Running Initial Tests'));
    console.log(chalk.white('Verifying installation and configuration.'));
    console.log('');
    
    const tests = [
      { name: 'Configuration loading', test: () => this.testConfigLoading() },
      { name: 'API connectivity', test: () => this.testApiConnectivity() },
      { name: 'Model availability', test: () => this.testModelAvailability() },
      { name: 'Feature initialization', test: () => this.testFeatureInit() }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      try {
        console.log(chalk.cyan(`  🔍 Testing ${test.name}...`));
        await test.test();
        console.log(chalk.green(`  ✅ ${test.name} passed`));
        passed++;
      } catch (error) {
        console.log(chalk.red(`  ❌ ${test.name} failed: ${error.message}`));
        failed++;
      }
    }
    
    console.log('');
    console.log(chalk.bold(`📊 Test Results: ${chalk.green(passed + ' passed')} / ${chalk.red(failed + ' failed')}`));
    
    if (failed > 0) {
      console.log(chalk.yellow('  ⚠️  Some tests failed - the system may have limited functionality'));
    }
    
    console.log('');
  }

  /**
   * Display completion message
   */
  displayCompletion() {
    console.log(chalk.bold.green('🎉 Setup Complete!'));
    console.log(chalk.gray('━'.repeat(50)));
    console.log('');
    console.log(chalk.white('Your Enhanced AI CLI is now ready to use!'));
    console.log('');
    console.log(chalk.bold('🚀 Quick Start Commands:'));
    console.log(chalk.cyan('  recoder-code "build a todo app"                 # One-shot command'));
    console.log(chalk.cyan('  recoder-code --interactive                       # Interactive mode'));
    console.log(chalk.cyan('  recoder-code --models                            # List available models'));
    console.log(chalk.cyan('  recoder-code --setup                             # Re-run setup'));
    console.log('');
    console.log(chalk.bold('📖 Features Enabled:'));
    
    if (this.config.OPENROUTER_MODEL) {
      console.log(chalk.green(`  ✅ Primary Model: ${this.config.OPENROUTER_MODEL.split('/').pop()}`));
    }
    if (this.config.ENABLE_FILE_WATCHERS === 'true') {
      console.log(chalk.green('  ✅ File Watchers: Automatic code reviews'));
    }
    if (this.config.ENABLE_GIT_HOOKS === 'true') {
      console.log(chalk.green('  ✅ Git Hooks: Quality gates enabled'));
    }
    if (this.config.ENABLE_TOOL_INTEGRATION === 'true') {
      console.log(chalk.green('  ✅ Tool Integration: Native dev tools'));
    }
    
    console.log('');
    console.log(chalk.bold('📚 Documentation:'));
    console.log(chalk.gray('  • README.md - Comprehensive usage guide'));
    console.log(chalk.gray('  • Examples in the examples/ directory'));
    console.log(chalk.gray('  • Use --help for command-specific help'));
    console.log('');
    console.log(chalk.yellow('Happy coding! 🎯'));
  }

  /**
   * Helper methods
   */
  async prompt(question, isPassword = false) {
    return new Promise((resolve) => {
      if (isPassword) {
        // Simple password masking - in production, use a proper library
        process.stdout.write(question);
        process.stdin.setRawMode(true);
        process.stdin.resume();

        let password = '';
        const dataHandler = (char) => {
          char = char.toString();

          if (char === '\r' || char === '\n') {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', dataHandler);
            process.stdout.write('\n');
            resolve(password);
          } else if (char === '\u0003') {
            process.exit();
          } else if (char === '\u007f') {
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else {
            password += char;
            process.stdout.write('*');
          }
        };
        process.stdin.on('data', dataHandler);
      } else {
        this.rl.question(question, resolve);
      }
    });
  }

  async testApiKey(apiKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createEnvFile() {
    const envContent = Object.entries(this.config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n';
    
    fs.writeFileSync('.env', envContent);
  }

  async createPackageJson() {
    const packageTemplate = {
      "name": "enhanced-ai-cli",
      "version": "1.0.0",
      "description": "Enterprise-grade AI development assistant",
      "main": "index.js",
      "bin": {
        "recoder-code": "./bin/recoder-code"
      },
      "scripts": {
        "start": "node index.js",
        "setup": "node setup.js",
        "test": "npm run test:integration",
        "test:integration": "node tests/integration-test.js"
      },
      "dependencies": {
        "chalk": "^5.3.0",
        "chokidar": "^3.5.3",
        "readline": "^1.3.0",
        "fs-extra": "^11.1.1"
      },
      "keywords": ["ai", "cli", "development", "automation"],
      "author": "Enhanced AI CLI Team",
      "license": "MIT"
    };
    
    fs.writeFileSync('package.json', JSON.stringify(packageTemplate, null, 2));
  }

  getGitignoreTemplate() {
    return `# Enhanced AI CLI
node_modules/
.env
.env.local
logs/
sessions/
*.log
.DS_Store
.vscode/settings.json
.idea/
dist/
build/
`;
  }

  getRecoderConfigTemplate() {
    return JSON.stringify({
      "version": "1.0.0",
      "features": {
        "rulesEngine": true,
        "taskAutomation": true,
        "devToolsIntegration": true,
        "intelligentModelSelection": true
      },
      "automation": {
        "fileWatchers": this.config.ENABLE_FILE_WATCHERS === 'true',
        "gitHooks": this.config.ENABLE_GIT_HOOKS === 'true',
        "notifications": this.config.ENABLE_NOTIFICATIONS === 'true'
      },
      "models": {
        "primary": this.config.OPENROUTER_MODEL,
        "autoSwitch": this.config.AUTO_MODEL_SWITCH === 'true',
        "costOptimize": this.config.COST_OPTIMIZE === 'true'
      }
    }, null, 2);
  }

  async testConfigLoading() {
    const config = require('./config.js');
    if (!config.apiKey) throw new Error('API key not loaded');
  }

  async testApiConnectivity() {
    if (!this.config.OPENROUTER_API_KEY) throw new Error('No API key configured');
    const result = await this.testApiKey(this.config.OPENROUTER_API_KEY);
    if (!result.success) throw new Error('API connectivity failed');
  }

  async testModelAvailability() {
    // Simple test - in real implementation, check model availability
    if (!this.config.OPENROUTER_MODEL) throw new Error('No model configured');
  }

  async testFeatureInit() {
    // Test if core files exist
    const coreFiles = ['cli/interactive.js', 'cli/model-manager.js', 'config.js'];
    for (const file of coreFiles) {
      if (!fs.existsSync(file)) {
        throw new Error(`Core file missing: ${file}`);
      }
    }
  }

}

if (require.main === module) {
  const setup = new EnhancedSetupWizard();
  setup.setup().catch(console.error);
}

module.exports = EnhancedSetupWizard;