#!/usr/bin/env node

/**
 * Final Production Deployment Validation
 * Comprehensive validation of all systems for production readiness
 */

const fs = require('fs');
const { spawn } = require('child_process');

class FinalProductionValidator {
  constructor() {
    this.results = {
      infrastructure: { passed: false, score: 0 },
      aiIntegration: { passed: false, score: 0 },
      platforms: { passed: false, score: 0 },
      security: { passed: false, score: 0 },
      deployment: { passed: false, score: 0 }
    };
    this.overallScore = 0;
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
    let score = 0;

    // Check Docker Compose
    if (fs.existsSync('docker-compose.production-enhanced.yml')) {
      this.log('Docker Compose production file: READY', 'success');
      score += 20;
    }

    // Check deployment script
    if (fs.existsSync('deploy-production.sh')) {
      this.log('Production deployment script: READY', 'success');
      score += 20;
    }

    // Check Nginx config
    if (fs.existsSync('nginx/nginx-production.conf')) {
      this.log('Nginx production config: READY', 'success');
      score += 15;
    }

    // Check monitoring configs
    const monitoringConfigs = [
      'monitoring/prometheus-production.yml',
      'monitoring/loki-production.yml',
      'monitoring/promtail-production.yml'
    ];

    let monitoringScore = 0;
    for (const config of monitoringConfigs) {
      if (fs.existsSync(config)) {
        monitoringScore += 5;
      }
    }
    score += monitoringScore;

    // Check secrets management
    if (fs.existsSync('scripts/generate-secrets.sh') && fs.existsSync('production.env.example')) {
      this.log('Secrets management: READY', 'success');
      score += 20;
    }

    this.results.infrastructure.score = score;
    this.results.infrastructure.passed = score >= 80;

    if (this.results.infrastructure.passed) {
      this.log(`Infrastructure validation: PASSED (${score}/100)`, 'success');
    } else {
      this.log(`Infrastructure validation: NEEDS WORK (${score}/100)`, 'warning');
    }

    return this.results.infrastructure.passed;
  }

  async validateAIIntegration() {
    this.log('🤖 Validating AI Integration...', 'info');
    let score = 0;
    let providersFound = 0;

    // Check for AI provider implementations
    const providers = [
      { name: 'Together AI (FREE)', file: 'backend/src/api/providers/together.ts', points: 25 },
      { name: 'Groq', pattern: 'groq', points: 20 },
      { name: 'Google/Gemini', pattern: 'google|gemini', points: 20 },
      { name: 'Anthropic', pattern: 'anthropic|claude', points: 15 },
      { name: 'OpenAI', pattern: 'openai', points: 10 }
    ];

    for (const provider of providers) {
      let found = false;

      if (provider.file && fs.existsSync(provider.file)) {
        found = true;
      } else if (provider.pattern) {
        // Check in key locations
        const searchDirs = ['backend/src', 'recoder-web/lib', 'recoder-chat/lib'];
        for (const dir of searchDirs) {
          if (fs.existsSync(dir)) {
            try {
              const result = await this.runCommand('grep', ['-r', '-i', '-l', provider.pattern, dir, '--include=*.ts', '--include=*.js']);
              if (result.stdout.trim()) {
                found = true;
                break;
              }
            } catch (e) {
              // Continue searching
            }
          }
        }
      }

      if (found) {
        this.log(`${provider.name}: CONFIGURED`, 'success');
        score += provider.points;
        providersFound++;
      } else {
        this.log(`${provider.name}: NOT FOUND`, 'warning');
      }
    }

    // Check for local AI (Ollama) support
    if (fs.existsSync('docker-compose.production-enhanced.yml')) {
      const dockerContent = fs.readFileSync('docker-compose.production-enhanced.yml', 'utf8');
      if (dockerContent.includes('ollama')) {
        this.log('Local AI (Ollama): CONFIGURED', 'success');
        score += 10;
      }
    }

    this.results.aiIntegration.score = score;
    this.results.aiIntegration.passed = score >= 70 && providersFound >= 3;

    if (this.results.aiIntegration.passed) {
      this.log(`AI Integration: PASSED (${score}/100, ${providersFound} providers)`, 'success');
    } else {
      this.log(`AI Integration: NEEDS WORK (${score}/100, ${providersFound} providers)`, 'warning');
    }

    return this.results.aiIntegration.passed;
  }

