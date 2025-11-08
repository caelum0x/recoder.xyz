#!/usr/bin/env node

/**
 * Recoder Code - Main CLI Entry Point
 * This is what users actually interact with after npm install -g recoder-code
 */

const { Command } = require('commander');
const inquirer = require('inquirer');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

class RecoderCode {
  constructor() {
    this.configPath = path.join(os.homedir(), '.recoder-config.json');
    this.config = this.loadConfig();
    this.program = new Command();
    this.setupCommands();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (error) {
      // Config doesn't exist or is corrupted
    }

    // Default config - points to your hosted services
    return {
      services: {
        auth: 'https://auth.recoder.dev',
        ml: 'https://ml.recoder.dev', 
        plugins: 'https://plugins.recoder.dev',
        collaboration: 'https://collab.recoder.dev'
      },
      user: null,
      token: null,
      initialized: false
    };
  }

  saveConfig() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  setupCommands() {
    this.program
      .name('recoder-code')
      .description('AI-powered development assistant with collaboration features')
      .version('1.0.0');

    // First-time setup
    this.program
      .command('init')
      .description('Initialize Recoder Code (first-time setup)')
      .action(() => this.initializeUser());

    // Authentication
    this.program
      .command('login')
      .description('Login to Recoder Code services')
      .action(() => this.loginUser());

    this.program
      .command('logout')
      .description('Logout from Recoder Code services')  
      .action(() => this.logoutUser());

    // Collaboration features
    this.program
      .command('collab')
      .description('Start or join collaboration session')
      .option('-c, --create [name]', 'Create new session')
      .option('-j, --join <sessionId>', 'Join existing session')
      .action((options) => this.handleCollaboration(options));

    // Plugin management
    this.program
      .command('plugins')
      .description('Manage plugins')
      .option('-s, --search <query>', 'Search plugins')
      .option('-i, --install <name>', 'Install plugin')
      .option('-l, --list', 'List installed plugins')
      .action((options) => this.handlePlugins(options));

    // ML/AI features
    this.program
      .command('train')
      .description('AI model training and operations')
      .option('-m, --merge <config>', 'Merge models with config file')
      .option('-s, --status <jobId>', 'Check training job status')
      .action((options) => this.handleTraining(options));

    // Status check
    this.program
      .command('status')
      .description('Check service status and configuration')
      .action(() => this.checkStatus());
  }

  async initializeUser() {
    console.log(chalk.cyan.bold('\n🚀 Welcome to Recoder Code!\n'));
    
    if (this.config.initialized) {
      console.log(chalk.yellow('Already initialized. Use "recoder-code login" to authenticate.'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useHostedServices',
        message: 'Use hosted Recoder Code services? (Recommended)',
        default: true
      },
      {
        type: 'input',
        name: 'email',
        message: 'Enter your email:',
        validate: (input) => input.includes('@') || 'Please enter a valid email'
      }
    ]);

    if (!answers.useHostedServices) {
      console.log(chalk.yellow('\n⚙️  Self-hosted setup instructions:'));
      console.log('1. Clone the repository: git clone https://github.com/your-org/recoder-code');
      console.log('2. Run: docker-compose up -d');  
      console.log('3. Configure services: recoder-code config set-local');
      return;
    }

    // For hosted services - create account or login
    try {
      console.log(chalk.blue('\n📝 Creating account with hosted services...'));
      
      // This would call your authentication service
      await this.createAccount(answers.email);
      
      this.config.initialized = true;
      this.saveConfig();
      
      console.log(chalk.green('\n✅ Initialization complete!'));
      console.log(chalk.cyan('Next steps:'));
      console.log('• Login: recoder-code login');
      console.log('• Start collaborating: recoder-code collab --create');
      console.log('• Browse plugins: recoder-code plugins --search');
      
    } catch (error) {
      console.log(chalk.red(`❌ Setup failed: ${error.message}`));
    }
  }

  async createAccount(email) {
    // This would integrate with your auth service
    const response = await axios.post(`${this.config.services.auth}/register`, {
      email,
      source: 'cli'
    });
    
    console.log(chalk.green(`📧 Verification email sent to ${email}`));
    console.log(chalk.yellow('Please check your email and click the verification link.'));
    
    return response.data;
  }

