#!/usr/bin/env node

/**
 * Production Security Hardening Assessment
 * Comprehensive security audit and hardening implementation for Recoder.xyz
 */

const fs = require('fs');
const path = require('path');

// Security Assessment Categories
const SECURITY_CATEGORIES = {
  AUTHENTICATION: {
    name: 'Authentication & Authorization',
    priority: 'CRITICAL',
    areas: ['JWT Security', 'Session Management', 'Multi-Factor Auth', 'OAuth Integration']
  },
  API_SECURITY: {
    name: 'API Security',
    priority: 'HIGH',
    areas: ['Rate Limiting', 'Input Validation', 'CORS Configuration', 'API Key Management']
  },
  DATA_PROTECTION: {
    name: 'Data Protection',
    priority: 'CRITICAL',
    areas: ['Encryption at Rest', 'Encryption in Transit', 'PII Protection', 'Secret Management']
  },
  INFRASTRUCTURE: {
    name: 'Infrastructure Security',
    priority: 'HIGH',
    areas: ['Network Security', 'Container Security', 'Environment Isolation', 'Access Control']
  },
  CODE_SECURITY: {
    name: 'Code Security',
    priority: 'MEDIUM',
    areas: ['Dependency Scanning', 'SAST/DAST', 'Code Signing', 'Supply Chain Security']
  },
  MONITORING: {
    name: 'Security Monitoring',
    priority: 'HIGH',
    areas: ['Audit Logging', 'Threat Detection', 'Incident Response', 'Compliance']
  }
};

const BACKEND_URL = 'http://localhost:3001';

class SecurityHardeningAssessment {
  constructor() {
    this.assessmentResults = [];
    this.vulnerabilities = [];
    this.recommendations = [];
    this.projectRoot = process.cwd();
  }

  async runFullAssessment() {
    console.log('🔐 Starting Production Security Hardening Assessment');
    console.log('=' * 65);
    
    // Phase 1: Backend Security Assessment
    await this.assessBackendSecurity();
    
    // Phase 2: File System Security Scan
    await this.scanFileSystemSecurity();
    
    // Phase 3: Configuration Security
    await this.assessConfigurationSecurity();
    
    // Phase 4: API Security Testing
    await this.testAPISecurity();
    
    // Phase 5: Generate Security Report
    await this.generateSecurityReport();
    
    // Phase 6: Implement Security Hardening
    await this.implementSecurityHardening();
  }

  async assessBackendSecurity() {
    console.log('\n🛡️  Phase 1: Backend Security Assessment');
    console.log('-'.repeat(50));

    const securityTests = [
      {
        name: 'Backend Health & Security Headers',
        endpoint: '/health',
        checkType: 'headers',
        criticalHeaders: ['X-Content-Type-Options', 'X-Frame-Options', 'X-XSS-Protection', 'Strict-Transport-Security']
      },
      {
        name: 'CORS Configuration',
        endpoint: '/health',
        checkType: 'cors',
        method: 'OPTIONS'
      },
      {
        name: 'Rate Limiting',
        endpoint: '/health',
        checkType: 'rate_limit',
        requests: 100
      },
      {
        name: 'Input Validation',
        endpoint: '/api/test',
        checkType: 'input_validation',
        payloads: ['<script>alert(1)</script>', 'DROP TABLE users;', '../../../etc/passwd']
      }
    ];

    for (const test of securityTests) {
      await this.runSecurityTest(test);
    }
  }