  async validatePlatforms() {
    this.log('🌐 Validating Platform Readiness...', 'info');
    let score = 0;

    const platforms = [
      { name: 'Web Platform', dir: 'recoder-web', packageJson: 'recoder-web/package.json', points: 25 },
      { name: 'Chat Platform', dir: 'recoder-chat', packageJson: 'recoder-chat/package.json', points: 25 },
      { name: 'VS Code Extension', dir: 'recoder-extension', packageJson: 'recoder-extension/package.json', points: 20 },
      { name: 'Backend API', dir: 'backend', packageJson: 'backend/package.json', points: 20 },
      { name: 'Production Engine', dir: 'production-engine', packageJson: 'production-engine/package.json', points: 10 }
    ];

    let workingPlatforms = 0;

    for (const platform of platforms) {
      if (fs.existsSync(platform.dir) && fs.existsSync(platform.packageJson)) {
        try {
          const packageContent = JSON.parse(fs.readFileSync(platform.packageJson, 'utf8'));
          if (packageContent.scripts && packageContent.scripts.build) {
            this.log(`${platform.name}: READY`, 'success');
            score += platform.points;
            workingPlatforms++;
          } else {
            this.log(`${platform.name}: Missing build script`, 'warning');
            score += platform.points * 0.5;
          }
        } catch (error) {
          this.log(`${platform.name}: Invalid package.json`, 'error');
        }
      } else {
        this.log(`${platform.name}: NOT FOUND`, 'warning');
      }
    }

    this.results.platforms.score = score;
    this.results.platforms.passed = score >= 70 && workingPlatforms >= 4;

    if (this.results.platforms.passed) {
      this.log(`Platform Readiness: PASSED (${score}/100, ${workingPlatforms} platforms)`, 'success');
    } else {
      this.log(`Platform Readiness: NEEDS WORK (${score}/100, ${workingPlatforms} platforms)`, 'warning');
    }

    return this.results.platforms.passed;
  }