  async loginUser() {
    if (!this.config.initialized) {
      console.log(chalk.red('❌ Please run "recoder-code init" first'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Email:'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:'
      }
    ]);

    try {
      console.log(chalk.blue('🔐 Authenticating...'));
      
      const response = await axios.post(`${this.config.services.auth}/login`, {
        email: answers.email,
        password: answers.password
      });

      this.config.user = response.data.user;
      this.config.token = response.data.token;
      this.saveConfig();

      console.log(chalk.green(`✅ Welcome back, ${response.data.user.name}!`));
      console.log(chalk.cyan('🎯 You can now use all Recoder Code features'));
      
    } catch (error) {
      console.log(chalk.red(`❌ Login failed: ${error.response?.data?.message || error.message}`));
    }
  }

  async logoutUser() {
    this.config.user = null;
    this.config.token = null;
    this.saveConfig();
    console.log(chalk.green('👋 Logged out successfully'));
  }

  async handleCollaboration(options) {
    if (!this.ensureAuthenticated()) return;

    if (options.create !== undefined) {
      const sessionName = options.create || 'Untitled Session';
      await this.createCollaborationSession(sessionName);
    } else if (options.join) {
      await this.joinCollaborationSession(options.join);
    } else {
      console.log(chalk.yellow('Usage: recoder-code collab --create [name] or --join <sessionId>'));
    }
  }

