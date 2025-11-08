/**
 * Auto Services Manager - Automatically manages Docker containers for services
 * Provides seamless service lifecycle management
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

const execAsync = promisify(exec);

class AutoServicesManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.recoder-code');
    this.servicesConfigFile = path.join(this.configDir, 'services-status.json');
    this.dockerComposeFile = path.join(process.cwd(), 'docker-compose.services.yml');
    
    this.services = {
      'ml-training': {
        image: 'recoder/ml-training:latest',
        port: 8000,
        healthCheck: '/health',
        autoStart: false,
        required: false
      },
      'collaboration': {
        image: 'recoder/collaboration:latest',
        port: 3003,
        healthCheck: '/api/health',
        autoStart: false,
        required: false
      },
      'plugin-registry': {
        image: 'recoder/plugin-registry:latest',
        port: 3000,
        healthCheck: '/api/health',
        autoStart: false,
        required: false
      },
      'redis': {
        image: 'redis:alpine',
        port: 6379,
        healthCheck: null,
        autoStart: true,
        required: true
      },
      'postgres': {
        image: 'postgres:15-alpine',
        port: 5432,
        healthCheck: null,
        autoStart: true,
        required: true
      }
    };
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable() {
    try {
      await execAsync('docker --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Docker daemon is running
   */
  async isDockerRunning() {
    try {
      await execAsync('docker ps', { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get status of all services
   */
  async getServicesStatus() {
    const status = {};
    
    for (const [serviceName, config] of Object.entries(this.services)) {
      status[serviceName] = await this.getServiceStatus(serviceName);
    }
    
    return status;
  }

  /**
   * Get status of a specific service
   */
  async getServiceStatus(serviceName) {
    const config = this.services[serviceName];
    if (!config) {
      return { status: 'unknown', error: 'Service not configured' };
    }

    try {
      // Check if container exists and is running
      const { stdout } = await execAsync(`docker ps --format "table {{.Names}}\\t{{.Status}}" --filter "name=${serviceName}"`);
      const lines = stdout.trim().split('\\n');
      
      if (lines.length > 1) {
        const statusLine = lines[1];
        const isRunning = statusLine.includes('Up');
        
        if (isRunning && config.healthCheck) {
          // Perform health check
          return await this.performHealthCheck(serviceName);
        }
        
        return {
          status: isRunning ? 'running' : 'stopped',
          container: statusLine
        };
      }
      
      return { status: 'not-found' };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Perform health check on a service
   */
  async performHealthCheck(serviceName) {
    const config = this.services[serviceName];
    
    try {
      const axios = require('axios');
      const response = await axios.get(`http://localhost:${config.port}${config.healthCheck}`, {
        timeout: 3000
      });
      
      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        health: response.data
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Start a specific service
   */
  async startService(serviceName, options = {}) {
    const config = this.services[serviceName];
    if (!config) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    console.log(chalk.cyan(`🚀 Starting ${serviceName}...`));

    try {
      // Check if container already exists
      const status = await this.getServiceStatus(serviceName);
      
      if (status.status === 'running' || status.status === 'healthy') {
        console.log(chalk.green(`✅ ${serviceName} is already running`));
        return true;
      }

      // Start the container
      const dockerCommand = this.buildDockerCommand(serviceName, options);
      await execAsync(dockerCommand);

      // Wait for service to be ready
      await this.waitForServiceReady(serviceName);
      
      console.log(chalk.green(`✅ ${serviceName} started successfully`));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to start ${serviceName}: ${error.message}`));
      return false;
    }
  }

  /**
   * Build Docker command for starting a service
   */
  buildDockerCommand(serviceName, options = {}) {
    const config = this.services[serviceName];
    
    let command = `docker run -d --name ${serviceName}`;
    
    // Add port mapping
    if (config.port) {
      command += ` -p ${config.port}:${config.port}`;
    }

    // Add environment variables
    if (serviceName === 'postgres') {
      const dbPassword = process.env.RECODER_DB_PASSWORD || 'changeme';
      command += ` -e POSTGRES_DB=recoder -e POSTGRES_USER=recoder -e POSTGRES_PASSWORD=${dbPassword}`;
    }

    // Add volumes for persistence
    if (serviceName === 'postgres' || serviceName === 'redis') {
      command += ` -v ${serviceName}-data:/data`;
    }

    // Add restart policy
    command += ` --restart unless-stopped`;

    // Add the image
    command += ` ${config.image}`;

    return command;
  }

  /**
   * Stop a specific service
   */
  async stopService(serviceName) {
    console.log(chalk.yellow(`⏹️  Stopping ${serviceName}...`));

    try {
      await execAsync(`docker stop ${serviceName}`);
      await execAsync(`docker rm ${serviceName}`);
      
      console.log(chalk.green(`✅ ${serviceName} stopped`));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to stop ${serviceName}: ${error.message}`));
      return false;
    }
  }

  /**
   * Wait for a service to be ready
   */
  async waitForServiceReady(serviceName, maxWaitTime = 30000) {
    const config = this.services[serviceName];
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getServiceStatus(serviceName);
      
      if (status.status === 'healthy' || (status.status === 'running' && !config.healthCheck)) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Service ${serviceName} did not become ready within ${maxWaitTime}ms`);
  }

  /**
   * Auto-start required services
   */
  async autoStartServices() {
    if (!await this.isDockerRunning()) {
      console.log(chalk.yellow('⚠️  Docker is not running. Services cannot be auto-started.'));
      console.log(chalk.gray('   Start Docker Desktop and run: recoder-code services start'));
      return false;
    }

    console.log(chalk.cyan('🤖 Auto-starting required services...'));

    const requiredServices = Object.entries(this.services)
      .filter(([name, config]) => config.required || config.autoStart)
      .map(([name]) => name);

    let allStarted = true;
    for (const serviceName of requiredServices) {
      const started = await this.startService(serviceName);
      if (!started) allStarted = false;
    }

    if (allStarted) {
      console.log(chalk.green('✅ All required services are running'));
    } else {
      console.log(chalk.yellow('⚠️  Some services failed to start'));
    }

    return allStarted;
  }

  /**
   * Smart start - only start what's needed for the requested feature
   */
  async smartStart(feature) {
    const featureServices = {
      'ml-training': ['redis', 'ml-training'],
      'collaboration': ['redis', 'postgres', 'collaboration'],
      'plugins': ['redis', 'plugin-registry'],
      'full': ['redis', 'postgres', 'ml-training', 'collaboration', 'plugin-registry']
    };

    const services = featureServices[feature] || featureServices.full;
    
    console.log(chalk.cyan(`🎯 Starting services for ${feature}...`));

    let allStarted = true;
    for (const serviceName of services) {
      const started = await this.startService(serviceName);
      if (!started) allStarted = false;
    }

    return allStarted;
  }

  /**
   * Stop all services
   */
  async stopAllServices() {
    console.log(chalk.yellow('⏹️  Stopping all services...'));

    const results = {};
    for (const serviceName of Object.keys(this.services)) {
      results[serviceName] = await this.stopService(serviceName);
    }

    const allStopped = Object.values(results).every(stopped => stopped);
    if (allStopped) {
      console.log(chalk.green('✅ All services stopped'));
    }

    return results;
  }

  /**
   * Show services status in a nice format
   */
  async showStatus() {
    console.log(chalk.cyan.bold('🐳 Docker Services Status\\n'));

    if (!await this.isDockerAvailable()) {
      console.log(chalk.red('❌ Docker is not installed'));
      console.log(chalk.gray('   Install Docker Desktop to enable services'));
      return;
    }

    if (!await this.isDockerRunning()) {
      console.log(chalk.yellow('⚠️  Docker daemon is not running'));
      console.log(chalk.gray('   Start Docker Desktop to manage services'));
      return;
    }

    const status = await this.getServicesStatus();
    
    for (const [serviceName, serviceStatus] of Object.entries(status)) {
      const config = this.services[serviceName];
      let statusIcon = '❓';
      let statusText = serviceStatus.status;

      switch (serviceStatus.status) {
        case 'healthy':
          statusIcon = '🟢';
          statusText = 'Running (Healthy)';
          break;
        case 'running':
          statusIcon = '🟡';
          statusText = 'Running';
          break;
        case 'unhealthy':
          statusIcon = '🔴';
          statusText = 'Running (Unhealthy)';
          break;
        case 'stopped':
          statusIcon = '⏹️ ';
          statusText = 'Stopped';
          break;
        case 'not-found':
          statusIcon = '⚪';
          statusText = 'Not Started';
          break;
        case 'error':
          statusIcon = '❌';
          statusText = 'Error';
          break;
      }

      const requiredText = config.required ? '(Required)' : '';
      console.log(`${statusIcon} ${serviceName.padEnd(15)} ${statusText} ${requiredText}`);
      if (config.port) {
        console.log(chalk.gray(`   Port: ${config.port}`));
      }
    }

    console.log();
    console.log(chalk.cyan('💡 Commands:'));
    console.log(chalk.white('   recoder-code services start    # Start all services'));
    console.log(chalk.white('   recoder-code services stop     # Stop all services'));
    console.log(chalk.white('   recoder-code services restart  # Restart all services'));
    console.log();
  }

  /**
   * Create Docker Compose file for services
   */
  async createDockerCompose() {
    const compose = {
      version: '3.8',
      services: {},
      volumes: {
        'postgres-data': {},
        'redis-data': {}
      }
    };

    for (const [serviceName, config] of Object.entries(this.services)) {
      compose.services[serviceName] = {
        image: config.image,
        restart: 'unless-stopped'
      };

      if (config.port) {
        compose.services[serviceName].ports = [`${config.port}:${config.port}`];
      }

      if (serviceName === 'postgres') {
        compose.services[serviceName].environment = {
          POSTGRES_DB: 'recoder',
          POSTGRES_USER: 'recoder',
          POSTGRES_PASSWORD: '${RECODER_DB_PASSWORD:-changeme}'
        };
        compose.services[serviceName].volumes = ['postgres-data:/var/lib/postgresql/data'];
      }

      if (serviceName === 'redis') {
        compose.services[serviceName].volumes = ['redis-data:/data'];
      }
    }

    const yamlContent = `# Recoder-Code Services
# Auto-generated Docker Compose file
version: '3.8'

services:
${Object.entries(compose.services).map(([name, service]) => 
  `  ${name}:\n${Object.entries(service).map(([key, value]) => 
    `    ${key}: ${typeof value === 'object' ? JSON.stringify(value).replace(/"/g, '') : value}`
  ).join('\\n')}`
).join('\\n\\n')}

volumes:
${Object.keys(compose.volumes).map(name => `  ${name}:`).join('\\n')}
`;

    fs.writeFileSync(this.dockerComposeFile, yamlContent);
    console.log(chalk.green(`✅ Docker Compose file created: ${this.dockerComposeFile}`));
  }

  /**
   * Handle service commands from CLI
   */
  async handleCommand(command, ...args) {
    switch (command) {
      case 'status':
        await this.showStatus();
        return true;

      case 'start':
        if (args[0]) {
          return await this.startService(args[0]);
        } else {
          return await this.autoStartServices();
        }

      case 'stop':
        if (args[0]) {
          return await this.stopService(args[0]);
        } else {
          return await this.stopAllServices();
        }

      case 'restart':
        if (args[0]) {
          await this.stopService(args[0]);
          return await this.startService(args[0]);
        } else {
          await this.stopAllServices();
          return await this.autoStartServices();
        }

      case 'smart-start':
        return await this.smartStart(args[0] || 'full');

      case 'compose':
        await this.createDockerCompose();
        return true;

      case 'health':
        const status = await this.getServicesStatus();
        console.log(JSON.stringify(status, null, 2));
        return true;

      default:
        console.log(chalk.red(`❌ Unknown command: ${command}`));
        console.log(chalk.gray('Available commands: status, start, stop, restart, smart-start, compose'));
        return false;
    }
  }
}

module.exports = AutoServicesManager;