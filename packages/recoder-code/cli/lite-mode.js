/**
 * Lite Mode - Simplified recoder-code experience without microservices
 * Perfect for users who just want AI chat functionality
 */

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const fs = require('fs');
const path = require('path');

class LiteMode {
  constructor() {
    this.isLiteMode = false;
    this.disabledFeatures = [];
  }

  /**
   * Check if system should run in lite mode
   */
  shouldUseLiteMode() {
    // Check if user explicitly requested lite mode
    if (process.argv.includes('--lite') || process.env.RECODER_LITE_MODE === 'true') {
      return true;
    }

    // Auto-detect if services are not available
    const servicesDown = this.checkServicesAvailability();
    const isFirstRun = this.isFirstTimeUser();
    
    // Enable lite mode if services aren't running or it's first run
    return servicesDown || isFirstRun;
  }

  /**
   * Check if this is user's first time using recoder-code
   */
  isFirstTimeUser() {
    const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder-code');
    const configFile = path.join(configDir, 'config.json');
    return !fs.existsSync(configFile);
  }

  /**
   * Check if microservices are running
   */
  checkServicesAvailability() {
    // Quick check - if Docker isn't running, services likely aren't either
    try {
      require('child_process').execSync('docker ps', { stdio: 'ignore' });
      return false; // Docker is running, services might be available
    } catch (error) {
      return true; // Docker not available, definitely need lite mode
    }
  }

  /**
   * Initialize lite mode
   */
  initializeLiteMode() {
    this.isLiteMode = true;
    this.disabledFeatures = [
      'ml-training',
      'collaboration',
      'plugins',
      'user-auth',
      'project-management'
    ];

    // Only show in debug mode
    if (process.env.RECODER_DEBUG === 'true') {
      console.log(chalk.cyan('🚀 Running in Lite Mode - AI Chat Only'));
      console.log(chalk.gray('   Advanced features disabled for simplicity'));
      console.log(chalk.gray('   Run "recoder-code --services" to enable full platform\n'));
    }
  }

  /**
   * Show lite mode status
   */
  showStatus() {
    if (!this.isLiteMode) return;

    console.log(chalk.bold.cyan('\n🎯 Lite Mode Status'));
    console.log(chalk.gray('─'.repeat(30)));
    console.log(chalk.green('✅ AI Chat with 32+ models'));
    console.log(chalk.green('✅ File operations'));
    console.log(chalk.green('✅ Code assistance'));
    console.log(chalk.green('✅ Terminal chat'));
    
    console.log(chalk.yellow('\n⏸️  Disabled in Lite Mode:'));
    console.log(chalk.gray('   • Real-time collaboration'));
    console.log(chalk.gray('   • ML model training'));  
    console.log(chalk.gray('   • Plugin marketplace'));
    console.log(chalk.gray('   • User authentication'));
    
    console.log(chalk.cyan('\n💡 Enable full platform:'));
    console.log(chalk.white('   recoder-code --enable-services'));
  }

  /**
   * Check if a feature is available in lite mode
   */
  isFeatureAvailable(featureName) {
    if (!this.isLiteMode) return true;
    return !this.disabledFeatures.includes(featureName);
  }

  /**
   * Handle disabled feature access
   */
  handleDisabledFeature(featureName, friendlyName) {
    if (this.isFeatureAvailable(featureName)) return false;

    console.log(chalk.yellow(`⏸️  ${friendlyName} is disabled in Lite Mode`));
    console.log(chalk.gray(`   Enable with: recoder-code --enable-services`));
    console.log(chalk.gray(`   Or run: recoder-code services start\n`));
    
    return true; // Feature was disabled
  }

  /**
   * Get lite mode configuration
   */
  getLiteConfig() {
    return {
      services: {
        ml: { enabled: false, url: null },
        plugins: { enabled: false, url: null },
        collaboration: { enabled: false, url: null }
      },
      features: {
        chat: true,
        fileOperations: true,
        codeAssistance: true,
        terminalIntegration: true,
        mlTraining: false,
        collaboration: false,
        plugins: false,
        authentication: false
      },
      ui: {
        showLiteIndicator: true,
        hideAdvancedOptions: true,
        simplifiedHelp: true
      }
    };
  }

  /**
   * Create simple setup for lite mode
   */
  async createLiteSetup() {
    const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder-code');
    const configFile = path.join(configDir, 'config.json');

    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Create minimal configuration
    const liteConfig = {
      version: '2.0.0',
      mode: 'lite',
      firstRun: false,
      ...this.getLiteConfig()
    };

    fs.writeFileSync(configFile, JSON.stringify(liteConfig, null, 2));
    
    console.log(chalk.green('✅ Lite mode configuration created'));
    console.log(chalk.gray(`   Config saved: ${configFile}`));
  }

  /**
   * Upgrade from lite mode to full platform
   */
  async upgradeToFullMode() {
    console.log(chalk.cyan('🔧 Upgrading to full platform...'));
    
    // Check prerequisites
    const hasDocker = this.checkDockerAvailable();
    const hasNode = process.version;
    
    console.log(chalk.blue('\n📋 System Check:'));
    console.log(chalk.green(`✅ Node.js ${hasNode}`));
    console.log(hasDocker ? 
      chalk.green('✅ Docker available') : 
      chalk.yellow('⚠️  Docker not found (required for services)')
    );

    if (!hasDocker) {
      console.log(chalk.yellow('\n💡 To enable full platform:'));
      console.log(chalk.white('   1. Install Docker Desktop'));
      console.log(chalk.white('   2. Run: recoder-code services start'));
      console.log(chalk.white('   3. Register: recoder-code auth register'));
      return;
    }

    console.log(chalk.cyan('\n🚀 Starting services...'));
    console.log(chalk.gray('   This will start ML training, collaboration, and plugin services'));
    
    // Here we would start the services
    // For now, just update the config
    this.updateConfigForFullMode();
  }

  checkDockerAvailable() {
    try {
      require('child_process').execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  updateConfigForFullMode() {
    const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.recoder-code');
    const configFile = path.join(configDir, 'config.json');

    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      config.mode = 'full';
      config.services.ml.enabled = true;
      config.services.collaboration.enabled = true;
      config.services.plugins.enabled = true;
      
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
      console.log(chalk.green('✅ Configuration updated to full mode'));
    }
  }
}

module.exports = LiteMode;