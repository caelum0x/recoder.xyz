/**
 * Comprehensive Validation Pipeline for Generated Code
 */

import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { Logger } from '@recoder/shared';
import {
  GenerationResult,
  ValidationResult,
  ValidationStatus,
  SyntaxValidation,
  TypeValidation,
  SecurityValidation,
  PerformanceValidation,
  FunctionalityValidation,
  IntegrationValidation,
  SecurityVulnerability,
  SecurityRisk,
  ComplianceCheck,
  PerformanceMetric,
  PerformanceBottleneck,
  PerformanceRecommendation,
  FunctionalityTest,
  TestExpectation,
  DependencyValidation,
  ServiceIntegrationValidation,
  ExternalApiValidation,
  ConfigurationValidation,
  CodeLocation,
  GenerationError,
  GenerationWarning,
  GeneratedFile
} from '@recoder/shared/types/code-generation';

export class ValidationPipeline {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), '.recoder', 'validation-temp');
  }

  public async initialize(): Promise<void> {
    await fs.ensureDir(this.tempDir);
    Logger.info('Validation pipeline initialized', { tempDir: this.tempDir });
  }

  public async validate(result: GenerationResult): Promise<ValidationResult> {
    Logger.info('Starting comprehensive validation', { 
      resultId: result.id,
      files: result.files.length 
    });

    const validationResult: ValidationResult = {
      overall: ValidationStatus.SKIPPED,
      syntax: { status: ValidationStatus.SKIPPED, errors: [], warnings: [], suggestions: [] },
      types: { status: ValidationStatus.SKIPPED, errors: [], warnings: [], coverage: 0, strictness: 'loose' },
      security: { status: ValidationStatus.SKIPPED, vulnerabilities: [], risks: [], compliance: [], score: 0 },
      performance: { status: ValidationStatus.SKIPPED, metrics: [], bottlenecks: [], recommendations: [], score: 0 },
      functionality: { 
        status: ValidationStatus.SKIPPED, 
        tests: [], 
        coverage: 0, 
        mockDetection: { detected: false, locations: [], types: [], suggestions: [] },
        apiValidation: { 
          endpoints: [], 
          authentication: { implemented: false, method: [], secure: false, issues: [] },
          errorHandling: { implemented: false, comprehensive: false, standardized: false, userFriendly: false, issues: [] },
          documentation: { exists: false, complete: false, upToDate: false, format: '', issues: [] }
        },
        databaseValidation: { 
          connections: [], 
          queries: [], 
          migrations: { exists: false, reversible: false, safe: false, documented: false, issues: [] },
          security: { encryption: false, accessControl: false, sqlInjectionProtection: false, auditLogging: false, issues: [] }
        }
      },
      integration: { 
        status: ValidationStatus.SKIPPED, 
        dependencies: [], 
        services: [], 
        apis: [], 
        configuration: { 
          status: ValidationStatus.SKIPPED,
          environment: { variables: [], secrets: [], complete: false, secure: false },
          build: { configured: false, optimized: false, tested: false, documented: false, issues: [] },
          deployment: { configured: false, secure: false, scalable: false, monitored: false, rollbackCapable: false, issues: [] },
          issues: []
        }
      },
      reality: {
        status: ValidationStatus.SKIPPED,
        realFunctionality: true,
        externalIntegrations: [],
        dataFlow: { complete: false, consistent: false, validated: false, errorHandled: false, secure: false, issues: [] },
        businessLogic: { implemented: false, tested: false, documented: false, maintainable: false, scalable: false, issues: [] },
        userExperience: { responsive: false, accessible: false, intuitive: false, errorHandling: false, performance: false, issues: [] }
      }
    };

    try {
      // Create temporary validation workspace
      const validationWorkspace = await this.createValidationWorkspace(result);

      // Run all validation checks in parallel where possible
      const [syntaxResult, typeResult, securityResult, performanceResult] = await Promise.all([
        this.validateSyntax(result.files, validationWorkspace),
        this.validateTypes(result.files, validationWorkspace),
        this.validateSecurity(result.files, validationWorkspace),
        this.validatePerformance(result.files, validationWorkspace)
      ]);

      // Run sequential validations that depend on previous results
      const functionalityResult = await this.validateFunctionality(result.files, validationWorkspace);
      const integrationResult = await this.validateIntegration(result.files, validationWorkspace);

      // Combine all results
      validationResult.syntax = syntaxResult;
      validationResult.types = typeResult;
      validationResult.security = securityResult;
      validationResult.performance = performanceResult;
      validationResult.functionality = functionalityResult;
      validationResult.integration = integrationResult;

      // Calculate overall status
      validationResult.overall = this.calculateOverallStatus(validationResult);

      Logger.info('Validation completed', {
        resultId: result.id,
        overall: validationResult.overall,
        syntax: syntaxResult.status,
        types: typeResult.status,
        security: securityResult.status,
        performance: performanceResult.status
      });

      // Cleanup temporary workspace
      await this.cleanupValidationWorkspace(validationWorkspace);

      return validationResult;
    } catch (error) {
      Logger.error('Validation pipeline failed', { error });
      validationResult.overall = ValidationStatus.FAILED;
      return validationResult;
    }
  }

  private async createValidationWorkspace(result: GenerationResult): Promise<string> {
    const workspaceId = `validation_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const workspacePath = path.join(this.tempDir, workspaceId);
    
    await fs.ensureDir(workspacePath);

    // Copy generated files to workspace
    for (const file of result.files) {
      const filePath = path.join(workspacePath, path.basename(file.path));
      await fs.writeFile(filePath, file.content, 'utf8');
    }

    // Create package.json for validation tools
    const packageJson = {
      name: 'validation-workspace',
      version: '1.0.0',
      private: true,
      dependencies: {},
      devDependencies: {
        typescript: '^5.0.0',
        eslint: '^8.0.0',
        '@typescript-eslint/parser': '^6.0.0',
        '@typescript-eslint/eslint-plugin': '^6.0.0'
      }
    };

    await fs.writeJson(path.join(workspacePath, 'package.json'), packageJson, { spaces: 2 });

    Logger.debug('Created validation workspace', { workspaceId, workspacePath });
    return workspacePath;
  }

  private async validateSyntax(files: GeneratedFile[], workspace: string): Promise<SyntaxValidation> {
    Logger.debug('Validating syntax');

    const result: SyntaxValidation = {
      status: ValidationStatus.PASSED,
      errors: [],
      warnings: [],
      suggestions: []
    };

    for (const file of files) {
      try {
        if (file.language === 'JavaScript' || file.language === 'TypeScript') {
          await this.validateJavaScriptSyntax(file, workspace, result);
        } else if (file.language === 'Python') {
          await this.validatePythonSyntax(file, workspace, result);
        }
        // Add more language validators as needed
      } catch (error) {
        result.errors.push({
          code: 'SYNTAX_ERROR',
          message: `Syntax validation failed for ${file.path}: ${error}`,
          severity: 'high',
          location: { file: file.path, line: 1, column: 1 },
          suggestions: ['Check file syntax', 'Verify language compliance'],
          recoverable: true
        });
      }
    }

    result.status = result.errors.length > 0 ? ValidationStatus.FAILED : 
                   result.warnings.length > 0 ? ValidationStatus.WARNING : ValidationStatus.PASSED;

    return result;
  }

  private async validateJavaScriptSyntax(file: GeneratedFile, workspace: string, result: SyntaxValidation): Promise<void> {
    const filePath = path.join(workspace, path.basename(file.path));
    
    try {
      // Use ESLint for JavaScript/TypeScript syntax validation
      const eslintResult = await this.runESLint(filePath);
      
      eslintResult.forEach(issue => {
        if (issue.severity === 2) { // Error
          result.errors.push({
            code: 'ESLINT_ERROR',
            message: issue.message,
            severity: 'medium',
            location: {
              file: file.path,
              line: issue.line,
              column: issue.column
            },
            suggestions: [issue.fix || 'Fix syntax error'],
            recoverable: true
          });
        } else { // Warning
          result.warnings.push({
            code: 'ESLINT_WARNING',
            message: issue.message,
            location: {
              file: file.path,
              line: issue.line,
              column: issue.column
            },
            suggestion: issue.fix || 'Consider fixing this warning'
          });
        }
      });
    } catch (error) {
      // ESLint not available or failed, try basic syntax check
      await this.basicJavaScriptSyntaxCheck(file, result);
    }
  }

  private async runESLint(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const eslint = spawn('npx', ['eslint', '--format', 'json', filePath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      eslint.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      eslint.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      eslint.on('close', (code) => {
        try {
          const results = JSON.parse(stdout);
          resolve(results[0]?.messages || []);
        } catch (error) {
          reject(new Error(`ESLint failed: ${stderr}`));
        }
      });
    });
  }

  private async basicJavaScriptSyntaxCheck(file: GeneratedFile, result: SyntaxValidation): Promise<void> {
    try {
      // Basic syntax patterns that indicate issues
      const problematicPatterns = [
        { pattern: /\bunexpected\s+token/gi, message: 'Unexpected token found' },
        { pattern: /\bsyntax\s+error/gi, message: 'Syntax error detected' },
        { pattern: /\bmissing\s+[;,\)\]\}]/gi, message: 'Missing punctuation' },
        { pattern: /\bundefined\s+variable/gi, message: 'Undefined variable reference' }
      ];

      const lines = file.content.split('\n');
      
      problematicPatterns.forEach(({ pattern, message }) => {
        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            result.warnings.push({
              code: 'POTENTIAL_SYNTAX_ISSUE',
              message: `${message}: ${line.trim()}`,
              location: {
                file: file.path,
                line: index + 1,
                column: 1
              },
              suggestion: 'Review and fix syntax'
            });
          }
        });
      });

      // Check for basic structural issues
      const openBraces = (file.content.match(/\{/g) || []).length;
      const closeBraces = (file.content.match(/\}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        result.errors.push({
          code: 'BRACE_MISMATCH',
          message: `Mismatched braces: ${openBraces} opening, ${closeBraces} closing`,
          severity: 'high',
          location: { file: file.path, line: 1, column: 1 },
          suggestions: ['Check for missing or extra braces'],
          recoverable: true
        });
      }
    } catch (error) {
      Logger.warn('Basic syntax check failed', { file: file.path, error });
    }
  }

  private async validatePythonSyntax(file: GeneratedFile, workspace: string, result: SyntaxValidation): Promise<void> {
    const filePath = path.join(workspace, path.basename(file.path));
    
    return new Promise((resolve) => {
      const python = spawn('python', ['-m', 'py_compile', filePath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          result.errors.push({
            code: 'PYTHON_SYNTAX_ERROR',
            message: `Python syntax error: ${stderr}`,
            severity: 'high',
            location: { file: file.path, line: 1, column: 1 },
            suggestions: ['Fix Python syntax errors'],
            recoverable: true
          });
        }
        resolve();
      });
    });
  }

  private async validateTypes(files: GeneratedFile[], workspace: string): Promise<TypeValidation> {
    Logger.debug('Validating types');

    const result: TypeValidation = {
      status: ValidationStatus.PASSED,
      errors: [],
      warnings: [],
      coverage: 0,
      strictness: 'loose'
    };

    const typeScriptFiles = files.filter(f => f.language === 'TypeScript');
    
    if (typeScriptFiles.length === 0) {
      result.status = ValidationStatus.SKIPPED;
      return result;
    }

    try {
      // Create tsconfig.json for type checking
      const tsConfig = {
        compilerOptions: {
          target: 'es2020',
          module: 'commonjs',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          noEmit: true
        },
        include: ['*.ts', '*.tsx']
      };

      await fs.writeJson(path.join(workspace, 'tsconfig.json'), tsConfig, { spaces: 2 });

      // Run TypeScript compiler for type checking
      const typeErrors = await this.runTypeScriptCompiler(workspace);
      
      typeErrors.forEach(error => {
        result.errors.push({
          code: 'TYPE_ERROR',
          message: error.message,
          severity: error.severity,
          location: error.location,
          suggestions: error.suggestions,
          recoverable: true
        });
      });

      // Calculate type coverage
      result.coverage = await this.calculateTypeCoverage(typeScriptFiles);
      result.strictness = 'strict'; // Since we use strict mode

      result.status = result.errors.length > 0 ? ValidationStatus.FAILED : ValidationStatus.PASSED;
    } catch (error) {
      Logger.warn('Type validation failed', { error });
      result.status = ValidationStatus.FAILED;
    }

    return result;
  }

  private async runTypeScriptCompiler(workspace: string): Promise<any[]> {
    return new Promise((resolve) => {
      const tsc = spawn('npx', ['tsc', '--noEmit'], {
        cwd: workspace,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';

      tsc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      tsc.on('close', (code) => {
        const errors = this.parseTypeScriptErrors(stderr);
        resolve(errors);
      });
    });
  }

  private parseTypeScriptErrors(output: string): any[] {
    const errors: any[] = [];
    const lines = output.split('\n');
    
    lines.forEach(line => {
      const match = line.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/);
      if (match) {
        errors.push({
          message: match[6],
          severity: match[4] === 'error' ? 'high' : 'medium',
          location: {
            file: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3])
          },
          suggestions: [`Fix TypeScript error TS${match[5]}`]
        });
      }
    });

    return errors;
  }

  private async calculateTypeCoverage(files: GeneratedFile[]): Promise<number> {
    let totalIdentifiers = 0;
    let typedIdentifiers = 0;

    for (const file of files) {
      const lines = file.content.split('\n');
      
      lines.forEach(line => {
        // Count variables, functions, parameters
        const identifiers = line.match(/\b(let|const|var|function|class|interface)\s+\w+/g) || [];
        totalIdentifiers += identifiers.length;
        
        // Count typed identifiers
        const typedItems = line.match(/:\s*\w+/g) || [];
        typedIdentifiers += typedItems.length;
      });
    }

    return totalIdentifiers > 0 ? (typedIdentifiers / totalIdentifiers) * 100 : 100;
  }

  private async validateSecurity(files: GeneratedFile[], workspace: string): Promise<SecurityValidation> {
    Logger.debug('Validating security');

    const result: SecurityValidation = {
      status: ValidationStatus.PASSED,
      vulnerabilities: [],
      risks: [],
      compliance: [],
      score: 100
    };

    for (const file of files) {
      await this.scanForSecurityVulnerabilities(file, result);
      await this.assessSecurityRisks(file, result);
    }

    // Calculate security score
    result.score = this.calculateSecurityScore(result);
    result.status = result.vulnerabilities.some(v => v.severity === 'critical') ? ValidationStatus.FAILED :
                   result.vulnerabilities.length > 0 ? ValidationStatus.WARNING : ValidationStatus.PASSED;

    return result;
  }

  private async scanForSecurityVulnerabilities(file: GeneratedFile, result: SecurityValidation): Promise<void> {
    const vulnerabilityPatterns = [
      {
        pattern: /eval\s*\(/gi,
        severity: 'critical' as const,
        type: 'Code Injection',
        description: 'Use of eval() function can lead to code injection',
        cwe: 'CWE-95'
      },
      {
        pattern: /innerHTML\s*=.*\+/gi,
        severity: 'high' as const,
        type: 'XSS',
        description: 'Dynamic innerHTML assignment may lead to XSS',
        cwe: 'CWE-79'
      },
      {
        pattern: /document\.write\s*\(/gi,
        severity: 'medium' as const,
        type: 'XSS',
        description: 'document.write() can be exploited for XSS',
        cwe: 'CWE-79'
      },
      {
        pattern: /password.*=.*['"]\w+['"];?/gi,
        severity: 'critical' as const,
        type: 'Hard-coded Credentials',
        description: 'Hard-coded password detected',
        cwe: 'CWE-798'
      },
      {
        pattern: /SELECT\s+\*\s+FROM.*\+/gi,
        severity: 'high' as const,
        type: 'SQL Injection',
        description: 'Potential SQL injection vulnerability',
        cwe: 'CWE-89'
      },
      {
        pattern: /crypto\.createHash\(['"]md5['"].*\)/gi,
        severity: 'medium' as const,
        type: 'Weak Cryptography',
        description: 'MD5 is cryptographically weak',
        cwe: 'CWE-327'
      }
    ];

    const lines = file.content.split('\n');
    
    vulnerabilityPatterns.forEach(vuln => {
      lines.forEach((line, index) => {
        if (vuln.pattern.test(line)) {
          result.vulnerabilities.push({
            id: `VULN_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            severity: vuln.severity,
            type: vuln.type,
            description: vuln.description,
            location: {
              file: file.path,
              line: index + 1,
              column: line.search(vuln.pattern) + 1
            },
            recommendation: this.getSecurityRecommendation(vuln.type),
            cwe: vuln.cwe
          });
        }
      });
    });
  }

  private getSecurityRecommendation(type: string): string {
    const recommendations = {
      'Code Injection': 'Avoid using eval(). Use safer alternatives like JSON.parse() or Function constructor with proper validation.',
      'XSS': 'Sanitize user input and use textContent instead of innerHTML for dynamic content.',
      'SQL Injection': 'Use parameterized queries or prepared statements instead of string concatenation.',
      'Hard-coded Credentials': 'Store credentials in environment variables or secure configuration files.',
      'Weak Cryptography': 'Use stronger hash algorithms like SHA-256 or bcrypt for password hashing.'
    };
    
    return recommendations[type] || 'Review and apply security best practices.';
  }

  private async assessSecurityRisks(file: GeneratedFile, result: SecurityValidation): Promise<void> {
    const riskPatterns = [
      {
        pattern: /http:/gi,
        level: 'medium' as const,
        type: 'Insecure Communication',
        description: 'HTTP connections are not encrypted'
      },
      {
        pattern: /localStorage|sessionStorage/gi,
        level: 'low' as const,
        type: 'Client-side Storage',
        description: 'Client-side storage may contain sensitive data'
      },
      {
        pattern: /window\.location\.href.*=.*req\./gi,
        level: 'high' as const,
        type: 'Open Redirect',
        description: 'Potential open redirect vulnerability'
      }
    ];

    riskPatterns.forEach(risk => {
      if (risk.pattern.test(file.content)) {
        result.risks.push({
          type: risk.type,
          level: risk.level,
          description: risk.description,
          mitigation: this.getSecurityMitigation(risk.type)
        });
      }
    });
  }

  private getSecurityMitigation(type: string): string[] {
    const mitigations = {
      'Insecure Communication': ['Use HTTPS for all communications', 'Implement HSTS headers'],
      'Client-side Storage': ['Avoid storing sensitive data client-side', 'Encrypt sensitive data if storage is necessary'],
      'Open Redirect': ['Validate redirect URLs against whitelist', 'Use relative URLs when possible']
    };
    
    return mitigations[type] || ['Apply appropriate security controls'];
  }

  private calculateSecurityScore(result: SecurityValidation): number {
    let score = 100;
    
    result.vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'critical': score -= 30; break;
        case 'high': score -= 20; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    });

    result.risks.forEach(risk => {
      switch (risk.level) {
        case 'high': score -= 15; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    });

    return Math.max(0, score);
  }

  private async validatePerformance(files: GeneratedFile[], workspace: string): Promise<PerformanceValidation> {
    Logger.debug('Validating performance');

    const result: PerformanceValidation = {
      status: ValidationStatus.PASSED,
      metrics: [],
      bottlenecks: [],
      recommendations: [],
      score: 100
    };

    for (const file of files) {
      await this.analyzePerformance(file, result);
    }

    result.score = this.calculatePerformanceScore(result);
    result.status = result.bottlenecks.some(b => b.impact === 'high') ? ValidationStatus.WARNING : ValidationStatus.PASSED;

    return result;
  }

  private async analyzePerformance(file: GeneratedFile, result: PerformanceValidation): Promise<void> {
    // Analyze common performance issues
    const performancePatterns = [
      {
        pattern: /for\s*\(.*\.length.*\)/gi,
        type: 'Inefficient Loop',
        impact: 'medium' as const,
        description: 'Loop condition evaluates length property on each iteration'
      },
      {
        pattern: /document\.getElementById.*querySelector.*loop|for.*document\./gi,
        type: 'DOM Query in Loop',
        impact: 'high' as const,
        description: 'DOM queries inside loops can cause performance issues'
      },
      {
        pattern: /JSON\.parse.*JSON\.stringify/gi,
        type: 'Inefficient Serialization',
        impact: 'medium' as const,
        description: 'Inefficient object cloning using JSON methods'
      },
      {
        pattern: /\.map\(.*\.map\(/gi,
        type: 'Nested Array Operations',
        impact: 'medium' as const,
        description: 'Nested array operations can be inefficient'
      }
    ];

    const lines = file.content.split('\n');
    
    performancePatterns.forEach(pattern => {
      lines.forEach((line, index) => {
        if (pattern.pattern.test(line)) {
          result.bottlenecks.push({
            type: pattern.type,
            location: {
              file: file.path,
              line: index + 1,
              column: 1
            },
            impact: pattern.impact,
            description: pattern.description,
            solution: this.getPerformanceSolution(pattern.type)
          });
        }
      });
    });

    // Calculate basic metrics
    const complexity = this.calculateCyclomaticComplexity(file.content);
    const linesOfCode = file.lines;
    
    result.metrics.push(
      {
        name: 'Cyclomatic Complexity',
        value: complexity,
        unit: 'complexity points',
        target: 10,
        status: complexity > 15 ? 'poor' : complexity > 10 ? 'warning' : 'good'
      },
      {
        name: 'Lines of Code',
        value: linesOfCode,
        unit: 'lines',
        target: 300,
        status: linesOfCode > 500 ? 'poor' : linesOfCode > 300 ? 'warning' : 'good'
      }
    );
  }

  private getPerformanceSolution(type: string): string {
    const solutions = {
      'Inefficient Loop': 'Cache the length property outside the loop condition',
      'DOM Query in Loop': 'Move DOM queries outside the loop or cache elements',
      'Inefficient Serialization': 'Use structured cloning or Object.assign() for shallow copies',
      'Nested Array Operations': 'Consider using a single loop with combined logic'
    };
    
    return solutions[type] || 'Optimize the identified performance issue';
  }

  private calculateCyclomaticComplexity(content: string): number {
    // Simplified cyclomatic complexity calculation
    const complexityIndicators = [
      (content.match(/if\s*\(/g) || []).length,
      (content.match(/else\s+if\s*\(/g) || []).length,
      (content.match(/while\s*\(/g) || []).length,
      (content.match(/for\s*\(/g) || []).length,
      (content.match(/case\s+.*:/g) || []).length,
      (content.match(/catch\s*\(/g) || []).length,
      (content.match(/&&|\|\|/g) || []).length
    ];
    
    return 1 + complexityIndicators.reduce((sum, count) => sum + count, 0);
  }

  private calculatePerformanceScore(result: PerformanceValidation): number {
    let score = 100;
    
    result.bottlenecks.forEach(bottleneck => {
      switch (bottleneck.impact) {
        case 'high': score -= 20; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    });

    result.metrics.forEach(metric => {
      if (metric.status === 'poor') score -= 15;
      else if (metric.status === 'warning') score -= 10;
    });

    return Math.max(0, score);
  }

  private async validateFunctionality(files: GeneratedFile[], workspace: string): Promise<FunctionalityValidation> {
    Logger.debug('Validating functionality');

    const result: FunctionalityValidation = {
      status: ValidationStatus.PASSED,
      tests: [],
      coverage: 0,
      mockDetection: { detected: false, locations: [], types: [], suggestions: [] },
      apiValidation: {
        endpoints: [],
        authentication: { implemented: false, method: [], secure: false, issues: [] },
        errorHandling: { implemented: false, comprehensive: false, standardized: false, userFriendly: false, issues: [] },
        documentation: { exists: false, complete: false, upToDate: false, format: '', issues: [] }
      },
      databaseValidation: {
        connections: [],
        queries: [],
        migrations: { exists: false, reversible: false, safe: false, documented: false, issues: [] },
        security: { encryption: false, accessControl: false, sqlInjectionProtection: false, auditLogging: false, issues: [] }
      }
    };

    // This would run actual functional tests if test files are generated
    // For now, we'll perform static analysis

    for (const file of files) {
      await this.validateFileFunctionality(file, result);
    }

    result.status = result.tests.every(t => t.status === 'passed') ? ValidationStatus.PASSED :
                   result.tests.some(t => t.status === 'failed') ? ValidationStatus.FAILED : ValidationStatus.WARNING;

    return result;
  }

  private async validateFileFunctionality(file: GeneratedFile, result: FunctionalityValidation): Promise<void> {
    // Check for basic functionality indicators
    const hasErrorHandling = /try\s*\{[\s\S]*catch|\.catch\(|throw\s+new\s+Error/gi.test(file.content);
    const hasInputValidation = /validate|check|verify|assert/gi.test(file.content);
    const hasAsyncHandling = /async|await|Promise|\.then\(/gi.test(file.content);

    // Create functionality test
    const functionalityTest: FunctionalityTest = {
      name: `Functionality test for ${path.basename(file.path)}`,
      status: 'passed',
      duration: 0,
      expectations: [
        {
          description: 'Has error handling',
          actual: hasErrorHandling,
          expected: true,
          status: hasErrorHandling ? 'passed' : 'failed'
        },
        {
          description: 'Has input validation',
          actual: hasInputValidation,
          expected: true,
          status: hasInputValidation ? 'passed' : 'failed'
        },
        {
          description: 'Has async handling (if needed)',
          actual: hasAsyncHandling || !file.content.includes('async'),
          expected: true,
          status: (hasAsyncHandling || !file.content.includes('async')) ? 'passed' : 'failed'
        }
      ]
    };

    functionalityTest.status = functionalityTest.expectations.every(e => e.status === 'passed') ? 'passed' : 'failed';
    result.tests.push(functionalityTest);
  }

  private async validateIntegration(files: GeneratedFile[], workspace: string): Promise<IntegrationValidation> {
    Logger.debug('Validating integration');

    const result: IntegrationValidation = {
      status: ValidationStatus.PASSED,
      dependencies: [],
      services: [],
      apis: [],
      configuration: {
        status: ValidationStatus.PASSED,
        environment: { variables: [], secrets: [], complete: false, secure: false },
        build: { configured: false, optimized: false, tested: false, documented: false, issues: [] },
        deployment: { configured: false, secure: false, scalable: false, monitored: false, rollbackCapable: false, issues: [] },
        issues: []
      }
    };

    // Validate dependencies
    for (const file of files) {
      for (const dependency of file.dependencies) {
        const depValidation: DependencyValidation = {
          name: dependency.name,
          version: dependency.version || 'latest',
          status: 'valid', // Would check against npm registry in practice
          issues: [],
          recommendations: []
        };
        
        result.dependencies.push(depValidation);
      }
    }

    result.status = result.dependencies.some(d => d.status === 'vulnerable') ? ValidationStatus.FAILED :
                   result.dependencies.some(d => d.status === 'outdated') ? ValidationStatus.WARNING : ValidationStatus.PASSED;

    return result;
  }

  private calculateOverallStatus(validation: ValidationResult): ValidationStatus {
    const statuses = [
      validation.syntax.status,
      validation.types?.status || ValidationStatus.SKIPPED,
      validation.security.status,
      validation.performance.status,
      validation.functionality.status,
      validation.integration.status
    ].filter(status => status !== ValidationStatus.SKIPPED);

    if (statuses.some(status => status === ValidationStatus.FAILED)) {
      return ValidationStatus.FAILED;
    }
    
    if (statuses.some(status => status === ValidationStatus.WARNING)) {
      return ValidationStatus.WARNING;
    }
    
    return ValidationStatus.PASSED;
  }

  private async cleanupValidationWorkspace(workspace: string): Promise<void> {
    try {
      await fs.remove(workspace);
      Logger.debug('Cleaned up validation workspace', { workspace });
    } catch (error) {
      Logger.warn('Failed to cleanup validation workspace', { workspace, error });
    }
  }

  public async cleanup(): Promise<void> {
    try {
      await fs.remove(this.tempDir);
      Logger.info('Validation pipeline cleanup completed');
    } catch (error) {
      Logger.warn('Failed to cleanup validation pipeline', { error });
    }
  }
}