  async createCollaborationSession(name) {
    try {
      console.log(chalk.blue(`🏗️  Creating collaboration session "${name}"...`));
      
      const response = await axios.post(
        `${this.config.services.collaboration}/api/sessions`,
        { name },
        { headers: { 'Authorization': `Bearer ${this.config.token}` } }
      );

      const sessionId = response.data.sessionId;
      console.log(chalk.green(`✅ Session created!`));
      console.log(chalk.cyan(`🔗 Session ID: ${sessionId}`));
      console.log(chalk.cyan(`📋 Share link: https://collab.recoder.dev/${sessionId}`));
      
      // Start real-time collaboration
      await this.startRealtimeCollaboration(sessionId);
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to create session: ${error.message}`));
    }
  }

  async joinCollaborationSession(sessionId) {
    console.log(chalk.blue(`🔗 Joining session ${sessionId}...`));
    await this.startRealtimeCollaboration(sessionId);
  }

  async startRealtimeCollaboration(sessionId) {
    console.log(chalk.green('🚀 Starting real-time collaboration...'));
    console.log(chalk.yellow('📝 This would open your editor with live collaboration'));
    console.log(chalk.yellow('🎯 Multiple cursors, real-time edits, voice chat available'));
    console.log(chalk.gray('Press Ctrl+C to exit collaboration\n'));
    
    // In real implementation, this would:
    // 1. Open WebSocket connection to collaboration service
    // 2. Launch user's preferred editor (VSCode, etc.) 
    // 3. Enable real-time collaborative editing
    // 4. Handle operational transforms
  }

  async handlePlugins(options) {
    if (!this.ensureAuthenticated()) return;

    if (options.search) {
      await this.searchPlugins(options.search);
    } else if (options.install) {
      await this.installPlugin(options.install);
    } else if (options.list) {
      await this.listInstalledPlugins();
    } else {
      console.log(chalk.yellow('Usage: recoder-code plugins --search <query> | --install <name> | --list'));
    }
  }

  async searchPlugins(query) {
    try {
      console.log(chalk.blue(`🔍 Searching plugins for "${query}"...`));
      
      const response = await axios.get(
        `${this.config.services.plugins}/api/packages/search`,
        { 
          params: { q: query },
          headers: { 'Authorization': `Bearer ${this.config.token}` }
        }
      );

      const plugins = response.data.results;
      if (plugins.length === 0) {
        console.log(chalk.yellow('No plugins found'));
        return;
      }

      console.log(chalk.green(`\n📦 Found ${plugins.length} plugins:\n`));
      plugins.forEach(plugin => {
        console.log(chalk.cyan(`${plugin.name}`) + chalk.gray(` v${plugin.version}`));
        console.log(`   ${plugin.description}`);
        console.log(chalk.gray(`   ⭐ ${plugin.rating}/5 • 📥 ${plugin.downloads} downloads\n`));
      });
      
    } catch (error) {
      console.log(chalk.red(`❌ Search failed: ${error.message}`));
    }
  }

  async installPlugin(pluginName) {
    try {
      console.log(chalk.blue(`📥 Installing plugin "${pluginName}"...`));
      
      const response = await axios.post(
        `${this.config.services.plugins}/api/packages/${pluginName}/install`,
        {},
        { headers: { 'Authorization': `Bearer ${this.config.token}` } }
      );

      console.log(chalk.green(`✅ Plugin "${pluginName}" installed successfully!`));
      console.log(chalk.cyan('🔧 New commands available:'));
      response.data.commands?.forEach(cmd => {
        console.log(chalk.gray(`   • recoder-code ${cmd}`));
      });
      
    } catch (error) {
      console.log(chalk.red(`❌ Installation failed: ${error.message}`));
    }
  }

  async handleTraining(options) {
    if (!this.ensureAuthenticated()) return;

    if (options.merge) {
      await this.submitMergeJob(options.merge);
    } else if (options.status) {
      await this.checkTrainingStatus(options.status);
    } else {
      console.log(chalk.yellow('Usage: recoder-code train --merge <config.json> | --status <jobId>'));
    }
  }

  async submitMergeJob(configFile) {
    try {
      if (!fs.existsSync(configFile)) {
        console.log(chalk.red(`❌ Config file not found: ${configFile}`));
        return;
      }

      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      console.log(chalk.blue('🧠 Submitting model merge job...'));
      
      const response = await axios.post(
        `${this.config.services.ml}/api/v1/merge/jobs`,
        config,
        { headers: { 'Authorization': `Bearer ${this.config.token}` } }
      );

      console.log(chalk.green(`✅ Job submitted successfully!`));
      console.log(chalk.cyan(`🆔 Job ID: ${response.data.job_id}`));
      console.log(chalk.cyan(`⏱️  Estimated completion: ${response.data.estimated_time}`));
      console.log(chalk.gray(`Check status: recoder-code train --status ${response.data.job_id}`));
      
    } catch (error) {
      console.log(chalk.red(`❌ Job submission failed: ${error.message}`));
    }
  }

  async checkStatus() {
    console.log(chalk.blue('🔍 Checking Recoder Code status...\n'));
    
    // Check authentication
    if (this.config.user) {
      console.log(chalk.green(`👤 Logged in as: ${this.config.user.email}`));
    } else {
      console.log(chalk.yellow('❌ Not logged in'));
    }
    
    // Check services
    console.log(chalk.cyan('\n🌐 Service Status:'));
    
    for (const [name, url] of Object.entries(this.config.services)) {
      try {
        const response = await axios.get(`${url}/health`, { timeout: 5000 });
        console.log(chalk.green(`✅ ${name}: ${response.data.status}`));
      } catch (error) {
        console.log(chalk.red(`❌ ${name}: offline`));
      }
    }
  }

  ensureAuthenticated() {
    if (!this.config.token) {
      console.log(chalk.red('❌ Please login first: recoder-code login'));
      return false;
    }
    return true;
  }

  run() {
    // Handle case when no command provided
    if (process.argv.length <= 2) {
      if (!this.config.initialized) {
        console.log(chalk.cyan.bold('\n🚀 Welcome to Recoder Code!'));
        console.log(chalk.yellow('Get started: recoder-code init\n'));
      } else if (!this.config.user) {
        console.log(chalk.cyan.bold('\n🚀 Recoder Code'));
        console.log(chalk.yellow('Login to continue: recoder-code login\n'));
      } else {
        console.log(chalk.cyan.bold('\n🚀 Recoder Code'));
        console.log(chalk.green(`Welcome back, ${this.config.user.name}!\n`));
        console.log(chalk.gray('Available commands:'));
        console.log(chalk.gray('• recoder-code collab --create  (start collaboration)'));
        console.log(chalk.gray('• recoder-code plugins --search (find plugins)'));
        console.log(chalk.gray('• recoder-code train --merge    (train AI models)'));
        console.log(chalk.gray('• recoder-code status           (check everything)\n'));
      }
      return;
    }

    this.program.parse();
  }
}

// Run the CLI
if (require.main === module) {
  const recoder = new RecoderCode();
  recoder.run();
}

module.exports = RecoderCode;