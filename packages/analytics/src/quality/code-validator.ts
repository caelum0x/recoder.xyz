/**
 * Code Compilation & Security Scanning System
 * 
 * Advanced system for validating generated code through compilation checks,
 * security vulnerability scanning, code quality analysis, and best practices
 * enforcement. Provides real-time feedback and automated remediation suggestions.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CodeValidationRequest {
  id: string;
  code: string;
  language: string;
  context: {
    modelName: string;
    taskType: string;
    prompt?: string;
    framework?: string;
    dependencies?: string[];
  };
  validationTypes: ValidationType[];
  options?: {
    timeoutMs?: number;
    strictMode?: boolean;
    customRules?: string[];
    skipCompilation?: boolean;
    skipSecurity?: boolean;
  };
}

export interface CodeValidationResult {
  id: string;
  overallScore: number;               // 0-1 overall quality score
  validationTime: number;             // Validation time in ms
  
  // Individual validation results
  compilation: CompilationResult;
  security: SecurityScanResult;
  quality: CodeQualityResult;
  performance: PerformanceAnalysisResult;
  
  // Summary
  issues: CodeIssue[];
  recommendations: CodeRecommendation[];
  fixes: AutomaticFix[];
  
  // Metadata
  timestamp: Date;
  success: boolean;
  error?: string;
}

export enum ValidationType {
  COMPILATION = 'compilation',
  SECURITY = 'security',
  QUALITY = 'quality',
  PERFORMANCE = 'performance',
  STYLE = 'style',
  BEST_PRACTICES = 'best_practices'
}

export interface CompilationResult {
  success: boolean;
  language: string;
  compiler: string;
  compilerVersion: string;
  
  // Compilation details
  exitCode: number;
  stdout: string;
  stderr: string;
  compilationTime: number;           // ms
  
  // Syntax analysis
  syntaxErrors: SyntaxError[];
  warnings: CompilerWarning[];
  
  // Dependencies
  missingDependencies: string[];
  unusedDependencies: string[];
  
  score: number;                     // 0-1 compilation score
}

export interface SecurityScanResult {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilities: SecurityVulnerability[];
  riskScore: number;                 // 0-1 (1 = highest risk)
  
  // Scan categories
  categories: {
    injection: SecurityCategoryResult;
    xss: SecurityCategoryResult;
    authentication: SecurityCategoryResult;
    authorization: SecurityCategoryResult;
    cryptography: SecurityCategoryResult;
    dataExposure: SecurityCategoryResult;
    inputValidation: SecurityCategoryResult;
    errorHandling: SecurityCategoryResult;
  };
  
  // Compliance
  compliance: {
    owasp: ComplianceResult;
    cwe: ComplianceResult;
    custom: ComplianceResult[];
  };
  
  score: number;                     // 0-1 security score
}

export interface CodeQualityResult {
  maintainabilityIndex: number;      // 0-100 maintainability score
  cyclomaticComplexity: number;      // Cyclomatic complexity
  linesOfCode: number;
  duplicatedLines: number;
  
  // Quality metrics
  metrics: {
    readability: number;             // 0-1 readability score
    modularity: number;              // 0-1 modularity score
    testability: number;             // 0-1 testability score
    documentation: number;           // 0-1 documentation score
  };
  
  // Code smells
  codeSmells: CodeSmell[];
  technicalDebt: TechnicalDebt;
  
  score: number;                     // 0-1 quality score
}

export interface PerformanceAnalysisResult {
  overallPerformance: 'excellent' | 'good' | 'fair' | 'poor';
  
  // Performance issues
  issues: PerformanceIssue[];
  
  // Analysis categories
  algorithms: {
    complexity: string;              // e.g., "O(n²)"
    optimization: string[];          // Optimization suggestions
    score: number;                   // 0-1 algorithm efficiency
  };
  
  memory: {
    leaks: MemoryLeak[];
    usage: string;                   // Memory usage estimation
    score: number;                   // 0-1 memory efficiency
  };
  
  io: {
    blockingOperations: BlockingOperation[];
    asyncUsage: number;              // 0-1 proper async usage
    score: number;                   // 0-1 I/O efficiency
  };
  
  score: number;                     // 0-1 performance score
}

// Supporting interfaces

export interface SyntaxError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  code?: string;
}

export interface CompilerWarning {
  line: number;
  column: number;
  message: string;
  type: string;
  fixable: boolean;
}

export interface SecurityVulnerability {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location: {
    line: number;
    column: number;
    function?: string;
  };
  cwe?: string;                      // CWE identifier
  owasp?: string;                    // OWASP category
  evidence: string;                  // Code snippet showing vulnerability
  remediation: string;               // How to fix
  confidence: number;                // 0-1 confidence in detection
}

export interface SecurityCategoryResult {
  score: number;                     // 0-1 security score for category
  issues: number;                    // Number of issues found
  criticalIssues: number;            // Number of critical issues
  passed: boolean;                   // Whether category passed minimum threshold
}

export interface ComplianceResult {
  framework: string;
  version: string;
  passed: boolean;
  score: number;                     // 0-1 compliance score
  violations: string[];
}

export interface CodeSmell {
  type: string;
  severity: 'minor' | 'major' | 'critical';
  location: {
    startLine: number;
    endLine: number;
    function?: string;
    class?: string;
  };
  description: string;
  remediation: string;
  effort: number;                    // Estimated hours to fix
}

export interface TechnicalDebt {
  totalHours: number;                // Total estimated hours to fix all issues
  categories: {
    reliability: number;
    security: number;
    maintainability: number;
    performance: number;
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface PerformanceIssue {
  type: 'algorithm' | 'memory' | 'io' | 'database' | 'network';
  severity: 'minor' | 'major' | 'critical';
  location: {
    line: number;
    function?: string;
  };
  description: string;
  impact: string;
  recommendation: string;
  estimatedImprovement: string;      // e.g., "50% faster execution"
}

export interface MemoryLeak {
  type: string;
  location: {
    line: number;
    function?: string;
  };
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface BlockingOperation {
  type: string;
  location: {
    line: number;
    function?: string;
  };
  description: string;
  asyncAlternative?: string;
}

export interface CodeIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'compilation' | 'security' | 'quality' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location: {
    line: number;
    column?: number;
    file?: string;
  };
  rule?: string;
  fixable: boolean;
}

export interface CodeRecommendation {
  type: 'improvement' | 'optimization' | 'refactor' | 'security';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  benefits: string[];
  effort: 'low' | 'medium' | 'high';
  examples?: {
    before: string;
    after: string;
  };
}

export interface AutomaticFix {
  id: string;
  type: string;
  description: string;
  location: {
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
  };
  originalCode: string;
  fixedCode: string;
  confidence: number;                // 0-1 confidence in fix
}

export interface ValidationRule {
  id: string;
  name: string;
  category: ValidationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  
  // Rule definition
  pattern?: RegExp;                  // Pattern-based rule
  ast?: boolean;                     // AST-based rule
  custom?: boolean;                  // Custom function rule
  
  // Configuration
  config: Record<string, any>;
  
  // Metadata
  description: string;
  remediation: string;
  references: string[];
}

export class CodeValidator extends EventEmitter {
  private validationRules: Map<string, ValidationRule> = new Map();
  private tempDir: string;
  private compilerCache: Map<string, string> = new Map();
  
  private config = {
    tempDirPrefix: 'code-validator-',
    defaultTimeout: 30000,            // 30 seconds
    maxFileSize: 1024 * 1024,         // 1MB
    maxConcurrentValidations: 10,
    cleanupInterval: 300000,          // 5 minutes
  };

  private activeValidations = new Set<string>();

  constructor() {
    super();
    this.tempDir = path.join(process.cwd(), 'temp', this.config.tempDirPrefix + Date.now());
    this.initializeSecurityRules();
    this.initializeQualityRules();
    this.setupCleanup();
  }

  private initializeSecurityRules(): void {
    const securityRules: ValidationRule[] = [
      {
        id: 'sql_injection',
        name: 'SQL Injection Detection',
        category: ValidationType.SECURITY,
        severity: 'critical',
        enabled: true,
        pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\s+.*(?:WHERE|VALUES|SET)\s+.*(?:=|LIKE|IN)\s*['"]\s*\+/gi,
        config: {},
        description: 'Detects potential SQL injection vulnerabilities',
        remediation: 'Use parameterized queries or prepared statements',
        references: ['https://owasp.org/www-community/attacks/SQL_Injection']
      },
      {
        id: 'xss_vulnerability',
        name: 'Cross-Site Scripting (XSS)',
        category: ValidationType.SECURITY,
        severity: 'high',
        enabled: true,
        pattern: /(?:innerHTML|outerHTML|document\.write|eval)\s*[=\(]\s*.*(?:req\.query|req\.body|req\.params|request\.|input|user)/gi,
        config: {},
        description: 'Detects potential XSS vulnerabilities',
        remediation: 'Sanitize and escape user input before rendering',
        references: ['https://owasp.org/www-community/attacks/xss/']
      },
      {
        id: 'hardcoded_secrets',
        name: 'Hardcoded Secrets',
        category: ValidationType.SECURITY,
        severity: 'critical',
        enabled: true,
        pattern: /(?:password|secret|key|token|api_key)\s*[=:]\s*['"]\w{8,}['"]/gi,
        config: {},
        description: 'Detects hardcoded secrets and credentials',
        remediation: 'Use environment variables or secure configuration management',
        references: ['https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password']
      },
      {
        id: 'command_injection',
        name: 'Command Injection',
        category: ValidationType.SECURITY,
        severity: 'critical',
        enabled: true,
        pattern: /(?:exec|system|shell_exec|passthru|popen|proc_open)\s*\(.*(?:req\.|request\.|input|user|\$_)/gi,
        config: {},
        description: 'Detects potential command injection vulnerabilities',
        remediation: 'Validate and sanitize input, use safe alternatives',
        references: ['https://owasp.org/www-community/attacks/Command_Injection']
      },
      {
        id: 'path_traversal',
        name: 'Path Traversal',
        category: ValidationType.SECURITY,
        severity: 'high',
        enabled: true,
        pattern: /(?:readFile|writeFile|open|include|require)\s*\(.*(?:\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/gi,
        config: {},
        description: 'Detects potential path traversal vulnerabilities',
        remediation: 'Validate file paths and use secure file operations',
        references: ['https://owasp.org/www-community/attacks/Path_Traversal']
      },
      {
        id: 'weak_crypto',
        name: 'Weak Cryptography',
        category: ValidationType.SECURITY,
        severity: 'medium',
        enabled: true,
        pattern: /(?:MD5|SHA1|DES|RC4|md5|sha1)\s*\(/gi,
        config: {},
        description: 'Detects use of weak cryptographic algorithms',
        remediation: 'Use strong cryptographic algorithms like SHA-256, AES',
        references: ['https://owasp.org/www-community/vulnerabilities/Use_of_a_Broken_or_Risky_Cryptographic_Algorithm']
      },
      {
        id: 'insecure_random',
        name: 'Insecure Random Generation',
        category: ValidationType.SECURITY,
        severity: 'medium',
        enabled: true,
        pattern: /(?:Math\.random|Random\(\)|rand\(\)|srand\(\))/gi,
        config: {},
        description: 'Detects use of insecure random number generation',
        remediation: 'Use cryptographically secure random generators',
        references: ['https://owasp.org/www-community/vulnerabilities/Insecure_Randomness']
      },
      {
        id: 'unsafe_deserialization',
        name: 'Unsafe Deserialization',
        category: ValidationType.SECURITY,
        severity: 'high',
        enabled: true,
        pattern: /(?:pickle\.loads|yaml\.load|eval|unserialize)\s*\(/gi,
        config: {},
        description: 'Detects potentially unsafe deserialization',
        remediation: 'Use safe deserialization methods and validate input',
        references: ['https://owasp.org/www-community/vulnerabilities/Deserialization_of_untrusted_data']
      }
    ];

    securityRules.forEach(rule => {
      this.validationRules.set(rule.id, rule);
    });

    Logger.info(`Initialized ${securityRules.length} security rules`);
  }

  private initializeQualityRules(): void {
    const qualityRules: ValidationRule[] = [
      {
        id: 'long_function',
        name: 'Long Function',
        category: ValidationType.QUALITY,
        severity: 'medium',
        enabled: true,
        config: { maxLines: 50 },
        description: 'Functions should not exceed 50 lines',
        remediation: 'Break down long functions into smaller, focused functions',
        references: ['https://refactoring.guru/smells/long-method']
      },
      {
        id: 'deep_nesting',
        name: 'Deep Nesting',
        category: ValidationType.QUALITY,
        severity: 'medium',
        enabled: true,
        config: { maxDepth: 4 },
        description: 'Code should not be nested more than 4 levels deep',
        remediation: 'Use early returns or extract nested logic into functions',
        references: ['https://refactoring.guru/smells/long-method']
      },
      {
        id: 'magic_numbers',
        name: 'Magic Numbers',
        category: ValidationType.QUALITY,
        severity: 'low',
        enabled: true,
        pattern: /(?<![a-zA-Z_])\d{2,}(?![a-zA-Z_])/g,
        config: { excludeCommon: [0, 1, -1, 100, 1000] },
        description: 'Avoid magic numbers, use named constants',
        remediation: 'Replace magic numbers with named constants',
        references: ['https://refactoring.guru/smells/magic-number']
      },
      {
        id: 'unused_variables',
        name: 'Unused Variables',
        category: ValidationType.QUALITY,
        severity: 'low',
        enabled: true,
        config: {},
        description: 'Remove unused variables to improve code clarity',
        remediation: 'Remove unused variables or use them appropriately',
        references: ['https://eslint.org/docs/rules/no-unused-vars']
      },
      {
        id: 'missing_error_handling',
        name: 'Missing Error Handling',
        category: ValidationType.QUALITY,
        severity: 'high',
        enabled: true,
        pattern: /(?:fetch|axios|request|readFile|writeFile|exec)\s*\([^)]*\)\s*(?!\.catch|\.then)/gi,
        config: {},
        description: 'Async operations should include error handling',
        remediation: 'Add proper error handling with try-catch or .catch()',
        references: ['https://nodejs.org/api/errors.html']
      }
    ];

    qualityRules.forEach(rule => {
      this.validationRules.set(rule.id, rule);
    });

    Logger.info(`Initialized ${qualityRules.length} quality rules`);
  }

  private setupCleanup(): void {
    setInterval(() => {
      this.cleanupTempFiles();
    }, this.config.cleanupInterval);
  }

  /**
   * Validate code with comprehensive checks
   */
  async validateCode(request: CodeValidationRequest): Promise<CodeValidationResult> {
    const startTime = Date.now();
    
    if (this.activeValidations.size >= this.config.maxConcurrentValidations) {
      throw new Error('Maximum concurrent validations reached');
    }

    this.activeValidations.add(request.id);

    try {
      Logger.info(`Starting code validation for ${request.id} (${request.language})`);

      const result: CodeValidationResult = {
        id: request.id,
        overallScore: 0,
        validationTime: 0,
        compilation: await this.performCompilationCheck(request),
        security: await this.performSecurityScan(request),
        quality: await this.performQualityAnalysis(request),
        performance: await this.performPerformanceAnalysis(request),
        issues: [],
        recommendations: [],
        fixes: [],
        timestamp: new Date(),
        success: true
      };

      // Aggregate results
      result.issues = this.aggregateIssues(result);
      result.recommendations = this.generateRecommendations(result);
      result.fixes = await this.generateAutomaticFixes(request, result);
      result.overallScore = this.calculateOverallScore(result);
      result.validationTime = Date.now() - startTime;

      this.emit('validationCompleted', result);
      Logger.info(`Code validation completed for ${request.id}: ${(result.overallScore * 100).toFixed(1)}% score`);

      return result;

    } catch (error) {
      Logger.error(`Code validation failed for ${request.id}:`, error);
      
      return {
        id: request.id,
        overallScore: 0,
        validationTime: Date.now() - startTime,
        compilation: this.createEmptyCompilationResult(),
        security: this.createEmptySecurityResult(),
        quality: this.createEmptyQualityResult(),
        performance: this.createEmptyPerformanceResult(),
        issues: [],
        recommendations: [],
        fixes: [],
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

    } finally {
      this.activeValidations.delete(request.id);
    }
  }

  /**
   * Perform compilation check
   */
  private async performCompilationCheck(request: CodeValidationRequest): Promise<CompilationResult> {
    if (request.options?.skipCompilation) {
      return this.createEmptyCompilationResult();
    }

    const startTime = Date.now();
    
    try {
      // Create temporary file
      const tempFile = await this.createTempFile(request.code, request.language);
      
      // Get compiler for language
      const compiler = await this.getCompiler(request.language);
      if (!compiler) {
        throw new Error(`No compiler found for language: ${request.language}`);
      }

      // Run compilation
      const compileCommand = this.buildCompileCommand(compiler, tempFile, request.language);
      const { stdout, stderr } = await execAsync(compileCommand, {
        timeout: request.options?.timeoutMs || this.config.defaultTimeout
      });

      // Parse compilation results
      const syntaxErrors = this.parseSyntaxErrors(stderr, request.language);
      const warnings = this.parseWarnings(stdout + stderr, request.language);
      
      // Analyze dependencies
      const { missing, unused } = await this.analyzeDependencies(request.code, request.context.dependencies || []);

      const result: CompilationResult = {
        success: syntaxErrors.length === 0,
        language: request.language,
        compiler: compiler.name,
        compilerVersion: compiler.version,
        exitCode: 0,
        stdout,
        stderr,
        compilationTime: Date.now() - startTime,
        syntaxErrors,
        warnings,
        missingDependencies: missing,
        unusedDependencies: unused,
        score: this.calculateCompilationScore(syntaxErrors, warnings)
      };

      // Cleanup temp file
      await this.cleanupTempFile(tempFile);

      return result;

    } catch (error) {
      Logger.error('Compilation check failed:', error);
      
      return {
        success: false,
        language: request.language,
        compiler: 'unknown',
        compilerVersion: 'unknown',
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Compilation failed',
        compilationTime: Date.now() - startTime,
        syntaxErrors: [{ line: 1, column: 1, message: 'Compilation failed', severity: 'error' }],
        warnings: [],
        missingDependencies: [],
        unusedDependencies: [],
        score: 0
      };
    }
  }

  /**
   * Perform security scan
   */
  private async performSecurityScan(request: CodeValidationRequest): Promise<SecurityScanResult> {
    if (request.options?.skipSecurity) {
      return this.createEmptySecurityResult();
    }

    const vulnerabilities: SecurityVulnerability[] = [];
    const code = request.code;

    // Run security rules
    for (const rule of this.validationRules.values()) {
      if (rule.category !== ValidationType.SECURITY || !rule.enabled) {
        continue;
      }

      if (rule.pattern) {
        const matches = Array.from(code.matchAll(rule.pattern));
        
        for (const match of matches) {
          const lineNumber = this.getLineNumber(code, match.index || 0);
          
          vulnerabilities.push({
            id: `${rule.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: rule.id,
            severity: rule.severity as SecurityVulnerability['severity'],
            title: rule.name,
            description: rule.description,
            location: {
              line: lineNumber,
              column: this.getColumnNumber(code, match.index || 0)
            },
            cwe: this.getCWEMapping(rule.id),
            owasp: this.getOWASPMapping(rule.id),
            evidence: match[0],
            remediation: rule.remediation,
            confidence: 0.8 // Base confidence for pattern matches
          });
        }
      }
    }

    // Calculate category scores
    const categories = this.calculateSecurityCategories(vulnerabilities);
    
    // Calculate overall risk and score
    const riskScore = this.calculateSecurityRiskScore(vulnerabilities);
    const overallRisk = this.determineOverallRisk(riskScore);

    return {
      overallRisk,
      vulnerabilities,
      riskScore,
      categories,
      compliance: {
        owasp: {
          framework: 'OWASP Top 10',
          version: '2021',
          passed: riskScore < 0.3,
          score: 1 - riskScore,
          violations: vulnerabilities.filter(v => v.owasp).map(v => v.owasp!)
        },
        cwe: {
          framework: 'CWE',
          version: '4.8',
          passed: vulnerabilities.filter(v => v.severity === 'critical').length === 0,
          score: 1 - (vulnerabilities.length / 50), // Normalize by max expected
          violations: vulnerabilities.filter(v => v.cwe).map(v => v.cwe!)
        },
        custom: []
      },
      score: Math.max(0, 1 - riskScore) // Invert risk score for quality score
    };
  }

  /**
   * Perform code quality analysis
   */
  private async performQualityAnalysis(request: CodeValidationRequest): Promise<CodeQualityResult> {
    const code = request.code;
    const lines = code.split('\n');
    
    // Calculate basic metrics
    const linesOfCode = lines.filter(line => line.trim().length > 0).length;
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(code);
    const duplicatedLines = this.findDuplicatedLines(lines);
    
    // Calculate quality metrics
    const readability = this.calculateReadability(code);
    const modularity = this.calculateModularity(code);
    const testability = this.calculateTestability(code);
    const documentation = this.calculateDocumentation(code);
    
    // Detect code smells
    const codeSmells = await this.detectCodeSmells(code, request.language);
    
    // Calculate technical debt
    const technicalDebt = this.calculateTechnicalDebt(codeSmells);
    
    // Calculate maintainability index
    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      linesOfCode, cyclomaticComplexity, readability
    );

    return {
      maintainabilityIndex,
      cyclomaticComplexity,
      linesOfCode,
      duplicatedLines: duplicatedLines.length,
      metrics: {
        readability,
        modularity,
        testability,
        documentation
      },
      codeSmells,
      technicalDebt,
      score: this.calculateQualityScore({
        maintainabilityIndex,
        readability,
        modularity,
        testability,
        codeSmells: codeSmells.length
      })
    };
  }

  /**
   * Perform performance analysis
   */
  private async performPerformanceAnalysis(request: CodeValidationRequest): Promise<PerformanceAnalysisResult> {
    const code = request.code;
    
    // Analyze algorithms
    const algorithms = this.analyzeAlgorithms(code);
    
    // Analyze memory usage
    const memory = this.analyzeMemoryUsage(code);
    
    // Analyze I/O operations
    const io = this.analyzeIOOperations(code);
    
    // Detect performance issues
    const issues = this.detectPerformanceIssues(code, algorithms, memory, io);
    
    // Calculate overall performance
    const overallScore = (algorithms.score + memory.score + io.score) / 3;
    const overallPerformance = this.categorizePerformance(overallScore);

    return {
      overallPerformance,
      issues,
      algorithms,
      memory,
      io,
      score: overallScore
    };
  }

  // Helper methods for compilation

  private async createTempFile(code: string, language: string): Promise<string> {
    await fs.mkdir(this.tempDir, { recursive: true });
    
    const extension = this.getFileExtension(language);
    const fileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
    const filePath = path.join(this.tempDir, fileName);
    
    await fs.writeFile(filePath, code, 'utf8');
    return filePath;
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      Logger.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }

  private async getCompiler(language: string): Promise<{ name: string; version: string } | null> {
    const cached = this.compilerCache.get(language);
    if (cached) {
      return JSON.parse(cached);
    }

    const compilerCommands: Record<string, string> = {
      javascript: 'node --version',
      typescript: 'tsc --version',
      python: 'python --version',
      java: 'javac -version',
      csharp: 'csc',
      cpp: 'g++ --version',
      go: 'go version',
      rust: 'rustc --version'
    };

    const command = compilerCommands[language.toLowerCase()];
    if (!command) {
      return null;
    }

    try {
      const { stdout, stderr } = await execAsync(command);
      const output = stdout || stderr;
      const version = this.extractVersion(output);
      
      const compiler = {
        name: command.split(' ')[0],
        version
      };
      
      this.compilerCache.set(language, JSON.stringify(compiler));
      return compiler;
      
    } catch (error) {
      Logger.warn(`Compiler not found for ${language}:`, error);
      return null;
    }
  }

  private buildCompileCommand(compiler: { name: string; version: string }, filePath: string, language: string): string {
    const commands: Record<string, string> = {
      javascript: `node -c "${filePath}"`,
      typescript: `tsc --noEmit "${filePath}"`,
      python: `python -m py_compile "${filePath}"`,
      java: `javac "${filePath}"`,
      cpp: `g++ -fsyntax-only "${filePath}"`,
      go: `go build -o /dev/null "${filePath}"`,
      rust: `rustc --emit=metadata "${filePath}"`
    };

    return commands[language.toLowerCase()] || `${compiler.name} "${filePath}"`;
  }

  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      csharp: 'cs',
      cpp: 'cpp',
      go: 'go',
      rust: 'rs'
    };

    return extensions[language.toLowerCase()] || 'txt';
  }

  private extractVersion(output: string): string {
    const versionMatch = output.match(/v?(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : 'unknown';
  }

  private parseSyntaxErrors(stderr: string, language: string): SyntaxError[] {
    const errors: SyntaxError[] = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      const errorMatch = this.parseCompilerError(line, language);
      if (errorMatch) {
        errors.push(errorMatch);
      }
    }

    return errors;
  }

  private parseCompilerError(line: string, language: string): SyntaxError | null {
    // Language-specific error parsing patterns
    const patterns: Record<string, RegExp> = {
      javascript: /(?:.*):(\d+):(\d+): (.+)/,
      typescript: /(?:.*)\((\d+),(\d+)\): error TS\d+: (.+)/,
      python: /File ".*", line (\d+).*\n\s*(.+)/,
      java: /(?:.*):(\d+): error: (.+)/,
      cpp: /(?:.*):(\d+):(\d+): error: (.+)/
    };

    const pattern = patterns[language.toLowerCase()];
    if (!pattern) {
      return null;
    }

    const match = line.match(pattern);
    if (match) {
      return {
        line: parseInt(match[1]),
        column: parseInt(match[2] || '1'),
        message: match[3] || match[2],
        severity: 'error'
      };
    }

    return null;
  }

  private parseWarnings(output: string, language: string): CompilerWarning[] {
    const warnings: CompilerWarning[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('warning') || line.includes('Warning')) {
        const warning = this.parseCompilerWarning(line, language);
        if (warning) {
          warnings.push(warning);
        }
      }
    }

    return warnings;
  }

  private parseCompilerWarning(line: string, language: string): CompilerWarning | null {
    // Simplified warning parsing
    const match = line.match(/(?:.*):(\d+):(\d+): warning: (.+)/);
    if (match) {
      return {
        line: parseInt(match[1]),
        column: parseInt(match[2]),
        message: match[3],
        type: 'compiler_warning',
        fixable: false
      };
    }
    return null;
  }

  private async analyzeDependencies(code: string, declaredDeps: string[]): Promise<{ missing: string[]; unused: string[] }> {
    // Simplified dependency analysis
    const importPattern = /(?:import|require|from)\s+['"]([^'"]+)['"]/g;
    const usedDeps = new Set<string>();
    
    let match;
    while ((match = importPattern.exec(code)) !== null) {
      usedDeps.add(match[1]);
    }

    const missing = Array.from(usedDeps).filter(dep => !declaredDeps.includes(dep));
    const unused = declaredDeps.filter(dep => !usedDeps.has(dep));

    return { missing, unused };
  }

  private calculateCompilationScore(errors: SyntaxError[], warnings: CompilerWarning[]): number {
    if (errors.length > 0) {
      return 0; // Compilation errors = 0 score
    }
    
    const warningPenalty = warnings.length * 0.1;
    return Math.max(0, 1 - warningPenalty);
  }

  // Helper methods for security scanning

  private calculateSecurityCategories(vulnerabilities: SecurityVulnerability[]): SecurityScanResult['categories'] {
    const categorizeVuln = (vuln: SecurityVulnerability): string => {
      const typeMapping: Record<string, string> = {
        'sql_injection': 'injection',
        'xss_vulnerability': 'xss',
        'hardcoded_secrets': 'authentication',
        'command_injection': 'injection',
        'path_traversal': 'inputValidation',
        'weak_crypto': 'cryptography',
        'insecure_random': 'cryptography',
        'unsafe_deserialization': 'inputValidation'
      };
      return typeMapping[vuln.type] || 'other';
    };

    const categories = {
      injection: { score: 1, issues: 0, criticalIssues: 0, passed: true },
      xss: { score: 1, issues: 0, criticalIssues: 0, passed: true },
      authentication: { score: 1, issues: 0, criticalIssues: 0, passed: true },
      authorization: { score: 1, issues: 0, criticalIssues: 0, passed: true },
      cryptography: { score: 1, issues: 0, criticalIssues: 0, passed: true },
      dataExposure: { score: 1, issues: 0, criticalIssues: 0, passed: true },
      inputValidation: { score: 1, issues: 0, criticalIssues: 0, passed: true },
      errorHandling: { score: 1, issues: 0, criticalIssues: 0, passed: true }
    };

    for (const vuln of vulnerabilities) {
      const category = categorizeVuln(vuln) as keyof typeof categories;
      const cat = categories[category];
      
      if (cat) {
        cat.issues++;
        if (vuln.severity === 'critical') {
          cat.criticalIssues++;
        }
        
        // Calculate category score based on issues
        const severityWeight = { low: 0.1, medium: 0.3, high: 0.6, critical: 1.0 };
        const impact = severityWeight[vuln.severity] || 0.5;
        cat.score = Math.max(0, cat.score - impact * 0.2);
        cat.passed = cat.score > 0.7 && cat.criticalIssues === 0;
      }
    }

    return categories;
  }

  private calculateSecurityRiskScore(vulnerabilities: SecurityVulnerability[]): number {
    if (vulnerabilities.length === 0) {
      return 0;
    }

    const severityWeights = { low: 0.1, medium: 0.3, high: 0.6, critical: 1.0 };
    const totalRisk = vulnerabilities.reduce((sum, vuln) => {
      return sum + (severityWeights[vuln.severity] * vuln.confidence);
    }, 0);

    return Math.min(1, totalRisk / 10); // Normalize to 0-1
  }

  private determineOverallRisk(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.3) return 'medium';
    return 'low';
  }

  private getCWEMapping(ruleId: string): string | undefined {
    const mapping: Record<string, string> = {
      'sql_injection': 'CWE-89',
      'xss_vulnerability': 'CWE-79',
      'hardcoded_secrets': 'CWE-798',
      'command_injection': 'CWE-78',
      'path_traversal': 'CWE-22',
      'weak_crypto': 'CWE-327',
      'insecure_random': 'CWE-338',
      'unsafe_deserialization': 'CWE-502'
    };
    return mapping[ruleId];
  }

  private getOWASPMapping(ruleId: string): string | undefined {
    const mapping: Record<string, string> = {
      'sql_injection': 'A03:2021-Injection',
      'xss_vulnerability': 'A03:2021-Injection',
      'hardcoded_secrets': 'A07:2021-Identification and Authentication Failures',
      'command_injection': 'A03:2021-Injection',
      'path_traversal': 'A01:2021-Broken Access Control',
      'weak_crypto': 'A02:2021-Cryptographic Failures',
      'insecure_random': 'A02:2021-Cryptographic Failures',
      'unsafe_deserialization': 'A08:2021-Software and Data Integrity Failures'
    };
    return mapping[ruleId];
  }

  // Helper methods for quality analysis

  private calculateCyclomaticComplexity(code: string): number {
    // Simplified cyclomatic complexity calculation
    const complexityKeywords = [
      'if', 'else', 'while', 'for', 'switch', 'case', 'catch', 'try', '&&', '||', '?'
    ];
    
    let complexity = 1; // Base complexity
    
    for (const keyword of complexityKeywords) {
      const matches = code.match(new RegExp(`\\b${keyword}\\b`, 'g'));
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }

  private findDuplicatedLines(lines: string[]): string[] {
    const duplicates: string[] = [];
    const lineCount = new Map<string, number>();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10) { // Only consider meaningful lines
        lineCount.set(trimmed, (lineCount.get(trimmed) || 0) + 1);
      }
    }
    
    for (const [line, count] of lineCount) {
      if (count > 1) {
        duplicates.push(line);
      }
    }
    
    return duplicates;
  }

  private calculateReadability(code: string): number {
    // Simplified readability calculation based on various factors
    const lines = code.split('\n');
    const totalLines = lines.length;
    
    if (totalLines === 0) return 1;
    
    let score = 1;
    
    // Average line length penalty
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / totalLines;
    if (avgLineLength > 120) {
      score -= 0.2;
    }
    
    // Comment ratio bonus
    const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('#')).length;
    const commentRatio = commentLines / totalLines;
    score += commentRatio * 0.3;
    
    // Indentation consistency
    const indentationConsistency = this.calculateIndentationConsistency(lines);
    score += indentationConsistency * 0.2;
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateIndentationConsistency(lines: string[]): number {
    const indentationSizes = new Map<number, number>();
    
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      
      const leadingSpaces = line.match(/^[ \t]*/)?.[0].length || 0;
      if (leadingSpaces > 0) {
        indentationSizes.set(leadingSpaces, (indentationSizes.get(leadingSpaces) || 0) + 1);
      }
    }
    
    if (indentationSizes.size === 0) return 1;
    
    // Check if there's a consistent pattern
    const counts = Array.from(indentationSizes.values());
    const maxCount = Math.max(...counts);
    const totalIndentedLines = counts.reduce((sum, count) => sum + count, 0);
    
    return maxCount / totalIndentedLines;
  }

  private calculateModularity(code: string): number {
    // Simple modularity calculation based on function/class organization
    const functionMatches = code.match(/(?:function|def|class|interface)\s+\w+/g) || [];
    const linesOfCode = code.split('\n').filter(line => line.trim().length > 0).length;
    
    if (linesOfCode === 0) return 1;
    
    const functionsPerLOC = functionMatches.length / linesOfCode;
    return Math.min(1, functionsPerLOC * 20); // Normalize
  }

  private calculateTestability(code: string): number {
    // Simple testability heuristics
    let score = 0.5; // Base score
    
    // Bonus for small functions
    const avgFunctionLength = this.calculateAverageFunctionLength(code);
    if (avgFunctionLength < 20) {
      score += 0.3;
    }
    
    // Penalty for global state usage
    const globalStateUsage = (code.match(/(?:global|window\.|document\.)/g) || []).length;
    score -= Math.min(0.3, globalStateUsage * 0.05);
    
    // Bonus for dependency injection patterns
    const diPatterns = (code.match(/(?:inject|provide|constructor.*\w+)/g) || []).length;
    score += Math.min(0.2, diPatterns * 0.05);
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateAverageFunctionLength(code: string): number {
    const functionRegex = /(?:function|def|class)\s+\w+[^{]*{([^}]*)}/g;
    const functions = [];
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      functions.push(match[1]);
    }
    
    if (functions.length === 0) return 0;
    
    const totalLines = functions.reduce((sum, func) => {
      return sum + func.split('\n').filter(line => line.trim().length > 0).length;
    }, 0);
    
    return totalLines / functions.length;
  }

  private calculateDocumentation(code: string): number {
    const lines = code.split('\n');
    const codeLines = lines.filter(line => line.trim().length > 0 && !line.trim().startsWith('//') && !line.trim().startsWith('#')).length;
    const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('/*')).length;
    
    if (codeLines === 0) return 1;
    
    const commentRatio = commentLines / codeLines;
    return Math.min(1, commentRatio * 3); // Normalize, good ratio is around 0.3
  }

  private async detectCodeSmells(code: string, language: string): Promise<CodeSmell[]> {
    const smells: CodeSmell[] = [];
    const lines = code.split('\n');
    
    // Long function detection
    const functions = this.extractFunctions(code, language);
    for (const func of functions) {
      if (func.lines > 50) {
        smells.push({
          type: 'long_function',
          severity: func.lines > 100 ? 'critical' : 'major',
          location: {
            startLine: func.startLine,
            endLine: func.endLine,
            function: func.name
          },
          description: `Function ${func.name} is too long (${func.lines} lines)`,
          remediation: 'Break down into smaller, focused functions',
          effort: Math.min(8, func.lines / 10) // Hours to refactor
        });
      }
    }
    
    // Deep nesting detection
    const deeplyNestedLines = this.findDeeplyNestedCode(lines);
    for (const lineInfo of deeplyNestedLines) {
      smells.push({
        type: 'deep_nesting',
        severity: lineInfo.depth > 6 ? 'critical' : 'major',
        location: {
          startLine: lineInfo.line,
          endLine: lineInfo.line
        },
        description: `Code nested ${lineInfo.depth} levels deep`,
        remediation: 'Use early returns or extract nested logic',
        effort: 2
      });
    }
    
    return smells;
  }

  private extractFunctions(code: string, language: string): Array<{ name: string; startLine: number; endLine: number; lines: number }> {
    const functions: Array<{ name: string; startLine: number; endLine: number; lines: number }> = [];
    const lines = code.split('\n');
    
    // Simplified function extraction (language-agnostic)
    const functionRegex = /(?:function|def|class|method)\s+(\w+)/g;
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      const startIndex = match.index!;
      const startLine = this.getLineNumber(code, startIndex);
      const name = match[1];
      
      // Find function end (simplified)
      let braceCount = 0;
      let endLine = startLine;
      let foundStart = false;
      
      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            foundStart = true;
          } else if (char === '}') {
            braceCount--;
            if (foundStart && braceCount === 0) {
              endLine = i + 1;
              break;
            }
          }
        }
        
        if (foundStart && braceCount === 0) {
          break;
        }
      }
      
      functions.push({
        name,
        startLine,
        endLine,
        lines: endLine - startLine + 1
      });
    }
    
    return functions;
  }

  private findDeeplyNestedCode(lines: string[]): Array<{ line: number; depth: number }> {
    const deeplyNested: Array<{ line: number; depth: number }> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const depth = this.calculateNestingDepth(line);
      
      if (depth > 4) {
        deeplyNested.push({ line: i + 1, depth });
      }
    }
    
    return deeplyNested;
  }

  private calculateNestingDepth(line: string): number {
    const leadingSpaces = line.match(/^[ \t]*/)?.[0].length || 0;
    return Math.floor(leadingSpaces / 2); // Assuming 2 spaces per level
  }

  private calculateTechnicalDebt(codeSmells: CodeSmell[]): TechnicalDebt {
    const totalHours = codeSmells.reduce((sum, smell) => sum + smell.effort, 0);
    
    const categories = {
      reliability: 0,
      security: 0,
      maintainability: 0,
      performance: 0
    };
    
    for (const smell of codeSmells) {
      switch (smell.type) {
        case 'long_function':
        case 'deep_nesting':
          categories.maintainability += smell.effort;
          break;
        default:
          categories.maintainability += smell.effort;
      }
    }
    
    const priority = totalHours > 40 ? 'critical' : totalHours > 20 ? 'high' : totalHours > 8 ? 'medium' : 'low';
    
    return {
      totalHours,
      categories,
      priority
    };
  }

  private calculateMaintainabilityIndex(linesOfCode: number, complexity: number, readability: number): number {
    // Simplified maintainability index calculation
    // Based on Microsoft's maintainability index formula (simplified)
    
    if (linesOfCode === 0) return 100;
    
    const volumeComponent = Math.log2(linesOfCode) * 0.23;
    const complexityComponent = complexity * 0.16;
    const readabilityComponent = (1 - readability) * 50;
    
    const index = Math.max(0, 171 - volumeComponent - complexityComponent - readabilityComponent);
    return Math.min(100, index);
  }

  private calculateQualityScore(metrics: {
    maintainabilityIndex: number;
    readability: number;
    modularity: number;
    testability: number;
    codeSmells: number;
  }): number {
    const maintainabilityScore = metrics.maintainabilityIndex / 100;
    const smellPenalty = Math.min(0.5, metrics.codeSmells * 0.05);
    
    const weightedScore = (
      maintainabilityScore * 0.3 +
      metrics.readability * 0.25 +
      metrics.modularity * 0.2 +
      metrics.testability * 0.25
    ) - smellPenalty;
    
    return Math.max(0, Math.min(1, weightedScore));
  }

  // Helper methods for performance analysis

  private analyzeAlgorithms(code: string): PerformanceAnalysisResult['algorithms'] {
    const optimizations: string[] = [];
    let complexity = 'O(n)'; // Default assumption
    let score = 0.8; // Default score
    
    // Detect nested loops (O(n²) or worse)
    const nestedLoopMatches = code.match(/for\s*\([^}]*\)\s*{[^}]*for\s*\([^}]*\)/g);
    if (nestedLoopMatches && nestedLoopMatches.length > 0) {
      complexity = 'O(n²)';
      score = 0.4;
      optimizations.push('Consider using hash maps or more efficient algorithms to reduce nested loops');
    }
    
    // Detect inefficient operations
    if (code.includes('indexOf') || code.includes('find(')) {
      optimizations.push('Consider using Set or Map for O(1) lookups instead of linear search');
      score = Math.min(score, 0.6);
    }
    
    // Detect recursion without memoization
    const recursivePattern = /function\s+(\w+)[^{]*{[^}]*\1\(/g;
    if (recursivePattern.test(code) && !code.includes('memo') && !code.includes('cache')) {
      optimizations.push('Add memoization to recursive functions to avoid redundant calculations');
      score = Math.min(score, 0.5);
    }
    
    return {
      complexity,
      optimization: optimizations,
      score
    };
  }

  private analyzeMemoryUsage(code: string): PerformanceAnalysisResult['memory'] {
    const leaks: MemoryLeak[] = [];
    let score = 0.9; // Default good score
    let usage = 'moderate';
    
    // Detect potential memory leaks
    const eventListenerPattern = /addEventListener\s*\([^}]*\)/g;
    const removeListenerPattern = /removeEventListener\s*\([^}]*\)/g;
    
    const addListeners = code.match(eventListenerPattern)?.length || 0;
    const removeListeners = code.match(removeListenerPattern)?.length || 0;
    
    if (addListeners > removeListeners) {
      leaks.push({
        type: 'event_listener',
        location: { line: 1 },
        description: 'Event listeners added without corresponding removal',
        severity: 'medium'
      });
      score -= 0.2;
    }
    
    // Detect large object creation in loops
    if (code.includes('new ') && (code.includes('for(') || code.includes('while('))) {
      leaks.push({
        type: 'object_creation_in_loop',
        location: { line: 1 },
        description: 'Objects created inside loops may cause memory pressure',
        severity: 'low'
      });
      score -= 0.1;
    }
    
    // Estimate usage based on code patterns
    const arrayOperations = (code.match(/\[\]/g) || []).length;
    const objectOperations = (code.match(/\{\}/g) || []).length;
    
    if (arrayOperations + objectOperations > 10) {
      usage = 'high';
      score -= 0.1;
    } else if (arrayOperations + objectOperations < 3) {
      usage = 'low';
    }
    
    return {
      leaks,
      usage,
      score: Math.max(0, score)
    };
  }

  private analyzeIOOperations(code: string): PerformanceAnalysisResult['io'] {
    const blockingOperations: BlockingOperation[] = [];
    let asyncUsage = 0.5; // Default score
    let score = 0.8;
    
    // Detect blocking I/O operations
    const blockingPatterns = [
      { pattern: /readFileSync/g, type: 'file_io' },
      { pattern: /execSync/g, type: 'process_execution' },
      { pattern: /XMLHttpRequest/g, type: 'network_request' }
    ];
    
    for (const { pattern, type } of blockingPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        blockingOperations.push({
          type,
          location: { line: 1 },
          description: `Blocking ${type.replace('_', ' ')} operation detected`,
          asyncAlternative: this.getAsyncAlternative(type)
        });
        score -= 0.3;
      }
    }
    
    // Check async/await usage
    const asyncPatterns = [
      /async\s+function/g,
      /await\s+/g,
      /\.then\(/g,
      /\.catch\(/g
    ];
    
    let asyncScore = 0;
    for (const pattern of asyncPatterns) {
      if (pattern.test(code)) {
        asyncScore += 0.25;
      }
    }
    asyncUsage = Math.min(1, asyncScore);
    
    return {
      blockingOperations,
      asyncUsage,
      score: Math.max(0, score + (asyncUsage - 0.5))
    };
  }

  private getAsyncAlternative(type: string): string {
    const alternatives: Record<string, string> = {
      'file_io': 'Use readFile with promises or fs.promises.readFile',
      'process_execution': 'Use exec with callbacks or promisify',
      'network_request': 'Use fetch API or axios with promises'
    };
    return alternatives[type] || 'Use async/await pattern';
  }

  private detectPerformanceIssues(
    code: string,
    algorithms: PerformanceAnalysisResult['algorithms'],
    memory: PerformanceAnalysisResult['memory'],
    io: PerformanceAnalysisResult['io']
  ): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    
    // Algorithm issues
    if (algorithms.complexity.includes('n²') || algorithms.complexity.includes('n³')) {
      issues.push({
        type: 'algorithm',
        severity: 'major',
        location: { line: 1 },
        description: `Algorithm has ${algorithms.complexity} complexity`,
        impact: 'Performance degrades significantly with input size',
        recommendation: 'Optimize algorithm to reduce time complexity',
        estimatedImprovement: 'Up to 90% faster for large inputs'
      });
    }
    
    // Memory issues
    for (const leak of memory.leaks) {
      issues.push({
        type: 'memory',
        severity: leak.severity === 'high' ? 'critical' : 'major',
        location: leak.location,
        description: leak.description,
        impact: 'Memory usage increases over time',
        recommendation: 'Fix memory leak to prevent out-of-memory errors',
        estimatedImprovement: '50-80% reduction in memory usage'
      });
    }
    
    // I/O issues
    for (const blockingOp of io.blockingOperations) {
      issues.push({
        type: 'io',
        severity: 'major',
        location: blockingOp.location,
        description: blockingOp.description,
        impact: 'Blocks event loop and reduces responsiveness',
        recommendation: blockingOp.asyncAlternative || 'Use non-blocking alternatives',
        estimatedImprovement: '10-100x improvement in responsiveness'
      });
    }
    
    return issues;
  }

  private categorizePerformance(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 0.9) return 'excellent';
    if (score >= 0.7) return 'good';
    if (score >= 0.5) return 'fair';
    return 'poor';
  }

  // Aggregation and scoring methods

  private aggregateIssues(result: CodeValidationResult): CodeIssue[] {
    const issues: CodeIssue[] = [];
    
    // Compilation issues
    for (const error of result.compilation.syntaxErrors) {
      issues.push({
        id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        category: 'compilation',
        severity: 'high',
        title: 'Syntax Error',
        description: error.message,
        location: { line: error.line, column: error.column },
        fixable: false
      });
    }
    
    // Security issues
    for (const vuln of result.security.vulnerabilities) {
      issues.push({
        id: vuln.id,
        type: 'error',
        category: 'security',
        severity: vuln.severity,
        title: vuln.title,
        description: vuln.description,
        location: { line: vuln.location.line, column: vuln.location.column },
        rule: vuln.type,
        fixable: true
      });
    }
    
    // Quality issues
    for (const smell of result.quality.codeSmells) {
      issues.push({
        id: `quality_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'warning',
        category: 'quality',
        severity: smell.severity === 'critical' ? 'critical' : 'medium',
        title: smell.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: smell.description,
        location: { line: smell.location.startLine },
        fixable: true
      });
    }
    
    // Performance issues
    for (const perfIssue of result.performance.issues) {
      issues.push({
        id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'warning',
        category: 'performance',
        severity: perfIssue.severity === 'critical' ? 'critical' : 'medium',
        title: perfIssue.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' Issue',
        description: perfIssue.description,
        location: { line: perfIssue.location.line },
        fixable: false
      });
    }
    
    return issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  private generateRecommendations(result: CodeValidationResult): CodeRecommendation[] {
    const recommendations: CodeRecommendation[] = [];
    
    // Compilation recommendations
    if (!result.compilation.success) {
      recommendations.push({
        type: 'improvement',
        priority: 'high',
        title: 'Fix Compilation Errors',
        description: 'Resolve syntax errors to enable proper code execution',
        benefits: ['Code will compile and run', 'Better IDE support', 'Easier debugging'],
        effort: 'low'
      });
    }
    
    // Security recommendations
    if (result.security.overallRisk === 'high' || result.security.overallRisk === 'critical') {
      recommendations.push({
        type: 'security',
        priority: 'high',
        title: 'Address Security Vulnerabilities',
        description: 'Fix identified security issues to protect against attacks',
        benefits: ['Improved security posture', 'Compliance with standards', 'User trust'],
        effort: 'medium'
      });
    }
    
    // Quality recommendations  
    if (result.quality.maintainabilityIndex < 50) {
      recommendations.push({
        type: 'refactor',
        priority: 'medium',
        title: 'Improve Code Maintainability',
        description: 'Refactor code to improve readability and maintainability',
        benefits: ['Easier to modify', 'Reduced technical debt', 'Better team collaboration'],
        effort: 'high'
      });
    }
    
    // Performance recommendations
    if (result.performance.overallPerformance === 'poor' || result.performance.overallPerformance === 'fair') {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Optimize Performance',
        description: 'Improve algorithm efficiency and reduce resource usage',
        benefits: ['Faster execution', 'Lower resource consumption', 'Better user experience'],
        effort: 'medium'
      });
    }
    
    return recommendations;
  }

  private async generateAutomaticFixes(
    request: CodeValidationRequest,
    result: CodeValidationResult
  ): Promise<AutomaticFix[]> {
    const fixes: AutomaticFix[] = [];
    const lines = request.code.split('\n');
    
    // Simple automatic fixes for common issues
    for (const issue of result.issues) {
      if (!issue.fixable) continue;
      
      const fix = await this.generateFixForIssue(issue, lines);
      if (fix) {
        fixes.push(fix);
      }
    }
    
    return fixes;
  }

  private async generateFixForIssue(issue: CodeIssue, lines: string[]): Promise<AutomaticFix | null> {
    const lineIndex = issue.location.line - 1;
    
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return null;
    }
    
    const originalLine = lines[lineIndex];
    
    // Example: Fix hardcoded secret
    if (issue.rule === 'hardcoded_secrets') {
      const fixedLine = originalLine.replace(
        /(['"])[a-zA-Z0-9+/=]{20,}\1/g,
        'process.env.SECRET_KEY || $1$1'
      );
      
      if (fixedLine !== originalLine) {
        return {
          id: `fix_${issue.id}`,
          type: 'security_fix',
          description: 'Replace hardcoded secret with environment variable',
          location: {
            startLine: issue.location.line,
            endLine: issue.location.line
          },
          originalCode: originalLine,
          fixedCode: fixedLine,
          confidence: 0.8
        };
      }
    }
    
    return null;
  }

  private calculateOverallScore(result: CodeValidationResult): number {
    const weights = {
      compilation: 0.3,
      security: 0.3,
      quality: 0.25,
      performance: 0.15
    };
    
    return (
      result.compilation.score * weights.compilation +
      result.security.score * weights.security +
      result.quality.score * weights.quality +
      result.performance.score * weights.performance
    );
  }

  // Helper methods for empty results

  private createEmptyCompilationResult(): CompilationResult {
    return {
      success: true,
      language: 'unknown',
      compiler: 'none',
      compilerVersion: 'none',
      exitCode: 0,
      stdout: '',
      stderr: '',
      compilationTime: 0,
      syntaxErrors: [],
      warnings: [],
      missingDependencies: [],
      unusedDependencies: [],
      score: 1
    };
  }

  private createEmptySecurityResult(): SecurityScanResult {
    return {
      overallRisk: 'low',
      vulnerabilities: [],
      riskScore: 0,
      categories: {
        injection: { score: 1, issues: 0, criticalIssues: 0, passed: true },
        xss: { score: 1, issues: 0, criticalIssues: 0, passed: true },
        authentication: { score: 1, issues: 0, criticalIssues: 0, passed: true },
        authorization: { score: 1, issues: 0, criticalIssues: 0, passed: true },
        cryptography: { score: 1, issues: 0, criticalIssues: 0, passed: true },
        dataExposure: { score: 1, issues: 0, criticalIssues: 0, passed: true },
        inputValidation: { score: 1, issues: 0, criticalIssues: 0, passed: true },
        errorHandling: { score: 1, issues: 0, criticalIssues: 0, passed: true }
      },
      compliance: {
        owasp: { framework: 'OWASP Top 10', version: '2021', passed: true, score: 1, violations: [] },
        cwe: { framework: 'CWE', version: '4.8', passed: true, score: 1, violations: [] },
        custom: []
      },
      score: 1
    };
  }

  private createEmptyQualityResult(): CodeQualityResult {
    return {
      maintainabilityIndex: 100,
      cyclomaticComplexity: 1,
      linesOfCode: 0,
      duplicatedLines: 0,
      metrics: {
        readability: 1,
        modularity: 1,
        testability: 1,
        documentation: 1
      },
      codeSmells: [],
      technicalDebt: {
        totalHours: 0,
        categories: { reliability: 0, security: 0, maintainability: 0, performance: 0 },
        priority: 'low'
      },
      score: 1
    };
  }

  private createEmptyPerformanceResult(): PerformanceAnalysisResult {
    return {
      overallPerformance: 'excellent',
      issues: [],
      algorithms: { complexity: 'O(1)', optimization: [], score: 1 },
      memory: { leaks: [], usage: 'low', score: 1 },
      io: { blockingOperations: [], asyncUsage: 1, score: 1 },
      score: 1
    };
  }

  // Utility methods

  private getLineNumber(text: string, index: number): number {
    return text.substring(0, index).split('\n').length;
  }

  private getColumnNumber(text: string, index: number): number {
    const beforeIndex = text.substring(0, index);
    const lastNewline = beforeIndex.lastIndexOf('\n');
    return index - lastNewline;
  }

  private async cleanupTempFiles(): Promise<void> {
    try {
      const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
      const now = Date.now();
      
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(this.tempDir, entry.name);
          const stats = await fs.stat(filePath);
          
          // Delete files older than 1 hour
          if (now - stats.mtime.getTime() > 60 * 60 * 1000) {
            await fs.unlink(filePath);
          }
        }
      }
    } catch (error) {
      Logger.warn('Failed to cleanup temp files:', error);
    }
  }
}

// Export singleton instance
export const codeValidator = new CodeValidator();