#!/usr/bin/env node

/**
 * Health Check Script for Production Deployment
 * Validates all critical services and dependencies
 */

const http = require('http');
const fs = require('fs');
const { execSync } = require('child_process');

class HealthChecker {
  constructor() {
    this.checks = [];
    this.status = {
      healthy: true,
      timestamp: new Date().toISOString(),
      version: this.getVersion(),
      uptime: process.uptime(),
      checks: {}
    };
  }

  async performHealthCheck() {
    try {
      await this.checkBasicHealth();
      await this.checkDependencies();
      await this.checkServices();
      await this.checkResources();
      await this.checkConfiguration();
      
      return this.generateHealthReport();
    } catch (error) {
      this.status.healthy = false;
      this.status.error = error.message;
      return this.status;
    }
  }

  async checkBasicHealth() {
    // Check if main process is responsive
    this.status.checks.process = {
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      node_version: process.version,
      platform: process.platform,
      status: 'healthy'
    };

    // Check if we can access the file system
    try {
      const tempFile = '/tmp/health-check-' + Date.now();
      fs.writeFileSync(tempFile, 'health-check');
      fs.unlinkSync(tempFile);
      this.status.checks.filesystem = { status: 'healthy' };
    } catch (error) {
      this.status.checks.filesystem = { status: 'unhealthy', error: error.message };
      this.status.healthy = false;
    }
  }

  async checkDependencies() {
    const dependencies = {
      config: () => this.checkConfigFile(),
      models: () => this.checkModelManager(),
      rules: () => this.checkRulesEngine(),
      automation: () => this.checkTaskManager()
    };

    for (const [name, check] of Object.entries(dependencies)) {
      try {
        await check();
        this.status.checks[name] = { status: 'healthy' };
      } catch (error) {
        this.status.checks[name] = { status: 'unhealthy', error: error.message };
        this.status.healthy = false;
      }
    }
  }

  async checkServices() {
    const services = [];
    
    // Check Redis connection
    if (process.env.REDIS_URL) {
      services.push({
        name: 'redis',
        check: () => this.checkRedis()
      });
    }

    // Check PostgreSQL connection
    if (process.env.POSTGRES_URL) {
      services.push({
        name: 'postgres',
        check: () => this.checkPostgres()
      });
    }

    // Check OpenRouter API
    if (process.env.OPENROUTER_API_KEY) {
      services.push({
        name: 'openrouter',
        check: () => this.checkOpenRouterAPI()
      });
    }

    for (const service of services) {
      try {
        await service.check();
        this.status.checks[service.name] = { status: 'healthy' };
      } catch (error) {
        this.status.checks[service.name] = { status: 'unhealthy', error: error.message };
        // Don't mark as unhealthy for external services, just warn
        if (!['openrouter'].includes(service.name)) {
          this.status.healthy = false;
        }
      }
    }
  }

  async checkResources() {
    const memory = process.memoryUsage();
    const memoryUsagePercent = (memory.heapUsed / memory.heapTotal) * 100;
    
    this.status.checks.resources = {
      memory: {
        used: memory.heapUsed,
        total: memory.heapTotal,
        usage_percent: memoryUsagePercent,
        status: memoryUsagePercent > 90 ? 'warning' : 'healthy'
      },
      uptime: process.uptime(),
      status: 'healthy'
    };

    // Check disk space
    try {
      const diskUsage = execSync('df -h /app', { encoding: 'utf8' });
      const lines = diskUsage.trim().split('\n');
      if (lines.length > 1) {
        const usage = lines[1].split(/\s+/);
        const usedPercent = parseInt(usage[4]);
        
        this.status.checks.resources.disk = {
          used_percent: usedPercent,
          status: usedPercent > 90 ? 'warning' : 'healthy'
        };
      }
    } catch (error) {
      // Disk check failed, but not critical
      this.status.checks.resources.disk = { status: 'unknown' };
    }
  }

