#!/usr/bin/env node

/**
 * Unified Integration Manager
 * 
 * Central hub that coordinates all integrations:
 * - Packages (@qwen-code/core and @qwen-code/cli)
 * - Scripts (build, optimization, utilities)
 * - DevContainer (containerized development)
 * 
 * Provides a single interface for accessing all integrated features
 */

const chalk = require('chalk').default || require('chalk');
const { PackagesIntegration } = require('./packages-integration.js');
const { ScriptsIntegration } = require('./scripts-integration.js');
const { DevContainerIntegration } = require('./devcontainer-integration.js');

class UnifiedIntegration {
  constructor() {
    this.packages = null;
    this.scripts = null;
    this.devcontainer = null;
    this.isInitialized = false;
    this.initializationTime = 0;
  }

  /**
   * Initialize all integrations
   */
  async initialize(options = {}) {
    const startTime = Date.now();
    
    try {
      console.log(chalk.bold.cyan('\n⚡ Initializing Recoder Code Unified Integration...\n'));
      
      // Initialize packages integration
      if (options.packages !== false) {
        const PackagesIntegrationClass = require('./packages-integration.js').getInstance;
        this.packages = PackagesIntegrationClass();
        await this.packages.initialize();
      }
      
      // Initialize scripts integration
      if (options.scripts !== false) {
        const ScriptsIntegrationClass = require('./scripts-integration.js').getInstance;
        this.scripts = ScriptsIntegrationClass();
        await this.scripts.initialize();
      }
      
      // Initialize devcontainer integration
      if (options.devcontainer !== false) {
        const DevContainerIntegrationClass = require('./devcontainer-integration.js').getInstance;
        this.devcontainer = DevContainerIntegrationClass();
        await this.devcontainer.initialize();
      }
      
      this.isInitialized = true;
      this.initializationTime = Date.now() - startTime;
      
      console.log(chalk.bold.green(`\n✅ All integrations initialized in ${this.initializationTime}ms\n`));
      
      // Show summary
      if (options.verbose !== false) {
        this.showIntegrationSummary();
      }
      
    } catch (error) {
      console.error(chalk.red(`\n✗ Integration initialization failed: ${error.message}\n`));
      throw error;
    }
  }

  /**
   * Show integration summary
   */
  showIntegrationSummary() {
    console.log(chalk.bold.cyan('📊 Integration Summary:\n'));
    console.log(chalk.gray('─'.repeat(70)));
    
    // Packages status
    if (this.packages) {
      const pkgStatus = this.packages.getStatus();
      console.log(chalk.bold.yellow('\n🔗 PACKAGES:'));
      console.log(`  Mode: ${chalk.cyan(pkgStatus.mode)}`);
      console.log(`  Core Loaded: ${pkgStatus.coreLoaded ? chalk.green('✓') : chalk.gray('✗')}`);
      console.log(`  CLI Loaded: ${pkgStatus.cliLoaded ? chalk.green('✓') : chalk.gray('✗')}`);
      
      if (pkgStatus.features.length > 0) {
        console.log(`  Features: ${chalk.white(pkgStatus.features.join(', '))}`);
      }
    }
    
    // Scripts status
    if (this.scripts) {
      const scriptStatus = this.scripts.getStatus();
      console.log(chalk.bold.yellow('\n📜 SCRIPTS:'));
      console.log(`  Available: ${chalk.cyan(scriptStatus.totalScripts)} scripts`);
      console.log(`  Location: ${chalk.gray(scriptStatus.scriptsDir)}`);
    }
    
    // DevContainer status
    if (this.devcontainer) {
      const devStatus = this.devcontainer.getStatus();
      console.log(chalk.bold.yellow('\n🐳 DEVCONTAINER:'));
      console.log(`  Docker: ${devStatus.hasDocker ? chalk.green('✓') : chalk.gray('✗')}`);
      console.log(`  DevContainer CLI: ${devStatus.hasDevContainerCLI ? chalk.green('✓') : chalk.gray('✗')}`);
      
      if (devStatus.features.length > 0) {
        console.log(`  Features: ${chalk.white(devStatus.features.join(', '))}`);
      }
    }
    
    console.log(chalk.gray('\n' + '─'.repeat(70) + '\n'));
  }

  /**
   * Get all available commands
   */
  getAvailableCommands() {
    const commands = [];
    
    // Package commands
    if (this.packages && this.packages.arePackagesAvailable()) {
      commands.push({
        category: 'Packages',
        items: [
          { name: '--packages-status', description: 'Show packages integration status' },
          { name: '--build-packages', description: 'Build @qwen-code packages' },
          { name: '--packages-info', description: 'Show detailed packages information' }
        ]
      });
    }
    
    // Script commands
    if (this.scripts && this.scripts.isInitialized) {
      commands.push({
        category: 'Scripts',
        items: [
          { name: '--list-scripts', description: 'List all available scripts' },
          { name: '--script <name>', description: 'Execute a specific script' },
          { name: '--health-check', description: 'Run system health check' },
          { name: '--benchmark', description: 'Run performance benchmark' },
          { name: '--security-audit', description: 'Run security audit' }
        ]
      });
    }
    
    // DevContainer commands
    if (this.devcontainer && this.devcontainer.hasDocker) {
      commands.push({
        category: 'DevContainer',
        items: [
          { name: '--container-list', description: 'List DevContainer configurations' },
          { name: '--container-build', description: 'Build DevContainer' },
          { name: '--container-start', description: 'Start DevContainer services' },
          { name: '--container-stop', description: 'Stop DevContainer services' },
          { name: '--container-status', description: 'Show container status' }
        ]
      });
    }
    
    return commands;
  }

