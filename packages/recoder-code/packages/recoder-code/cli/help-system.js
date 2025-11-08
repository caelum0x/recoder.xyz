/**
 * Comprehensive Help System for Recoder Code CLI
 * Provides detailed usage information and examples
 */

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class HelpSystem {
  constructor() {
    this.version = require('../package.json').version;
    this.LiteMode = require('./lite-mode.js');
  }

  showMainHelp() {
    // Check if this is a first-time user or lite mode
    const liteMode = new this.LiteMode();
    const isFirstTime = liteMode.isFirstTimeUser();
    const isLiteMode = liteMode.shouldUseLiteMode();
    
    if (isFirstTime || isLiteMode) {
      this.showBeginnerHelp();
      return;
    }
    
    console.log(chalk.cyan.bold(`
╭─────────────────────────────────────────────────────╮
│                   RECODER CODE v${this.version}                   │
│          AI-Powered Development Platform            │
╰─────────────────────────────────────────────────────╯
`));

    console.log(chalk.green.bold('🚀 QUICK START:'));
    console.log(chalk.gray('  1. Initialize your environment:'));
    console.log(chalk.blue('     recoder-code config init'));
    console.log(chalk.gray('  2. Register or login:'));
    console.log(chalk.blue('     recoder-code auth register <username> <email> <password>'));
    console.log(chalk.gray('  3. Check services status:'));
    console.log(chalk.blue('     recoder-code services status'));

    console.log(chalk.green.bold('\\n📋 MAIN COMMANDS:'));
    
    const commands = [
      ['config', 'Configuration management and environment setup', 'recoder-code config init'],
      ['auth', 'User authentication and account management', 'recoder-code auth login <user> <pass>'],
      ['services', 'Service health monitoring and management', 'recoder-code services status'],
      ['train', 'ML model training and merging operations', 'recoder-code train merge config.json'],
      ['plugins', 'Plugin discovery and installation', 'recoder-code plugins search "analyzer"'],
      ['collab', 'Real-time collaboration sessions', 'recoder-code collab create "My Session"'],
      ['help', 'Show help information for commands', 'recoder-code help <command>']
    ];

    commands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(10)}`), chalk.gray(desc));
      console.log(chalk.blue(`             ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('💡 GET DETAILED HELP:'));
    console.log(chalk.blue('  recoder-code help <command>'), chalk.gray('- Show detailed help for a command'));
    console.log(chalk.blue('  recoder-code --version'), chalk.gray('     - Show version information'));
    console.log(chalk.blue('  recoder-code --info'), chalk.gray('        - Show system information'));

    console.log(chalk.green.bold('\\n🌐 SERVICES ARCHITECTURE:'));
    console.log(chalk.gray('  • ML Training Service    - Model merging and training jobs'));
    console.log(chalk.gray('  • Plugin Registry       - Package discovery and management'));
    console.log(chalk.gray('  • Collaboration Service - Real-time collaborative editing'));

    console.log(chalk.green.bold('\\n📚 DOCUMENTATION:'));
    console.log(chalk.blue('  Setup Guide:'), chalk.gray('  cat SETUP.md'));
    console.log(chalk.blue('  Examples:'), chalk.gray('     ls examples/'));
    console.log(chalk.blue('  Config File:'), chalk.gray('  ~/.recoder-code/config.json'));

    console.log();
  }

  showConfigHelp() {
    console.log(chalk.cyan.bold('⚙️  CONFIGURATION MANAGEMENT\\n'));
    
    console.log(chalk.green.bold('DESCRIPTION:'));
    console.log(chalk.gray('  Manage Recoder Code configuration, environment setup, and service URLs.\\n'));
    
    console.log(chalk.green.bold('USAGE:'));
    console.log(chalk.blue('  recoder-code config <command> [options]\\n'));
    
    console.log(chalk.green.bold('COMMANDS:'));
    const configCommands = [
      ['init', 'Initialize configuration and environment files', 'recoder-code config init'],
      ['show', 'Display current configuration settings', 'recoder-code config show'],
      ['get <path>', 'Get specific configuration value', 'recoder-code config get services.ml.url'],
      ['set <path> <value>', 'Set configuration value', 'recoder-code config set cli.theme dark'],
      ['reset --confirm', 'Reset configuration to defaults', 'recoder-code config reset --confirm'],
      ['edit', 'Open configuration file in editor', 'recoder-code config edit']
    ];

    configCommands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(20)}`), chalk.gray(desc));
      console.log(chalk.blue(`                        ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('CONFIGURATION PATHS:'));
    console.log(chalk.gray('  services.ml.url              - ML Training Service endpoint'));
    console.log(chalk.gray('  services.plugins.url         - Plugin Registry endpoint'));  
    console.log(chalk.gray('  services.collaboration.url   - Collaboration Service endpoint'));
    console.log(chalk.gray('  cli.verboseLogging           - Enable detailed logging'));
    console.log(chalk.gray('  cli.contextEngine.enabled    - Enable/disable context engine'));
    console.log(chalk.gray('  user.defaultRole            - Default role for new users\\n'));
    
    console.log(chalk.green.bold('EXAMPLES:'));
    console.log(chalk.blue('  recoder-code config init'), chalk.gray('                    # Set up environment'));
    console.log(chalk.blue('  recoder-code config set services.ml.url http://prod.ml.com'));
    console.log(chalk.blue('  recoder-code config get cli.theme'), chalk.gray('          # Get current theme'));
    console.log();
  }

  showAuthHelp() {
    console.log(chalk.cyan.bold('🔐 USER AUTHENTICATION\\n'));
    
    console.log(chalk.green.bold('DESCRIPTION:'));
    console.log(chalk.gray('  Manage user accounts, authentication, and access to services.\\n'));
    
    console.log(chalk.green.bold('USAGE:'));
    console.log(chalk.blue('  recoder-code auth <command> [options]\\n'));
    
    console.log(chalk.green.bold('COMMANDS:'));
    const authCommands = [
      ['register <user> <email> <pass> [name]', 'Create new user account', 'recoder-code auth register alice alice@dev.com mypass123 "Alice"'],
      ['login <username> <password>', 'Login to services', 'recoder-code auth login alice mypass123'],
      ['logout', 'Logout and clear authentication', 'recoder-code auth logout'],
      ['whoami', 'Show current user information', 'recoder-code auth whoami'],
      ['status', 'Check authentication status', 'recoder-code auth status']
    ];

    authCommands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(35)}`), chalk.gray(desc));
      console.log(chalk.blue(`                                     ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('USER ROLES:'));
    console.log(chalk.gray('  USER       - Basic access to services'));
    console.log(chalk.gray('  DEVELOPER  - Can train models and use advanced features'));
    console.log(chalk.gray('  RESEARCHER - Full access to ML training and research tools'));
    console.log(chalk.gray('  ADMIN      - Full system administration access\\n'));

    console.log(chalk.green.bold('EXAMPLES:'));
    console.log(chalk.blue('  recoder-code auth register dev dev@company.com secretpass "Developer"'));
    console.log(chalk.blue('  recoder-code auth login dev secretpass'));
    console.log(chalk.blue('  recoder-code auth whoami'), chalk.gray('                      # View profile'));
    console.log();
  }

  showTrainHelp() {
    console.log(chalk.cyan.bold('🧠 ML MODEL TRAINING\\n'));
    
    console.log(chalk.green.bold('DESCRIPTION:'));
    console.log(chalk.gray('  Train and merge machine learning models using MergeKit integration.\\n'));
    
    console.log(chalk.green.bold('USAGE:'));
    console.log(chalk.blue('  recoder-code train <command> [options]\\n'));
    
    console.log(chalk.green.bold('COMMANDS:'));
    const trainCommands = [
      ['merge <config.json>', 'Submit model merge job', 'recoder-code train merge my-merge.json'],
      ['status <job-id>', 'Check training job status', 'recoder-code train status job_12345']
    ];

    trainCommands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(20)}`), chalk.gray(desc));
      console.log(chalk.blue(`                        ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('MERGE CONFIGURATION FORMAT:'));
    console.log(chalk.gray('  {'));
    console.log(chalk.gray('    "name": "My Custom Model",'));
    console.log(chalk.gray('    "description": "Custom merged model",'));  
    console.log(chalk.gray('    "merge_method": "linear",'));
    console.log(chalk.gray('    "models": ['));
    console.log(chalk.gray('      {"model": "microsoft/DialoGPT-small", "weight": 0.7},'));
    console.log(chalk.gray('      {"model": "microsoft/DialoGPT-medium", "weight": 0.3}'));
    console.log(chalk.gray('    ],'));
    console.log(chalk.gray('    "parameters": {'));
    console.log(chalk.gray('      "dtype": "float16",'));
    console.log(chalk.gray('      "output_path": "./merged-model"'));
    console.log(chalk.gray('    }'));
    console.log(chalk.gray('  }\\n'));

    console.log(chalk.green.bold('MERGE METHODS:'));
    console.log(chalk.gray('  linear           - Linear interpolation between models'));
    console.log(chalk.gray('  slerp            - Spherical linear interpolation'));
    console.log(chalk.gray('  task_arithmetic  - Task arithmetic merging'));
    console.log(chalk.gray('  ties             - TIES merging method\\n'));

    console.log(chalk.green.bold('EXAMPLES:'));
    console.log(chalk.blue('  recoder-code train merge examples/basic-merge.json'));
    console.log(chalk.blue('  recoder-code train status job_abc123'), chalk.gray('  # Check job progress'));
    console.log();
  }

  showPluginsHelp() {
    console.log(chalk.cyan.bold('📦 PLUGIN MANAGEMENT\\n'));
    
    console.log(chalk.green.bold('DESCRIPTION:'));
    console.log(chalk.gray('  Discover, search, and install plugins from the plugin registry.\\n'));
    
    console.log(chalk.green.bold('USAGE:'));
    console.log(chalk.blue('  recoder-code plugins <command> [options]\\n'));
    
    console.log(chalk.green.bold('COMMANDS:'));
    const pluginCommands = [
      ['search <query>', 'Search for plugins', 'recoder-code plugins search "code analyzer"'],
      ['install <name>', 'Install a plugin', 'recoder-code plugins install my-plugin']
    ];

    pluginCommands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(20)}`), chalk.gray(desc));
      console.log(chalk.blue(`                        ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('PLUGIN CATEGORIES:'));
    console.log(chalk.gray('  Code Analysis    - Static analysis and linting tools'));
    console.log(chalk.gray('  AI Assistants    - AI-powered development helpers'));
    console.log(chalk.gray('  Integrations     - Third-party service integrations'));
    console.log(chalk.gray('  Templates        - Project templates and scaffolds\\n'));

    console.log(chalk.green.bold('EXAMPLES:'));
    console.log(chalk.blue('  recoder-code plugins search "typescript"'), chalk.gray('  # Find TypeScript plugins'));
    console.log(chalk.blue('  recoder-code plugins search "ai"'), chalk.gray('          # Find AI-related plugins'));
    console.log(chalk.blue('  recoder-code plugins install ts-analyzer'), chalk.gray(' # Install specific plugin'));
    console.log();
  }

  showCollabHelp() {
    console.log(chalk.cyan.bold('🤝 REAL-TIME COLLABORATION\\n'));
    
    console.log(chalk.green.bold('DESCRIPTION:'));
    console.log(chalk.gray('  Create and join real-time collaborative editing sessions.\\n'));
    
    console.log(chalk.green.bold('USAGE:'));
    console.log(chalk.blue('  recoder-code collab <command> [options]\\n'));
    
    console.log(chalk.green.bold('COMMANDS:'));
    const collabCommands = [
      ['create [name]', 'Create new collaboration session', 'recoder-code collab create "My Project"'],
      ['join <session-id>', 'Join existing session', 'recoder-code collab join abc-123-def']
    ];

    collabCommands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(20)}`), chalk.gray(desc));
      console.log(chalk.blue(`                        ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('COLLABORATION FEATURES:'));
    console.log(chalk.gray('  Real-time Editing    - Simultaneous editing with operational transform'));
    console.log(chalk.gray('  Cursor Awareness     - See other users\' cursors and selections'));
    console.log(chalk.gray('  User Presence        - View who is currently in the session'));
    console.log(chalk.gray('  Session Management   - Create, join, and manage sessions\\n'));

    console.log(chalk.green.bold('EXAMPLES:'));
    console.log(chalk.blue('  recoder-code collab create "Backend Team"'), chalk.gray(' # Create team session'));
    console.log(chalk.blue('  recoder-code collab join sess_123abc'), chalk.gray('       # Join by ID'));
    console.log();
  }

  showServicesHelp() {
    console.log(chalk.cyan.bold('🌐 SERVICES MANAGEMENT\\n'));
    
    console.log(chalk.green.bold('DESCRIPTION:'));
    console.log(chalk.gray('  Monitor and manage Recoder Code microservices health and status.\\n'));
    
    console.log(chalk.green.bold('USAGE:'));
    console.log(chalk.blue('  recoder-code services <command>\\n'));
    
    console.log(chalk.green.bold('COMMANDS:'));
    const serviceCommands = [
      ['status', 'Show health status of all services', 'recoder-code services status'],
      ['config', 'Display services configuration', 'recoder-code services config'],
      ['enable', 'Enable services integration', 'recoder-code services enable'],
      ['disable', 'Disable services integration', 'recoder-code services disable'],
      ['reset', 'Reset services configuration', 'recoder-code services reset']
    ];

    serviceCommands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(10)}`), chalk.gray(desc));
      console.log(chalk.blue(`              ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('MICROSERVICES:'));
    console.log(chalk.gray('  ML Training Service      - http://localhost:8000'));
    console.log(chalk.gray('    • Model training and merging'));
    console.log(chalk.gray('    • JWT authentication'));
    console.log(chalk.gray('    • MergeKit integration\\n'));
    
    console.log(chalk.gray('  Plugin Registry Service  - http://localhost:3000'));
    console.log(chalk.gray('    • Package discovery'));
    console.log(chalk.gray('    • Plugin installation'));
    console.log(chalk.gray('    • Metadata management\\n'));
    
    console.log(chalk.gray('  Collaboration Service    - http://localhost:3003'));
    console.log(chalk.gray('    • Real-time sessions'));
    console.log(chalk.gray('    • WebSocket communication'));
    console.log(chalk.gray('    • Operational transform\\n'));

    console.log(chalk.green.bold('EXAMPLES:'));
    console.log(chalk.blue('  recoder-code services status'), chalk.gray('  # Check all services'));
    console.log(chalk.blue('  recoder-code services config'), chalk.gray('  # View configuration'));
    console.log();
  }

  showCommandHelp(command, forceAdvanced = false) {
    // Check for --advanced flag to show full help
    if (forceAdvanced || command === '--advanced') {
      this.showAdvancedHelp();
      return;
    }
    
    switch (command?.toLowerCase()) {
      case 'config':
        this.showConfigHelp();
        break;
      case 'auth':
      case 'user':
        this.showAuthHelp();
        break;
      case 'train':
      case 'training':
        this.showTrainHelp();
        break;
      case 'plugins':
      case 'plugin':
        this.showPluginsHelp();
        break;
      case 'collab':
      case 'collaborate':
      case 'collaboration':
        this.showCollabHelp();
        break;
      case 'services':
      case 'service':
        this.showServicesHelp();
        break;
      default:
        if (command) {
          console.log(chalk.red(`❌ Unknown command: ${command}\\n`));
        }
        this.showMainHelp();
    }
  }

  showVersion() {
    console.log(chalk.cyan.bold(`Recoder Code v${this.version}`));
    console.log(chalk.gray('Complete AI-powered development platform'));
    console.log(chalk.gray('Copyright © 2024 Recoder Code Team'));
  }

  showSystemInfo() {
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    
    console.log(chalk.cyan.bold('🖥️  SYSTEM INFORMATION\\n'));
    
    console.log(chalk.green('Version:'), chalk.white(this.version));
    console.log(chalk.green('Node.js:'), chalk.white(process.version));
    console.log(chalk.green('Platform:'), chalk.white(`${os.platform()} ${os.arch()}`));
    console.log(chalk.green('Memory:'), chalk.white(`${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`));
    
    // Check config
    const configPath = path.join(os.homedir(), '.recoder-code', 'config.json');
    const configExists = fs.existsSync(configPath);
    console.log(chalk.green('Config:'), configExists ? chalk.green('✅ Found') : chalk.red('❌ Not initialized'));
    
    // Check services config
    const servicesPath = path.join(os.homedir(), '.recoder-services-config.json');
    const servicesExists = fs.existsSync(servicesPath);
    console.log(chalk.green('Services:'), servicesExists ? chalk.green('✅ Configured') : chalk.yellow('⚠️  Default settings'));
    
    console.log();
    console.log(chalk.gray('To initialize configuration: recoder-code config init'));
    console.log();
  }

  showBeginnerHelp() {
    console.log(chalk.cyan.bold(`
╭─────────────────────────────────────────────────────╮
│             🚀 WELCOME TO RECODER-CODE!             │
│         Get started with AI coding in 30 seconds    │
╰─────────────────────────────────────────────────────╯
`));

    console.log(chalk.green.bold('✨ FIRST TIME HERE?'));
    console.log(chalk.white('  Recoder-Code is the easiest way to code with AI!'));
    console.log(chalk.gray('  • Chat with 32+ AI models'));
    console.log(chalk.gray('  • Build complete projects'));
    console.log(chalk.gray('  • Free models included'));
    console.log();

    console.log(chalk.green.bold('🚀 GET STARTED IN 3 STEPS:'));
    console.log(chalk.blue('  1. recoder-code --setup'), chalk.gray('    # 30-second setup'));
    console.log(chalk.blue('  2. recoder-code'), chalk.gray('             # Start chatting'));
    console.log(chalk.blue('  3. recoder-code "Build me a todo app"'), chalk.gray(' # Build something!'));
    console.log();

    console.log(chalk.green.bold('💬 QUICK EXAMPLES:'));
    console.log(chalk.blue('  recoder-code "Hello world"'), chalk.gray('        # Simple chat'));
    console.log(chalk.blue('  recoder-code "Create a React app"'), chalk.gray('   # Build projects'));
    console.log(chalk.blue('  recoder-code "Fix this bug"'), chalk.gray('        # Code help'));
    console.log(chalk.blue('  recoder-code --stream "Help me"'), chalk.gray('     # Streaming responses'));
    console.log();

    console.log(chalk.green.bold('📚 LEARN MORE:'));
    console.log(chalk.blue('  recoder-code --help --advanced'), chalk.gray('   # Full help (after setup)'));
    console.log(chalk.blue('  recoder-code --progress'), chalk.gray('          # Check your progress'));
    console.log(chalk.blue('  recoder-code --models'), chalk.gray('           # See all AI models'));
    console.log(chalk.blue('  recoder-code --enable-services'), chalk.gray(' # Enable collaboration & ML'));
    console.log();

    console.log(chalk.cyan('💡 TIP:'), chalk.gray('Start simple with chat, then explore advanced features!'));
    console.log();
  }

  showAdvancedHelp() {
    console.log(chalk.cyan.bold(`
╭─────────────────────────────────────────────────────╮
│                   RECODER CODE v${this.version}                   │
│          AI-Powered Development Platform            │
╰─────────────────────────────────────────────────────╯
`));

    console.log(chalk.green.bold('🚀 QUICK START:'));
    console.log(chalk.gray('  1. Initialize your environment:'));
    console.log(chalk.blue('     recoder-code config init'));
    console.log(chalk.gray('  2. Register or login:'));
    console.log(chalk.blue('     recoder-code auth register <username> <email> <password>'));
    console.log(chalk.gray('  3. Check services status:'));
    console.log(chalk.blue('     recoder-code services status'));

    console.log(chalk.green.bold('\\n📋 MAIN COMMANDS:'));
    
    const commands = [
      ['config', 'Configuration management and environment setup', 'recoder-code config init'],
      ['auth', 'User authentication and account management', 'recoder-code auth login <user> <pass>'],
      ['services', 'Service health monitoring and management', 'recoder-code services status'],
      ['train', 'ML model training and merging operations', 'recoder-code train merge config.json'],
      ['plugins', 'Plugin discovery and installation', 'recoder-code plugins search "analyzer"'],
      ['collab', 'Real-time collaboration sessions', 'recoder-code collab create "My Session"'],
      ['help', 'Show help information for commands', 'recoder-code help <command>']
    ];

    commands.forEach(([cmd, desc, example]) => {
      console.log(chalk.cyan(`  ${cmd.padEnd(10)}`), chalk.gray(desc));
      console.log(chalk.blue(`             ${example}`));
      console.log();
    });

    console.log(chalk.green.bold('💡 GET DETAILED HELP:'));
    console.log(chalk.blue('  recoder-code help <command>'), chalk.gray('- Show detailed help for a command'));
    console.log(chalk.blue('  recoder-code --version'), chalk.gray('     - Show version information'));
    console.log(chalk.blue('  recoder-code --info'), chalk.gray('        - Show system information'));

    console.log(chalk.green.bold('\\n🌐 SERVICES ARCHITECTURE:'));
    console.log(chalk.gray('  • ML Training Service    - Model merging and training jobs'));
    console.log(chalk.gray('  • Plugin Registry       - Package discovery and management'));
    console.log(chalk.gray('  • Collaboration Service - Real-time collaborative editing'));

    console.log(chalk.green.bold('\\n📚 DOCUMENTATION:'));
    console.log(chalk.blue('  Setup Guide:'), chalk.gray('  cat SETUP.md'));
    console.log(chalk.blue('  Examples:'), chalk.gray('     ls examples/'));
    console.log(chalk.blue('  Config File:'), chalk.gray('  ~/.recoder-code/config.json'));

    console.log();
  }
}

module.exports = HelpSystem;