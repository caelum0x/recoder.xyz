const { BaseAnalyzer } = require('./baseAnalyzer');
const { ASTParser } = require('../utils/ast-parser');
const { FileUtils } = require('../utils/file-utils');
const { logger } = require('../utils/logger');
const path = require('path');

class SecurityAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.securityPatterns = {
      sqlInjection: {
        pattern: /(?:query|execute|exec)\s*\(\s*["`'].*\$\{|.*\+.*["`']/gi,
        severity: 'high',
        description: 'Potential SQL injection vulnerability'
      },
      xss: {
        pattern: /innerHTML\s*=|document\.write\s*\(|eval\s*\(/gi,
        severity: 'high',
        description: 'Potential XSS vulnerability'
      },
      hardcodedSecrets: {
        pattern: /(?:password|secret|key|token)\s*[:=]\s*["`'][^"`']{8,}["`']/gi,
        severity: 'critical',
        description: 'Hardcoded secrets detected'
      },
      weakCrypto: {
        pattern: /md5|sha1(?![\d])|des(?!k)|rc4/gi,
        severity: 'medium',
        description: 'Weak cryptographic algorithm'
      },
      pathTraversal: {
        pattern: /\.\.[\/\\]|\.\.[\/\\].*[\/\\]/gi,
        severity: 'high',
        description: 'Potential path traversal vulnerability'
      },
      commandInjection: {
        pattern: /exec\s*\(|system\s*\(|shell_exec\s*\(/gi,
        severity: 'high',
        description: 'Potential command injection'
      },
      insecureRandom: {
        pattern: /Math\.random\(\)/gi,
        severity: 'low',
        description: 'Insecure random number generation'
      },
      httpUsage: {
        pattern: /http:\/\//gi,
        severity: 'medium',
        description: 'Insecure HTTP protocol usage'
      }
    };

    this.sensitiveFiles = [
      '.env',
      '.env.local',
      '.env.production',
      'config.json',
      'secrets.json',
      'private.key',
      'id_rsa'
    ];

    this.secureHeaders = [
      'content-security-policy',
      'x-frame-options',
      'x-content-type-options',
      'strict-transport-security',
      'x-xss-protection'
    ];
  }

  async analyze(input, context = {}) {
    try {
      const { projectPath, files, packageJson } = input;
      
      const analysis = await this.performAsyncAnalysis(input, async () => {
        const results = {
          vulnerabilities: await this.scanForVulnerabilities(files || projectPath),
          dependencies: await this.analyzeDependencyVulnerabilities(packageJson || projectPath),
          configuration: await this.analyzeSecurityConfiguration(projectPath),
          secrets: await this.scanForSecrets(files || projectPath),
          headers: await this.analyzeSecurityHeaders(projectPath),
          permissions: await this.analyzeFilePermissions(projectPath),
          compliance: await this.checkComplianceStandards(projectPath)
        };

        results.summary = this.generateSecuritySummary(results);
        results.metrics = this.generateSecurityMetrics(results);
        results.recommendations = this.generateSecurityRecommendations(results);
        results.score = this.calculateSecurityScore(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        analysisType: 'security',
        projectPath: typeof input === 'string' ? input : input.projectPath
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  async scanForVulnerabilities(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { 
          recursive: true
        });
        // Filter for code files
        files = files.filter(file => {
          const ext = path.extname(file);
          return ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.cs'].includes(ext);
        });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const vulnerabilities = [];

      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (!content) continue;

        const fileVulns = this.scanFileForVulnerabilities(content, file);
        vulnerabilities.push(...fileVulns);
      }

      return this.categorizeVulnerabilities(vulnerabilities);
    } catch (error) {
      logger.error('Vulnerability scanning failed:', error);
      return {};
    }
  }

  scanFileForVulnerabilities(content, filePath) {
    const vulnerabilities = [];

    for (const [vulnType, config] of Object.entries(this.securityPatterns)) {
      const matches = [...content.matchAll(config.pattern)];
      
      for (const match of matches) {
        const lineNumber = this.getLineNumber(content, match.index);
        
        vulnerabilities.push({
          type: vulnType,
          severity: config.severity,
          description: config.description,
          file: filePath,
          line: lineNumber,
          code: match[0],
          context: this.getCodeContext(content, match.index),
          recommendation: this.getVulnerabilityRecommendation(vulnType)
        });
      }
    }

    return vulnerabilities;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  getCodeContext(content, index, contextLines = 2) {
    const lines = content.split('\n');
    const lineNumber = this.getLineNumber(content, index) - 1;
    
    const start = Math.max(0, lineNumber - contextLines);
    const end = Math.min(lines.length, lineNumber + contextLines + 1);
    
    return {
      before: lines.slice(start, lineNumber),
      line: lines[lineNumber],
      after: lines.slice(lineNumber + 1, end)
    };
  }

  categorizeVulnerabilities(vulnerabilities) {
    const categorized = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      byType: {},
      byFile: {}
    };

    for (const vuln of vulnerabilities) {
      categorized[vuln.severity].push(vuln);
      
      if (!categorized.byType[vuln.type]) {
        categorized.byType[vuln.type] = [];
      }
      categorized.byType[vuln.type].push(vuln);
      
      if (!categorized.byFile[vuln.file]) {
        categorized.byFile[vuln.file] = [];
      }
      categorized.byFile[vuln.file].push(vuln);
    }

    categorized.total = vulnerabilities.length;
    categorized.summary = {
      critical: categorized.critical.length,
      high: categorized.high.length,
      medium: categorized.medium.length,
      low: categorized.low.length
    };

    return categorized;
  }

  getVulnerabilityRecommendation(vulnType) {
    const recommendations = {
      sqlInjection: 'Use parameterized queries or prepared statements',
      xss: 'Sanitize user input and use safe DOM manipulation methods',
      hardcodedSecrets: 'Move secrets to environment variables or secure vault',
      weakCrypto: 'Use stronger cryptographic algorithms (AES, SHA-256+)',
      pathTraversal: 'Validate and sanitize file paths, use safe path joining',
      commandInjection: 'Avoid executing user input, use safe alternatives',
      insecureRandom: 'Use cryptographically secure random generators',
      httpUsage: 'Use HTTPS instead of HTTP for secure communication'
    };

    return recommendations[vulnType] || 'Review and remediate this security issue';
  }

  async analyzeDependencyVulnerabilities(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      if (!packageJson || !packageJson.dependencies) {
        return { vulnerabilities: [], summary: { total: 0 } };
      }

      // Mock vulnerability data - in practice would use npm audit or similar
      const vulnerableDeps = this.mockVulnerabilityCheck(packageJson.dependencies);

      return {
        vulnerabilities: vulnerableDeps,
        summary: {
          total: vulnerableDeps.length,
          critical: vulnerableDeps.filter(v => v.severity === 'critical').length,
          high: vulnerableDeps.filter(v => v.severity === 'high').length,
          medium: vulnerableDeps.filter(v => v.severity === 'medium').length,
          low: vulnerableDeps.filter(v => v.severity === 'low').length
        }
      };
    } catch (error) {
      logger.error('Dependency vulnerability analysis failed:', error);
      return { vulnerabilities: [], summary: { total: 0 } };
    }
  }

  mockVulnerabilityCheck(dependencies) {
    // Mock known vulnerable packages for demonstration
    const knownVulnerable = {
      'lodash': { severity: 'high', description: 'Prototype pollution vulnerability' },
      'moment': { severity: 'medium', description: 'ReDoS vulnerability' },
      'minimist': { severity: 'low', description: 'Prototype pollution in older versions' }
    };

    const vulnerabilities = [];
    
    for (const [depName, version] of Object.entries(dependencies)) {
      if (knownVulnerable[depName]) {
        vulnerabilities.push({
          package: depName,
          version: version,
          severity: knownVulnerable[depName].severity,
          description: knownVulnerable[depName].description,
          fixAvailable: true,
          recommendedVersion: 'latest'
        });
      }
    }

    return vulnerabilities;
  }

  async analyzeSecurityConfiguration(projectPath) {
    try {
      const configs = {
        env: await this.checkEnvironmentConfig(projectPath),
        cors: await this.checkCorsConfig(projectPath),
        auth: await this.checkAuthConfig(projectPath),
        https: await this.checkHttpsConfig(projectPath),
        cookies: await this.checkCookieConfig(projectPath)
      };

      return {
        configs,
        score: this.calculateConfigScore(configs),
        issues: this.identifyConfigIssues(configs)
      };
    } catch (error) {
      logger.error('Security configuration analysis failed:', error);
      return {};
    }
  }

  async checkEnvironmentConfig(projectPath) {
    const envFiles = ['.env', '.env.example', '.env.local', '.env.production'];
    const foundFiles = [];
    const issues = [];

    for (const envFile of envFiles) {
      const filePath = path.join(projectPath, envFile);
      if (await FileUtils.fileExists(filePath)) {
        foundFiles.push(envFile);
        
        const content = await FileUtils.readFile(filePath);
        if (content && this.containsSecrets(content)) {
          issues.push(`Potential secrets in ${envFile}`);
        }
      }
    }

    return {
      foundFiles,
      issues,
      hasExample: foundFiles.includes('.env.example'),
      hasProduction: foundFiles.includes('.env.production')
    };
  }

  containsSecrets(content) {
    const secretPatterns = [
      /password\s*=\s*[^#\n]+/i,
      /secret\s*=\s*[^#\n]+/i,
      /key\s*=\s*[^#\n]+/i,
      /token\s*=\s*[^#\n]+/i
    ];

    return secretPatterns.some(pattern => pattern.test(content));
  }

  async checkCorsConfig(projectPath) {
    // Look for CORS configuration in common files
    const configFiles = [
      'server.js',
      'app.js',
      'index.js',
      'src/server.js',
      'src/app.js'
    ];

    for (const configFile of configFiles) {
      const filePath = path.join(projectPath, configFile);
      if (await FileUtils.fileExists(filePath)) {
        const content = await FileUtils.readFile(filePath);
        if (content && content.includes('cors')) {
          return {
            configured: true,
            allowsAll: content.includes('*'),
            file: configFile
          };
        }
      }
    }

    return { configured: false };
  }

  async checkAuthConfig(projectPath) {
    // Look for authentication configuration
    const authIndicators = ['jwt', 'passport', 'auth', 'session'];
    const configFiles = ['server.js', 'app.js', 'src/server.js'];

    for (const configFile of configFiles) {
      const filePath = path.join(projectPath, configFile);
      if (await FileUtils.fileExists(filePath)) {
        const content = await FileUtils.readFile(filePath);
        if (content) {
          const hasAuth = authIndicators.some(indicator => 
            content.toLowerCase().includes(indicator)
          );
          if (hasAuth) {
            return {
              configured: true,
              file: configFile,
              mechanisms: authIndicators.filter(indicator => 
                content.toLowerCase().includes(indicator)
              )
            };
          }
        }
      }
    }

    return { configured: false };
  }

  async checkHttpsConfig(projectPath) {
    // Check for HTTPS configuration
    const serverFiles = ['server.js', 'app.js', 'src/server.js'];

    for (const serverFile of serverFiles) {
      const filePath = path.join(projectPath, serverFile);
      if (await FileUtils.fileExists(filePath)) {
        const content = await FileUtils.readFile(filePath);
        if (content && (content.includes('https') || content.includes('ssl'))) {
          return {
            configured: true,
            file: serverFile
          };
        }
      }
    }

    return { configured: false };
  }

  async checkCookieConfig(projectPath) {
    // Check for secure cookie configuration
    const serverFiles = ['server.js', 'app.js', 'src/server.js'];

    for (const serverFile of serverFiles) {
      const filePath = path.join(projectPath, serverFile);
      if (await FileUtils.fileExists(filePath)) {
        const content = await FileUtils.readFile(filePath);
        if (content && content.includes('cookie')) {
          return {
            configured: true,
            secure: content.includes('secure: true'),
            httpOnly: content.includes('httpOnly: true'),
            sameSite: content.includes('sameSite'),
            file: serverFile
          };
        }
      }
    }

    return { configured: false };
  }

  calculateConfigScore(configs) {
    let score = 0;
    let maxScore = 0;

    if (configs.env) {
      maxScore += 20;
      if (configs.env.hasExample) score += 10;
      if (configs.env.issues.length === 0) score += 10;
    }

    if (configs.cors) {
      maxScore += 20;
      if (configs.cors.configured) score += 15;
      if (configs.cors.configured && !configs.cors.allowsAll) score += 5;
    }

    if (configs.auth) {
      maxScore += 20;
      if (configs.auth.configured) score += 20;
    }

    if (configs.https) {
      maxScore += 20;
      if (configs.https.configured) score += 20;
    }

    if (configs.cookies) {
      maxScore += 20;
      if (configs.cookies.configured) score += 10;
      if (configs.cookies.secure) score += 5;
      if (configs.cookies.httpOnly) score += 5;
    }

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }

  identifyConfigIssues(configs) {
    const issues = [];

    if (configs.env && configs.env.issues.length > 0) {
      issues.push(...configs.env.issues);
    }

    if (configs.cors && configs.cors.allowsAll) {
      issues.push('CORS allows all origins (*)');
    }

    if (!configs.auth || !configs.auth.configured) {
      issues.push('No authentication mechanism detected');
    }

    if (!configs.https || !configs.https.configured) {
      issues.push('HTTPS not configured');
    }

    if (configs.cookies && configs.cookies.configured) {
      if (!configs.cookies.secure) {
        issues.push('Cookies not marked as secure');
      }
      if (!configs.cookies.httpOnly) {
        issues.push('Cookies not marked as httpOnly');
      }
    }

    return issues;
  }

  async scanForSecrets(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const secrets = [];
      const secretPatterns = {
        apiKey: /api[_-]?key\s*[:=]\s*["`']([a-zA-Z0-9_-]{20,})["`']/gi,
        token: /token\s*[:=]\s*["`']([a-zA-Z0-9_.-]{20,})["`']/gi,
        password: /password\s*[:=]\s*["`']([^"`']{8,})["`']/gi,
        secret: /secret\s*[:=]\s*["`']([a-zA-Z0-9_.-]{16,})["`']/gi,
        privateKey: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
        awsKey: /AKIA[0-9A-Z]{16}/gi,
        googleKey: /AIza[0-9A-Za-z_-]{35}/gi,
        slackToken: /xox[baprs]-[0-9a-zA-Z]{10,48}/gi
      };

      for (const file of files) {
        // Skip binary files and common non-text files
        const ext = path.extname(file);
        if (['.jpg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz'].includes(ext)) {
          continue;
        }

        const content = await FileUtils.readFile(file);
        if (!content) continue;

        for (const [secretType, pattern] of Object.entries(secretPatterns)) {
          const matches = [...content.matchAll(pattern)];
          
          for (const match of matches) {
            secrets.push({
              type: secretType,
              file: file,
              line: this.getLineNumber(content, match.index),
              value: match[1] || match[0],
              severity: this.getSecretSeverity(secretType),
              recommendation: 'Move to environment variables or secure vault'
            });
          }
        }
      }

      return {
        secrets,
        count: secrets.length,
        bySeverity: this.categorizeSecrets(secrets),
        byType: this.groupSecretsByType(secrets)
      };
    } catch (error) {
      logger.error('Secret scanning failed:', error);
      return { secrets: [], count: 0 };
    }
  }

  getSecretSeverity(secretType) {
    const severityMap = {
      privateKey: 'critical',
      awsKey: 'critical',
      password: 'high',
      apiKey: 'high',
      token: 'high',
      secret: 'medium',
      googleKey: 'high',
      slackToken: 'medium'
    };

    return severityMap[secretType] || 'medium';
  }

  categorizeSecrets(secrets) {
    const categorized = { critical: 0, high: 0, medium: 0, low: 0 };
    
    for (const secret of secrets) {
      categorized[secret.severity]++;
    }
    
    return categorized;
  }

  groupSecretsByType(secrets) {
    const grouped = {};
    
    for (const secret of secrets) {
      if (!grouped[secret.type]) {
        grouped[secret.type] = [];
      }
      grouped[secret.type].push(secret);
    }
    
    return grouped;
  }

  async analyzeSecurityHeaders(projectPath) {
    // Mock analysis - in practice would analyze server configuration
    return {
      configured: this.secureHeaders.map(header => ({
        header,
        configured: Math.random() > 0.5,
        value: 'mock-value'
      })),
      score: Math.floor(Math.random() * 100),
      missing: []
    };
  }

  async analyzeFilePermissions(projectPath) {
    // Mock analysis - in practice would check file permissions
    return {
      issues: [],
      score: 90,
      recommendations: []
    };
  }

  async checkComplianceStandards(projectPath) {
    return {
      owasp: { score: 75, issues: [] },
      gdpr: { score: 60, issues: [] },
      pci: { score: 50, issues: [] }
    };
  }

  generateSecuritySummary(analysis) {
    const totalVulns = analysis.vulnerabilities?.total || 0;
    const criticalVulns = analysis.vulnerabilities?.summary?.critical || 0;
    const secretsCount = analysis.secrets?.count || 0;

    return {
      overview: `Found ${totalVulns} vulnerabilities (${criticalVulns} critical) and ${secretsCount} potential secrets`,
      score: analysis.score,
      riskLevel: this.calculateRiskLevel(analysis),
      priorityIssues: this.identifyPriorityIssues(analysis)
    };
  }

  calculateSecurityScore(analysis) {
    let score = 100;

    // Deduct for vulnerabilities
    if (analysis.vulnerabilities) {
      score -= (analysis.vulnerabilities.summary?.critical || 0) * 25;
      score -= (analysis.vulnerabilities.summary?.high || 0) * 15;
      score -= (analysis.vulnerabilities.summary?.medium || 0) * 5;
    }

    // Deduct for secrets
    if (analysis.secrets) {
      score -= analysis.secrets.count * 10;
    }

    // Factor in configuration score
    if (analysis.configuration?.score) {
      score = (score + analysis.configuration.score) / 2;
    }

    return Math.max(0, Math.round(score));
  }

  calculateRiskLevel(analysis) {
    const score = analysis.score || this.calculateSecurityScore(analysis);
    
    if (score >= 80) return 'low';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'high';
    return 'critical';
  }

  identifyPriorityIssues(analysis) {
    const issues = [];

    if (analysis.vulnerabilities?.summary?.critical > 0) {
      issues.push({
        type: 'vulnerability',
        priority: 'critical',
        message: `${analysis.vulnerabilities.summary.critical} critical vulnerabilities found`
      });
    }

    if (analysis.secrets?.bySeverity?.critical > 0) {
      issues.push({
        type: 'secrets',
        priority: 'critical',
        message: `${analysis.secrets.bySeverity.critical} critical secrets exposed`
      });
    }

    return issues.slice(0, 5); // Top 5 priority issues
  }

  generateSecurityMetrics(analysis) {
    return {
      vulnerabilityDensity: this.calculateVulnerabilityDensity(analysis),
      secretsDensity: this.calculateSecretsDensity(analysis),
      configurationCompliance: analysis.configuration?.score || 0,
      overallRisk: this.calculateRiskLevel(analysis)
    };
  }

  calculateVulnerabilityDensity(analysis) {
    // Simplified calculation
    const totalVulns = analysis.vulnerabilities?.total || 0;
    return totalVulns; // Would normalize by codebase size in practice
  }

  calculateSecretsDensity(analysis) {
    const secretsCount = analysis.secrets?.count || 0;
    return secretsCount; // Would normalize by codebase size in practice
  }

  generateSecurityRecommendations(analysis) {
    const recommendations = [];

    if (analysis.vulnerabilities?.summary?.critical > 0) {
      recommendations.push({
        type: 'vulnerability',
        priority: 'critical',
        message: 'Address critical vulnerabilities immediately',
        actions: ['Review code for SQL injection', 'Fix XSS vulnerabilities', 'Update vulnerable dependencies']
      });
    }

    if (analysis.secrets?.count > 0) {
      recommendations.push({
        type: 'secrets',
        priority: 'high',
        message: 'Remove hardcoded secrets from code',
        actions: ['Move secrets to environment variables', 'Use secure secret management', 'Rotate exposed secrets']
      });
    }

    if (analysis.configuration?.score < 70) {
      recommendations.push({
        type: 'configuration',
        priority: 'medium',
        message: 'Improve security configuration',
        actions: ['Enable HTTPS', 'Configure CORS properly', 'Set secure cookie flags']
      });
    }

    return recommendations;
  }
}

module.exports = { SecurityAnalyzer };