  /**
   * Display integration help
   */
  showHelp() {
    console.log(chalk.bold.cyan('\n🔧 Recoder Code - Unified Integration Help\n'));
    console.log(chalk.gray('─'.repeat(70)));
    
    const commands = this.getAvailableCommands();
    
    for (const category of commands) {
      console.log(chalk.bold.yellow(`\n${category.category.toUpperCase()}:`));
      for (const cmd of category.items) {
        console.log(`  ${chalk.green(cmd.name.padEnd(25))} ${chalk.gray(cmd.description)}`);
      }
    }
    
    console.log(chalk.gray('\n' + '─'.repeat(70)));
    console.log(chalk.cyan('\nExamples:\n'));
    console.log(chalk.white('  recoder-code --list-scripts'));
    console.log(chalk.white('  recoder-code --script health-check'));
    console.log(chalk.white('  recoder-code --build-packages'));
    console.log(chalk.white('  recoder-code --container-start'));
    console.log();
  }

  /**
   * Handle command-line argument
   */
  async handleCommand(command, args = []) {
    try {
      // Package commands
      if (command === '--packages-status') {
        if (this.packages) {
          console.log(JSON.stringify(this.packages.getStatus(), null, 2));
        }
        return true;
      }
      
      if (command === '--build-packages') {
        if (this.packages) {
          await this.packages.buildPackages();
        }
        return true;
      }
      
      if (command === '--packages-info') {
        if (this.packages) {
          const status = this.packages.getStatus();
          console.log(chalk.bold.cyan('\n📦 Packages Information:\n'));
          console.log(chalk.gray('─'.repeat(70)));
          console.log(JSON.stringify(status, null, 2));
          console.log(chalk.gray('─'.repeat(70) + '\n'));
        }
        return true;
      }
      
      // Script commands
      if (command === '--list-scripts') {
        if (this.scripts) {
          this.scripts.listScripts();
        }
        return true;
      }
      
      if (command === '--script') {
        if (this.scripts && args[0]) {
          await this.scripts.executeScript(args[0], args.slice(1));
        } else {
          console.log(chalk.red('Error: Script name required'));
          console.log(chalk.cyan('Usage: recoder-code --script <name> [args]'));
        }
        return true;
      }
      
      if (command === '--health-check') {
        if (this.scripts) {
          await this.scripts.healthCheck();
        }
        return true;
      }
      
      if (command === '--benchmark') {
        if (this.scripts) {
          await this.scripts.performanceBenchmark();
        }
        return true;
      }
      
      if (command === '--security-audit') {
        if (this.scripts) {
          await this.scripts.securityAudit();
        }
        return true;
      }
      
      // DevContainer commands
      if (command === '--container-list') {
        if (this.devcontainer) {
          this.devcontainer.listConfigurations();
        }
        return true;
      }
      
      if (command === '--container-build') {
        if (this.devcontainer) {
          await this.devcontainer.buildDevContainer(args[0]);
        }
        return true;
      }
      
      if (command === '--container-start') {
        if (this.devcontainer) {
          await this.devcontainer.startServices();
        }
        return true;
      }
      
      if (command === '--container-stop') {
        if (this.devcontainer) {
          await this.devcontainer.stopServices();
        }
        return true;
      }
      
      if (command === '--container-status') {
        if (this.devcontainer) {
          await this.devcontainer.showRunningContainers();
        }
        return true;
      }
      
      if (command === '--integration-help') {
        this.showHelp();
        return true;
      }
      
      return false; // Command not handled
      
    } catch (error) {
      console.error(chalk.red(`\n✗ Command failed: ${error.message}\n`));
      throw error;
    }
  }

  /**
   * Get full status of all integrations
   */
  getFullStatus() {
    return {
      initialized: this.isInitialized,
      initializationTime: this.initializationTime,
      packages: this.packages ? this.packages.getStatus() : null,
      scripts: this.scripts ? this.scripts.getStatus() : null,
      devcontainer: this.devcontainer ? this.devcontainer.getStatus() : null,
      availableCommands: this.getAvailableCommands()
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  UnifiedIntegration,
  getInstance: () => {
    if (!instance) {
      instance = new UnifiedIntegration();
    }
    return instance;
  },
  // Export individual integrations for direct access
  getPackagesIntegration: () => require('./packages-integration.js').getInstance(),
  getScriptsIntegration: () => require('./scripts-integration.js').getInstance(),
  getDevContainerIntegration: () => require('./devcontainer-integration.js').getInstance()
};
