/**
 * Smart Defaults System - Auto-configuration for new users
 * Detects user environment and sets optimal defaults
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class SmartDefaults {
  constructor() {
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.configFile = path.join(this.configDir, 'config.json');
  }

  /**
   * Detect user environment and create smart defaults
   */
  async createSmartDefaults() {
    console.log(chalk.cyan('🎯 Creating smart configuration...'));
    
    const environment = this.detectEnvironment();
    const userType = this.detectUserType();
    const capabilities = this.detectCapabilities();
    
    const smartConfig = this.buildSmartConfig(environment, userType, capabilities);
    
    // Create config directory
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Save smart configuration
    fs.writeFileSync(this.configFile, JSON.stringify(smartConfig, null, 2));
    
    this.showConfigSummary(smartConfig);
    return smartConfig;
  }

  /**
   * Detect user's development environment
   */
  detectEnvironment() {
    const environment = {
      os: process.platform,
      node: process.version,
      shell: process.env.SHELL || 'unknown',
      terminal: process.env.TERM || 'unknown',
      ci: !!process.env.CI
    };

    // Check for common development tools
    environment.hasDocker = this.checkCommand('docker');
    environment.hasGit = this.checkCommand('git');
    environment.hasVSCode = fs.existsSync(path.join(os.homedir(), '.vscode')) || 
                            fs.existsSync(path.join(os.homedir(), 'Library/Application Support/Code'));
    environment.hasNode = true; // We know this since we're running
    
    return environment;
  }

  /**
   * Detect what type of user this might be
   */
  detectUserType() {
    const homeDir = os.homedir();
    const indicators = {
      hasProjects: fs.existsSync(path.join(homeDir, 'Projects')) || 
                   fs.existsSync(path.join(homeDir, 'Development')) ||
                   fs.existsSync(path.join(homeDir, 'dev')),
      hasNodeProjects: this.findFiles(homeDir, 'package.json', 3).length > 0,
      hasPythonProjects: this.findFiles(homeDir, 'requirements.txt', 3).length > 0,
      hasDockerfiles: this.findFiles(homeDir, 'Dockerfile', 3).length > 0,
      hasGitRepos: this.findFiles(homeDir, '.git', 3, true).length > 0
    };

    // Determine user type based on indicators
    if (indicators.hasNodeProjects && indicators.hasDockerfiles) {
      return 'fullstack-developer';
    } else if (indicators.hasNodeProjects) {
      return 'frontend-developer';
    } else if (indicators.hasPythonProjects) {
      return 'python-developer';
    } else if (indicators.hasGitRepos) {
      return 'developer';
    } else {
      return 'newcomer';
    }
  }

  /**
   * Detect system capabilities
   */
  detectCapabilities() {
    return {
      hasInternet: true, // Assume true for now
      hasDocker: this.checkCommand('docker'),
      hasGit: this.checkCommand('git'),
      hasNodeJs: true,
      memory: os.totalmem(),
      cores: os.cpus().length,
      arch: os.arch()
    };
  }

  /**
   * Build smart configuration based on detected environment
   */
  buildSmartConfig(environment, userType, capabilities) {
    const baseConfig = {
      version: '2.0.0',
      mode: capabilities.hasDocker && userType !== 'newcomer' ? 'full' : 'lite',
      userType: userType,
      firstRun: false,
      autoDetected: true,
      createdAt: new Date().toISOString()
    };

    // Services configuration based on capabilities
    baseConfig.services = {
      ml: {
        enabled: capabilities.hasDocker && capabilities.memory > 4 * 1024 * 1024 * 1024, // 4GB
        url: 'http://localhost:8000',
        timeout: 30000
      },
      plugins: {
        enabled: capabilities.hasDocker,
        url: 'http://localhost:3000',  
        timeout: 15000
      },
      collaboration: {
        enabled: capabilities.hasDocker && userType.includes('developer'),
        url: 'http://localhost:3003',
        timeout: 10000
      }
    };

    // CLI preferences based on user type
    baseConfig.cli = {
      theme: 'default',
      verboseLogging: userType === 'newcomer',
      autoUpdate: true,
      showTips: userType === 'newcomer',
      contextEngine: {
        enabled: true,
        maxFiles: userType === 'fullstack-developer' ? 2000 : 1000,
        excludePatterns: this.getExcludePatterns(userType)
      }
    };

    // OpenRouter model preferences
    baseConfig.openrouter = {
      defaultModel: this.selectDefaultModel(userType),
      fallbackModels: this.selectFallbackModels(userType),
      preferFreeModels: userType === 'newcomer',
      sort: userType === 'newcomer' ? 'price' : 'throughput'
    };

    // User preferences
    baseConfig.user = {
      defaultRole: userType.includes('developer') ? 'developer' : 'user',
      autoLogin: false,
      saveCredentials: false,
      onboardingCompleted: false
    };

    // Integration settings
    baseConfig.integrations = {
      vscode: {
        enabled: environment.hasVSCode,
        socketPath: null
      },
      docker: {
        enabled: capabilities.hasDocker,
        composeFile: 'docker-compose.yml'
      },
      git: {
        enabled: capabilities.hasGit,
        autoCommit: false
      }
    };

    return baseConfig;
  }

  /**
   * Select default model based on user type
   */
  selectDefaultModel(userType) {
    const modelPreferences = {
      'newcomer': 'deepseek/deepseek-chat', // Free and good
      'python-developer': 'deepseek/deepseek-r1-distill-llama-70b', // Great for Python
      'frontend-developer': 'qwen/qwen-2.5-72b-instruct:free', // Good for web dev
      'fullstack-developer': 'anthropic/claude-sonnet-4', // Premium but powerful
      'developer': 'deepseek/deepseek-r1-distill-llama-70b' // Good general coding
    };

    return modelPreferences[userType] || 'deepseek/deepseek-chat';
  }

  /**
   * Select fallback models based on user type
   */
  selectFallbackModels(userType) {
    if (userType === 'newcomer') {
      return [
        'deepseek/deepseek-chat',
        'qwen/qwen-2.5-72b-instruct:free',
        'google/gemma-2-9b-it:free'
      ];
    } else {
      return [
        'anthropic/claude-3.5-sonnet',
        'deepseek/deepseek-r1-distill-llama-70b',
        'qwen/qwen-2.5-72b-instruct:free'
      ];
    }
  }

  /**
   * Get context engine exclude patterns based on user type
   */
  getExcludePatterns(userType) {
    const basePatterns = ['node_modules/**', '.git/**', 'dist/**', 'build/**'];
    
    const additionalPatterns = {
      'python-developer': ['__pycache__/**', '*.pyc', 'venv/**', '.env/**'],
      'frontend-developer': ['coverage/**', '.next/**', '.nuxt/**'],
      'fullstack-developer': ['logs/**', 'temp/**', 'uploads/**'],
      'newcomer': []
    };

    return [...basePatterns, ...(additionalPatterns[userType] || [])];
  }

  /**
   * Check if a command is available
   */
  checkCommand(command) {
    try {
      require('child_process').execSync(`${command} --version`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find files recursively up to specified depth
   */
  findFiles(dir, filename, maxDepth = 2, isDirectory = false) {
    const results = [];
    
    if (maxDepth < 0) return results;
    
    try {
      const entries = fs.readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (entry === filename) {
            if ((isDirectory && stat.isDirectory()) || (!isDirectory && stat.isFile())) {
              results.push(fullPath);
            }
          }
          
          if (stat.isDirectory() && maxDepth > 0) {
            results.push(...this.findFiles(fullPath, filename, maxDepth - 1, isDirectory));
          }
        } catch (error) {
          // Skip inaccessible files/directories
          continue;
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }
    
    return results;
  }

  /**
   * Show configuration summary to user
   */
  showConfigSummary(config) {
    console.log(chalk.green('\n✅ Smart configuration created!'));
    console.log(chalk.gray('─'.repeat(40)));
    
    console.log(chalk.blue(`🎯 Mode: ${config.mode}`));
    console.log(chalk.blue(`👤 User Type: ${config.userType}`));
    console.log(chalk.blue(`🤖 Default Model: ${config.openrouter.defaultModel}`));
    
    console.log(chalk.yellow('\n🔧 Services:'));
    Object.entries(config.services).forEach(([service, conf]) => {
      const status = conf.enabled ? chalk.green('✅') : chalk.gray('⏸️ ');
      console.log(`   ${status} ${service.charAt(0).toUpperCase() + service.slice(1)}`);
    });
    
    console.log(chalk.cyan('\n💡 Configuration Tips:'));
    if (config.mode === 'lite') {
      console.log(chalk.gray('   • Lite mode enabled for simplicity'));
      console.log(chalk.gray('   • Enable services: recoder-code --enable-services'));
    }
    
    if (config.openrouter.preferFreeModels) {
      console.log(chalk.gray('   • Using free models to start'));
      console.log(chalk.gray('   • Upgrade models anytime with --model flag'));
    }
    
    console.log(chalk.gray(`\n📁 Config saved: ${this.configFile}`));
  }

  /**
   * Load existing configuration or create smart defaults
   */
  async loadOrCreateConfig() {
    if (fs.existsSync(this.configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        return config;
      } catch (error) {
        console.log(chalk.yellow('⚠️  Corrupted config detected, creating new one...'));
      }
    }
    
    return await this.createSmartDefaults();
  }

  /**
   * Update configuration with user preferences
   */
  updateConfig(updates) {
    try {
      let config = {};
      
      if (fs.existsSync(this.configFile)) {
        config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      }
      
      // Deep merge updates
      const updatedConfig = this.deepMerge(config, updates);
      updatedConfig.updatedAt = new Date().toISOString();
      
      fs.writeFileSync(this.configFile, JSON.stringify(updatedConfig, null, 2));
      
      console.log(chalk.green('✅ Configuration updated'));
      return updatedConfig;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to update config: ${error.message}`));
      return null;
    }
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

module.exports = SmartDefaults;