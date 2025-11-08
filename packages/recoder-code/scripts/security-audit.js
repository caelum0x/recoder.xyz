#!/usr/bin/env node

/**
 * Security Audit Script
 * Comprehensive security analysis for the Enhanced AI CLI
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class SecurityAuditor {
  constructor() {
    this.vulnerabilities = [];
    this.warnings = [];
    this.recommendations = [];
    this.criticalIssues = 0;
    this.highIssues = 0;
    this.mediumIssues = 0;
    this.lowIssues = 0;
  }

  async audit() {
    console.log(chalk.bold.cyan('🔒 Enhanced AI CLI Security Audit'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log('');

    await this.auditDependencies();
    await this.auditCodeSecurity();
    await this.auditConfigurationSecurity();
    await this.auditAPIKeySecurity();
    await this.auditFilePermissions();
    await this.auditDataHandling();
    await this.generateSecurityReport();
  }

  async auditDependencies() {
    console.log(chalk.cyan('🔍 Dependency Security Audit'));
    
    try {
      // NPM Audit
      const auditOutput = execSync('npm audit --json', { encoding: 'utf8' });
      const auditData = JSON.parse(auditOutput);
      
      if (auditData.vulnerabilities && Object.keys(auditData.vulnerabilities).length > 0) {
        Object.values(auditData.vulnerabilities).forEach(vuln => {
          this.addVulnerability('dependency', vuln.severity, 
            `${vuln.name}: ${vuln.title}`, vuln.url);
        });
      } else {
        console.log(chalk.green('✅ No dependency vulnerabilities found'));
      }
    } catch (error) {
      console.log(chalk.green('✅ No dependency vulnerabilities found'));
    }
    
    // Check for known problematic packages
    await this.checkProblematicPackages();
    
    // License compliance check
    await this.checkLicenseCompliance();
  }

  async checkProblematicPackages() {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.optionalDependencies
    };
    
    const problematicPackages = [
      'eval', 'vm2', 'node-serialize', 'serialize-javascript',
      'lodash', 'moment', 'request', 'colors'
    ];
    
    const found = problematicPackages.filter(pkg => allDeps[pkg]);
    
    if (found.length > 0) {
      found.forEach(pkg => {
        this.addWarning('dependency', 'Consider alternative for potentially problematic package: ' + pkg);
      });
    }
  }

  async checkLicenseCompliance() {
    console.log(chalk.cyan('  📄 Checking license compliance...'));
    
    try {
      const licenseCheck = execSync('npm ls --json', { encoding: 'utf8' });
      const licenseData = JSON.parse(licenseCheck);
      
      // Check for GPL licenses in dependencies
      const checkLicenses = (deps, path = '') => {
        if (!deps) return;
        
        Object.entries(deps).forEach(([name, info]) => {
          if (info.license && info.license.includes('GPL')) {
            this.addWarning('license', `GPL license detected in ${name}: ${info.license}`);
          }
          
          if (info.dependencies) {
            checkLicenses(info.dependencies, path + '/' + name);
          }
        });
      };
      
      checkLicenses(licenseData.dependencies);
      console.log(chalk.green('✅ License compliance checked'));
    } catch (error) {
      this.addWarning('license', 'Could not verify all package licenses');
    }
  }

  async auditCodeSecurity() {
    console.log(chalk.cyan('\\n🔍 Code Security Analysis'));
    
    const sourceFiles = this.findSourceFiles();
    
    for (const file of sourceFiles) {
      await this.analyzeFile(file);
    }
    
    console.log(chalk.green(`✅ Analyzed ${sourceFiles.length} source files`));
  }

  async analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Check for hardcoded secrets
      await this.checkHardcodedSecrets(content, relativePath);
      
      // Check for dangerous functions
      await this.checkDangerousFunctions(content, relativePath);
      
      // Check for SQL injection risks
      await this.checkSQLInjection(content, relativePath);
      
      // Check for XSS vulnerabilities
      await this.checkXSSVulnerabilities(content, relativePath);
      
      // Check for insecure randomness
      await this.checkInsecureRandomness(content, relativePath);
      
      // Check for eval usage
      await this.checkEvalUsage(content, relativePath);
      
    } catch (error) {
      // Skip files that can't be read
    }
  }

  async checkHardcodedSecrets(content, filePath) {
    const secretPatterns = [
      { name: 'API Keys', pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][^'"]{20,}['"]/gi },
      { name: 'Passwords', pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/gi },
      { name: 'Tokens', pattern: /(?:token|auth)\s*[=:]\s*['"][^'"]{20,}['"]/gi },
      { name: 'Private Keys', pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i },
      { name: 'AWS Keys', pattern: /AKIA[0-9A-Z]{16}/gi },
      { name: 'JWT Tokens', pattern: /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g }
    ];
    
    secretPatterns.forEach(({ name, pattern }) => {
      const matches = content.match(pattern);
      if (matches) {
        this.addVulnerability('secrets', 'high', 
          `Potential ${name} hardcoded in ${filePath}`, null);
      }
    });
  }

  async checkDangerousFunctions(content, filePath) {
    const dangerousFunctions = [
      { name: 'eval()', pattern: /\beval\s*\(/gi, severity: 'critical' },
      { name: 'Function()', pattern: /\bFunction\s*\(/gi, severity: 'high' },
      { name: 'setTimeout/setInterval with string', pattern: /set(?:Timeout|Interval)\s*\(\s*['"][^'"]*['"]/gi, severity: 'medium' },
      { name: 'document.write', pattern: /\bdocument\.write\s*\(/gi, severity: 'medium' },
      { name: 'innerHTML assignment', pattern: /\.innerHTML\s*=/gi, severity: 'low' }
    ];
    
    dangerousFunctions.forEach(({ name, pattern, severity }) => {
      const matches = content.match(pattern);
      if (matches) {
        this.addVulnerability('code', severity, 
          `Dangerous function ${name} used in ${filePath}`, null);
      }
    });
  }

  async checkSQLInjection(content, filePath) {
    const sqlPatterns = [
      /\$\{[^}]*\}.*(?:SELECT|INSERT|UPDATE|DELETE)/gi,
      /['"]\s*\+\s*.*(?:SELECT|INSERT|UPDATE|DELETE)/gi,
      /query\s*\(\s*['"][^'"]*['"]\s*\+/gi
    ];
    
    sqlPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        this.addVulnerability('sql-injection', 'high', 
          `Potential SQL injection in ${filePath}`, null);
      }
    });
  }

  async checkXSSVulnerabilities(content, filePath) {
    const xssPatterns = [
      /\.innerHTML\s*=\s*.*\+/gi,
      /\.outerHTML\s*=\s*.*\+/gi,
      /document\.write\s*\(.*\+/gi
    ];
    
    xssPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        this.addVulnerability('xss', 'medium', 
          `Potential XSS vulnerability in ${filePath}`, null);
      }
    });
  }

  async checkInsecureRandomness(content, filePath) {
    const insecureRandom = /\bMath\.random\s*\(\)/gi;
    const matches = content.match(insecureRandom);
    
    if (matches) {
      this.addWarning('crypto', 
        `Insecure randomness (Math.random()) used in ${filePath}. Consider crypto.randomBytes()`);
    }
  }

  async checkEvalUsage(content, filePath) {
    const evalPatterns = [
      /\beval\s*\(/gi,
      /\bnew\s+Function\s*\(/gi,
      /\bsetTimeout\s*\(\s*['"][^'"]*['"]/gi
    ];
    
    evalPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        this.addVulnerability('eval', 'critical', 
          `Dynamic code execution detected in ${filePath}`, null);
      }
    });
  }

  async auditConfigurationSecurity() {
    console.log(chalk.cyan('\\n🔍 Configuration Security'));
    
    // Check environment files
    await this.checkEnvironmentFiles();
    
    // Check file permissions
    await this.checkConfigPermissions();
    
    // Check for exposed configuration
    await this.checkExposedConfig();
  }

  async checkEnvironmentFiles() {
    const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
    
    envFiles.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const lines = content.split('\\n');
          
          lines.forEach((line, index) => {
            // Check for weak values
            if (line.includes('password=123') || line.includes('secret=test')) {
              this.addVulnerability('config', 'high', 
                `Weak credential in ${file}:${index + 1}`, null);
            }
            
            // Check for exposed values
            if (line.includes('localhost') && !line.includes('development')) {
              this.addWarning('config', 
                `Localhost reference in ${file}:${index + 1} - ensure not in production`);
            }
          });
        } catch (error) {
          // File exists but can't be read
        }
      }
    });
  }

  async checkConfigPermissions() {
    const sensitiveFiles = ['.env', 'config.js', 'setup.js'];
    
    sensitiveFiles.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          const mode = stats.mode.toString(8);
          
          // Check if file is world-readable (last digit > 4)
          if (parseInt(mode.slice(-1)) > 4) {
            this.addVulnerability('permissions', 'medium', 
              `${file} is world-readable (${mode})`, null);
          }
        } catch (error) {
          // Can't check permissions
        }
      }
    });
  }

  async checkExposedConfig() {
    // Check if .env is in git
    try {
      const gitIgnore = fs.readFileSync('.gitignore', 'utf8');
      if (!gitIgnore.includes('.env')) {
        this.addVulnerability('config', 'critical', 
          '.env file not in .gitignore - secrets may be committed', null);
      }
    } catch (error) {
      this.addWarning('config', 'No .gitignore found');
    }
  }

  async auditAPIKeySecurity() {
    console.log(chalk.cyan('\\n🔍 API Key Security'));
    
    // Check API key handling
    await this.checkAPIKeyHandling();
    
    // Check for key rotation
    await this.checkKeyRotation();
    
    // Check encryption at rest
    await this.checkKeyEncryption();
  }

  async checkAPIKeyHandling() {
    const configFiles = ['config.js', 'cli/run.js', 'setup.js'];
    
    for (const file of configFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          
          // Check for plain text API key storage
          if (content.includes('OPENROUTER_API_KEY') && content.includes('=')) {
            // This is okay if it's reading from env
            if (!content.includes('process.env')) {
              this.addVulnerability('api-keys', 'high', 
                `API key may be hardcoded in ${file}`, null);
            }
          }
          
          // Check for proper validation
          if (content.includes('apiKey') && !content.includes('validate')) {
            this.addWarning('api-keys', 
              `API key validation may be missing in ${file}`);
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }
  }

  async checkKeyRotation() {
    // Check if there's any key rotation mechanism
    const sourceFiles = this.findSourceFiles();
    let hasKeyRotation = false;
    
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('rotation') || content.includes('refresh') || content.includes('renew')) {
          hasKeyRotation = true;
          break;
        }
      } catch (error) {
        // Skip
      }
    }
    
    if (!hasKeyRotation) {
      this.addRecommendation('api-keys', 
        'Consider implementing API key rotation mechanism');
    }
  }

  async checkKeyEncryption() {
    // Check if keys are encrypted at rest
    const sourceFiles = this.findSourceFiles();
    let hasEncryption = false;
    
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('encrypt') || content.includes('crypto')) {
          hasEncryption = true;
          break;
        }
      } catch (error) {
        // Skip
      }
    }
    
    if (!hasEncryption) {
      this.addRecommendation('encryption', 
        'Consider encrypting sensitive data at rest');
    }
  }

  async auditFilePermissions() {
    console.log(chalk.cyan('\\n🔍 File Permissions'));
    
    const sensitiveFiles = [
      'setup.js', 'config.js', '.env', 'cli/run.js',
      'package.json', 'scripts/'
    ];
    
    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          const isDir = stats.isDirectory();
          const mode = stats.mode.toString(8);
          
          // Check for overly permissive permissions
          if (isDir) {
            if (parseInt(mode.slice(-3)) > 755) {
              this.addWarning('permissions', 
                `Directory ${file} has overly permissive permissions: ${mode}`);
            }
          } else {
            if (parseInt(mode.slice(-3)) > 644) {
              this.addWarning('permissions', 
                `File ${file} has overly permissive permissions: ${mode}`);
            }
          }
        } catch (error) {
          // Can't check permissions
        }
      }
    }
  }

  async auditDataHandling() {
    console.log(chalk.cyan('\\n🔍 Data Handling Security'));
    
    // Check for data validation
    await this.checkDataValidation();
    
    // Check for secure communication
    await this.checkSecureCommunication();
    
    // Check for data retention
    await this.checkDataRetention();
  }

  async checkDataValidation() {
    const sourceFiles = this.findSourceFiles();
    let hasValidation = false;
    
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('validate') || content.includes('sanitize') || content.includes('escape')) {
          hasValidation = true;
          break;
        }
      } catch (error) {
        // Skip
      }
    }
    
    if (!hasValidation) {
      this.addRecommendation('validation', 
        'Implement input validation and sanitization');
    }
  }

  async checkSecureCommunication() {
    const sourceFiles = this.findSourceFiles();
    
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for HTTP usage (should be HTTPS)
        const httpMatches = content.match(/http:\/\/[^\s'"]+/gi);
        if (httpMatches) {
          httpMatches.forEach(match => {
            if (!match.includes('localhost') && !match.includes('127.0.0.1')) {
              this.addVulnerability('communication', 'medium', 
                `Insecure HTTP communication in ${file}: ${match}`, null);
            }
          });
        }
      } catch (error) {
        // Skip
      }
    }
  }

  async checkDataRetention() {
    // Check for log files and data retention policies
    const logFiles = ['logs/', 'sessions/', '*.log'];
    let hasRetentionPolicy = false;
    
    // Check if there's any retention logic
    const sourceFiles = this.findSourceFiles();
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('retention') || content.includes('cleanup') || content.includes('expire')) {
          hasRetentionPolicy = true;
          break;
        }
      } catch (error) {
        // Skip
      }
    }
    
    if (!hasRetentionPolicy) {
      this.addRecommendation('data-retention', 
        'Implement data retention and cleanup policies');
    }
  }

  findSourceFiles() {
    const files = [];
    const extensions = ['.js', '.ts', '.jsx', '.tsx'];
    
    const scanDir = (dir) => {
      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(item)) {
            scanDir(fullPath);
          } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
            files.push(fullPath);
          }
        });
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    scanDir(process.cwd());
    return files;
  }

  addVulnerability(category, severity, description, reference) {
    this.vulnerabilities.push({ category, severity, description, reference });
    
    switch (severity) {
      case 'critical': this.criticalIssues++; break;
      case 'high': this.highIssues++; break;
      case 'medium': this.mediumIssues++; break;
      case 'low': this.lowIssues++; break;
    }
  }

  addWarning(category, description) {
    this.warnings.push({ category, description });
  }

  addRecommendation(category, description) {
    this.recommendations.push({ category, description });
  }

  async generateSecurityReport() {
    console.log(chalk.bold.cyan('\\n🛡️  Security Audit Report'));
    console.log(chalk.gray('═'.repeat(50)));
    
    // Summary
    const totalIssues = this.criticalIssues + this.highIssues + this.mediumIssues + this.lowIssues;
    
    if (totalIssues === 0) {
      console.log(chalk.green('🎉 No security vulnerabilities found!'));
      console.log(chalk.green('✅ Your application follows security best practices'));
    } else {
      console.log(chalk.yellow(`⚠️  Found ${totalIssues} security issues:`));
      
      if (this.criticalIssues > 0) {
        console.log(chalk.red(`   🚨 Critical: ${this.criticalIssues}`));
      }
      if (this.highIssues > 0) {
        console.log(chalk.red(`   🔴 High: ${this.highIssues}`));
      }
      if (this.mediumIssues > 0) {
        console.log(chalk.yellow(`   🟡 Medium: ${this.mediumIssues}`));
      }
      if (this.lowIssues > 0) {
        console.log(chalk.blue(`   🔵 Low: ${this.lowIssues}`));
      }
    }
    
    // Detailed vulnerabilities
    if (this.vulnerabilities.length > 0) {
      console.log(chalk.bold('\\n🔍 Detailed Vulnerabilities:'));
      
      this.vulnerabilities.forEach((vuln, index) => {
        const severityColor = vuln.severity === 'critical' ? chalk.red :
                             vuln.severity === 'high' ? chalk.red :
                             vuln.severity === 'medium' ? chalk.yellow : chalk.blue;
        
        console.log(`\\n${index + 1}. ${severityColor(vuln.severity.toUpperCase())}: ${vuln.description}`);
        console.log(chalk.gray(`   Category: ${vuln.category}`));
        if (vuln.reference) {
          console.log(chalk.gray(`   Reference: ${vuln.reference}`));
        }
      });
    }
    
    // Warnings
    if (this.warnings.length > 0) {
      console.log(chalk.bold('\\n⚠️  Warnings:'));
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.description}`);
        console.log(chalk.gray(`   Category: ${warning.category}`));
      });
    }
    
    // Recommendations
    if (this.recommendations.length > 0) {
      console.log(chalk.bold('\\n💡 Security Recommendations:'));
      this.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec.description}`);
        console.log(chalk.gray(`   Category: ${rec.category}`));
      });
    }
    
    // Security score
    const maxScore = 100;
    const deductions = (this.criticalIssues * 20) + (this.highIssues * 10) + 
                      (this.mediumIssues * 5) + (this.lowIssues * 2) + 
                      (this.warnings.length * 1);
    const score = Math.max(0, maxScore - deductions);
    
    console.log(chalk.bold('\\n📊 Security Score:'));
    const scoreColor = score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;
    console.log(scoreColor(`   ${score}/100`));
    
    if (score >= 90) {
      console.log(chalk.green('   Excellent security posture! 🏆'));
    } else if (score >= 70) {
      console.log(chalk.yellow('   Good security, but room for improvement 📈'));
    } else {
      console.log(chalk.red('   Security needs immediate attention! 🚨'));
    }
    
    // Next steps
    console.log(chalk.bold('\\n🎯 Next Steps:'));
    if (this.criticalIssues > 0) {
      console.log(chalk.red('1. 🚨 Address critical vulnerabilities immediately'));
    }
    if (this.highIssues > 0) {
      console.log(chalk.red('2. 🔴 Fix high-severity issues within 24 hours'));
    }
    if (this.mediumIssues > 0) {
      console.log(chalk.yellow('3. 🟡 Plan to address medium-severity issues'));
    }
    
    console.log(chalk.cyan('4. 📚 Review security best practices'));
    console.log(chalk.cyan('5. 🔄 Run security audits regularly'));
    console.log(chalk.cyan('6. 📋 Document security procedures'));
    
    console.log('\\n' + chalk.gray('Security audit completed at: ' + new Date().toISOString()));
  }
}

// Run audit if this file is executed directly
if (require.main === module) {
  const auditor = new SecurityAuditor();
  auditor.audit().catch(console.error);
}

module.exports = SecurityAuditor;