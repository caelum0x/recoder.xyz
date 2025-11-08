/**
 * Configuration Manager for Recoder Code
 * Handles environment setup, service configuration, and user preferences
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.configFile = path.join(this.configDir, 'config.json');
    this.envFile = path.join(this.configDir, '.env');
    this.defaultConfig = this.getDefaultConfig();
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  getDefaultConfig() {
    return {
      version: '1.0.0',
      services: {
        ml: {
          url: process.env.RECODER_ML_SERVICE || 'http://localhost:8000',
          enabled: true,
          timeout: 30000
        },
        plugins: {
          url: process.env.RECODER_PLUGIN_REGISTRY || 'http://localhost:3000',
          enabled: true,
          timeout: 15000
        },
        collaboration: {
          url: process.env.RECODER_COLLAB_SERVICE || 'http://localhost:3003',
          enabled: true,
          timeout: 10000
        }
      },
      user: {
        defaultRole: 'developer',
        autoLogin: false,
        saveCredentials: false
      },
      cli: {
        theme: 'default',
        verboseLogging: false,
        autoUpdate: true,
        contextEngine: {
          enabled: true,
          maxFiles: 1000,
          excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
        }
      },
      integrations: {
        vscode: {
          enabled: false,
          socketPath: null
        },
        docker: {
          enabled: false,
          composeFile: 'docker-compose.yml'
        }
      },
      environment: process.env.NODE_ENV || 'development'
    };
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        // Merge with defaults to ensure all keys exist
        return { ...this.defaultConfig, ...config };
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load config: ${error.message}`));
    }
    
    return this.defaultConfig;
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Could not save config: ${error.message}`));
      return false;
    }
  }

  updateConfig(path, value) {
    const config = this.loadConfig();
    const keys = path.split('.');
    let current = config;
    
    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    // Set the value
    current[keys[keys.length - 1]] = value;
    
    return this.saveConfig(config);
  }

  getConfig(path = null) {
    const config = this.loadConfig();
    
    if (!path) return config;
    
    const keys = path.split('.');
    let current = config;
    
    for (const key of keys) {
      if (current[key] === undefined) {
        return null;
      }
      current = current[key];
    }
    
    return current;
  }

  resetConfig() {
    if (fs.existsSync(this.configFile)) {
      fs.unlinkSync(this.configFile);
    }
    if (fs.existsSync(this.envFile)) {
      fs.unlinkSync(this.envFile);
    }
    console.log(chalk.green('✅ Configuration reset to defaults'));
  }

  initializeEnvironment() {
    console.log(chalk.cyan.bold('🚀 Initializing Recoder Code Environment\\n'));
    
    const config = this.loadConfig();
    
    // Create environment file if it doesn't exist
    if (!fs.existsSync(this.envFile)) {
      const envContent = this.generateEnvTemplate();
      fs.writeFileSync(this.envFile, envContent);
      console.log(chalk.green(`✅ Created environment file: ${this.envFile}`));
    }
    
    // Save initial config
    this.saveConfig(config);
    console.log(chalk.green(`✅ Configuration file: ${this.configFile}`));
    
    // Show next steps
    console.log(chalk.cyan.bold('\\n📋 Next Steps:'));
    console.log(chalk.gray('1. Review your configuration:'));
    console.log(chalk.blue(`   recoder-code config show`));
    console.log(chalk.gray('2. Start the services:'));
    console.log(chalk.blue(`   recoder-code services status`));
    console.log(chalk.gray('3. Register or login:'));
    console.log(chalk.blue(`   recoder-code auth register <username> <email> <password>`));
    console.log();
  }

  generateEnvTemplate() {
    return `# Recoder Code Environment Configuration
# Generated on ${new Date().toISOString()}

# Service URLs - Modify these if running services on different hosts/ports
RECODER_ML_SERVICE=http://localhost:8000
RECODER_PLUGIN_REGISTRY=http://localhost:3000
RECODER_COLLAB_SERVICE=http://localhost:3003

# Database Configuration (for local development)
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432
# POSTGRES_DB=recoder_code
# POSTGRES_USER=recoder
# POSTGRES_PASSWORD=your_password

# Redis Configuration
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=

# Authentication
# JWT_SECRET_KEY=your-secret-key-change-this-in-production
# JWT_ALGORITHM=HS256
# ACCESS_TOKEN_EXPIRE_MINUTES=30

# Development vs Production
NODE_ENV=development

# Optional: OpenAI/Claude API keys for enhanced features
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=

# Docker configuration
# DOCKER_COMPOSE_FILE=docker-compose.yml
# DOCKER_REGISTRY=

# Enable debug logging
# DEBUG=recoder:*
`;
  }

  showConfig() {
    const config = this.loadConfig();
    
    console.log(chalk.cyan.bold('⚙️  Recoder Code Configuration\\n'));
    
    // Services
    console.log(chalk.green.bold('🌐 Services:'));
    Object.entries(config.services).forEach(([name, service]) => {
      const status = service.enabled ? chalk.green('✅ enabled') : chalk.red('❌ disabled');
      console.log(`  ${name.toUpperCase()}: ${service.url} ${status}`);
    });
    
    // User settings
    console.log(chalk.green.bold('\\n👤 User Settings:'));
    console.log(`  Default Role: ${config.user.defaultRole}`);
    console.log(`  Auto Login: ${config.user.autoLogin ? 'Yes' : 'No'}`);
    
    // CLI settings
    console.log(chalk.green.bold('\\n🖥️  CLI Settings:'));
    console.log(`  Theme: ${config.cli.theme}`);
    console.log(`  Verbose Logging: ${config.cli.verboseLogging ? 'Yes' : 'No'}`);
    console.log(`  Context Engine: ${config.cli.contextEngine.enabled ? 'Enabled' : 'Disabled'}`);
    
    // Environment
    console.log(chalk.green.bold('\\n🌍 Environment:'));
    console.log(`  Mode: ${config.environment}`);
    console.log(`  Config File: ${this.configFile}`);
    console.log(`  Env File: ${this.envFile}`);
    
    console.log();
  }

  async handleConfigCommand(action, ...args) {
    switch (action) {
      case 'init':
        const [mode] = args;
        if (mode === '--guided' || mode === '--onboard') {
          const OnboardingFlow = require('./onboarding');
          const onboarding = new OnboardingFlow();
          await onboarding.start();
        } else {
          this.initializeEnvironment();
        }
        break;
        
      case 'show':
      case 'list':
        this.showConfig();
        break;
        
      case 'get':
        const [getPath] = args;
        if (!getPath) {
          console.log(chalk.yellow('Usage: recoder-code config get <path>'));
          return;
        }
        const value = this.getConfig(getPath);
        if (value === null) {
          console.log(chalk.red(`❌ Configuration path '${getPath}' not found`));
        } else {
          console.log(JSON.stringify(value, null, 2));
        }
        break;
        
      case 'set':
        const [setPath, setValue] = args;
        if (!setPath || setValue === undefined) {
          console.log(chalk.yellow('Usage: recoder-code config set <path> <value>'));
          return;
        }
        
        // Try to parse value as JSON, fallback to string
        let parsedValue;
        try {
          parsedValue = JSON.parse(setValue);
        } catch {
          parsedValue = setValue;
        }
        
        if (this.updateConfig(setPath, parsedValue)) {
          console.log(chalk.green(`✅ Updated ${setPath} = ${setValue}`));
        }
        break;
        
      case 'reset':
        const [confirm] = args;
        if (confirm !== '--confirm') {
          console.log(chalk.yellow('This will reset all configuration to defaults.'));
          console.log(chalk.yellow('Use: recoder-code config reset --confirm'));
          return;
        }
        this.resetConfig();
        break;
        
      case 'edit':
        const editor = process.env.EDITOR || 'nano';
        console.log(chalk.blue(`📝 Opening config in ${editor}...`));
        const { spawn } = require('child_process');
        const child = spawn(editor, [this.configFile], { stdio: 'inherit' });
        child.on('close', (code) => {
          if (code === 0) {
            console.log(chalk.green('✅ Configuration updated'));
          } else {
            console.log(chalk.red('❌ Editor closed with error'));
          }
        });
        break;
        
      default:
        console.log(chalk.yellow('Usage: recoder-code config <init|show|get|set|reset|edit>'));
        console.log(chalk.gray('  init                    - Initialize environment'));
        console.log(chalk.gray('  show                    - Show current configuration'));
        console.log(chalk.gray('  get <path>              - Get configuration value'));
        console.log(chalk.gray('  set <path> <value>      - Set configuration value'));
        console.log(chalk.gray('  reset --confirm         - Reset to defaults'));
        console.log(chalk.gray('  edit                    - Edit config file'));
    }
  }
}

module.exports = ConfigManager;