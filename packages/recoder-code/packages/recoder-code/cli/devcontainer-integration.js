#!/usr/bin/env node

/**
 * DevContainer Integration Module
 * 
 * Integrates DevContainer functionality into Recoder Code
 * Provides containerized development environment support
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const chalk = require('chalk').default || require('chalk');

const execAsync = promisify(exec);

class DevContainerIntegration {
  constructor() {
    this.devcontainerDir = path.join(__dirname, '..', '.devcontainer');
    this.dockerCompose = path.join(__dirname, '..', 'docker-compose.yml');
    this.isInitialized = false;
    this.hasDocker = false;
    this.hasDevContainerCLI = false;
  }

  /**
   * Initialize DevContainer integration
   */
  async initialize() {
    try {
      console.log(chalk.cyan('🐳 Initializing DevContainer integration...'));
      
      // Check if devcontainer config exists
      if (!fs.existsSync(this.devcontainerDir)) {
        console.log(chalk.yellow('⚠️  DevContainer directory not found'));
        return;
      }

      // Check for Docker
      await this.checkDocker();
      
      // Check for DevContainer CLI
      await this.checkDevContainerCLI();
      
      this.isInitialized = true;
      console.log(chalk.green('✓ DevContainer integration initialized'));
      
      if (!this.hasDocker) {
        console.log(chalk.yellow('  ⚠️  Docker not found - container features disabled'));
      }
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  DevContainer integration failed: ${error.message}`));
    }
  }

  /**
   * Check if Docker is installed
   */
  async checkDocker() {
    try {
      await execAsync('docker --version');
      this.hasDocker = true;
      console.log(chalk.green('  ✓ Docker detected'));
    } catch (error) {
      this.hasDocker = false;
      console.log(chalk.gray('  ✗ Docker not found'));
    }
  }

  /**
   * Check if DevContainer CLI is installed
   */
  async checkDevContainerCLI() {
    try {
      await execAsync('devcontainer --version');
      this.hasDevContainerCLI = true;
      console.log(chalk.green('  ✓ DevContainer CLI detected'));
    } catch (error) {
      this.hasDevContainerCLI = false;
      console.log(chalk.gray('  ✗ DevContainer CLI not found (optional)'));
    }
  }

  /**
   * List available DevContainer configurations
   */
  listConfigurations() {
    if (!fs.existsSync(this.devcontainerDir)) {
      console.log(chalk.yellow('No DevContainer configurations found'));
      return;
    }

    console.log(chalk.bold.cyan('\n🐳 DevContainer Configurations:\n'));
    console.log(chalk.gray('─'.repeat(70)));
    
    const files = fs.readdirSync(this.devcontainerDir);
    const configs = files.filter(f => f.endsWith('.json') || f === 'Dockerfile');
    
    for (const file of configs) {
      const filePath = path.join(this.devcontainerDir, file);
      const stat = fs.statSync(filePath);
      
      if (file.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const name = content.name || file;
          console.log(`  ${chalk.green('●')} ${chalk.white(name)}`);
          if (content.image) {
            console.log(`    ${chalk.gray('Image:')} ${content.image}`);
          }
          if (content.features) {
            console.log(`    ${chalk.gray('Features:')} ${Object.keys(content.features).length} enabled`);
          }
        } catch (error) {
          console.log(`  ${chalk.yellow('○')} ${file} (invalid JSON)`);
        }
      } else {
        console.log(`  ${chalk.green('●')} ${chalk.white(file)}`);
      }
    }
    
    console.log(chalk.gray('\n' + '─'.repeat(70)));
  }

  /**
   * Build DevContainer
   */
  async buildDevContainer(configName = 'devcontainer.json') {
    if (!this.hasDocker) {
      throw new Error('Docker is required to build DevContainers. Please install Docker first.');
    }

    console.log(chalk.cyan(`\n🔨 Building DevContainer: ${configName}\n`));
    
    try {
      const configPath = path.join(this.devcontainerDir, configName);
      
      if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration ${configName} not found`);
      }

      // If DevContainer CLI is available, use it
      if (this.hasDevContainerCLI) {
        const command = `devcontainer build --workspace-folder ${path.join(__dirname, '..')} --config ${configPath}`;
        const { stdout, stderr } = await execAsync(command);
        
        if (stdout) console.log(stdout);
        if (stderr) console.error(chalk.yellow(stderr));
        
      } else {
        // Fallback to docker-compose
        console.log(chalk.gray('Using docker-compose fallback...'));
        const { stdout, stderr } = await execAsync('docker-compose build', {
          cwd: path.join(__dirname, '..')
        });
        
        if (stdout) console.log(stdout);
        if (stderr) console.error(chalk.yellow(stderr));
      }
      
      console.log(chalk.green('\n✓ DevContainer built successfully\n'));
      
    } catch (error) {
      console.error(chalk.red(`\n✗ Build failed: ${error.message}\n`));
      throw error;
    }
  }

  /**
   * Start DevContainer services
   */
  async startServices() {
    if (!this.hasDocker) {
      throw new Error('Docker is required to start services');
    }

    console.log(chalk.cyan('\n🚀 Starting DevContainer services...\n'));
    
    try {
      const { stdout, stderr } = await execAsync('docker-compose up -d', {
        cwd: path.join(__dirname, '..')
      });
      
      if (stdout) console.log(stdout);
      if (stderr) console.error(chalk.yellow(stderr));
      
      console.log(chalk.green('\n✓ Services started successfully\n'));
      
      // Show running containers
      await this.showRunningContainers();
      
    } catch (error) {
      console.error(chalk.red(`\n✗ Failed to start services: ${error.message}\n`));
      throw error;
    }
  }

  /**
   * Stop DevContainer services
   */
  async stopServices() {
    if (!this.hasDocker) {
      throw new Error('Docker is required');
    }

    console.log(chalk.cyan('\n🛑 Stopping DevContainer services...\n'));
    
    try {
      const { stdout, stderr } = await execAsync('docker-compose down', {
        cwd: path.join(__dirname, '..')
      });
      
      if (stdout) console.log(stdout);
      if (stderr) console.error(chalk.yellow(stderr));
      
      console.log(chalk.green('\n✓ Services stopped successfully\n'));
      
    } catch (error) {
      console.error(chalk.red(`\n✗ Failed to stop services: ${error.message}\n`));
      throw error;
    }
  }

  /**
   * Show running containers
   */
  async showRunningContainers() {
    try {
      const { stdout } = await execAsync('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"');
      
      console.log(chalk.bold.cyan('\nRunning Containers:\n'));
      console.log(stdout);
      
    } catch (error) {
      console.log(chalk.gray('Could not retrieve container status'));
    }
  }

  /**
   * Open in VS Code DevContainer
   */
  async openInVSCode() {
    if (!this.hasDevContainerCLI) {
      console.log(chalk.yellow('DevContainer CLI not found.'));
      console.log(chalk.cyan('Install with: npm install -g @devcontainers/cli'));
      return;
    }

    console.log(chalk.cyan('\n📦 Opening in VS Code DevContainer...\n'));
    
    try {
      const command = `code --folder-uri vscode-remote://dev-container+${encodeURIComponent(path.join(__dirname, '..'))}`;
      await execAsync(command);
      
      console.log(chalk.green('✓ VS Code should open with DevContainer\n'));
      
    } catch (error) {
      console.error(chalk.red(`✗ Failed to open VS Code: ${error.message}\n`));
    }
  }

  /**
   * Get DevContainer status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      hasDocker: this.hasDocker,
      hasDevContainerCLI: this.hasDevContainerCLI,
      devcontainerDir: this.devcontainerDir,
      dockerCompose: this.dockerCompose,
      features: this.getAvailableFeatures()
    };
  }

  /**
   * Get available features
   */
  getAvailableFeatures() {
    const features = [];
    
    if (this.hasDocker) {
      features.push('Container Build');
      features.push('Docker Compose');
      features.push('Service Management');
    }
    
    if (this.hasDevContainerCLI) {
      features.push('DevContainer CLI');
      features.push('VS Code Integration');
    }
    
    return features;
  }
}

// Singleton instance
let instance = null;

module.exports = {
  DevContainerIntegration,
  getInstance: () => {
    if (!instance) {
      instance = new DevContainerIntegration();
    }
    return instance;
  }
};