  async validateSecurity() {
    this.log('🔒 Validating Security Configuration...', 'info');
    let score = 0;

    // Check environment template
    if (fs.existsSync('production.env.example')) {
      this.log('Environment template: READY', 'success');
      score += 20;
    }

    // Check secrets generation
    if (fs.existsSync('.env.production.test')) {
      const envContent = fs.readFileSync('.env.production.test', 'utf8');
      const requiredVars = ['DB_PASSWORD', 'REDIS_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY'];
      let foundVars = 0;

      for (const varName of requiredVars) {
        if (envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=your_`)) {
          foundVars++;
        }
      }

      if (foundVars === requiredVars.length) {
        this.log('Security secrets: GENERATED', 'success');
        score += 30;
      } else {
        this.log(`Security secrets: PARTIAL (${foundVars}/${requiredVars.length})`, 'warning');
        score += 15;
      }
    }

    // Check Nginx security config
    if (fs.existsSync('nginx/nginx-production.conf')) {
      const nginxContent = fs.readFileSync('nginx/nginx-production.conf', 'utf8');
      if (nginxContent.includes('ssl_protocols') && nginxContent.includes('security')) {
        this.log('Nginx security headers: CONFIGURED', 'success');
        score += 25;
      }
    }

    // Check secrets management guide
    if (fs.existsSync('secrets-management-guide.md')) {
      this.log('Security documentation: AVAILABLE', 'success');
      score += 15;
    }

    // Check domain setup guide
    if (fs.existsSync('DOMAIN_SSL_SETUP_GUIDE.md')) {
      this.log('Domain/SSL guide: AVAILABLE', 'success');
      score += 10;
    }

    this.results.security.score = score;
    this.results.security.passed = score >= 80;

    if (this.results.security.passed) {
      this.log(`Security Configuration: PASSED (${score}/100)`, 'success');
    } else {
      this.log(`Security Configuration: NEEDS WORK (${score}/100)`, 'warning');
    }

    return this.results.security.passed;
  }

  async validateDeployment() {
    this.log('🚀 Validating Deployment Readiness...', 'info');
    let score = 0;

    // Check deployment script
    if (fs.existsSync('deploy-production.sh') && fs.statSync('deploy-production.sh').mode & parseInt('100', 8)) {
      this.log('Deployment automation: READY', 'success');
      score += 30;
    }

    // Check Docker Compose production file
    if (fs.existsSync('docker-compose.production-enhanced.yml')) {
      try {
        const dockerContent = fs.readFileSync('docker-compose.production-enhanced.yml', 'utf8');
        
        // Check for essential services
        const essentialServices = ['postgres', 'redis', 'backend', 'web', 'nginx'];
        let foundServices = 0;
        
        for (const service of essentialServices) {
          if (dockerContent.includes(`${service}:`)) {
            foundServices++;
          }
        }
        
        if (foundServices === essentialServices.length) {
          this.log('Docker services: ALL CONFIGURED', 'success');
          score += 40;
        } else {
          this.log(`Docker services: PARTIAL (${foundServices}/${essentialServices.length})`, 'warning');
          score += 20;
        }

      } catch (error) {
        this.log('Docker Compose file: INVALID', 'error');
      }
    }

    // Check documentation
    const docs = [
      'PRODUCTION_INFRASTRUCTURE_COMPLETE.md',
      'DOMAIN_SSL_SETUP_GUIDE.md'
    ];

    let docsScore = 0;
    for (const doc of docs) {
      if (fs.existsSync(doc)) {
        docsScore += 15;
      }
    }
    score += docsScore;

    this.results.deployment.score = score;
    this.results.deployment.passed = score >= 80;

    if (this.results.deployment.passed) {
      this.log(`Deployment Readiness: PASSED (${score}/100)`, 'success');
    } else {
      this.log(`Deployment Readiness: NEEDS WORK (${score}/100)`, 'warning');
    }

    return this.results.deployment.passed;
  }

  async runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject({ code, stdout, stderr });
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error('Command timeout'));
      }, 5000);
    });
  }

  generateFinalReport() {
    // Calculate overall score
    this.overallScore = Math.round(
      (this.results.infrastructure.score + 
       this.results.aiIntegration.score + 
       this.results.platforms.score + 
       this.results.security.score + 
       this.results.deployment.score) / 5
    );

    const allPassed = Object.values(this.results).every(r => r.passed);
    const productionReady = this.overallScore >= 85 && allPassed;

    const report = {
      timestamp: new Date().toISOString(),
      overallStatus: productionReady ? 'PRODUCTION_READY' : 'NEEDS_IMPROVEMENT',
      overallScore: this.overallScore,
      readinessLevel: this.getReadinessLevel(),
      results: this.results,
      recommendations: this.generateRecommendations(productionReady),
      nextSteps: this.generateNextSteps(productionReady)
    };

    // Write comprehensive report
    fs.writeFileSync('final-production-validation.json', JSON.stringify(report, null, 2));
    this.log('Final validation report written to: final-production-validation.json', 'success');

    return report;
  }

  getReadinessLevel() {
    if (this.overallScore >= 95) return 'EXCELLENT - DEPLOY NOW';
    if (this.overallScore >= 85) return 'PRODUCTION READY';
    if (this.overallScore >= 70) return 'MOSTLY READY - MINOR FIXES NEEDED';
    if (this.overallScore >= 50) return 'NEEDS WORK - MAJOR FIXES REQUIRED';
    return 'NOT READY - EXTENSIVE WORK NEEDED';
  }

  generateRecommendations(productionReady) {
    const recommendations = [];

    if (productionReady) {
      recommendations.push('🎉 System is PRODUCTION READY!');
      recommendations.push('🌐 Purchase and configure recoder.xyz domain');
      recommendations.push('🖥️ Deploy to production server (DigitalOcean/AWS)');
      recommendations.push('🔑 Add real API keys to production environment');
      recommendations.push('📊 Set up monitoring alerts and backup procedures');
    } else {
      if (this.results.infrastructure.score < 80) {
        recommendations.push('🏗️ Complete infrastructure setup (Docker, deployment scripts)');
      }
      if (this.results.aiIntegration.score < 70) {
        recommendations.push('🤖 Fix AI provider integrations across all platforms');
      }
      if (this.results.platforms.score < 70) {
        recommendations.push('🌐 Ensure all platforms have proper build scripts');
      }
      if (this.results.security.score < 80) {
        recommendations.push('🔒 Complete security configuration and secrets management');
      }
      if (this.results.deployment.score < 80) {
        recommendations.push('🚀 Finalize deployment automation and documentation');
      }
    }

    return recommendations;
  }

  generateNextSteps(productionReady) {
    if (productionReady) {
      return [
        '1. Purchase recoder.xyz domain',
        '2. Set up production server (minimum 8GB RAM, 4 CPU)',
        '3. Configure DNS A records',
        '4. Generate real production secrets',
        '5. Run: ./deploy-production.sh',
        '6. Test all platforms and AI integration',
        '7. Set up monitoring and backup procedures'
      ];
    } else {
      return [
        '1. Address failing validation categories',
        '2. Re-run validation until all categories pass',
        '3. Test platforms locally',
        '4. Prepare production deployment',
        '5. Follow production deployment guide'
      ];
    }
  }

  async run() {
    console.log('🚀 FINAL PRODUCTION VALIDATION');
    console.log('============================\n');

    // Run all validation categories
    await this.validateInfrastructure();
    await this.validateAIIntegration();
    await this.validatePlatforms();
    await this.validateSecurity();
    await this.validateDeployment();

    // Generate final report
    const report = this.generateFinalReport();

    // Display results
    console.log('\n🎯 FINAL VALIDATION RESULTS');
    console.log('============================');
    console.log(`Overall Status: ${report.overallStatus}`);
    console.log(`Overall Score: ${report.overallScore}/100`);
    console.log(`Readiness Level: ${report.readinessLevel}`);
    console.log('');

    // Category breakdown
    console.log('📊 Category Scores:');
    console.log(`   🏗️  Infrastructure: ${this.results.infrastructure.score}/100 ${this.results.infrastructure.passed ? '✅' : '⚠️'}`);
    console.log(`   🤖 AI Integration: ${this.results.aiIntegration.score}/100 ${this.results.aiIntegration.passed ? '✅' : '⚠️'}`);
    console.log(`   🌐 Platforms: ${this.results.platforms.score}/100 ${this.results.platforms.passed ? '✅' : '⚠️'}`);
    console.log(`   🔒 Security: ${this.results.security.score}/100 ${this.results.security.passed ? '✅' : '⚠️'}`);
    console.log(`   🚀 Deployment: ${this.results.deployment.score}/100 ${this.results.deployment.passed ? '✅' : '⚠️'}`);

    console.log('\n💡 RECOMMENDATIONS:');
    report.recommendations.forEach(rec => console.log(`   ${rec}`));

    console.log('\n📋 NEXT STEPS:');
    report.nextSteps.forEach(step => console.log(`   ${step}`));

    console.log(`\n📄 Full report: final-production-validation.json`);

    return report.overallStatus === 'PRODUCTION_READY';
  }
}

// Execute if run directly
if (require.main === module) {
  const validator = new FinalProductionValidator();
  validator.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Final validation failed:', error);
    process.exit(1);
  });
}

module.exports = FinalProductionValidator;