  async checkConfiguration() {
    const requiredConfig = [
      'OPENROUTER_API_KEY'
    ];

    const missingConfig = requiredConfig.filter(key => !process.env[key]);
    
    this.status.checks.configuration = {
      required_vars: requiredConfig.length,
      missing_vars: missingConfig,
      status: missingConfig.length === 0 ? 'healthy' : 'unhealthy'
    };

    if (missingConfig.length > 0) {
      this.status.healthy = false;
    }
  }

  async checkConfigFile() {
    if (!fs.existsSync('config.js')) {
      throw new Error('config.js not found');
    }
    
    const config = require('../config.js');
    if (!config.apiKey && !process.env.OPENROUTER_API_KEY) {
      throw new Error('No API key configured');
    }
  }

  async checkModelManager() {
    if (!fs.existsSync('cli/model-manager.js')) {
      throw new Error('model-manager.js not found');
    }
    
    // Basic module load test
    require('../cli/model-manager.js');
  }

  async checkRulesEngine() {
    if (!fs.existsSync('cli/rules-engine.js')) {
      throw new Error('rules-engine.js not found');
    }
    
    require('../cli/rules-engine.js');
  }

  async checkTaskManager() {
    if (!fs.existsSync('cli/task-manager.js')) {
      throw new Error('task-manager.js not found');
    }
    
    require('../cli/task-manager.js');
  }

  async checkRedis() {
    return new Promise((resolve, reject) => {
      const url = new URL(process.env.REDIS_URL);
      const client = require('net').createConnection({
        host: url.hostname,
        port: url.port || 6379,
        timeout: 5000
      });

      client.on('connect', () => {
        client.end();
        resolve();
      });

      client.on('error', (error) => {
        reject(new Error(`Redis connection failed: ${error.message}`));
      });

      client.on('timeout', () => {
        client.destroy();
        reject(new Error('Redis connection timeout'));
      });
    });
  }

  async checkPostgres() {
    return new Promise((resolve, reject) => {
      const url = new URL(process.env.POSTGRES_URL);
      const client = require('net').createConnection({
        host: url.hostname,
        port: url.port || 5432,
        timeout: 5000
      });

      client.on('connect', () => {
        client.end();
        resolve();
      });

      client.on('error', (error) => {
        reject(new Error(`PostgreSQL connection failed: ${error.message}`));
      });

      client.on('timeout', () => {
        client.destroy();
        reject(new Error('PostgreSQL connection timeout'));
      });
    });
  }

  async checkOpenRouterAPI() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'openrouter.ai',
        port: 443,
        path: '/api/v1/models',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      };

      const req = require('https').request(options, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`OpenRouter API returned status ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        reject(new Error(`OpenRouter API error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('OpenRouter API timeout'));
      });

      req.end();
    });
  }

  getVersion() {
    try {
      const packageJson = require('../package.json');
      return packageJson.version;
    } catch (error) {
      return 'unknown';
    }
  }

  generateHealthReport() {
    const healthyChecks = Object.values(this.status.checks).filter(
      check => check.status === 'healthy'
    ).length;
    
    const totalChecks = Object.keys(this.status.checks).length;
    
    this.status.summary = {
      healthy_checks: healthyChecks,
      total_checks: totalChecks,
      health_percentage: totalChecks > 0 ? Math.round((healthyChecks / totalChecks) * 100) : 0
    };

    return this.status;
  }
}

// CLI usage
if (require.main === module) {
  const checker = new HealthChecker();
  
  checker.performHealthCheck()
    .then(status => {
      console.log(JSON.stringify(status, null, 2));
      process.exit(status.healthy ? 0 : 1);
    })
    .catch(error => {
      console.error('Health check failed:', error);
      process.exit(1);
    });
}

// HTTP endpoint for Docker health checks
if (process.env.NODE_ENV === 'production') {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      const checker = new HealthChecker();
      try {
        const status = await checker.performHealthCheck();
        res.writeHead(status.healthy ? 200 : 503, {
          'Content-Type': 'application/json'
        });
        res.end(JSON.stringify(status));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ healthy: false, error: error.message }));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  const port = process.env.HEALTH_PORT || 8081;
  server.listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
  });
}

module.exports = HealthChecker;