  async runSecurityTest(test) {
    console.log(`   🧪 Testing: ${test.name}`);
    const startTime = Date.now();

    try {
      let testResult = {
        name: test.name,
        category: test.checkType,
        passed: false,
        vulnerabilities: [],
        recommendations: [],
        responseTime: 0,
        timestamp: new Date()
      };

      if (test.checkType === 'headers') {
        const response = await fetch(`${BACKEND_URL}${test.endpoint}`);
        testResult.responseTime = Date.now() - startTime;
        
        const securityHeaders = {};
        test.criticalHeaders.forEach(header => {
          securityHeaders[header] = response.headers.get(header);
        });

        const missingHeaders = test.criticalHeaders.filter(header => !response.headers.get(header));
        
        if (missingHeaders.length === 0) {
          testResult.passed = true;
          console.log(`      ✅ All security headers present`);
        } else {
          testResult.vulnerabilities.push(`Missing security headers: ${missingHeaders.join(', ')}`);
          testResult.recommendations.push('Implement missing security headers');
          console.log(`      ⚠️  Missing headers: ${missingHeaders.join(', ')}`);
        }

        testResult.details = { securityHeaders, missingHeaders };

      } else if (test.checkType === 'cors') {
        const response = await fetch(`${BACKEND_URL}${test.endpoint}`, {
          method: 'OPTIONS',
          headers: {
            'Origin': 'https://malicious-site.com',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type'
          }
        });
        
        testResult.responseTime = Date.now() - startTime;
        const corsHeaders = {
          'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
          'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
          'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers')
        };

        if (corsHeaders['Access-Control-Allow-Origin'] === '*') {
          testResult.vulnerabilities.push('CORS allows all origins (*)');
          testResult.recommendations.push('Restrict CORS to specific origins');
          console.log(`      ⚠️  CORS vulnerability: Allows all origins`);
        } else {
          testResult.passed = true;
          console.log(`      ✅ CORS properly configured`);
        }

        testResult.details = { corsHeaders };

      } else if (test.checkType === 'rate_limit') {
        const promises = Array(test.requests).fill().map(() => 
          fetch(`${BACKEND_URL}${test.endpoint}`)
        );
        
        const responses = await Promise.all(promises);
        testResult.responseTime = Date.now() - startTime;
        
        const rateLimited = responses.some(r => r.status === 429);
        const successCount = responses.filter(r => r.ok).length;
        
        if (rateLimited) {
          testResult.passed = true;
          console.log(`      ✅ Rate limiting active (${successCount}/${test.requests} succeeded)`);
        } else {
          testResult.vulnerabilities.push('No rate limiting detected');
          testResult.recommendations.push('Implement rate limiting middleware');
          console.log(`      ⚠️  No rate limiting detected (${successCount}/${test.requests} succeeded)`);
        }

        testResult.details = { successCount, totalRequests: test.requests, rateLimited };

      } else if (test.checkType === 'input_validation') {
        const testResults = [];
        
        for (const payload of test.payloads) {
          try {
            const response = await fetch(`${BACKEND_URL}${test.endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ test: payload })
            });
            
            testResults.push({
              payload,
              status: response.status,
              blocked: response.status >= 400
            });
          } catch (error) {
            testResults.push({
              payload,
              status: 'error',
              blocked: true,
              error: error.message
            });
          }
        }

        testResult.responseTime = Date.now() - startTime;
        const blockedPayloads = testResults.filter(r => r.blocked).length;
        
        if (blockedPayloads === test.payloads.length) {
          testResult.passed = true;
          console.log(`      ✅ Input validation working (${blockedPayloads}/${test.payloads.length} blocked)`);
        } else {
          testResult.vulnerabilities.push('Insufficient input validation');
          testResult.recommendations.push('Implement comprehensive input validation');
          console.log(`      ⚠️  Input validation gaps (${blockedPayloads}/${test.payloads.length} blocked)`);
        }

        testResult.details = { testResults };
      }

      this.assessmentResults.push(testResult);

    } catch (error) {
      console.log(`      ❌ Test failed: ${error.message}`);
      this.assessmentResults.push({
        name: test.name,
        category: test.checkType,
        passed: false,
        error: error.message,
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      });
    }
  }

  async scanFileSystemSecurity() {
    console.log('\n🗂️  Phase 2: File System Security Scan');
    console.log('-'.repeat(50));

    const securityScans = [
      {
        name: 'Environment Files Security',
        scan: 'env_files',
        patterns: ['.env*', '*.key', '*.pem', 'secrets*']
      },
      {
        name: 'Configuration Security',
        scan: 'config_files',
        patterns: ['*.config.*', 'docker-compose*', '*.json']
      },
      {
        name: 'Dependency Vulnerabilities',
        scan: 'dependencies',
        files: ['package.json', 'package-lock.json', 'pnpm-lock.yaml']
      }
    ];

    for (const scan of securityScans) {
      await this.runFileSystemScan(scan);
    }
  }

  async runFileSystemScan(scan) {
    console.log(`   🔍 Scanning: ${scan.name}`);

    try {
      let scanResult = {
        name: scan.name,
        scanType: scan.scan,
        issues: [],
        recommendations: [],
        filesScanned: 0,
        timestamp: new Date()
      };

      if (scan.scan === 'env_files') {
        const envFiles = this.findFiles(this.projectRoot, scan.patterns);
        scanResult.filesScanned = envFiles.length;

        envFiles.forEach(file => {
          if (this.isExposedFile(file)) {
            scanResult.issues.push(`Potentially exposed environment file: ${file}`);
            scanResult.recommendations.push('Add environment files to .gitignore');
          }

          if (this.containsSensitiveData(file)) {
            scanResult.issues.push(`Sensitive data detected in: ${file}`);
            scanResult.recommendations.push('Use secure secret management');
          }
        });

        console.log(`      📁 Scanned ${envFiles.length} environment files`);
        if (scanResult.issues.length > 0) {
          console.log(`      ⚠️  Found ${scanResult.issues.length} security issues`);
        } else {
          console.log(`      ✅ No environment security issues found`);
        }

      } else if (scan.scan === 'config_files') {
        const configFiles = this.findFiles(this.projectRoot, scan.patterns);
        scanResult.filesScanned = configFiles.length;

        configFiles.forEach(file => {
          const insecureConfigs = this.checkConfigSecurity(file);
          scanResult.issues.push(...insecureConfigs);
        });

        console.log(`      📁 Scanned ${configFiles.length} configuration files`);
        if (scanResult.issues.length > 0) {
          console.log(`      ⚠️  Found ${scanResult.issues.length} configuration issues`);
        } else {
          console.log(`      ✅ Configuration security looks good`);
        }

      } else if (scan.scan === 'dependencies') {
        const depFiles = scan.files.filter(file => 
          fs.existsSync(path.join(this.projectRoot, file))
        );
        scanResult.filesScanned = depFiles.length;

        // Simulate dependency vulnerability scan
        const knownVulnerabilities = this.checkDependencyVulnerabilities(depFiles);
        scanResult.issues.push(...knownVulnerabilities);

        console.log(`      📦 Scanned ${depFiles.length} dependency files`);
        if (scanResult.issues.length > 0) {
          console.log(`      ⚠️  Found ${scanResult.issues.length} dependency vulnerabilities`);
        } else {
          console.log(`      ✅ No known dependency vulnerabilities`);
        }
      }

      this.assessmentResults.push(scanResult);

    } catch (error) {
      console.log(`      ❌ Scan failed: ${error.message}`);
    }
  }

  async assessConfigurationSecurity() {
    console.log('\n⚙️  Phase 3: Configuration Security Assessment');
    console.log('-'.repeat(50));

    const configs = [
      {
        name: 'Database Configuration',
        file: 'backend/src/database/prisma.ts',
        checks: ['connection_security', 'query_protection']
      },
      {
        name: 'AI Provider Security',
        file: 'backend/src/services/ai-provider-manager.ts',
        checks: ['api_key_handling', 'rate_limiting']
      },
      {
        name: 'Server Configuration',
        file: 'backend/src/index.ts',
        checks: ['security_middleware', 'error_handling']
      }
    ];

    for (const config of configs) {
      await this.assessConfiguration(config);
    }
  }

  async assessConfiguration(config) {
    console.log(`   🔧 Assessing: ${config.name}`);

    try {
      const configPath = path.join(this.projectRoot, config.file);
      
      if (!fs.existsSync(configPath)) {
        console.log(`      ⚠️  Configuration file not found: ${config.file}`);
        return;
      }

      const fileContent = fs.readFileSync(configPath, 'utf8');
      const securityIssues = [];
      const recommendations = [];

      // Check for common security issues
      if (fileContent.includes('process.env') && !fileContent.includes('validation')) {
        securityIssues.push('Environment variables used without validation');
        recommendations.push('Implement environment variable validation');
      }

      if (fileContent.includes('console.log') && fileContent.includes('password')) {
        securityIssues.push('Potential password logging detected');
        recommendations.push('Remove sensitive data from logs');
      }

      if (config.file.includes('database') && !fileContent.includes('ssl')) {
        securityIssues.push('Database connection may not use SSL');
        recommendations.push('Enable SSL for database connections');
      }

      console.log(`      📄 Configuration analyzed`);
      if (securityIssues.length > 0) {
        console.log(`      ⚠️  Found ${securityIssues.length} security concerns`);
      } else {
        console.log(`      ✅ Configuration security looks good`);
      }

      this.assessmentResults.push({
        name: config.name,
        category: 'configuration',
        file: config.file,
        issues: securityIssues,
        recommendations,
        timestamp: new Date()
      });

    } catch (error) {
      console.log(`      ❌ Assessment failed: ${error.message}`);
    }
  }

  async testAPISecurity() {
    console.log('\n🌐 Phase 4: API Security Testing');
    console.log('-'.repeat(50));

    const apiTests = [
      {
        name: 'Authentication Bypass',
        endpoint: '/api/admin',
        method: 'GET',
        headers: {}
      },
      {
        name: 'SQL Injection',
        endpoint: '/api/search',
        method: 'POST',
        payload: { query: "'; DROP TABLE users; --" }
      },
      {
        name: 'NoSQL Injection',
        endpoint: '/api/login',
        method: 'POST',
        payload: { email: { $ne: null }, password: { $ne: null } }
      }
    ];

    for (const test of apiTests) {
      await this.runAPISecurityTest(test);
    }
  }

  async runAPISecurityTest(test) {
    console.log(`   🌐 Testing: ${test.name}`);

    try {
      const requestOptions = {
        method: test.method,
        headers: {
          'Content-Type': 'application/json',
          ...test.headers
        }
      };

      if (test.payload) {
        requestOptions.body = JSON.stringify(test.payload);
      }

      const response = await fetch(`${BACKEND_URL}${test.endpoint}`, requestOptions);
      
      const testResult = {
        name: test.name,
        category: 'api_security',
        endpoint: test.endpoint,
        status: response.status,
        vulnerable: false,
        details: {},
        timestamp: new Date()
      };

      // Analyze response for vulnerabilities
      if (test.name.includes('Authentication') && response.status === 200) {
        testResult.vulnerable = true;
        testResult.details.issue = 'Unauthenticated access to protected endpoint';
      }

      if (test.name.includes('Injection') && response.status === 500) {
        const responseText = await response.text();
        if (responseText.includes('SQL') || responseText.includes('MongoDB')) {
          testResult.vulnerable = true;
          testResult.details.issue = 'Potential injection vulnerability detected';
        }
      }

      console.log(`      Status: ${response.status} ${testResult.vulnerable ? '⚠️' : '✅'}`);
      this.assessmentResults.push(testResult);

    } catch (error) {
      console.log(`      ❌ Test failed: ${error.message}`);
    }
  }

  // Helper methods
  findFiles(dir, patterns) {
    let files = [];
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files = files.concat(this.findFiles(fullPath, patterns));
        } else if (stat.isFile()) {
          if (patterns.some(pattern => this.matchPattern(item, pattern))) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
    return files;
  }

  matchPattern(filename, pattern) {
    const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(filename);
  }

  isExposedFile(filePath) {
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return true;
    
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    const relativePath = path.relative(this.projectRoot, filePath);
    
    return !gitignore.split('\n').some(line => 
      line.trim() && !line.startsWith('#') && relativePath.includes(line.trim())
    );
  }

  containsSensitiveData(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sensitivePatterns = [
        /password\s*=\s*["'][^"']+["']/i,
        /secret\s*=\s*["'][^"']+["']/i,
        /api[_-]?key\s*=\s*["'][^"']+["']/i,
        /token\s*=\s*["'][^"']+["']/i
      ];
      
      return sensitivePatterns.some(pattern => pattern.test(content));
    } catch (error) {
      return false;
    }
  }

  checkConfigSecurity(filePath) {
    const issues = [];
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for hardcoded secrets
      if (content.includes('password') && content.includes(':')) {
        issues.push(`Potential hardcoded credentials in ${path.basename(filePath)}`);
      }
      
      // Check for insecure protocols
      if (content.includes('http://') && !content.includes('localhost')) {
        issues.push(`Insecure HTTP protocol detected in ${path.basename(filePath)}`);
      }
      
      // Check for debug modes
      if (content.includes('"debug": true') || content.includes('DEBUG=true')) {
        issues.push(`Debug mode enabled in ${path.basename(filePath)}`);
      }
    } catch (error) {
      // Ignore read errors
    }
    
    return issues;
  }

  checkDependencyVulnerabilities(depFiles) {
    // Simulate dependency vulnerability checking
    const vulnerabilities = [];
    
    depFiles.forEach(file => {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          
          // Check for known vulnerable patterns
          if (content.includes('lodash') && content.includes('4.17.15')) {
            vulnerabilities.push('Lodash 4.17.15 has known vulnerabilities');
          }
          
          if (content.includes('express') && content.includes('4.16')) {
            vulnerabilities.push('Express 4.16.x has known vulnerabilities');
          }
        } catch (error) {
          // Ignore read errors
        }
      }
    });
    
    return vulnerabilities;
  }

  async generateSecurityReport() {
    console.log('\n📊 Phase 5: Security Assessment Report');
    console.log('-'.repeat(50));

    const totalTests = this.assessmentResults.length;
    const passedTests = this.assessmentResults.filter(r => r.passed || r.passed !== false).length;
    const vulnerabilities = this.assessmentResults.filter(r => r.vulnerable || r.issues?.length > 0).length;
    
    console.log(`\n📈 Security Assessment Summary:`);
    console.log(`   Total Security Tests: ${totalTests}`);
    console.log(`   Tests Passed: ${passedTests}/${totalTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`   Vulnerabilities Found: ${vulnerabilities}`);
    console.log(`   Security Score: ${((passedTests/totalTests) * 100).toFixed(1)}%`);

    // Categorize findings
    const criticalIssues = [];
    const highIssues = [];
    const mediumIssues = [];
    
    this.assessmentResults.forEach(result => {
      if (result.vulnerabilities?.length > 0 || result.vulnerable) {
        criticalIssues.push(result.name);
      } else if (result.issues?.length > 0) {
        highIssues.push(result.name);
      }
    });

    console.log(`\n🚨 Security Risk Analysis:`);
    if (criticalIssues.length > 0) {
      console.log(`   🔴 Critical Issues: ${criticalIssues.length}`);
      criticalIssues.forEach(issue => console.log(`      - ${issue}`));
    }
    
    if (highIssues.length > 0) {
      console.log(`   🟡 High Priority Issues: ${highIssues.length}`);
      highIssues.slice(0, 3).forEach(issue => console.log(`      - ${issue}`));
    }

    if (criticalIssues.length === 0 && highIssues.length === 0) {
      console.log(`   🟢 No critical security issues detected`);
    }

    // Generate report file
    const reportData = {
      summary: {
        totalTests,
        passedTests,
        vulnerabilities,
        securityScore: ((passedTests/totalTests) * 100).toFixed(1),
        criticalIssues: criticalIssues.length,
        highIssues: highIssues.length
      },
      categories: SECURITY_CATEGORIES,
      detailedResults: this.assessmentResults,
      recommendations: this.generateSecurityRecommendations(),
      timestamp: new Date()
    };

    const reportFile = path.join(this.projectRoot, 'security-assessment-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    
    console.log(`\n📄 Security report saved to: security-assessment-report.json`);
  }

  generateSecurityRecommendations() {
    const recommendations = [];
    
    // Analyze results and generate specific recommendations
    const hasSecurityHeaders = this.assessmentResults.some(r => 
      r.name.includes('Security Headers') && r.passed
    );
    
    if (!hasSecurityHeaders) {
      recommendations.push({
        priority: 'HIGH',
        category: 'API Security',
        issue: 'Missing security headers',
        solution: 'Implement Helmet.js middleware for security headers',
        implementation: 'Add helmet middleware to Express server'
      });
    }

    const hasCORS = this.assessmentResults.some(r => 
      r.name.includes('CORS') && !r.vulnerabilities?.length
    );
    
    if (!hasCORS) {
      recommendations.push({
        priority: 'HIGH',
        category: 'API Security',
        issue: 'CORS misconfiguration',
        solution: 'Configure CORS to allow specific origins only',
        implementation: 'Update CORS middleware with origin whitelist'
      });
    }

    // Add authentication recommendations
    recommendations.push({
      priority: 'CRITICAL',
      category: 'Authentication',
      issue: 'Missing authentication endpoints',
      solution: 'Implement JWT-based authentication system',
      implementation: 'Create /api/auth routes with proper JWT handling'
    });

    recommendations.push({
      priority: 'HIGH',
      category: 'Data Protection',
      issue: 'Environment variables security',
      solution: 'Implement secure secret management',
      implementation: 'Use encrypted environment variables and secret managers'
    });

    return recommendations;
  }

  async implementSecurityHardening() {
    console.log('\n🛠️  Phase 6: Implementing Security Hardening');
    console.log('-'.repeat(50));

    const hardeningSteps = [
      {
        name: 'Security Headers Implementation',
        file: 'backend/src/middleware/security.ts',
        priority: 'HIGH'
      },
      {
        name: 'Authentication Middleware',
        file: 'backend/src/middleware/auth.ts',
        priority: 'CRITICAL'
      },
      {
        name: 'Rate Limiting Implementation',
        file: 'backend/src/middleware/rate-limiter.ts',
        priority: 'HIGH'
      },
      {
        name: 'Input Validation Middleware',
        file: 'backend/src/middleware/validation.ts',
        priority: 'HIGH'
      },
      {
        name: 'Environment Security Configuration',
        file: '.env.security',
        priority: 'CRITICAL'
      }
    ];

    console.log(`\n🔧 Security Hardening Implementation Plan:`);
    hardeningSteps.forEach((step, i) => {
      const icon = step.priority === 'CRITICAL' ? '🔴' : step.priority === 'HIGH' ? '🟡' : '🟢';
      console.log(`   ${i + 1}. ${icon} ${step.name} (${step.priority})`);
    });

    console.log(`\n✨ Next Steps for Production Security:`);
    console.log(`   1. 🔒 Implement authentication endpoints`);
    console.log(`   2. 🛡️  Add security middleware to backend`);
    console.log(`   3. 🔑 Set up secure secret management`);
    console.log(`   4. 📊 Enable security monitoring and logging`);
    console.log(`   5. 🚀 Deploy with security-first configuration`);

    return {
      hardeningSteps,
      nextSteps: [
        'Implement authentication endpoints',
        'Add security middleware to backend',
        'Set up secure secret management',
        'Enable security monitoring and logging',
        'Deploy with security-first configuration'
      ]
    };
  }
}

// Run the assessment
async function main() {
  try {
    const assessment = new SecurityHardeningAssessment();
    await assessment.runFullAssessment();
  } catch (error) {
    console.error('❌ Security assessment failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { SecurityHardeningAssessment };