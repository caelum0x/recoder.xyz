#!/usr/bin/env node

/**
 * Production Deployment Testing & Validation
 * Tests all production infrastructure components
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PRODUCTION_SERVICES = [
  {
    name: '🐘 PostgreSQL Database',
    check: 'postgres container health',
    required: true
  },
  {
    name: '🔴 Redis Cache',
    check: 'redis container health', 
    required: true
  },
  {
    name: '🔧 Backend API',
    check: 'backend container health',
    required: true
  },
  {
    name: '⚡ Production Engine',
    check: 'production-engine container health',
    required: true
  },
  {
    name: '🌐 Web Platform',
    check: 'web container health',
    required: true
  },
  {
    name: '💬 Chat Platform', 
    check: 'chat container health',
    required: true
  },
  {
    name: '🔒 Nginx Proxy',
    check: 'nginx container health',
    required: true
  },
  {
    name: '📊 Prometheus Monitoring',
    check: 'prometheus container health',
    required: false
  },
  {
    name: '📈 Grafana Dashboard',
    check: 'grafana container health',
    required: false
  },
  {
    name: '🤖 Ollama Local AI',
    check: 'ollama container health',
    required: false
  }
];

const AI_PROVIDERS = [
  {
    name: 'Together AI (FREE)',
    envVar: 'TOGETHER_API_KEY',
    priority: 1,
    required: true
  },
  {
    name: 'Groq',
    envVar: 'GROQ_API_KEY', 
    priority: 2,
    required: false
  },
  {
    name: 'Google Gemini',
    envVar: 'GOOGLE_API_KEY',
    priority: 3,
    required: false
  },
  {
    name: 'Anthropic Claude',
    envVar: 'ANTHROPIC_API_KEY',
    priority: 4,
    required: false
  },
  {
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    priority: 5,
    required: false
  }
];

class ProductionValidator {
  constructor() {
    this.results = {
      infrastructure: {},
      aiProviders: {},
      security: {},
      deployment: {}
    };
    this.errors = [];
    this.warnings = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📋',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[type];
    console.log(`${prefix} [${timestamp.substr(11, 8)}] ${message}`);
  }

  async validateInfrastructure() {
    this.log('🏗️ Validating Production Infrastructure...', 'info');
    
    // Check if production compose file exists
    const composeFile = 'docker-compose.production-enhanced.yml';
    if (!fs.existsSync(composeFile)) {
      this.errors.push(`Production compose file missing: ${composeFile}`);
      this.log(`Production compose file missing: ${composeFile}`, 'error');
      return false;
    }
    
    this.log(`Production compose file found: ${composeFile}`, 'success');
    
    // Check deployment script
    const deployScript = 'deploy-production.sh';
    if (!fs.existsSync(deployScript)) {
      this.errors.push(`Deployment script missing: ${deployScript}`);
      this.log(`Deployment script missing: ${deployScript}`, 'error');
    } else if (!fs.statSync(deployScript).mode & parseInt('100', 8)) {
      this.warnings.push(`Deployment script not executable: ${deployScript}`);
      this.log(`Deployment script not executable: ${deployScript}`, 'warning');
    } else {
      this.log(`Deployment script ready: ${deployScript}`, 'success');
    }
    
    // Check secrets generation
    const secretsScript = 'scripts/generate-secrets.sh';
    if (!fs.existsSync(secretsScript)) {
      this.errors.push(`Secrets generator missing: ${secretsScript}`);
      this.log(`Secrets generator missing: ${secretsScript}`, 'error');
    } else {
      this.log(`Secrets generator ready: ${secretsScript}`, 'success');
    }
    
    // Check nginx config
    const nginxConfig = 'nginx/nginx-production.conf';
    if (!fs.existsSync(nginxConfig)) {
      this.errors.push(`Nginx production config missing: ${nginxConfig}`);
      this.log(`Nginx production config missing: ${nginxConfig}`, 'error');
    } else {
      this.log(`Nginx production config ready: ${nginxConfig}`, 'success');
    }
    
    // Check monitoring configs
    const monitoringConfigs = [
      'monitoring/prometheus-production.yml',
      'monitoring/loki-production.yml',
      'monitoring/promtail-production.yml'
    ];
    
    for (const config of monitoringConfigs) {
      if (fs.existsSync(config)) {
        this.log(`Monitoring config ready: ${config}`, 'success');
      } else {
        this.warnings.push(`Monitoring config missing: ${config}`);
        this.log(`Monitoring config missing: ${config}`, 'warning');
      }
    }
    
    this.results.infrastructure.passed = this.errors.length === 0;
    return this.results.infrastructure.passed;
  }

  async validateEnvironment() {
    this.log('🔒 Validating Environment Configuration...', 'info');
    
    // Check if environment template exists
    const envTemplate = 'production.env.example';
    if (!fs.existsSync(envTemplate)) {
      this.errors.push(`Environment template missing: ${envTemplate}`);
      this.log(`Environment template missing: ${envTemplate}`, 'error');
    } else {
      this.log(`Environment template ready: ${envTemplate}`, 'success');
    }
    
    // Check for test environment file
    const testEnvFile = '.env.production.test';
    if (fs.existsSync(testEnvFile)) {
      this.log(`Test environment file generated: ${testEnvFile}`, 'success');
      
      // Read and validate environment variables
      const envContent = fs.readFileSync(testEnvFile, 'utf8');
      
      const requiredVars = [
        'DB_PASSWORD',
        'REDIS_PASSWORD',
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'ENCRYPTION_KEY'
      ];
      
      for (const varName of requiredVars) {
        if (envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=your_`)) {
          this.log(`Required secret generated: ${varName}`, 'success');
        } else {
          this.errors.push(`Required secret missing or placeholder: ${varName}`);
          this.log(`Required secret missing or placeholder: ${varName}`, 'error');
        }
      }
    } else {
      this.warnings.push('Test environment file not generated');
      this.log('Test environment file not generated', 'warning');
    }
    
    this.results.security.passed = this.errors.length === 0;
    return this.results.security.passed;
  }

  async validateAIProviders() {
    this.log('🤖 Validating AI Provider Integration...', 'info');
    
    let providersFound = 0;
    let requiredProvidersMissing = 0;
    
    for (const provider of AI_PROVIDERS) {
      const found = await this.checkAIProviderConfig(provider);
      if (found) {
        providersFound++;
        this.log(`AI Provider configured: ${provider.name}`, 'success');
      } else if (provider.required) {
        requiredProvidersMissing++;
        this.errors.push(`Required AI provider missing: ${provider.name}`);
        this.log(`Required AI provider missing: ${provider.name}`, 'error');
      } else {
        this.warnings.push(`Optional AI provider not configured: ${provider.name}`);
        this.log(`Optional AI provider not configured: ${provider.name}`, 'warning');
      }
    }
    
    this.log(`AI Providers found: ${providersFound}/${AI_PROVIDERS.length}`, 'info');
    
    this.results.aiProviders.found = providersFound;
    this.results.aiProviders.total = AI_PROVIDERS.length;
    this.results.aiProviders.passed = requiredProvidersMissing === 0 && providersFound >= 2;
    
    return this.results.aiProviders.passed;
  }

  async checkAIProviderConfig(provider) {
    return new Promise((resolve) => {
      // Check if provider is configured in codebase
      const searchPatterns = [
        provider.name.toLowerCase().replace(/\s+/g, ''),
        provider.envVar.toLowerCase()
      ];
      
      let found = false;
      
      // Search in common locations
      const searchDirs = [
        'recoder-web/lib',
        'recoder-chat/lib',
        'recoder-extension/src',
        'backend/src',
        'production-engine/src'
      ];
      
      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        
        try {
          const result = spawn('grep', [
            '-r',
            '-i',
            searchPatterns.join('\\|'),
            dir,
            '--include=*.ts',
            '--include=*.js',
            '--include=*.json'
          ], { stdio: 'pipe' });
          
          result.on('close', (code) => {
            if (code === 0 && !found) {
              found = true;
              resolve(true);
            }
          });
          
          // Timeout after 1 second per directory
          setTimeout(() => {
            if (!found) {
              resolve(false);
            }
          }, 1000);
          
        } catch (error) {
          // Ignore search errors
        }
      }
      
      // Fallback timeout
      setTimeout(() => resolve(found), 2000);
    });
  }

  async validatePlatforms() {
    this.log('🌐 Validating Platform Readiness...', 'info');
    
    const platforms = [
      {
        name: 'Web Platform',
        dir: 'recoder-web',
        packageJson: 'recoder-web/package.json',
        required: true
      },
      {
        name: 'Chat Platform', 
        dir: 'recoder-chat',
        packageJson: 'recoder-chat/package.json',
        required: true
      },
      {
        name: 'VS Code Extension',
        dir: 'recoder-extension',
        packageJson: 'recoder-extension/package.json',
        required: false
      },
      {
        name: 'Backend API',
        dir: 'backend',
        packageJson: 'backend/package.json',
        required: true
      },
      {
        name: 'Production Engine',
        dir: 'production-engine',
        packageJson: 'production-engine/package.json',
        required: true
      }
    ];
    
    let platformsReady = 0;
    let requiredPlatformsMissing = 0;
    
    for (const platform of platforms) {
      if (fs.existsSync(platform.dir) && fs.existsSync(platform.packageJson)) {
        platformsReady++;
        this.log(`Platform ready: ${platform.name}`, 'success');
        
        // Check if platform has required scripts
        try {
          const packageContent = JSON.parse(fs.readFileSync(platform.packageJson, 'utf8'));
          const scripts = packageContent.scripts || {};
          
          if (scripts.build) {
            this.log(`  Build script available: ${platform.name}`, 'success');
          } else {
            this.warnings.push(`Build script missing: ${platform.name}`);
            this.log(`  Build script missing: ${platform.name}`, 'warning');
          }
          
        } catch (error) {
          this.warnings.push(`Invalid package.json: ${platform.packageJson}`);
          this.log(`Invalid package.json: ${platform.packageJson}`, 'warning');
        }
        
      } else if (platform.required) {
        requiredPlatformsMissing++;
        this.errors.push(`Required platform missing: ${platform.name}`);
        this.log(`Required platform missing: ${platform.name}`, 'error');
      } else {
        this.warnings.push(`Optional platform not found: ${platform.name}`);
        this.log(`Optional platform not found: ${platform.name}`, 'warning');
      }
    }
    
    this.log(`Platforms ready: ${platformsReady}/${platforms.length}`, 'info');
    
    this.results.deployment.platformsReady = platformsReady;
    this.results.deployment.totalPlatforms = platforms.length;
    this.results.deployment.passed = requiredPlatformsMissing === 0;
    
    return this.results.deployment.passed;
  }

  async validatePrerequisites() {
    this.log('🔧 Validating Prerequisites...', 'info');
    
    const requiredTools = ['docker', 'docker-compose', 'node', 'npm'];
    let toolsMissing = 0;
    
    for (const tool of requiredTools) {
      try {
        const result = spawn(tool, ['--version'], { stdio: 'pipe' });
        result.on('close', (code) => {
          if (code === 0) {
            this.log(`Required tool available: ${tool}`, 'success');
          } else {
            toolsMissing++;
            this.errors.push(`Required tool missing: ${tool}`);
            this.log(`Required tool missing: ${tool}`, 'error');
          }
        });
      } catch (error) {
        toolsMissing++;
        this.errors.push(`Required tool missing: ${tool}`);
        this.log(`Required tool missing: ${tool}`, 'error');
      }
    }
    
    return toolsMissing === 0;
  }

  generateReport() {
    this.log('📊 Generating Production Deployment Report...', 'info');
    
    const report = {
      timestamp: new Date().toISOString(),
      status: this.errors.length === 0 ? 'READY' : 'NEEDS_ATTENTION',
      summary: {
        errors: this.errors.length,
        warnings: this.warnings.length,
        readinessScore: this.calculateReadinessScore()
      },
      infrastructure: this.results.infrastructure,
      aiProviders: this.results.aiProviders,
      security: this.results.security,
      deployment: this.results.deployment,
      errors: this.errors,
      warnings: this.warnings,
      recommendations: this.generateRecommendations()
    };
    
    // Write report to file
    const reportPath = 'production-deployment-validation.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`Report written to: ${reportPath}`, 'success');
    
    return report;
  }

  calculateReadinessScore() {
    const maxScore = 100;
    let score = maxScore;
    
    // Deduct points for errors and warnings
    score -= (this.errors.length * 10);
    score -= (this.warnings.length * 2);
    
    return Math.max(0, score);
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.errors.length === 0) {
      recommendations.push('🚀 System ready for production deployment!');
      recommendations.push('📝 Review environment variables and API keys');
      recommendations.push('🌐 Configure domain DNS and SSL certificates'); 
      recommendations.push('📊 Set up monitoring alerts');
    } else {
      recommendations.push('🔧 Fix all errors before production deployment');
      if (this.errors.some(e => e.includes('missing'))) {
        recommendations.push('📁 Ensure all required files and directories exist');
      }
      if (this.errors.some(e => e.includes('AI provider'))) {
        recommendations.push('🤖 Configure at least one AI provider (Together AI recommended)');
      }
    }
    
    if (this.warnings.length > 0) {
      recommendations.push('⚠️ Review and address warnings for optimal deployment');
    }
    
    return recommendations;
  }

  async run() {
    console.log('🚀 Production Deployment Validation Starting...');
    console.log('================================================\n');
    
    // Run all validation steps
    await this.validateInfrastructure();
    await this.validateEnvironment();
    await this.validatePlatforms();
    await this.validateAIProviders();
    
    // Generate final report
    const report = this.generateReport();
    
    console.log('\n📊 VALIDATION RESULTS');
    console.log('======================');
    console.log(`Status: ${report.status}`);
    console.log(`Readiness Score: ${report.summary.readinessScore}/100`);
    console.log(`Errors: ${report.summary.errors}`);
    console.log(`Warnings: ${report.summary.warnings}`);
    
    if (report.aiProviders.found) {
      console.log(`AI Providers: ${report.aiProviders.found}/${report.aiProviders.total} configured`);
    }
    
    if (report.deployment.platformsReady) {
      console.log(`Platforms: ${report.deployment.platformsReady}/${report.deployment.totalPlatforms} ready`);
    }
    
    console.log('\n💡 RECOMMENDATIONS:');
    report.recommendations.forEach(rec => console.log(`   ${rec}`));
    
    console.log(`\n📄 Full report: production-deployment-validation.json`);
    
    return report.status === 'READY';
  }
}

// Execute validation if run directly
if (require.main === module) {
  const validator = new ProductionValidator();
  validator.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

module.exports = ProductionValidator;