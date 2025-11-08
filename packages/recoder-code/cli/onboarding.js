/**
 * User Onboarding Flow for Recoder Code
 * Guides new users through setup and first usage
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const ConfigManager = require('./config-manager');
const ServicesManager = require('./services-manager');

class OnboardingFlow {
  constructor() {
    this.configManager = new ConfigManager();
    this.servicesManager = new ServicesManager();
    this.step = 1;
    this.totalSteps = 7;
  }

  async start() {
    console.log(chalk.cyan.bold(`
╭─────────────────────────────────────────────────────╮
│             🚀 WELCOME TO RECODER CODE              │
│      AI-Powered Development Platform Setup         │
╰─────────────────────────────────────────────────────╯
`));

    console.log(chalk.green(`Welcome! This setup wizard will help you get started with Recoder Code.`));
    console.log(chalk.gray(`This will take about 2-3 minutes to complete.\\n`));

    // Check if already configured
    const configExists = fs.existsSync(this.configManager.configFile);
    if (configExists) {
      const proceed = await this.askYesNo('Configuration already exists. Would you like to reconfigure?', false);
      if (!proceed) {
        console.log(chalk.green('✅ Setup cancelled. Your existing configuration is preserved.'));
        return;
      }
    }

    console.log(chalk.cyan(`Let's get started!\\n`));

    try {
      await this.step1_Welcome();
      await this.step2_InitializeConfig();
      await this.step3_CheckServices();
      await this.step4_CreateUser();
      await this.step5_TestFeatures();
      await this.step6_ExampleFiles();
      await this.step7_Complete();
    } catch (error) {
      console.log(chalk.red(`\\n❌ Setup failed: ${error.message}`));
      console.log(chalk.gray(`You can restart setup anytime with: recoder-code config init`));
    }
  }

  async step1_Welcome() {
    this.showProgress('System Overview');
    
    console.log(chalk.green.bold('🌐 RECODER CODE FEATURES:\\n'));
    
    const features = [
      ['🧠 ML Training', 'Train and merge machine learning models with MergeKit'],
      ['📦 Plugin Registry', 'Discover and install development plugins'],
      ['🤝 Collaboration', 'Real-time collaborative editing sessions'],
      ['⚙️  Configuration', 'Flexible environment and service management'],
      ['🔐 Authentication', 'Secure user accounts with role-based access'],
      ['💻 CLI Interface', 'Powerful command-line tools and automation']
    ];

    features.forEach(([icon, desc]) => {
      console.log(chalk.cyan(`  ${icon}`) + chalk.gray(` ${desc}`));
    });

    console.log();
    await this.pause();
  }

  async step2_InitializeConfig() {
    this.showProgress('Configuration Setup');
    
    console.log(chalk.blue('🔧 Setting up your configuration...\\n'));
    
    // Initialize configuration
    this.configManager.initializeEnvironment();
    
    console.log(chalk.green('✅ Configuration files created successfully!'));
    console.log(chalk.gray(`   Config: ${this.configManager.configFile}`));
    console.log(chalk.gray(`   Environment: ${this.configManager.envFile}\\n`));
    
    await this.pause();
  }

  async step3_CheckServices() {
    this.showProgress('Service Health Check');
    
    console.log(chalk.blue('🌐 Checking service availability...\\n'));
    
    const health = await this.servicesManager.checkServicesHealth();
    
    let allHealthy = true;
    Object.entries(health).forEach(([name, status]) => {
      if (status.available) {
        console.log(chalk.green(`✅ ${name.toUpperCase()}: ${status.status} (${status.url})`));
      } else {
        console.log(chalk.red(`❌ ${name.toUpperCase()}: offline (${status.url})`));
        console.log(chalk.gray(`   ${status.error}`));
        allHealthy = false;
      }
    });

    if (!allHealthy) {
      console.log(chalk.yellow('\\n⚠️  Some services are not available. You can:'));
      console.log(chalk.gray('   • Start services manually (see SETUP.md)'));
      console.log(chalk.gray('   • Use Docker: docker-compose up -d'));
      console.log(chalk.gray('   • Configure different service URLs'));
      console.log(chalk.gray('\\n   Don\'t worry - you can continue setup and start services later.'));
    } else {
      console.log(chalk.green('\\n🎉 All services are running perfectly!'));
    }

    console.log();
    await this.pause();
  }

  async step4_CreateUser() {
    this.showProgress('User Account Setup');
    
    console.log(chalk.blue('👤 Let\'s create your user account...\\n'));
    
    const createAccount = await this.askYesNo('Would you like to create a user account now?', true);
    
    if (createAccount) {
      try {
        const username = await this.askQuestion('Username:', 'developer');
        const email = await this.askQuestion('Email:', `${username}@example.com`);
        const password = await this.askQuestion('Password:', 'password123', true);
        const fullName = await this.askQuestion('Full Name (optional):', `${username.charAt(0).toUpperCase() + username.slice(1)} User`);

        await this.servicesManager.registerUser(username, email, password, fullName);
        console.log(chalk.green(`\\n✅ Account created successfully! You can login with: ${username}`));
        
        // Try to login automatically
        try {
          await this.servicesManager.loginUser(username, password);
          console.log(chalk.green('✅ Automatically logged in!'));
        } catch (error) {
          console.log(chalk.yellow('⚠️  Account created but auto-login failed. You can login manually later.'));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Account creation failed: ${error.message}`));
        console.log(chalk.gray('You can create an account later with: recoder-code auth register'));
      }
    } else {
      console.log(chalk.gray('Skipped account creation. You can create one later with:'));
      console.log(chalk.blue('recoder-code auth register <username> <email> <password>'));
    }

    console.log();
    await this.pause();
  }

  async step5_TestFeatures() {
    this.showProgress('Feature Testing');
    
    console.log(chalk.blue('🧪 Let\'s test some features...\\n'));
    
    // Test plugin search
    console.log(chalk.cyan('Testing plugin search...'));
    try {
      const plugins = await this.servicesManager.searchPlugins('test');
      console.log(chalk.green(`✅ Plugin search working (found ${plugins.length} results)`));
    } catch (error) {
      console.log(chalk.red(`❌ Plugin search failed: ${error.message}`));
    }
    
    // Test collaboration
    console.log(chalk.cyan('Testing collaboration service...'));
    try {
      const sessionId = await this.servicesManager.createCollaborationSession('Welcome Session');
      console.log(chalk.green(`✅ Collaboration working (session: ${sessionId})`));
    } catch (error) {
      console.log(chalk.red(`❌ Collaboration failed: ${error.message}`));
    }

    console.log();
    await this.pause();
  }

  async step6_ExampleFiles() {
    this.showProgress('Example Files');
    
    console.log(chalk.blue('📝 Creating example files...\\n'));
    
    const examplesDir = path.join(process.cwd(), 'recoder-examples');
    
    try {
      if (!fs.existsSync(examplesDir)) {
        fs.mkdirSync(examplesDir, { recursive: true });
      }
      
      // Create example merge config
      const mergeConfig = {
        name: 'Example Model Merge',
        description: 'Example configuration for merging two DialoGPT models',
        merge_method: 'linear',
        models: [
          { model: 'microsoft/DialoGPT-small', weight: 0.7 },
          { model: 'microsoft/DialoGPT-medium', weight: 0.3 }
        ],
        parameters: {
          dtype: 'float16',
          output_path: './merged-model'
        },
        tags: ['example', 'onboarding']
      };
      
      const configPath = path.join(examplesDir, 'example-merge.json');
      fs.writeFileSync(configPath, JSON.stringify(mergeConfig, null, 2));
      
      // Create README
      const readme = `# Recoder Code Examples

Welcome to Recoder Code! Here are some examples to get you started:

## Model Training Example
\`\`\`bash
recoder-code train merge example-merge.json
\`\`\`

## Plugin Management
\`\`\`bash
recoder-code plugins search "analyzer"
recoder-code plugins install my-favorite-plugin
\`\`\`

## Collaboration
\`\`\`bash
recoder-code collab create "My Project Session"
\`\`\`

## Configuration
\`\`\`bash
recoder-code config show
recoder-code config set cli.theme dark
\`\`\`

## Authentication  
\`\`\`bash
recoder-code auth whoami
recoder-code auth status
\`\`\`

For more information, see the main documentation:
- Setup Guide: cat ../SETUP.md
- Help: recoder-code help
`;
      
      const readmePath = path.join(examplesDir, 'README.md');
      fs.writeFileSync(readmePath, readme);
      
      console.log(chalk.green('✅ Example files created:'));
      console.log(chalk.gray(`   Directory: ${examplesDir}`));
      console.log(chalk.gray(`   Files: example-merge.json, README.md`));
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to create examples: ${error.message}`));
    }

    console.log();
    await this.pause();
  }

  async step7_Complete() {
    this.showProgress('Setup Complete');
    
    console.log(chalk.green.bold('🎉 SETUP COMPLETE!\\n'));
    
    console.log(chalk.cyan.bold('📋 WHAT\'S NEXT:\\n'));
    
    const nextSteps = [
      'Check service status: recoder-code services status',
      'View your profile: recoder-code auth whoami',  
      'Search for plugins: recoder-code plugins search "your-interest"',
      'Try model training: recoder-code train merge recoder-examples/example-merge.json',
      'Start collaborating: recoder-code collab create "My First Session"',
      'Get help anytime: recoder-code help <command>'
    ];
    
    nextSteps.forEach((step, index) => {
      console.log(chalk.green(`${index + 1}. `), chalk.blue(step));
    });
    
    console.log(chalk.cyan.bold('\\n📚 RESOURCES:\\n'));
    console.log(chalk.blue('Setup Guide:'), chalk.gray('cat SETUP.md'));
    console.log(chalk.blue('Examples:'), chalk.gray('ls recoder-examples/'));
    console.log(chalk.blue('Configuration:'), chalk.gray('recoder-code config show'));
    console.log(chalk.blue('Help System:'), chalk.gray('recoder-code help'));
    
    console.log(chalk.green.bold('\\n✨ Happy coding with Recoder Code! ✨\\n'));
  }

  showProgress(stepName) {
    console.log(chalk.cyan.bold(`[${this.step}/${this.totalSteps}] ${stepName}`));
    console.log(chalk.gray('─'.repeat(50)));
    this.step++;
  }

  async pause() {
    if (process.env.NODE_ENV !== 'test') {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise(resolve => {
        readline.question(chalk.gray('Press Enter to continue...'), () => {
          readline.close();
          console.log();
          resolve();
        });
      });
    }
  }

  async askYesNo(question, defaultValue = true) {
    if (process.env.NODE_ENV === 'test') {
      return defaultValue;
    }
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise(resolve => {
      const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
      readline.question(`${question} ${defaultText}: `, (answer) => {
        readline.close();
        
        if (!answer.trim()) {
          resolve(defaultValue);
        } else {
          resolve(answer.toLowerCase().startsWith('y'));
        }
      });
    });
  }

  async askQuestion(question, defaultValue = '', isPassword = false) {
    if (process.env.NODE_ENV === 'test') {
      return defaultValue;
    }
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    if (isPassword) {
      // Hide password input
      process.stdin.on('keypress', (char, key) => {
        if (key && key.name === 'return') return;
        process.stdout.write('\\r' + question + ' ' + '*'.repeat(readline.line.length));
      });
    }
    
    return new Promise(resolve => {
      const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
      readline.question(prompt, (answer) => {
        readline.close();
        resolve(answer.trim() || defaultValue);
      });
    });
  }
}

module.exports = OnboardingFlow;