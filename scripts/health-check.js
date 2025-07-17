#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');

class HealthCheck {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.services = [
      {
        name: 'Backend API',
        url: 'http://localhost:3001/health',
        timeout: 5000
      },
      {
        name: 'Web Dashboard',
        url: 'http://localhost:3000',
        timeout: 5000
      }
    ];
  }

  async run() {
    console.log(chalk.cyan('🏥 CodeCraft Health Check\n'));

    const results = {
      services: [],
      packages: [],
      overall: 'healthy'
    };

    try {
      // Check package builds
      await this.checkPackageBuilds(results);
      
      // Check running services
      await this.checkServices(results);
      
      // Check dependencies
      await this.checkDependencies(results);
      
      // Print results
      this.printResults(results);
      
    } catch (error) {
      console.error(chalk.red('\n❌ Health check failed:'), error.message);
      process.exit(1);
    }
  }

  async checkPackageBuilds(results) {
    console.log(chalk.blue('📦 Checking package builds...\n'));
    
    const packages = [
      { name: 'CLI', path: 'packages/cli/dist/index.js' },
      { name: 'Shared', path: 'packages/shared/dist/index.js' },
      { name: 'Backend', path: 'backend/dist/server.js' },
      { name: 'VSCode Extension', path: 'packages/vscode-extension/dist/extension.js' }
    ];

    for (const pkg of packages) {
      const spinner = ora(`Checking ${pkg.name}...`).start();
      
      try {
        const filePath = path.join(this.rootDir, pkg.path);
        const exists = await fs.pathExists(filePath);
        
        if (exists) {
          const stats = await fs.stat(filePath);
          const isRecent = (Date.now() - stats.mtime.getTime()) < 24 * 60 * 60 * 1000; // 24 hours
          
          results.packages.push({
            name: pkg.name,
            status: 'built',
            path: pkg.path,
            lastModified: stats.mtime,
            isRecent
          });
          
          spinner.succeed(`${pkg.name} - Built ${isRecent ? '(recent)' : '(old)'}`);
        } else {
          results.packages.push({
            name: pkg.name,
            status: 'missing',
            path: pkg.path
          });
          
          spinner.fail(`${pkg.name} - Not built`);
          results.overall = 'unhealthy';
        }
      } catch (error) {
        spinner.fail(`${pkg.name} - Error: ${error.message}`);
        results.packages.push({
          name: pkg.name,
          status: 'error',
          error: error.message
        });
        results.overall = 'unhealthy';
      }
    }
  }

  async checkServices(results) {
    console.log(chalk.blue('\n🌐 Checking running services...\n'));
    
    for (const service of this.services) {
      const spinner = ora(`Checking ${service.name}...`).start();
      
      try {
        const response = await axios.get(service.url, {
          timeout: service.timeout,
          validateStatus: () => true // Accept any status code
        });
        
        const isHealthy = response.status >= 200 && response.status < 400;
        
        results.services.push({
          name: service.name,
          status: isHealthy ? 'running' : 'unhealthy',
          url: service.url,
          statusCode: response.status,
          responseTime: response.headers['x-response-time'] || 'N/A'
        });
        
        if (isHealthy) {
          spinner.succeed(`${service.name} - Running (${response.status})`);
        } else {
          spinner.warn(`${service.name} - Unhealthy (${response.status})`);
          results.overall = 'degraded';
        }
      } catch (error) {
        results.services.push({
          name: service.name,
          status: 'down',
          url: service.url,
          error: error.code || error.message
        });
        
        if (error.code === 'ECONNREFUSED') {
          spinner.info(`${service.name} - Not running`);
        } else {
          spinner.fail(`${service.name} - Error: ${error.message}`);
          results.overall = 'unhealthy';
        }
      }
    }
  }

  async checkDependencies(results) {
    console.log(chalk.blue('\n📋 Checking dependencies...\n'));
    
    const spinner = ora('Checking package dependencies...').start();
    
    try {
      // Check for security vulnerabilities
      const { execSync } = require('child_process');
      
      try {
        execSync('npm audit --audit-level=high', { 
          cwd: this.rootDir,
          stdio: 'pipe'
        });
        spinner.succeed('Dependencies - No high-severity vulnerabilities');
      } catch (error) {
        spinner.warn('Dependencies - Security vulnerabilities found');
        results.overall = 'degraded';
      }
    } catch (error) {
      spinner.fail(`Dependencies check failed: ${error.message}`);
      results.overall = 'unhealthy';
    }
  }

  printResults(results) {
    console.log(chalk.blue('\n📊 Health Check Summary:\n'));
    
    // Overall status
    const statusColor = results.overall === 'healthy' ? 'green' : 
                       results.overall === 'degraded' ? 'yellow' : 'red';
    const statusIcon = results.overall === 'healthy' ? '✅' : 
                      results.overall === 'degraded' ? '⚠️' : '❌';
    
    console.log(`${statusIcon} Overall Status: ${chalk[statusColor](results.overall.toUpperCase())}\n`);
    
    // Package builds
    console.log(chalk.blue('📦 Package Builds:'));
    results.packages.forEach(pkg => {
      const icon = pkg.status === 'built' ? '✅' : pkg.status === 'missing' ? '❌' : '⚠️';
      const color = pkg.status === 'built' ? 'green' : pkg.status === 'missing' ? 'red' : 'yellow';
      console.log(`   ${icon} ${pkg.name}: ${chalk[color](pkg.status)}`);
    });
    
    // Services
    console.log(chalk.blue('\n🌐 Services:'));
    results.services.forEach(svc => {
      const icon = svc.status === 'running' ? '✅' : svc.status === 'down' ? '❌' : '⚠️';
      const color = svc.status === 'running' ? 'green' : svc.status === 'down' ? 'gray' : 'yellow';
      const statusText = svc.status === 'down' ? 'not running' : svc.status;
      console.log(`   ${icon} ${svc.name}: ${chalk[color](statusText)} ${svc.url ? `(${svc.url})` : ''}`);
    });
    
    // Recommendations
    if (results.overall !== 'healthy') {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      
      const missingBuilds = results.packages.filter(p => p.status === 'missing');
      if (missingBuilds.length > 0) {
        console.log('   • Run `npm run build` to build missing packages');
      }
      
      const downServices = results.services.filter(s => s.status === 'down');
      if (downServices.length > 0) {
        console.log('   • Run `npm run dev` to start services');
      }
      
      if (results.overall === 'degraded') {
        console.log('   • Check logs for detailed error information');
        console.log('   • Run `npm audit fix` to fix security vulnerabilities');
      }
    }
    
    console.log('');
  }
}

// Run if executed directly
if (require.main === module) {
  const healthCheck = new HealthCheck();
  healthCheck.run();
}

module.exports = HealthCheck;